import type { AreaDef } from '../../game/areaTypes';
import { C } from '../../art/palette';

/**
 * THE FORGOTTEN SHRINE — the story hub.
 *
 * Quiet, symmetrical, and lit entirely in aether-cyan, which by this point in
 * the game the player reads as "magic" without being told. There are no random
 * enemies here on purpose: the area's job is to make the player slow down and
 * read, then commit to the boss door.
 */
export const forgottenShrine: AreaDef = {
  id: 'forgottenShrine',
  name: 'The Forgotten Shrine',
  subtitle: 'It remembers you first',
  description:
    'A terrace of pale stone, perfectly kept, in the middle of a region that ' +
    'has kept nothing. The shrine is not forgotten. The shrine is doing the ' +
    'forgetting, and it is very good at it.',
  biome: 'shrine',
  music: 'theme_shrine',
  recommendedLevel: 12,
  seed: 0x5d0c,
  size: { w: 1800, h: 1500 },

  // "A terrace of pale stone, perfectly kept" — the description's words, which
  // the ground never actually showed. The flagstone reaches to the balustrade
  // and stops, so the terrace has an edge you can see; the aether beneath the
  // shrine stone is the only place in the game where the magic is in the floor
  // rather than in an object standing on it.
  terrain: [
    {
      kind: 'stone',
      blobs: [
        { x: 900, y: 750, r: 292 },
        { x: 606, y: 750, r: 188 },
        { x: 1194, y: 750, r: 188 },
        { x: 900, y: 470, r: 170 },
        { x: 900, y: 1030, r: 170 },
      ],
    },
    {
      kind: 'arcane',
      blobs: [
        { x: 900, y: 706, r: 112 },
      ],
    },
  ],

  walls: [
    { x: 0, y: 0, w: 1800, h: 140 },
    { x: 0, y: 1360, w: 1800, h: 140 },
    { x: 0, y: 0, w: 140, h: 1500 },
    { x: 1660, y: 0, w: 140, h: 1500 },
    // The terrace balustrade, open at the four cardinal approaches.
    { x: 420, y: 420, w: 260, h: 36 },
    { x: 1120, y: 420, w: 260, h: 36 },
    { x: 420, y: 1044, w: 260, h: 36 },
    { x: 1120, y: 1044, w: 260, h: 36 },
    { x: 420, y: 420, w: 36, h: 200 },
    { x: 420, y: 880, w: 36, h: 200 },
    { x: 1344, y: 420, w: 36, h: 200 },
    { x: 1344, y: 880, w: 36, h: 200 },
  ],

  clearings: [
    { x: 420, y: 420, w: 960, h: 660 },
    { x: 820, y: 140, w: 160, h: 1220 },
    { x: 140, y: 680, w: 1520, h: 160 },
  ],

  props: [
    { type: 'shrineStone', x: 900, y: 700, scale: 1.6 },
    { type: 'statue', x: 620, y: 560 },
    { type: 'statue', x: 1180, y: 560, variant: 1 },
    { type: 'statue', x: 620, y: 940, variant: 2 },
    { type: 'statue', x: 1180, y: 940, variant: 3 },
    { type: 'pillar', x: 480, y: 480 },
    { type: 'pillar', x: 1320, y: 480, variant: 1 },
    { type: 'pillar', x: 480, y: 1020, variant: 2 },
    { type: 'pillar', x: 1320, y: 1020, variant: 3 },
    { type: 'brazier', x: 780, y: 620 },
    { type: 'brazier', x: 1020, y: 620, variant: 1 },
    { type: 'brazier', x: 780, y: 800, variant: 2 },
    { type: 'brazier', x: 1020, y: 800, variant: 3 },
    { type: 'obelisk', x: 900, y: 320 },
    { type: 'archway', x: 900, y: 1300, collide: 0 },
    { type: 'runeStone', x: 320, y: 760 },
    { type: 'runeStone', x: 1480, y: 760, variant: 1 },
  ],

  scatter: [
    { type: 'rubble', count: 12, spacing: 130, variants: 4 },
    { type: 'crystal', count: 10, spacing: 210, variants: 4, scaleMin: 0.5, scaleMax: 0.8 },
    { type: 'rock', count: 14, spacing: 120, variants: 4 },
  ],

  spawnPoints: {
    default: { x: 900, y: 1200, facing: -Math.PI / 2 },
    fromRuins: { x: 900, y: 1220, facing: -Math.PI / 2 },
    fromCaves: { x: 300, y: 760, facing: 0 },
    fromArena: { x: 900, y: 420, facing: Math.PI / 2 },
    respawn: { x: 900, y: 1200, facing: -Math.PI / 2 },
  },

  portals: [
    {
      id: 'toRuins',
      x: 900, y: 1400, radius: 80,
      toArea: 'ashenRuins', toSpawn: 'fromShrine',
      label: 'Ashen Ruins', facing: Math.PI / 2, style: 'archway',
    },
    {
      id: 'toCaves',
      x: 180, y: 760, radius: 76,
      toArea: 'arcaneCaves', toSpawn: 'fromShrine',
      label: 'Arcane Caves', facing: Math.PI, style: 'rift',
    },
    {
      id: 'toArena',
      x: 900, y: 200, radius: 84,
      toArea: 'bossArena', toSpawn: 'default',
      label: 'The Warden’s Vigil', facing: -Math.PI / 2, style: 'rift',
      requires: {
        flag: 'shrineAwakened',
        deniedMessage: 'The way north is a wall of still light. The shrine has not woken yet.',
      },
    },
  ],

  npcs: [
    { npcId: 'keeper', x: 900, y: 840, facing: -Math.PI / 2 },
    {
      npcId: 'mira', x: 1060, y: 1120, facing: -Math.PI / 2,
      requires: { flag: 'shrineAwakened' },
    },
  ],

  chests: [
    { id: 'fs_offering', x: 520, y: 700, lootTableId: 'shrineOffering', landmark: true },
  ],

  landmarks: [
    {
      id: 'fs_terrace', name: 'The Forgotten Shrine', x: 900, y: 760, radius: 340,
      message: 'Four statues. Four faces. None of them are looking at the shrine.',
    },
  ],

  secrets: [
    {
      id: 'fs_fifth_plinth', x: 1520, y: 1180, radius: 90,
      name: 'The Fifth Plinth',
      message:
        'An empty plinth behind the terrace, swept clean. Whatever stood here was ' +
        'removed carefully, and recently.',
      reward: { xp: 500, gold: 260, itemId: 'shrinewardSigil', count: 1 },
    },
  ],

  ambient: { kind: 'spark', color: C.aetherSoft, rate: 5, rise: 18 },
};
