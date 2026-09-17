import type { LootTable } from '../game/types';

/**
 * Loot tables.
 *
 * Each entry rolls independently against its own `chance`, and `weight` only
 * matters when a table is asked for a single weighted pick (chests). That keeps
 * the common case — "a wolf usually drops a pelt and sometimes a potion" —
 * expressible without a nested structure.
 */
export const LOOT_TABLES: Record<string, LootTable> = {
  none: { id: 'none', gold: { min: 0, max: 0 }, entries: [] },

  /* ------------------------- Enemy drops ------------------------- */
  shadowWolf: {
    id: 'shadowWolf',
    gold: { min: 2, max: 7 },
    entries: [
      { itemId: 'wolfPelt', weight: 10, min: 1, max: 1, chance: 0.55 },
      { itemId: 'potionMinorHealth', weight: 4, min: 1, max: 1, chance: 0.12 },
      { itemId: 'aetherShard', weight: 2, min: 1, max: 1, chance: 0.06 },
      { itemId: 'huntersDagger', weight: 1, min: 1, max: 1, chance: 0.02 },
    ],
  },
  forestGoblin: {
    id: 'forestGoblin',
    gold: { min: 4, max: 12 },
    entries: [
      { itemId: 'goblinCharm', weight: 10, min: 1, max: 2, chance: 0.5 },
      { itemId: 'breadRation', weight: 5, min: 1, max: 2, chance: 0.2 },
      { itemId: 'potionMinorMana', weight: 4, min: 1, max: 1, chance: 0.1 },
      { itemId: 'mossweaveCoat', weight: 1, min: 1, max: 1, chance: 0.025 },
    ],
  },
  arcaneSlime: {
    id: 'arcaneSlime',
    gold: { min: 1, max: 5 },
    entries: [
      { itemId: 'aetherShard', weight: 10, min: 1, max: 2, chance: 0.6 },
      { itemId: 'potionMinorMana', weight: 5, min: 1, max: 1, chance: 0.18 },
      { itemId: 'copperBand', weight: 1, min: 1, max: 1, chance: 0.03 },
    ],
  },
  skeletonWarrior: {
    id: 'skeletonWarrior',
    gold: { min: 8, max: 22 },
    entries: [
      { itemId: 'boneMeal', weight: 10, min: 1, max: 3, chance: 0.6 },
      { itemId: 'potionMinorHealth', weight: 5, min: 1, max: 2, chance: 0.22 },
      { itemId: 'woodcuttersAxe', weight: 2, min: 1, max: 1, chance: 0.04 },
      { itemId: 'aetherlightBlade', weight: 1, min: 1, max: 1, chance: 0.015 },
      { itemId: 'wolfToothCharm', weight: 2, min: 1, max: 1, chance: 0.05 },
    ],
  },
  corruptedMage: {
    id: 'corruptedMage',
    gold: { min: 14, max: 32 },
    entries: [
      { itemId: 'corruptedCore', weight: 8, min: 1, max: 1, chance: 0.4 },
      { itemId: 'aetherShard', weight: 8, min: 1, max: 3, chance: 0.45 },
      { itemId: 'potionGreaterHealth', weight: 4, min: 1, max: 1, chance: 0.14 },
      { itemId: 'shardwoodStaff', weight: 1, min: 1, max: 1, chance: 0.02 },
      { itemId: 'aetherlens', weight: 1, min: 1, max: 1, chance: 0.02 },
    ],
  },

  /* ------------------------- Chests ------------------------- */
  starterSupplies: {
    id: 'starterSupplies',
    gold: { min: 12, max: 24 },
    entries: [{ itemId: 'potionMinorHealth', weight: 1, min: 2, max: 3, chance: 1 }],
    guaranteed: [{ itemId: 'breadRation', count: 2 }],
  },
  woodsCache: {
    id: 'woodsCache',
    gold: { min: 30, max: 60 },
    entries: [
      { itemId: 'potionMinorMana', weight: 1, min: 2, max: 3, chance: 1 },
      { itemId: 'aetherShard', weight: 1, min: 1, max: 3, chance: 0.8 },
    ],
    guaranteed: [{ itemId: 'wolfToothCharm', count: 1 }],
  },
  goblinStash: {
    id: 'goblinStash',
    gold: { min: 40, max: 80 },
    entries: [
      { itemId: 'goblinCharm', weight: 1, min: 2, max: 5, chance: 1 },
      { itemId: 'huntersDagger', weight: 1, min: 1, max: 1, chance: 0.5 },
      { itemId: 'mossweaveCoat', weight: 1, min: 1, max: 1, chance: 0.35 },
    ],
  },
  ruinsCache: {
    id: 'ruinsCache',
    gold: { min: 60, max: 120 },
    entries: [
      { itemId: 'potionGreaterHealth', weight: 1, min: 1, max: 2, chance: 0.9 },
      { itemId: 'boneMeal', weight: 1, min: 2, max: 4, chance: 0.7 },
      { itemId: 'emberTonic', weight: 1, min: 1, max: 1, chance: 0.25 },
    ],
  },
  ruinsVault: {
    id: 'ruinsVault',
    gold: { min: 140, max: 260 },
    entries: [
      { itemId: 'aetherlightBlade', weight: 1, min: 1, max: 1, chance: 0.5 },
      { itemId: 'ashplateHarness', weight: 1, min: 1, max: 1, chance: 0.5 },
      { itemId: 'potionGreaterHealth', weight: 1, min: 2, max: 3, chance: 1 },
    ],
    guaranteed: [{ itemId: 'caveSigil', count: 1 }],
  },
  cavesCache: {
    id: 'cavesCache',
    gold: { min: 90, max: 170 },
    entries: [
      { itemId: 'aetherShard', weight: 1, min: 3, max: 6, chance: 1 },
      { itemId: 'focusTonic', weight: 1, min: 1, max: 1, chance: 0.4 },
      { itemId: 'aetherlens', weight: 1, min: 1, max: 1, chance: 0.3 },
    ],
  },
  cavesVault: {
    id: 'cavesVault',
    gold: { min: 220, max: 400 },
    entries: [
      { itemId: 'shardwoodStaff', weight: 1, min: 1, max: 1, chance: 0.6 },
      { itemId: 'runeveilRobe', weight: 1, min: 1, max: 1, chance: 0.45 },
      { itemId: 'potionGreaterHealth', weight: 1, min: 3, max: 4, chance: 1 },
    ],
    guaranteed: [{ itemId: 'shrineKey', count: 1 }],
  },
  shrineOffering: {
    id: 'shrineOffering',
    gold: { min: 260, max: 460 },
    entries: [
      { itemId: 'emberfangSabre', weight: 1, min: 1, max: 1, chance: 0.4 },
      { itemId: 'runeveilRobe', weight: 1, min: 1, max: 1, chance: 0.4 },
      { itemId: 'aetherlens', weight: 1, min: 1, max: 1, chance: 0.5 },
      { itemId: 'focusTonic', weight: 1, min: 1, max: 2, chance: 0.7 },
    ],
  },
  wardenHoard: {
    id: 'wardenHoard',
    gold: { min: 600, max: 900 },
    entries: [
      { itemId: 'emberfangSabre', weight: 1, min: 1, max: 1, chance: 0.7 },
      { itemId: 'runeveilRobe', weight: 1, min: 1, max: 1, chance: 0.7 },
      { itemId: 'corruptedCore', weight: 1, min: 2, max: 4, chance: 1 },
    ],
    guaranteed: [{ itemId: 'shrikesCall', count: 1 }],
  },
};

export function getLootTable(id: string): LootTable {
  return LOOT_TABLES[id] ?? LOOT_TABLES.none;
}
