import type { StorageAdapter } from '../../engine/Storage';
import { bus } from '../events';
import { GameState, defaultSettings, state } from '../GameState';
import { refreshUnlockedAbilities } from '../newGame';

/**
 * Persistence.
 *
 * The save file is a versioned snapshot of GameState and nothing else — no
 * entity references, no derived values — which is why loading is just
 * "overwrite the state and rebuild the world from it". Storage goes through the
 * adapter interface, so localStorage today and a cloud backend later are the
 * same code path.
 */

/**
 * Bump when a change makes old saves unreadable, and add a migration below.
 * Additive changes do not need a bump: missing fields fall back to defaults.
 */
export const SAVE_VERSION = 1;

export const SAVE_SLOTS = 3;
const AUTOSAVE_SLOT = 0;

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  /** Denormalised for the load screen, so a slot can be listed without a full parse. */
  summary: SaveSummary;
  data: Record<string, unknown>;
}

export interface SaveSummary {
  characterId: string;
  characterName: string;
  level: number;
  areaId: string;
  areaName: string;
  playtime: number;
  gold: number;
  questName: string | null;
}

export interface SlotInfo {
  slot: number;
  empty: boolean;
  summary?: SaveSummary;
  savedAt?: number;
  /** Set when the slot exists but could not be read. */
  corrupt?: boolean;
}

/** Fields that are runtime-only and deliberately not persisted. */
const TRANSIENT_KEYS = new Set<string>([]);

export class SaveSystem {
  constructor(private readonly storage: StorageAdapter) {}

  private key(slot: number): string {
    return `save.${slot}`;
  }

  /** Serialises the live state into a storable envelope. */
  private snapshot(summary: SaveSummary): SaveEnvelope {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      if (TRANSIENT_KEYS.has(key)) continue;
      if (typeof value === 'function') continue;
      data[key] = value;
    }
    return { version: SAVE_VERSION, savedAt: Date.now(), summary, data };
  }

  async save(slot: number, summary: SaveSummary): Promise<boolean> {
    try {
      const envelope = this.snapshot(summary);
      await this.storage.set(this.key(slot), JSON.stringify(envelope));
      bus.emit('saved', { slot });
      return true;
    } catch (err) {
      console.warn('[save] failed', err);
      return false;
    }
  }

  async autosave(summary: SaveSummary): Promise<boolean> {
    return this.save(AUTOSAVE_SLOT, summary);
  }

  async load(slot: number): Promise<boolean> {
    const envelope = await this.read(slot);
    if (!envelope) return false;
    try {
      const migrated = migrate(envelope);
      // Start from a clean default so a save missing a field added later gets
      // that field's default rather than whatever the previous session left.
      const fresh = new GameState();
      Object.assign(state, fresh);
      state.applySnapshot(migrated.data as Partial<GameState>);
      state.settings = { ...defaultSettings(), ...(migrated.data.settings as object ?? {}) };
      refreshUnlockedAbilities();
      bus.emit('loaded', { slot });
      return true;
    } catch (err) {
      console.warn('[save] could not apply save', err);
      return false;
    }
  }

  private async read(slot: number): Promise<SaveEnvelope | null> {
    try {
      const raw = await this.storage.get(this.key(slot));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveEnvelope;
      if (typeof parsed?.version !== 'number' || typeof parsed.data !== 'object') return null;
      return parsed;
    } catch (err) {
      console.warn(`[save] slot ${slot} is unreadable`, err);
      return null;
    }
  }

  async slotInfo(slot: number): Promise<SlotInfo> {
    try {
      const raw = await this.storage.get(this.key(slot));
      if (!raw) return { slot, empty: true };
      const parsed = JSON.parse(raw) as SaveEnvelope;
      if (!parsed?.summary) return { slot, empty: false, corrupt: true };
      return { slot, empty: false, summary: parsed.summary, savedAt: parsed.savedAt };
    } catch {
      return { slot, empty: false, corrupt: true };
    }
  }

  async listSlots(): Promise<SlotInfo[]> {
    const out: SlotInfo[] = [];
    for (let i = 0; i < SAVE_SLOTS; i++) out.push(await this.slotInfo(i));
    return out;
  }

  async deleteSlot(slot: number): Promise<void> {
    await this.storage.remove(this.key(slot));
  }

  async hasAnySave(): Promise<boolean> {
    const slots = await this.listSlots();
    return slots.some((s) => !s.empty && !s.corrupt);
  }

  /** Most recently saved non-empty slot, for a Continue button. */
  async mostRecentSlot(): Promise<SlotInfo | null> {
    const slots = await this.listSlots();
    const usable = slots.filter((s) => !s.empty && !s.corrupt && s.savedAt);
    if (usable.length === 0) return null;
    usable.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    return usable[0];
  }

  /** Settings persist outside save slots so they survive a new game. */
  async saveSettings(): Promise<void> {
    try {
      await this.storage.set('settings', JSON.stringify(state.settings));
    } catch (err) {
      console.warn('[save] settings failed', err);
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const raw = await this.storage.get('settings');
      if (!raw) return;
      state.settings = { ...defaultSettings(), ...JSON.parse(raw) };
    } catch {
      /* keep defaults */
    }
  }
}

/**
 * Applies migrations from older versions. Each step upgrades by exactly one
 * version, so the chain stays readable as the game grows.
 */
function migrate(envelope: SaveEnvelope): SaveEnvelope {
  let current = envelope;
  while (current.version < SAVE_VERSION) {
    switch (current.version) {
      // case 1: current = migrateV1toV2(current); break;
      default:
        // Unknown older version: accept it and let field defaults fill gaps.
        current = { ...current, version: SAVE_VERSION };
        break;
    }
  }
  if (current.version > SAVE_VERSION) {
    console.warn('[save] this save was written by a newer build; loading anyway');
  }
  return current;
}

/** Builds the summary shown on the load screen. */
export function buildSummary(
  characterName: string, areaName: string, questName: string | null,
): SaveSummary {
  return {
    characterId: state.characterId,
    characterName,
    level: state.level,
    areaId: state.currentAreaId,
    areaName,
    playtime: state.playtime,
    gold: state.gold,
    questName,
  };
}

/** Formats seconds as the load screen shows them. */
export function formatPlaytime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
