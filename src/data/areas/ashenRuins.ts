import type { AreaDef } from '../../game/areaTypes';
import { C } from '../../art/palette';

/**
 * ASHEN RUINS — environmental storytelling.
 *
 * The layout is a town grid that no longer works: streets that end in collapsed
 * walls, a plaza with a statue facing the wrong way, and a burnt line running
 * north-south that the player can follow to work out which way the fire came
 * from. Enemies here are undead, which is the first hint about what the Shrine
 * has been doing.
 */
export const ashenRuins: AreaDef = {
  id: 'ashenRuins',
  name: 'Ashen Ruins',
  subtitle: 'Nobody agrees what it was called',
  description:
    'A settlement that predates the Homestead by an argument nobody can settle. ' +
    'It burned, and then it kept burning in a way fire does not, and then it ' +
    'stopped — all in one night, according to the only account that survives.',
  biome: 'ruins',
  music: 'theme_ruins',
  recommendedLevel: 5,
  seed: 0x2c81,
  size: { w: 2400, h: 1900 },

  // The burn line. This area's whole premise is a fire that came from one
  // direction and stopped, and the layout was already built around a
  // north-south line the player can follow — but there was nothing on the
  // ground to follow. It is widest at the north gate and narrows going south,
  // so walking it backwards tells you where the fire came from without a
  // single line of dialogue.
  terrain: [
    {
      kind: 'ash',
      blobs: [
        { x: 1220, y: 320, r: 152 },
        { x: 1218, y: 520, r: 130 },
        { x: 1212, y: 720, r: 112 },
        { x: 1226, y: 920, r: 96 },
        { x: 1220, y: 1120, r: 82 },
        { x: 1222, y: 1320, r: 68 },
        { x: 1214, y: 1500, r: 54 },
      ],
    },
  ],

  walls: [
    { x: 0, y: 0, w: 2400, h: 100 },
    { x: 0, y: 1800, w: 2400, h: 100 },
    { x: 0, y: 0, w: 100, h: 1900 },
    { x: 2300, y: 0, w: 100, h: 1900 },
    // Standing wall segments: the street grid.
    { x: 380, y: 340, w: 480, h: 44 },
    { x: 380, y: 340, w: 44, h: 300 },
    { x: 1100, y: 300, w: 44, h: 420 },
    { x: 1100, y: 300, w: 380, h: 44 },
    { x: 1700, y: 520, w: 44, h: 460 },
    { x: 620, y: 1080, w: 520, h: 44 },
    { x: 1400, y: 1240, w: 44, h: 420 },
    { x: 1400, y: 1620, w: 500, h: 44 },
    // Sealed northern gate house, either side of the road to the Shrine.
    { x: 900, y: 100, w: 220, h: 120 },
    { x: 1300, y: 100, w: 220, h: 120 },
  ],

  clearings: [
    { x: 140, y: 820, w: 2120, h: 300 },
    { x: 1120, y: 160, w: 200, h: 1600 },
    { x: 860, y: 620, w: 560, h: 420 },
  ],

  props: [
    { type: 'statue', x: 1180, y: 800 },
    { type: 'pillar', x: 940, y: 660 },
    { type: 'pillar', x: 1420, y: 660, variant: 1 },
    { type: 'brokenPillar', x: 940, y: 980 },
    { type: 'brokenPillar', x: 1420, y: 980, variant: 1 },
    { type: 'archway', x: 1220, y: 300, collide: 0 },
    { type: 'brazier', x: 1080, y: 880 },
    { type: 'brazier', x: 1300, y: 880, variant: 1 },
    { type: 'grave', x: 520, y: 1380 },
    { type: 'grave', x: 580, y: 1420, variant: 1 },
    { type: 'grave', x: 470, y: 1450, variant: 2 },
    { type: 'grave', x: 620, y: 1330, variant: 3 },
    { type: 'bones', x: 700, y: 900 },
    { type: 'bones', x: 1680, y: 1160, variant: 1 },
    { type: 'bloodStain', x: 760, y: 960 },
    { type: 'deadTree', x: 300, y: 700 },
    { type: 'deadTree', x: 2100, y: 1420, variant: 1 },
    { type: 'cart', x: 1840, y: 900 },
    { type: 'obelisk', x: 1220, y: 1500 },
  ],

  scatter: [
    { type: 'rubble', count: 46, spacing: 70, variants: 5 },
    { type: 'brokenPillar', count: 14, spacing: 150, variants: 4, scaleMin: 0.8, scaleMax: 1.1 },
    { type: 'rock', count: 30, spacing: 80, variants: 4 },
    { type: 'deadTree', count: 16, spacing: 170, variants: 4, scaleMin: 0.8, scaleMax: 1.15 },
    { type: 'bones', count: 12, spacing: 120, variants: 4 },
  ],

  spawnPoints: {
    default: { x: 1220, y: 1680, facing: -Math.PI / 2 },
    fromWoods: { x: 1220, y: 1700, facing: -Math.PI / 2 },
    fromShrine: { x: 1220, y: 280, facing: Math.PI / 2 },
    respawn: { x: 1220, y: 1680, facing: -Math.PI / 2 },
  },

  portals: [
    {
      id: 'toWoods',
      x: 1220, y: 1840, radius: 80,
      toArea: 'whisperingWoods', toSpawn: 'fromRuins',
      label: 'Whispering Woods', facing: Math.PI / 2, style: 'path',
    },
    {
      id: 'toShrine',
      x: 1220, y: 140, radius: 80,
      toArea: 'forgottenShrine', toSpawn: 'fromRuins',
      label: 'The Forgotten Shrine', facing: -Math.PI / 2, style: 'archway',
      requires: {
        itemId: 'shrineKey',
        deniedMessage:
          'The gate does not have a lock. It has a decision, and it has not made it about you.',
      },
    },
  ],

  enemies: [
    { id: 'ar_skel_plaza', enemyId: 'skeletonWarrior', x: 1180, y: 820, level: 5, count: 3,
      spread: 150, patrolRadius: 120, respawn: 120 },
    { id: 'ar_skel_west', enemyId: 'skeletonWarrior', x: 520, y: 960, level: 5, count: 2,
      spread: 110, patrolRadius: 140, respawn: 120 },
    { id: 'ar_skel_graves', enemyId: 'skeletonWarrior', x: 560, y: 1400, level: 6, count: 3,
      spread: 130, patrolRadius: 90, respawn: 150 },
    { id: 'ar_mage_tower', enemyId: 'corruptedMage', x: 1780, y: 780, level: 6, count: 1,
      patrolRadius: 60, respawn: 180 },
    { id: 'ar_mage_north', enemyId: 'corruptedMage', x: 1240, y: 440, level: 7, count: 2,
      spread: 160, patrolRadius: 70, respawn: 180 },
    { id: 'ar_slime_cistern', enemyId: 'arcaneSlime', x: 1900, y: 1440, level: 5, count: 3,
      spread: 120, respawn: 150 },
    { id: 'ar_champion', enemyId: 'skeletonWarrior', x: 1900, y: 400, level: 8, elite: true,
      patrolRadius: 140, respawn: 0 },
  ],

  npcs: [
    { npcId: 'wren', x: 640, y: 820, facing: 0 },
  ],

  chests: [
    { id: 'ar_vault', x: 1860, y: 380, lootTableId: 'ruinsVault', landmark: true },
    { id: 'ar_cistern', x: 1960, y: 1520, lootTableId: 'ruinsCache' },
    { id: 'ar_gatehouse', x: 960, y: 260, lootTableId: 'ruinsCache' },
  ],

  landmarks: [
    {
      id: 'ar_plaza', name: 'The Turned Plaza', x: 1180, y: 800, radius: 260,
      message:
        'The statue faces north, away from the square it was built to watch. ' +
        'Somebody turned it. It took effort.',
    },
    { id: 'ar_graves', name: 'The Unmarked Rows', x: 560, y: 1400, radius: 220 },
  ],

  secrets: [
    {
      id: 'ar_cellar', x: 420, y: 520, radius: 90,
      name: 'A Sound Cellar',
      message: 'The trapdoor still works. Everything under it has been waiting politely.',
      reward: { xp: 220, gold: 120, itemId: 'ashplateHarness', count: 1 },
    },
    {
      id: 'ar_journal', x: 2060, y: 1180, radius: 80,
      name: "Someone's Last Camp",
      message: 'A bedroll, a cold fire, and a journal the rain got to first.',
      reward: { xp: 160, itemId: 'ruinedJournal', count: 1 },
    },
  ],

  ambient: { kind: 'ember', color: C.ember, rate: 4, rise: 30 },
};
