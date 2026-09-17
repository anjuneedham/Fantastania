import type { EquipSlot } from './types';
import {
  BONUS_POINT_LEVELS, MAX_LEVEL, SKILL_POINTS_PER_LEVEL, xpToNext,
} from './progression';
import { bus } from './events';

/**
 * All persistent player progress in one place.
 *
 * This object *is* the save file (see SaveSystem), which is why it holds plain
 * serialisable data and no entity references. Runtime objects — the live Player
 * entity, the loaded area — live in World and are rebuilt from this on load.
 */

export interface InventoryStack {
  itemId: string;
  count: number;
}

export interface QuestProgress {
  questId: string;
  /** Counter per objective, parallel to the quest's objective list. */
  counters: number[];
  /** True once every objective is satisfied but before the reward is claimed. */
  readyToTurnIn: boolean;
  /** Real seconds when the quest was accepted; used for sorting the log. */
  acceptedAt: number;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Show the on-screen joystick even on a device with a keyboard. */
  forceTouchControls: boolean;
  /** Reduced particles and effects for weaker hardware. */
  performanceMode: boolean;
  /** Camera shake intensity multiplier, 0 disables it. */
  screenShake: number;
  showDamageNumbers: boolean;
  showMinimap: boolean;
  /** Auto-face the nearest enemy when attacking on touch. */
  aimAssist: boolean;
}

export function defaultSettings(): GameSettings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.45,
    sfxVolume: 0.8,
    muted: false,
    forceTouchControls: false,
    performanceMode: false,
    screenShake: 1,
    showDamageNumbers: true,
    showMinimap: true,
    aimAssist: true,
  };
}

export class GameState {
  /* --- identity --- */
  characterId = 'eric';
  createdAt = 0;
  playtime = 0;

  /* --- progression --- */
  level = 1;
  xp = 0;
  skillPoints = 0;
  /** Skill tree node id -> ranks purchased. */
  learnedSkills: Record<string, number> = {};
  unlockedAbilities: string[] = [];
  loadout: { ability1: string | null; ability2: string | null; ultimate: string | null } = {
    ability1: null,
    ability2: null,
    ultimate: null,
  };

  /* --- resources --- */
  gold = 25;
  inventory: InventoryStack[] = [];
  equipment: Record<EquipSlot, string | null> = { weapon: null, armor: null, accessory: null };
  /** Carried over between areas so a wounded player stays wounded. */
  currentHealth = -1;
  currentMana = -1;

  /* --- world --- */
  currentAreaId = 'homestead';
  /** Spawn point id within the current area. */
  spawnPointId = 'default';
  unlockedAreas: string[] = ['homestead'];
  visitedAreas: string[] = [];
  discoveredLocations: string[] = [];
  foundSecrets: string[] = [];
  openedChests: string[] = [];
  /** Enemies killed per area since the last respawn tick, keyed `area:spawnId`. */
  clearedSpawns: string[] = [];

  /* --- quests & story --- */
  activeQuests: QuestProgress[] = [];
  completedQuests: string[] = [];
  turnedInQuests: string[] = [];
  /** Arbitrary story flags; dialogue and quests branch on these. */
  flags: Record<string, number | string | boolean> = {};
  metNpcs: string[] = [];

  /* --- telemetry (shown on the character screen) --- */
  kills = 0;
  deaths = 0;
  goldEarned = 0;
  bossesDefeated: string[] = [];

  settings: GameSettings = defaultSettings();

  /* ------------------------------------------------------------------ */

  get xpForNextLevel(): number {
    return xpToNext(this.level);
  }

  get xpProgress(): number {
    const need = this.xpForNextLevel;
    return Number.isFinite(need) ? Math.min(1, this.xp / need) : 1;
  }

  addXp(amount: number, source = 'combat'): void {
    if (amount <= 0 || this.level >= MAX_LEVEL) return;
    this.xp += amount;
    bus.emit('xpGained', { amount, source });

    while (this.level < MAX_LEVEL && this.xp >= this.xpForNextLevel) {
      this.xp -= this.xpForNextLevel;
      this.level++;
      const points = SKILL_POINTS_PER_LEVEL + (BONUS_POINT_LEVELS.has(this.level) ? 1 : 0);
      this.skillPoints += points;
      bus.emit('levelUp', { level: this.level, skillPoints: points });
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
  }

  addGold(amount: number): void {
    if (amount === 0) return;
    this.gold = Math.max(0, this.gold + amount);
    if (amount > 0) this.goldEarned += amount;
    bus.emit('goldChanged', { amount, total: this.gold });
  }

  hasFlag(flag: string): boolean {
    const v = this.flags[flag];
    return v !== undefined && v !== false && v !== 0;
  }

  setFlag(flag: string, value: number | string | boolean = true): void {
    this.flags[flag] = value;
    bus.emit('flagSet', { flag, value });
  }

  unlockArea(areaId: string): void {
    if (this.unlockedAreas.includes(areaId)) return;
    this.unlockedAreas.push(areaId);
    bus.emit('areaUnlocked', { areaId });
  }

  isAreaUnlocked(areaId: string): boolean {
    return this.unlockedAreas.includes(areaId);
  }

  markVisited(areaId: string): void {
    if (!this.visitedAreas.includes(areaId)) this.visitedAreas.push(areaId);
  }

  questProgressFor(questId: string): QuestProgress | undefined {
    return this.activeQuests.find((q) => q.questId === questId);
  }

  hasCompletedQuest(questId: string): boolean {
    return this.turnedInQuests.includes(questId);
  }

  /** Replaces every field from a plain object (used by SaveSystem). */
  applySnapshot(data: Partial<GameState>): void {
    Object.assign(this, data);
    // Settings gain fields over time; fill any the save predates.
    this.settings = { ...defaultSettings(), ...(data.settings ?? {}) };
  }

  /** Resets to a fresh game for the given character. */
  reset(characterId: string): void {
    const fresh = new GameState();
    Object.assign(this, fresh);
    this.characterId = characterId;
    this.createdAt = Date.now();
    this.settings = defaultSettings();
  }
}

/**
 * The single live game state. A module singleton rather than a field on the
 * engine, so `engine/` never has to know that Aetheria exists.
 */
export const state = new GameState();
