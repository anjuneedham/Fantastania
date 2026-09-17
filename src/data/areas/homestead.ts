import type { AreaDef } from '../../game/areaTypes';
import { C } from '../../art/palette';

/**
 * HOMESTEAD — the starting area.
 *
 * Deliberately small, safe and warm: amber light, tended fences, no hostiles.
 * Everything the player needs to learn (move, talk, open a chest, equip, leave)
 * is inside one screen-and-a-half, and the only exit is east toward the Woods.
 */
export const homestead: AreaDef = {
  id: 'homestead',
  name: 'The Homestead',
  subtitle: 'Where the lamps are still lit',
  description:
    'A cluster of steadings in the lee of the eastern ridge. Nine families, one ' +
    'well, and a standing agreement not to go into the Woods after dark — an ' +
    'agreement that has been holding up worse every season.',
  biome: 'homestead',
  music: 'theme_homestead',
  recommendedLevel: 1,
  seed: 0x4f17,
  size: { w: 1800, h: 1300 },
  safe: true,

  walls: [
    // Ridge along the north and south, funnelling the player east.
    { x: 0, y: 0, w: 1800, h: 120 },
    { x: 0, y: 1180, w: 1800, h: 120 },
    { x: 0, y: 0, w: 120, h: 1300 },
    // The eastern ridge, with a gap at the path out.
    { x: 1700, y: 0, w: 100, h: 520 },
    { x: 1700, y: 780, w: 100, h: 520 },
  ],

  clearings: [
    { x: 260, y: 520, w: 1440, h: 300 },  // the road east
    { x: 620, y: 300, w: 520, h: 520 },   // the commons
  ],

  props: [
    { type: 'cottage', x: 460, y: 430 },
    { type: 'cottage', x: 980, y: 380, variant: 1 },
    { type: 'cottage', x: 1320, y: 960, variant: 2 },
    { type: 'well', x: 800, y: 700 },
    { type: 'brazier', x: 660, y: 640 },
    { type: 'brazier', x: 960, y: 640, variant: 1 },
    { type: 'brazier', x: 1580, y: 600, variant: 2 },
    { type: 'cart', x: 1140, y: 760 },
    { type: 'banner', x: 300, y: 620 },
    { type: 'banner', x: 300, y: 760, variant: 1 },
    { type: 'fence', x: 560, y: 900 },
    { type: 'fence', x: 648, y: 900, variant: 1 },
    { type: 'fence', x: 736, y: 900, variant: 2 },
    { type: 'fence', x: 824, y: 900, variant: 3 },
    { type: 'stump', x: 1180, y: 480 },
    { type: 'broadTree', x: 300, y: 1040 },
    { type: 'broadTree', x: 1480, y: 320, variant: 1 },
    { type: 'signpost', x: 1600, y: 660 },
  ],

  scatter: [
    { type: 'bush', count: 22, spacing: 60, variants: 4, scaleMin: 0.8, scaleMax: 1.2 },
    { type: 'fern', count: 18, spacing: 44, variants: 4 },
    { type: 'rock', count: 10, spacing: 90, variants: 4, scaleMin: 0.7, scaleMax: 1.1 },
    { type: 'pineTree', count: 12, spacing: 130, variants: 4,
      region: { x: 140, y: 140, w: 1520, h: 240 } },
  ],

  spawnPoints: {
    default: { x: 460, y: 700, facing: 0 },
    fromWoods: { x: 1620, y: 650, facing: Math.PI },
    respawn: { x: 800, y: 780, facing: -Math.PI / 2 },
  },

  portals: [
    {
      id: 'toWoods',
      x: 1750, y: 650, radius: 70,
      toArea: 'whisperingWoods', toSpawn: 'fromHomestead',
      label: 'Whispering Woods',
      facing: 0,
      style: 'path',
    },
  ],

  npcs: [
    { npcId: 'mira', x: 800, y: 620, facing: Math.PI / 2 },
    { npcId: 'garrick', x: 1140, y: 640, facing: Math.PI / 2 },
    { npcId: 'tobin', x: 520, y: 880, facing: 0 },
  ],

  chests: [
    { id: 'homestead_supply', x: 380, y: 520, lootTableId: 'starterSupplies' },
  ],

  landmarks: [
    {
      id: 'homestead_commons', name: 'The Commons', x: 800, y: 700, radius: 200,
      message: 'Somebody has kept the braziers burning all night. Again.',
    },
  ],

  secrets: [
    {
      id: 'homestead_loose_board', x: 1330, y: 1040, radius: 46,
      name: 'A Loose Board',
      message: 'Under the porch: a tin box, a handful of coins, and an apology note.',
      reward: { gold: 40, xp: 25 },
    },
  ],

  ambient: { kind: 'ember', color: C.emberHot, rate: 2.4, rise: 22 },
};
