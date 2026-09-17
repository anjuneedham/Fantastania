import type { BiomeId, PropType } from '../art/environment';
import type { TerrainPatch } from '../art/terrain';

/**
 * The area schema.
 *
 * An area is authored as data: a size, some hand-placed landmarks, a few
 * scatter rules for the filler, and lists of portals, spawns, NPCs, chests and
 * secrets. AreaManager turns one of these into a live World. Adding a region to
 * Aetheria means adding a file in `data/areas/` and registering it — no system
 * enumerates areas by name.
 */

export interface AreaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Conditions gating a portal, chest, NPC, dialogue node or choice. Every
 * present condition must pass. One shared shape means a locked door, a hidden
 * dialogue option and a conditional NPC all behave identically.
 */
export interface Requirement {
  level?: number;
  /** Story flag that must be truthy. */
  flag?: string;
  /** Story flag that must be falsy. */
  notFlag?: string;
  /** Item that must be in the inventory (not consumed unless `consumeItem`). */
  itemId?: string;
  itemCount?: number;
  consumeItem?: boolean;
  /** Quest that must be turned in. */
  questCompleted?: string;
  /** Quest that must be accepted and not yet turned in. */
  questActive?: string;
  /** Quest whose objectives are all met but which has not been turned in. */
  questReady?: string;
  /** Quest that must NOT have been accepted or completed. */
  questNotStarted?: string;
  /** Minimum gold. */
  gold?: number;
  /** Message shown when the requirement is not met. */
  deniedMessage?: string;
}

export interface PortalDef {
  id: string;
  x: number;
  y: number;
  /** Trigger radius in world units. */
  radius: number;
  toArea: string;
  toSpawn: string;
  /** Shown on the interaction prompt, e.g. "Whispering Woods". */
  label: string;
  requires?: Requirement;
  /** Direction the player faces on arrival, in radians. */
  facing?: number;
  /** Visual treatment of the gateway. */
  style?: 'path' | 'archway' | 'cave' | 'rift' | 'door';
}

export interface AreaPropPlacement {
  type: PropType;
  x: number;
  y: number;
  scale?: number;
  variant?: number;
  /** Overrides the prop's default collision radius; 0 disables it. */
  collide?: number;
}

export interface ScatterRule {
  type: PropType;
  count: number;
  /** Region to scatter within; defaults to the whole area. */
  region?: AreaRect;
  scaleMin?: number;
  scaleMax?: number;
  /** Minimum distance from anything already placed. */
  spacing?: number;
  /** Number of distinct pre-rendered variants to draw from. */
  variants?: number;
}

export interface EnemySpawnDef {
  id: string;
  enemyId: string;
  x: number;
  y: number;
  level: number;
  /** Extra copies scattered within `spread` of (x, y). */
  count?: number;
  spread?: number;
  /** Radius the enemy patrols around its spawn point. */
  patrolRadius?: number;
  /** Seconds before a cleared spawn returns. 0 or omitted = never. */
  respawn?: number;
  /** Elite enemies get more health, a title and better loot. */
  elite?: boolean;
}

export interface NpcPlacement {
  npcId: string;
  x: number;
  y: number;
  facing?: number;
  /** Only appears when the requirement passes. */
  requires?: Requirement;
}

export interface ChestPlacement {
  id: string;
  x: number;
  y: number;
  lootTableId: string;
  requires?: Requirement;
  /** Chests marked `landmark` draw a beam so they read from across the map. */
  landmark?: boolean;
}

export interface SecretDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  name: string;
  /** Flavour text shown when discovered. */
  message: string;
  reward?: { gold?: number; xp?: number; itemId?: string; count?: number };
}

export interface LandmarkDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  /** Shown once, as a title card, when first entered. */
  message?: string;
}

export interface BossEncounterDef {
  enemyId: string;
  x: number;
  y: number;
  level: number;
  /** Player entering this radius starts the fight and seals the arena. */
  triggerRadius: number;
  /** Flag set once the boss dies. */
  defeatFlag: string;
  /** Music that plays for the fight. */
  music?: string;
  introLine?: string;
}

export interface AreaDef {
  id: string;
  name: string;
  /** Short line under the name on the title card. */
  subtitle: string;
  description: string;
  biome: BiomeId;
  music: string;
  recommendedLevel: number;
  /** Deterministic seed for scatter and decoration. */
  seed: number;
  size: { w: number; h: number };

  /** Safe areas suppress hostile spawns and regenerate the player faster. */
  safe?: boolean;

  /**
   * Ground terrain: pools, bogs, burns, flagstone. Drawn over the biome
   * ground, under everything else. Solid kinds (deep water) become collision
   * automatically, so a pond is a barrier without any hand-authored wall.
   */
  terrain?: TerrainPatch[];
  /** Hand-placed collision geometry (cliff walls, buildings, chasms). */
  walls?: AreaRect[];
  /** Hand-placed landmark props. */
  props?: AreaPropPlacement[];
  /** Procedural filler. */
  scatter?: ScatterRule[];
  /** Regions scatter must avoid (paths, clearings, arenas). */
  clearings?: AreaRect[];

  spawnPoints: Record<string, { x: number; y: number; facing?: number }>;
  portals?: PortalDef[];
  enemies?: EnemySpawnDef[];
  npcs?: NpcPlacement[];
  chests?: ChestPlacement[];
  secrets?: SecretDef[];
  landmarks?: LandmarkDef[];
  boss?: BossEncounterDef;

  /** Drifting ambient particles: motes, embers, falling leaves. */
  ambient?: {
    kind: 'spark' | 'ember' | 'leaf' | 'dust' | 'rune';
    color: string;
    /** Particles per second across the visible area. */
    rate: number;
    rise?: number;
  };
}
