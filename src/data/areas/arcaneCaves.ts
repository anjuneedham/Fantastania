import type { AreaDef } from '../../game/areaTypes';
import { C } from '../../art/palette';

/**
 * ARCANE CAVES — the dungeon.
 *
 * Tight corridors between wide chambers, which inverts the Woods: here the
 * player cannot kite freely, so positioning and ability cooldowns matter more
 * than raw movement. The three resonance stones form the area's puzzle: light
 * all three and the sealed inner chamber opens.
 */
export const arcaneCaves: AreaDef = {
  id: 'arcaneCaves',
  name: 'Arcane Caves',
  subtitle: 'The stone remembers a tune',
  description:
    'Not caves, strictly. Something hollowed these out on purpose, in a pattern ' +
    'that is almost symmetrical, and then the aether got in and made its own ' +
    'additions.',
  biome: 'caves',
  music: 'theme_caves',
  recommendedLevel: 8,
  seed: 0x77e2,
  size: { w: 2200, h: 2200 },

  walls: [
    { x: 0, y: 0, w: 2200, h: 120 },
    { x: 0, y: 2080, w: 2200, h: 120 },
    { x: 0, y: 0, w: 120, h: 2200 },
    { x: 2080, y: 0, w: 120, h: 2200 },

    // Entry corridor walls (west).
    { x: 120, y: 120, w: 440, h: 820 },
    { x: 120, y: 1180, w: 440, h: 900 },

    // Central chamber walls.
    { x: 820, y: 120, w: 180, h: 560 },
    { x: 820, y: 940, w: 180, h: 280 },
    { x: 820, y: 1480, w: 180, h: 600 },

    // Eastern chambers.
    { x: 1420, y: 120, w: 200, h: 420 },
    { x: 1420, y: 800, w: 200, h: 340 },
    { x: 1420, y: 1400, w: 200, h: 680 },

    // The sealed inner chamber's outer shell, gapped at the door.
    { x: 1740, y: 760, w: 60, h: 200 },
    { x: 1740, y: 1160, w: 60, h: 220 },
    { x: 1740, y: 760, w: 300, h: 60 },
    { x: 1740, y: 1320, w: 300, h: 60 },
  ],

  clearings: [
    { x: 560, y: 940, w: 260, h: 240 },
    { x: 1000, y: 680, w: 420, h: 800 },
    { x: 1620, y: 540, w: 420, h: 260 },
    { x: 1620, y: 1140, w: 420, h: 260 },
  ],

  props: [
    { type: 'crystal', x: 700, y: 1040, scale: 1.2 },
    { type: 'crystal', x: 1200, y: 760, scale: 1.1, variant: 1 },
    { type: 'crystal', x: 1180, y: 1420, variant: 2 },
    { type: 'crystal', x: 1880, y: 640, scale: 0.9, variant: 3 },
    { type: 'runeStone', x: 1060, y: 900 },
    { type: 'runeStone', x: 1340, y: 1240, variant: 1 },
    { type: 'runeStone', x: 1180, y: 1120, variant: 2 },
    { type: 'obelisk', x: 1900, y: 1060 },
    { type: 'stalagmite', x: 640, y: 1120 },
    { type: 'stalagmite', x: 1040, y: 1340, variant: 1 },
    { type: 'stalagmite', x: 1360, y: 820, variant: 2 },
    { type: 'bones', x: 1240, y: 1000 },
    { type: 'mushroom', x: 620, y: 980, variant: 3 },
    { type: 'mushroom', x: 1720, y: 1240, variant: 4 },
  ],

  scatter: [
    { type: 'stalagmite', count: 44, spacing: 96, variants: 5, scaleMin: 0.7, scaleMax: 1.3 },
    { type: 'rock', count: 34, spacing: 78, variants: 4 },
    { type: 'crystal', count: 16, spacing: 190, variants: 4, scaleMin: 0.5, scaleMax: 0.85 },
    { type: 'mushroom', count: 22, spacing: 90, variants: 5 },
    { type: 'bones', count: 10, spacing: 140, variants: 4 },
  ],

  spawnPoints: {
    default: { x: 300, y: 1060, facing: 0 },
    fromWoods: { x: 260, y: 1060, facing: 0 },
    fromShrine: { x: 1180, y: 260, facing: Math.PI / 2 },
    respawn: { x: 300, y: 1060, facing: 0 },
  },

  portals: [
    {
      id: 'toWoods',
      x: 160, y: 1060, radius: 70,
      toArea: 'whisperingWoods', toSpawn: 'fromCaves',
      label: 'Whispering Woods', facing: Math.PI, style: 'cave',
    },
    {
      id: 'toShrine',
      x: 1180, y: 180, radius: 76,
      toArea: 'forgottenShrine', toSpawn: 'fromCaves',
      label: 'The Forgotten Shrine', facing: -Math.PI / 2, style: 'rift',
      requires: {
        flag: 'cavesResonanceSolved',
        deniedMessage: 'The rift is inert. Three stones, three tones — none of them sounding.',
      },
    },
  ],

  enemies: [
    { id: 'ac_slime_entry', enemyId: 'arcaneSlime', x: 700, y: 1060, level: 8, count: 3,
      spread: 110, respawn: 140 },
    { id: 'ac_slime_hall', enemyId: 'arcaneSlime', x: 1180, y: 1180, level: 8, count: 4,
      spread: 160, respawn: 140 },
    { id: 'ac_mage_north', enemyId: 'corruptedMage', x: 1200, y: 780, level: 9, count: 2,
      spread: 140, patrolRadius: 70, respawn: 200 },
    { id: 'ac_mage_east', enemyId: 'corruptedMage', x: 1840, y: 640, level: 9, count: 2,
      spread: 120, patrolRadius: 60, respawn: 200 },
    { id: 'ac_skel_deep', enemyId: 'skeletonWarrior', x: 1840, y: 1240, level: 10, count: 3,
      spread: 130, patrolRadius: 100, respawn: 200 },
    { id: 'ac_warden', enemyId: 'corruptedMage', x: 1900, y: 1060, level: 11, elite: true,
      patrolRadius: 80, respawn: 0 },
  ],

  chests: [
    { id: 'ac_inner_vault', x: 1900, y: 1040, lootTableId: 'cavesVault', landmark: true,
      requires: {
        flag: 'cavesResonanceSolved',
        deniedMessage: 'Sealed. The three stones are still silent.',
      } },
    { id: 'ac_side_cache', x: 1880, y: 560, lootTableId: 'cavesCache' },
  ],

  landmarks: [
    {
      id: 'ac_hall', name: 'The Resonant Hall', x: 1180, y: 1080, radius: 300,
      message: 'Three stones, set in a triangle. Strike one and the other two answer.',
    },
  ],

  secrets: [
    {
      id: 'ac_seam', x: 640, y: 1600, radius: 90,
      name: 'A Seam in the Rock',
      message: 'Raw aether, still growing. It has been doing this for a very long time.',
      reward: { xp: 320, gold: 180, itemId: 'aetherShard', count: 5 },
    },
  ],

  ambient: { kind: 'rune', color: C.violet, rate: 3.6, rise: 12 },
};
