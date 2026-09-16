import type { AreaDef } from '../../game/areaTypes';
import { C } from '../../art/palette';

/**
 * WHISPERING WOODS — the first hostile area.
 *
 * Built as a wide, forgiving space with clear sight lines and low-threat
 * enemies, because this is where the player learns to fight. The hidden glade
 * in the north-west rewards the first player who wanders off the path.
 */
export const whisperingWoods: AreaDef = {
  id: 'whisperingWoods',
  name: 'Whispering Woods',
  subtitle: 'It is not the wind',
  description:
    'Old growth that has started keeping its own counsel. The Homestead used to ' +
    'log the eastern stands; nobody has tried in two years, and the paths have ' +
    'begun quietly rearranging themselves.',
  biome: 'forest',
  music: 'theme_woods',
  recommendedLevel: 2,
  seed: 0x9ab3,
  size: { w: 2600, h: 2000 },

  walls: [
    { x: 0, y: 0, w: 2600, h: 100 },
    { x: 0, y: 1900, w: 2600, h: 100 },
    { x: 0, y: 340, w: 100, h: 1560 },
    { x: 0, y: 0, w: 100, h: 200 },
    // Eastern cliff, gapped where the cave mouth is.
    { x: 2500, y: 0, w: 100, h: 760 },
    { x: 2500, y: 1020, w: 100, h: 980 },
    // A thicket wall that hides the north-west glade from the main path.
    { x: 520, y: 420, w: 40, h: 320 },
    { x: 520, y: 420, w: 420, h: 40 },
  ],

  clearings: [
    { x: 120, y: 820, w: 2400, h: 320 },   // the main east-west path
    { x: 1180, y: 300, w: 480, h: 1400 },  // the north-south path to the Ruins
    { x: 180, y: 480, w: 320, h: 300 },    // the hidden glade
  ],

  props: [
    { type: 'archway', x: 160, y: 980, collide: 0 },
    { type: 'shrineStone', x: 320, y: 620, scale: 0.8 },
    { type: 'mushroom', x: 260, y: 700 },
    { type: 'mushroom', x: 380, y: 700, variant: 1 },
    { type: 'mushroom', x: 320, y: 530, variant: 2 },
    { type: 'stump', x: 900, y: 1240 },
    { type: 'deadTree', x: 1760, y: 500 },
    { type: 'deadTree', x: 1980, y: 1500, variant: 1 },
    { type: 'boulder', x: 1420, y: 1560 },
    { type: 'boulder', x: 760, y: 420, variant: 1 },
    { type: 'crystal', x: 2340, y: 900, scale: 0.9 },
    { type: 'bones', x: 1840, y: 1180 },
    { type: 'bones', x: 1900, y: 1220, variant: 1 },
    { type: 'cart', x: 1260, y: 1720 },
  ],

  scatter: [
    { type: 'pineTree', count: 78, spacing: 116, variants: 5, scaleMin: 0.85, scaleMax: 1.25 },
    { type: 'broadTree', count: 34, spacing: 140, variants: 4, scaleMin: 0.9, scaleMax: 1.3 },
    { type: 'bush', count: 54, spacing: 64, variants: 5 },
    { type: 'fern', count: 68, spacing: 40, variants: 5 },
    { type: 'rock', count: 26, spacing: 88, variants: 4 },
    { type: 'mushroom', count: 14, spacing: 110, variants: 4 },
  ],

  spawnPoints: {
    default: { x: 240, y: 980, facing: 0 },
    fromHomestead: { x: 220, y: 980, facing: 0 },
    fromRuins: { x: 1400, y: 260, facing: Math.PI / 2 },
    fromCaves: { x: 2420, y: 900, facing: Math.PI },
    respawn: { x: 260, y: 980, facing: 0 },
  },

  portals: [
    {
      id: 'toHomestead',
      x: 120, y: 980, radius: 70,
      toArea: 'homestead', toSpawn: 'fromWoods',
      label: 'The Homestead', facing: Math.PI, style: 'path',
    },
    {
      id: 'toRuins',
      x: 1400, y: 140, radius: 80,
      toArea: 'ashenRuins', toSpawn: 'fromWoods',
      label: 'Ashen Ruins', facing: -Math.PI / 2, style: 'archway',
      requires: {
        level: 3,
        deniedMessage: 'The air off the Ruins is thick and wrong. Not yet — reach level 3 first.',
      },
    },
    {
      id: 'toCaves',
      x: 2540, y: 900, radius: 80,
      toArea: 'arcaneCaves', toSpawn: 'fromWoods',
      label: 'Arcane Caves', facing: 0, style: 'cave',
      requires: {
        itemId: 'caveSigil',
        deniedMessage: 'The cave mouth is sealed by a humming ward. Something must answer it.',
      },
    },
  ],

  enemies: [
    { id: 'ww_wolf_path_1', enemyId: 'shadowWolf', x: 820, y: 940, level: 2, count: 2, spread: 90,
      patrolRadius: 140, respawn: 90 },
    { id: 'ww_wolf_path_2', enemyId: 'shadowWolf', x: 1520, y: 1080, level: 2, count: 2, spread: 110,
      patrolRadius: 160, respawn: 90 },
    { id: 'ww_wolf_deep', enemyId: 'shadowWolf', x: 2080, y: 620, level: 3, count: 3, spread: 130,
      patrolRadius: 180, respawn: 120 },
    { id: 'ww_goblin_camp', enemyId: 'forestGoblin', x: 1300, y: 1560, level: 2, count: 3, spread: 120,
      patrolRadius: 100, respawn: 120 },
    { id: 'ww_goblin_north', enemyId: 'forestGoblin', x: 1380, y: 520, level: 3, count: 2, spread: 90,
      patrolRadius: 110, respawn: 120 },
    { id: 'ww_slime_hollow', enemyId: 'arcaneSlime', x: 2180, y: 1420, level: 3, count: 2, spread: 100,
      respawn: 150 },
    { id: 'ww_alpha', enemyId: 'shadowWolf', x: 620, y: 1640, level: 4, elite: true,
      patrolRadius: 200, respawn: 0 },
  ],

  npcs: [
    { npcId: 'hollow', x: 1180, y: 700, facing: Math.PI / 2 },
  ],

  chests: [
    { id: 'ww_glade_cache', x: 260, y: 560, lootTableId: 'woodsCache', landmark: true },
    { id: 'ww_camp_stash', x: 1180, y: 1620, lootTableId: 'goblinStash' },
  ],

  landmarks: [
    {
      id: 'ww_entrance', name: 'Whispering Woods', x: 300, y: 980, radius: 180,
      message: 'The trees lean in. You decide, firmly, that this is the wind.',
    },
    {
      id: 'ww_hollow', name: 'The Rotting Hollow', x: 2000, y: 1400, radius: 240,
    },
  ],

  secrets: [
    {
      id: 'ww_glade', x: 300, y: 600, radius: 130,
      name: 'The Quiet Glade',
      message: 'A ring of pale mushrooms and one standing stone. The whispering stops here.',
      reward: { xp: 90, gold: 35, itemId: 'aetherShard', count: 2 },
    },
    {
      id: 'ww_hollow_tree', x: 1980, y: 1500, radius: 70,
      name: 'The Hollow Tree',
      message: 'Somebody hid something in here and never came back for it.',
      reward: { xp: 60, itemId: 'potionGreaterHealth', count: 2 },
    },
  ],

  ambient: { kind: 'spark', color: C.aether, rate: 3.2, rise: 14 },
};
