import { PROPS, type PropType } from '../../art/environment';
import { Rng } from '../../engine/Rng';
import { dist2, pointInRect } from '../../engine/math';
import type {
  AreaDef, AreaRect, LandmarkDef, Requirement, SecretDef,
} from '../areaTypes';
import { getArea } from '../../data/areas';
import { tryGetItem } from '../../data/items';
import { Chest } from '../entities/Chest';
import { Enemy } from '../entities/Enemy';
import type { Interactable } from '../entities/Interactable';
import { Portal } from '../entities/Portal';
import { state } from '../GameState';
import type { PropInstance, World } from '../World';

/**
 * Turns an AreaDef into a populated World.
 *
 * All the placement logic lives here, so area files stay declarative. Scatter
 * is seeded per area: the same forest appears in the same arrangement on every
 * device and after every reload, which matters because the player will navigate
 * by landmarks they remember.
 */

export interface LoadedArea {
  def: AreaDef;
  portals: Portal[];
  enemies: Enemy[];
  /** Everything the player can walk up to and use. */
  interactables: Interactable[];
  /** The boss, once the encounter has started. */
  boss: Enemy | null;
  /** Landmarks not yet announced this session. */
  landmarks: LandmarkDef[];
  secrets: SecretDef[];
}

export function loadArea(world: World, areaId: string): LoadedArea {
  const def = getArea(areaId);
  world.clear();
  world.areaId = def.id;
  world.bounds = { x: 0, y: 0, w: def.size.w, h: def.size.h };

  for (const wall of def.walls ?? []) {
    world.obstacles.push({ kind: 'rect', x: wall.x, y: wall.y, w: wall.w, h: wall.h });
  }

  placeProps(world, def);

  const portals: Portal[] = [];
  for (const p of def.portals ?? []) {
    const portal = new Portal(p);
    world.addNow(portal);
    portals.push(portal);
  }

  const enemies = spawnEnemies(world, def);

  const interactables: Interactable[] = [];
  for (const placement of def.chests ?? []) {
    const chest = new Chest(placement);
    world.addNow(chest);
    interactables.push(chest);
  }

  // Props are static: sort once here so the renderer can merge instead of sort.
  world.props.sort((a, b) => a.y - b.y);
  world.glowProps = world.props.filter((p) => p.glow);

  state.markVisited(def.id);

  return {
    def,
    portals,
    enemies,
    interactables,
    boss: null,
    landmarks: (def.landmarks ?? []).filter((l) => !state.discoveredLocations.includes(l.id)),
    secrets: (def.secrets ?? []).filter((s) => !state.foundSecrets.includes(s.id)),
  };
}

/**
 * Populates an area's hostiles.
 *
 * Spawn groups with `respawn: 0` (elites, one-off encounters) stay dead once
 * cleared; everything else repopulates when the player returns, which keeps
 * travelling through a cleared zone from feeling like a ghost town while still
 * making a boss kill permanent.
 */
function spawnEnemies(world: World, def: AreaDef): Enemy[] {
  if (def.safe || !def.enemies) return [];
  const rng = new Rng(def.seed ^ 0x51ed);
  const out: Enemy[] = [];

  for (const spawn of def.enemies) {
    const permanent = !spawn.respawn;
    const key = `${def.id}:${spawn.id}`;
    if (permanent && state.clearedSpawns.includes(key)) continue;

    const count = spawn.count ?? 1;
    const spread = spawn.spread ?? 0;
    for (let i = 0; i < count; i++) {
      let x = spawn.x;
      let y = spawn.y;
      if (spread > 0 && count > 1) {
        // Ring placement with jitter, so a group of three does not stack up.
        const a = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const d = spread * rng.range(0.4, 1);
        x += Math.cos(a) * d;
        y += Math.sin(a) * d;
      }

      const enemy = new Enemy(spawn.enemyId, spawn.level, spawn.elite ?? false, key);
      // Nudge out of geometry rather than spawning inside a tree.
      const placed = findClearSpot(world, x, y, enemy.radius);
      enemy.x = placed.x;
      enemy.y = placed.y;
      enemy.setHome(placed.x, placed.y, spawn.patrolRadius ?? 90);
      enemy.pose.facing = rng.angle();
      world.addNow(enemy);
      out.push(enemy);
    }
  }
  return out;
}

/** Spirals outward from a point until a position clear of geometry is found. */
function findClearSpot(
  world: World, x: number, y: number, radius: number,
): { x: number; y: number } {
  if (world.isClear(x, y, radius)) return { x, y };
  for (let ring = 1; ring <= 6; ring++) {
    const r = ring * (radius + 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const nx = x + Math.cos(a) * r;
      const ny = y + Math.sin(a) * r;
      if (world.isClear(nx, ny, radius)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

/** Creates the area's boss. Called when the player trips the arena trigger. */
export function spawnBoss(world: World, def: AreaDef): Enemy | null {
  const boss = def.boss;
  if (!boss) return null;
  if (state.hasFlag(boss.defeatFlag)) return null;
  const enemy = new Enemy(boss.enemyId, boss.level, false, `${def.id}:boss`);
  enemy.x = boss.x;
  enemy.y = boss.y;
  enemy.setHome(boss.x, boss.y, 0);
  enemy.pose.facing = Math.PI / 2;
  world.addNow(enemy);
  return enemy;
}

function placeProps(world: World, def: AreaDef): void {
  const rng = new Rng(def.seed);
  const placed: Array<{ x: number; y: number; r: number }> = [];

  const add = (
    type: PropType, x: number, y: number, scale: number, variant: number, collideOverride?: number,
  ): void => {
    const spec = PROPS[type];
    const inst: PropInstance = {
      type, variant, x, y, scale,
      glow: !!spec.glow,
      flat: !!spec.flat,
    };
    world.props.push(inst);

    const collide = (collideOverride ?? spec.collide) * scale;
    if (collide > 0) {
      world.obstacles.push({ kind: 'circle', x, y, r: collide });
    }
    placed.push({ x, y, r: Math.max(collide, spec.w * scale * 0.3) });
  };

  for (const p of def.props ?? []) {
    add(p.type, p.x, p.y, p.scale ?? 1, p.variant ?? 0, p.collide);
  }

  for (const rule of def.scatter ?? []) {
    const region = rule.region ?? { x: 60, y: 60, w: def.size.w - 120, h: def.size.h - 120 };
    const spacing = rule.spacing ?? 70;
    const variants = rule.variants ?? 4;
    let placedCount = 0;
    // Bounded rejection sampling: give up rather than loop forever on a dense
    // area, since a few missing bushes is invisible and a hang is not.
    const maxAttempts = rule.count * 14;

    for (let attempt = 0; attempt < maxAttempts && placedCount < rule.count; attempt++) {
      const x = rng.range(region.x, region.x + region.w);
      const y = rng.range(region.y, region.y + region.h);

      if (inAnyRect(x, y, def.clearings)) continue;
      if (inAnyRect(x, y, def.walls)) continue;
      if (nearReserved(x, y, def, 110)) continue;
      if (tooClose(x, y, placed, spacing)) continue;

      const scale = rng.range(rule.scaleMin ?? 0.9, rule.scaleMax ?? 1.1);
      add(rule.type, x, y, scale, rng.int(0, variants - 1));
      placedCount++;
    }
  }
}

function inAnyRect(x: number, y: number, rects: AreaRect[] | undefined): boolean {
  if (!rects) return false;
  for (const r of rects) if (pointInRect(x, y, r)) return true;
  return false;
}

function tooClose(
  x: number, y: number, placed: Array<{ x: number; y: number; r: number }>, spacing: number,
): boolean {
  for (const p of placed) {
    const min = spacing + p.r * 0.35;
    if (dist2(x, y, p.x, p.y) < min * min) return true;
  }
  return false;
}

/** Keeps scatter off spawn points, portals, NPCs, chests and secrets. */
function nearReserved(x: number, y: number, def: AreaDef, pad: number): boolean {
  const check = (px: number, py: number, r: number): boolean =>
    dist2(x, y, px, py) < (r + pad) * (r + pad);

  for (const sp of Object.values(def.spawnPoints)) if (check(sp.x, sp.y, 60)) return true;
  for (const p of def.portals ?? []) if (check(p.x, p.y, p.radius)) return true;
  for (const n of def.npcs ?? []) if (check(n.x, n.y, 50)) return true;
  for (const c of def.chests ?? []) if (check(c.x, c.y, 50)) return true;
  for (const s of def.secrets ?? []) if (check(s.x, s.y, s.radius)) return true;
  for (const e of def.enemies ?? []) if (check(e.x, e.y, (e.spread ?? 0) + 60)) return true;
  if (def.boss && check(def.boss.x, def.boss.y, def.boss.triggerRadius)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Requirements                                                        */
/* ------------------------------------------------------------------ */

export interface RequirementResult {
  ok: boolean;
  /** Player-facing reason when `ok` is false. */
  reason?: string;
}

/**
 * Evaluates a gate. Used by portals, chests and conditional NPCs — one
 * implementation, so a locked door and a locked chest behave identically.
 */
export function checkRequirement(req: Requirement | undefined): RequirementResult {
  if (!req) return { ok: true };

  if (req.level !== undefined && state.level < req.level) {
    return { ok: false, reason: req.deniedMessage ?? `Requires level ${req.level}.` };
  }
  if (req.flag !== undefined && !state.hasFlag(req.flag)) {
    return { ok: false, reason: req.deniedMessage ?? 'Something is still missing here.' };
  }
  if (req.questCompleted !== undefined && !state.hasCompletedQuest(req.questCompleted)) {
    return { ok: false, reason: req.deniedMessage ?? 'There is unfinished business first.' };
  }
  if (req.itemId !== undefined) {
    const stack = state.inventory.find((s) => s.itemId === req.itemId);
    if (!stack || stack.count <= 0) {
      const item = tryGetItem(req.itemId);
      return {
        ok: false,
        reason: req.deniedMessage ?? `You need ${item?.name ?? 'something'} for this.`,
      };
    }
  }
  return { ok: true };
}

/** Where the player should appear when entering an area. */
export function spawnPointFor(def: AreaDef, id: string): { x: number; y: number; facing: number } {
  const sp = def.spawnPoints[id] ?? def.spawnPoints.default;
  if (!sp) {
    // Never strand the player: fall back to the middle of the area.
    return { x: def.size.w / 2, y: def.size.h / 2, facing: 0 };
  }
  return { x: sp.x, y: sp.y, facing: sp.facing ?? 0 };
}
