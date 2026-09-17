import type { AreaDef } from '../../game/areaTypes';
import { C } from '../../art/palette';

/**
 * BOSS ARENA — the first major encounter.
 *
 * A deliberately bare circular terrace. There is no cover and nowhere to kite
 * to, so the fight is decided by the player's grasp of dodge timing and ability
 * rotation — everything the previous five areas were teaching.
 */
export const bossArena: AreaDef = {
  id: 'bossArena',
  name: "The Warden's Vigil",
  subtitle: 'Something has been standing here a long time',
  description:
    'A ring of black stone above the shrine, worn smooth in a circle by ' +
    'something that has been pacing it for longer than the Homestead has ' +
    'existed.',
  biome: 'arena',
  music: 'theme_boss',
  recommendedLevel: 14,
  seed: 0x1f44,
  size: { w: 1400, h: 1200 },

  // "Worn smooth in a circle by something that has been pacing it." The arena
  // was a bare terrace with that written about it; this is the pacing, on the
  // floor. It also pushes the rubble scatter out to the rim, which leaves the
  // fighting surface clean — exactly what a no-cover duel needs.
  terrain: [
    {
      kind: 'ash',
      blobs: [
        { x: 700, y: 600, r: 326 },
        { x: 700, y: 430, r: 190 },
      ],
    },
  ],

  walls: [
    { x: 0, y: 0, w: 1400, h: 160 },
    { x: 0, y: 1040, w: 1400, h: 160 },
    { x: 0, y: 0, w: 160, h: 1200 },
    { x: 1240, y: 0, w: 160, h: 1200 },
    // Corner buttresses round the square arena off toward a circle.
    { x: 160, y: 160, w: 150, h: 110 },
    { x: 1090, y: 160, w: 150, h: 110 },
    { x: 160, y: 930, w: 150, h: 110 },
    { x: 1090, y: 930, w: 150, h: 110 },
  ],

  clearings: [
    { x: 260, y: 240, w: 880, h: 720 },
  ],

  props: [
    { type: 'obelisk', x: 340, y: 320 },
    { type: 'obelisk', x: 1060, y: 320, variant: 1 },
    { type: 'obelisk', x: 340, y: 880, variant: 2 },
    { type: 'obelisk', x: 1060, y: 880, variant: 3 },
    { type: 'brazier', x: 500, y: 260 },
    { type: 'brazier', x: 900, y: 260, variant: 1 },
    { type: 'bones', x: 560, y: 760 },
    { type: 'bones', x: 820, y: 700, variant: 1 },
    { type: 'bones', x: 700, y: 840, variant: 2 },
    { type: 'bloodStain', x: 700, y: 620 },
    { type: 'bloodStain', x: 620, y: 700, variant: 1 },
  ],

  scatter: [
    { type: 'rubble', count: 16, spacing: 90, variants: 4 },
  ],

  spawnPoints: {
    default: { x: 700, y: 940, facing: -Math.PI / 2 },
    respawn: { x: 700, y: 940, facing: -Math.PI / 2 },
  },

  portals: [
    {
      id: 'toShrine',
      x: 700, y: 1060, radius: 80,
      toArea: 'forgottenShrine', toSpawn: 'fromArena',
      label: 'The Forgotten Shrine', facing: Math.PI / 2, style: 'rift',
    },
  ],

  boss: {
    enemyId: 'hollowWarden',
    x: 700, y: 430,
    level: 15,
    triggerRadius: 320,
    defeatFlag: 'wardenDefeated',
    music: 'theme_boss',
    introLine: 'IT HAS BEEN SO QUIET.',
  },

  landmarks: [
    { id: 'ba_vigil', name: "The Warden's Vigil", x: 700, y: 600, radius: 400 },
  ],

  ambient: { kind: 'ember', color: C.blood, rate: 3, rise: 26 },
};
