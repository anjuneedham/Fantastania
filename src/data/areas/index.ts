import type { AreaDef } from '../../game/areaTypes';
import { arcaneCaves } from './arcaneCaves';
import { ashenRuins } from './ashenRuins';
import { bossArena } from './bossArena';
import { forgottenShrine } from './forgottenShrine';
import { homestead } from './homestead';
import { whisperingWoods } from './whisperingWoods';

/**
 * The area registry. Adding a region to Aetheria: create the file, import it
 * here, add it to the array. Nothing else needs to change — the map screen,
 * fast travel, save system and portals all read this registry.
 */
const ALL: AreaDef[] = [
  homestead,
  whisperingWoods,
  ashenRuins,
  arcaneCaves,
  forgottenShrine,
  bossArena,
];

export const AREAS: Record<string, AreaDef> = Object.fromEntries(
  ALL.map((a) => [a.id, a]),
);

/** Presentation order for the world map, roughly the intended route. */
export const AREA_ORDER: readonly string[] = ALL.map((a) => a.id);

export function getArea(id: string): AreaDef {
  const area = AREAS[id];
  if (!area) throw new Error(`Unknown area id: ${id}`);
  return area;
}

export function tryGetArea(id: string): AreaDef | undefined {
  return AREAS[id];
}

/**
 * Map-screen positions, as fractions of the map panel. Kept here rather than in
 * each area file because they describe the *map*, not the place.
 */
export const AREA_MAP_POSITIONS: Record<string, { x: number; y: number }> = {
  homestead: { x: 0.14, y: 0.62 },
  whisperingWoods: { x: 0.37, y: 0.58 },
  ashenRuins: { x: 0.42, y: 0.24 },
  arcaneCaves: { x: 0.68, y: 0.66 },
  forgottenShrine: { x: 0.74, y: 0.3 },
  bossArena: { x: 0.9, y: 0.12 },
};

/** Connections drawn between nodes on the map screen. */
export const AREA_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['homestead', 'whisperingWoods'],
  ['whisperingWoods', 'ashenRuins'],
  ['whisperingWoods', 'arcaneCaves'],
  ['ashenRuins', 'forgottenShrine'],
  ['arcaneCaves', 'forgottenShrine'],
  ['forgottenShrine', 'bossArena'],
];
