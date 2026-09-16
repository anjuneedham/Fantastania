import { C, RARITY_COLORS } from '../../art/palette';
import { getItem, tryGetItem } from '../../data/items';
import { getLootTable } from '../../data/loot';
import { Rng } from '../../engine/Rng';
import type { Player } from '../entities/Player';
import { bus } from '../events';
import { state, type InventoryStack } from '../GameState';
import type { EquipSlot, ItemDef, Rarity } from '../types';

/**
 * Inventory, equipment and loot rolling.
 *
 * Operates on GameState directly and announces every change on the bus, so the
 * UI never has to poll and the quest system picks up collection objectives for
 * free.
 */

/** Total slots. Stacks share a slot; equipment never does. */
export const INVENTORY_SLOTS = 48;

export interface AddResult {
  added: number;
  /** Items that did not fit. */
  overflow: number;
}

export function countOf(itemId: string): number {
  let total = 0;
  for (const stack of state.inventory) {
    if (stack.itemId === itemId) total += stack.count;
  }
  return total;
}

export function hasItem(itemId: string, count = 1): boolean {
  return countOf(itemId) >= count;
}

export function usedSlots(): number {
  return state.inventory.length;
}

/** Adds items, filling partial stacks first. */
export function addItem(itemId: string, count = 1, announce = true): AddResult {
  const def = tryGetItem(itemId);
  if (!def || count <= 0) return { added: 0, overflow: count };

  let remaining = count;
  if (def.stack > 1) {
    for (const stack of state.inventory) {
      if (stack.itemId !== itemId || stack.count >= def.stack) continue;
      const room = def.stack - stack.count;
      const moved = Math.min(room, remaining);
      stack.count += moved;
      remaining -= moved;
      if (remaining <= 0) break;
    }
  }

  while (remaining > 0 && state.inventory.length < INVENTORY_SLOTS) {
    const moved = Math.min(def.stack, remaining);
    state.inventory.push({ itemId, count: moved });
    remaining -= moved;
  }

  const added = count - remaining;
  if (added > 0) {
    // itemGained always fires: quest collect-objectives and anything else that
    // tracks inventory truth depend on it. `announce` only controls whether a
    // toast appears — silencing the toast (e.g. a displaced weapon quietly
    // returning to the pack on re-equip) must never also silence the event.
    bus.emit('itemGained', { itemId, count: added, rarity: def.rarity });
    if (announce) {
      bus.emit('toast', {
        text: added > 1 ? `${def.name} ×${added}` : def.name,
        color: RARITY_COLORS[def.rarity],
        icon: def.icon,
      });
    }
  }
  if (remaining > 0 && announce) {
    bus.emit('toast', { text: 'Your pack is full.', color: C.blood, icon: '⚠' });
  }
  return { added, overflow: remaining };
}

/** Removes items. Returns how many were actually removed. */
export function removeItem(itemId: string, count = 1): number {
  let remaining = count;
  for (let i = state.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    const stack = state.inventory[i];
    if (stack.itemId !== itemId) continue;
    const taken = Math.min(stack.count, remaining);
    stack.count -= taken;
    remaining -= taken;
    if (stack.count <= 0) state.inventory.splice(i, 1);
  }
  const removed = count - remaining;
  if (removed > 0) bus.emit('itemRemoved', { itemId, count: removed });
  return removed;
}

export interface EquipResult {
  ok: boolean;
  reason?: string;
}

/** Equips an item from the inventory, returning whatever it displaced. */
export function equipItem(itemId: string, player: Player): EquipResult {
  const def = tryGetItem(itemId);
  if (!def?.slot) return { ok: false, reason: 'That cannot be equipped.' };
  if (!hasItem(itemId)) return { ok: false, reason: 'You do not have that.' };

  if (def.levelReq && state.level < def.levelReq) {
    return { ok: false, reason: `Requires level ${def.levelReq}.` };
  }
  if (def.restrictedTo && !def.restrictedTo.includes(state.characterId)) {
    return { ok: false, reason: `${def.name} is not yours to use.` };
  }

  const slot = def.slot;
  const previous = state.equipment[slot];
  removeItem(itemId, 1);
  state.equipment[slot] = itemId;
  // The displaced item goes back to the pack; never destroy gear silently.
  if (previous) addItem(previous, 1, false);

  player.refreshStats();
  bus.emit('itemEquipped', { slot, itemId });
  bus.emit('toast', {
    text: `Equipped ${def.name}`,
    color: RARITY_COLORS[def.rarity],
    icon: def.icon,
  });
  return { ok: true };
}

export function unequipSlot(slot: EquipSlot, player: Player): EquipResult {
  const current = state.equipment[slot];
  if (!current) return { ok: false, reason: 'Nothing equipped.' };
  if (state.inventory.length >= INVENTORY_SLOTS) {
    return { ok: false, reason: 'Your pack is full.' };
  }
  state.equipment[slot] = null;
  addItem(current, 1, false);
  player.refreshStats();
  bus.emit('itemEquipped', { slot, itemId: null });
  return { ok: true };
}

/** Consumes a usable item. */
export function useItem(itemId: string, player: Player): EquipResult {
  const def = tryGetItem(itemId);
  if (!def) return { ok: false, reason: 'Unknown item.' };
  if (def.kind !== 'consumable' || !def.use) {
    return { ok: false, reason: 'You cannot use that.' };
  }
  if (!hasItem(itemId)) return { ok: false, reason: 'You do not have that.' };

  const potency = 1 + player.stats.passives.potionPotency;
  const use = def.use;
  let didSomething = false;

  if (use.health || use.healthPercent) {
    const amount = (use.health ?? 0) + player.maxHealth * (use.healthPercent ?? 0);
    const healed = player.heal(amount * potency);
    if (healed > 0) {
      didSomething = true;
      bus.emit('playerHealed', { amount: healed });
    }
  }
  if (use.mana || use.manaPercent) {
    const amount = ((use.mana ?? 0) + player.maxMana * (use.manaPercent ?? 0)) * potency;
    const before = player.mana;
    player.mana = Math.min(player.maxMana, player.mana + amount);
    if (player.mana > before) didSomething = true;
  }
  if (use.buff) {
    // Refresh rather than stack, matching how status effects behave.
    const existing = player.consumableBuffs.find((b) => b.stat === use.buff!.stat);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, use.buff.duration);
      existing.amount = Math.max(existing.amount, Math.round(use.buff.amount * potency));
    } else {
      player.consumableBuffs.push({
        stat: use.buff.stat,
        amount: Math.round(use.buff.amount * potency),
        remaining: use.buff.duration,
      });
    }
    player.refreshStats();
    didSomething = true;
  }

  if (!didSomething) {
    return { ok: false, reason: 'That would do nothing right now.' };
  }

  removeItem(itemId, 1);
  bus.emit('itemUsed', { itemId });
  if (use.message) bus.emit('toast', { text: use.message, color: C.verdant, icon: def.icon });
  return { ok: true };
}

/** Sells an item at a fraction of its value. */
export function sellItem(itemId: string, count = 1): EquipResult {
  const def = tryGetItem(itemId);
  if (!def) return { ok: false, reason: 'Unknown item.' };
  if (def.kind === 'quest') return { ok: false, reason: 'You should hold on to that.' };
  const removed = removeItem(itemId, count);
  if (removed <= 0) return { ok: false, reason: 'You do not have that.' };
  // Sell at 40%: enough that clearing your pack is worth doing, not enough to
  // make vendoring a better income than adventuring.
  state.addGold(Math.max(1, Math.round(def.value * 0.4)) * removed);
  return { ok: true };
}

export function buyItem(itemId: string, count = 1): EquipResult {
  const def = tryGetItem(itemId);
  if (!def) return { ok: false, reason: 'Unknown item.' };
  const cost = def.value * count;
  if (state.gold < cost) return { ok: false, reason: 'You cannot afford that.' };
  if (state.inventory.length >= INVENTORY_SLOTS && def.stack === 1) {
    return { ok: false, reason: 'Your pack is full.' };
  }
  state.addGold(-cost);
  addItem(itemId, count);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Loot rolling                                                        */
/* ------------------------------------------------------------------ */

export interface RolledLoot {
  gold: number;
  items: Array<{ itemId: string; count: number; rarity: Rarity }>;
}

/**
 * Rolls a table. Each entry is tested independently, so a table's contents read
 * exactly as written: a 55% pelt is a 55% pelt regardless of what else is in
 * the list.
 */
export function rollLoot(tableId: string, rng: Rng, luck = 0): RolledLoot {
  const table = getLootTable(tableId);
  const out: RolledLoot = { gold: 0, items: [] };

  out.gold = rng.int(table.gold.min, table.gold.max);

  for (const entry of table.guaranteed ?? []) {
    const def = tryGetItem(entry.itemId);
    if (def) out.items.push({ itemId: entry.itemId, count: entry.count, rarity: def.rarity });
  }

  for (const entry of table.entries) {
    if (!rng.chance(Math.min(1, entry.chance * (1 + luck)))) continue;
    const def = tryGetItem(entry.itemId);
    if (!def) continue;
    out.items.push({
      itemId: entry.itemId,
      count: rng.int(entry.min, entry.max),
      rarity: def.rarity,
    });
  }
  return out;
}

/** Inventory entries paired with their definitions, for the UI. */
export interface InventoryEntry {
  stack: InventoryStack;
  def: ItemDef;
  index: number;
}

export function inventoryEntries(filter?: (def: ItemDef) => boolean): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  state.inventory.forEach((stack, index) => {
    const def = tryGetItem(stack.itemId);
    if (!def) return;
    if (filter && !filter(def)) return;
    out.push({ stack, def, index });
  });
  return out;
}

/** Sort used by the inventory screen: kind, then rarity, then name. */
const KIND_ORDER = ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest'];
const RARITY_ORDER_MAP: Record<Rarity, number> = {
  legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4,
};

export function sortInventory(): void {
  state.inventory.sort((a, b) => {
    const da = getItem(a.itemId);
    const db = getItem(b.itemId);
    const kind = KIND_ORDER.indexOf(da.kind) - KIND_ORDER.indexOf(db.kind);
    if (kind !== 0) return kind;
    const rarity = RARITY_ORDER_MAP[da.rarity] - RARITY_ORDER_MAP[db.rarity];
    if (rarity !== 0) return rarity;
    return da.name.localeCompare(db.name);
  });
}
