import { PROPS, drawProp, type PropType } from '../art/environment';
import { FloatingTextSystem, ParticleSystem, type ParticleKind } from '../art/fx';
import { C } from '../art/palette';
import type { AudioBus } from '../engine/AudioBus';
import type { Camera } from '../engine/Camera';
import { circleRectOverlap, clamp, dist2 } from '../engine/math';
import { Actor, Entity, type Faction, type WorldLike } from './entities/Entity';
import { bus } from './events';
import { state } from './GameState';
import type { DamageEvent } from './types';

/**
 * The live simulation container: entities, collision, the damage pipeline and
 * the effect systems. One World exists per loaded area; everything in it is
 * disposable, because all durable progress lives in GameState.
 */

export interface RectObstacle {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleObstacle {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
}

export type Obstacle = RectObstacle | CircleObstacle;

/**
 * A placed piece of scenery. Props never move and never update, so they live
 * outside the entity list: they are pre-sorted by depth once at area load and
 * merged into the render order each frame, which keeps a 300-tree forest at
 * zero simulation cost.
 */
export interface PropInstance {
  type: PropType;
  variant: number;
  x: number;
  y: number;
  scale: number;
  /** True when the prop emits light and needs the live glow pass. */
  glow: boolean;
  /** True for decals that always draw beneath actors. */
  flat: boolean;
}

export interface WorldServices {
  audio: AudioBus;
  camera: Camera;
}

export class World implements WorldLike {
  entities: Entity[] = [];
  actors: Actor[] = [];
  obstacles: Obstacle[] = [];
  /** Sorted by y at load time; never re-sorted. */
  props: PropInstance[] = [];
  /** Subset of `props` that emits light. */
  glowProps: PropInstance[] = [];
  bounds = { x: 0, y: 0, w: 2400, h: 1600 };

  readonly particles = new ParticleSystem();
  readonly texts = new FloatingTextSystem();

  time = 0;
  /** Set by the scene; used for area-scoped logic and audio positioning. */
  areaId = 'homestead';

  private readonly services: WorldServices;
  private pendingSpawns: Entity[] = [];

  constructor(services: WorldServices) {
    this.services = services;
  }

  clear(): void {
    this.entities.length = 0;
    this.actors.length = 0;
    this.obstacles.length = 0;
    this.props.length = 0;
    this.glowProps.length = 0;
    this.pendingSpawns.length = 0;
    this.particles.clear();
    this.texts.clear();
    this.time = 0;
  }

  spawn(entity: Entity): void {
    // Deferred so spawning from inside an update never mutates the array we are
    // iterating.
    this.pendingSpawns.push(entity);
  }

  /** Adds immediately; used during area load, before the first update. */
  addNow(entity: Entity): void {
    this.entities.push(entity);
    if (entity instanceof Actor) this.actors.push(entity);
  }

  update(dt: number): void {
    this.time += dt;

    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (!e.expired) e.update(dt, this);
    }

    this.separateActors();
    this.particles.update(dt);
    this.texts.update(dt);

    if (this.pendingSpawns.length > 0) {
      for (const e of this.pendingSpawns) this.addNow(e);
      this.pendingSpawns.length = 0;
    }

    // Compact in place rather than filtering into a new array each frame.
    let write = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (!e.expired) this.entities[write++] = e;
    }
    this.entities.length = write;

    write = 0;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.expired) this.actors[write++] = a;
    }
    this.actors.length = write;
  }

  /* ------------------------------------------------------------------ */
  /* Collision                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Moves an entity by (dx, dy), resolving against obstacles and world bounds.
   * Axes are resolved separately so a player sliding along a wall keeps their
   * perpendicular speed instead of sticking.
   */
  moveWithCollision(entity: Entity, dx: number, dy: number): void {
    if (dx !== 0) {
      entity.x += dx;
      this.resolveAxis(entity, true);
    }
    if (dy !== 0) {
      entity.y += dy;
      this.resolveAxis(entity, false);
    }

    const b = this.bounds;
    const r = entity.radius;
    entity.x = clamp(entity.x, b.x + r, b.x + b.w - r);
    entity.y = clamp(entity.y, b.y + r, b.y + b.h - r);
  }

  private resolveAxis(entity: Entity, horizontal: boolean): void {
    const r = entity.radius;
    for (const ob of this.obstacles) {
      if (ob.kind === 'rect') {
        if (!circleRectOverlap(entity.x, entity.y, r, ob)) continue;
        if (horizontal) {
          const fromLeft = entity.x < ob.x + ob.w / 2;
          entity.x = fromLeft ? ob.x - r : ob.x + ob.w + r;
        } else {
          const fromTop = entity.y < ob.y + ob.h / 2;
          entity.y = fromTop ? ob.y - r : ob.y + ob.h + r;
        }
      } else {
        const combined = ob.r + r;
        const d2 = dist2(entity.x, entity.y, ob.x, ob.y);
        if (d2 >= combined * combined) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const nx = (entity.x - ob.x) / d;
        const ny = (entity.y - ob.y) / d;
        // Circles push out radially; splitting by axis would look wrong.
        entity.x = ob.x + nx * combined;
        entity.y = ob.y + ny * combined;
      }
    }
  }

  /** True when a circle at (x, y) would be clear of geometry. */
  isClear(x: number, y: number, r: number): boolean {
    const b = this.bounds;
    if (x - r < b.x || y - r < b.y || x + r > b.x + b.w || y + r > b.y + b.h) return false;
    for (const ob of this.obstacles) {
      if (ob.kind === 'rect') {
        if (circleRectOverlap(x, y, r, ob)) return false;
      } else {
        const combined = ob.r + r;
        if (dist2(x, y, ob.x, ob.y) < combined * combined) return false;
      }
    }
    return true;
  }

  /** Gentle mutual push so actors never occupy the same point. */
  private separateActors(): void {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.solid || a.isDead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.solid || b.isDead) continue;
        const min = a.radius + b.radius;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 >= min * min || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const overlap = (min - d) * 0.5;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        // The player is heavier than trash mobs, so a crowd cannot shove them.
        const aWeight = a.faction === 'player' ? 0.25 : 1;
        const bWeight = b.faction === 'player' ? 0.25 : 1;
        a.x -= nx * overlap * aWeight;
        a.y -= ny * overlap * aWeight;
        b.x += nx * overlap * bWeight;
        b.y += ny * overlap * bWeight;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Damage pipeline                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * The only path by which health changes. Mitigation, shields, on-hit
   * feedback, death and the resulting events all funnel through here.
   */
  damage(target: Actor, event: DamageEvent): void {
    if (target.isDead || target.invuln > 0 || event.amount <= 0) return;

    let amount = 'mitigateIncoming' in target
      ? (target as Actor & { mitigateIncoming(e: DamageEvent): number }).mitigateIncoming(event)
      : Math.max(1, Math.round(event.amount * target.damageTakenMult));

    // Shields soak before health, and report what they absorbed.
    if (target.shieldPoints > 0) {
      const absorbed = Math.min(target.shieldPoints, amount);
      target.shieldPoints -= absorbed;
      amount -= absorbed;
      if (absorbed > 0) {
        this.texts.push(String(Math.round(absorbed)), target.x, target.y - target.sprite.height, C.aether);
        this.particles.emit('spark', target.x, target.y - target.sprite.height * 0.5, 5, C.aether, {
          speed: 70, size: 2.5, life: 0.35,
        });
      }
      if (target.shieldPoints <= 0) {
        target.statuses = target.statuses.filter((s) => s.kind !== 'shield');
        this.particles.ring(target.x, target.y, target.radius * 2.4, C.aether, 0.4);
      }
      if (amount <= 0) {
        target.onDamaged({ ...event, amount: 0 });
        return;
      }
    }

    target.health -= amount;
    target.onDamaged({ ...event, amount });

    const color = DAMAGE_COLORS[event.type] ?? C.white;
    if (state.settings.showDamageNumbers) {
      this.texts.push(
        event.crit ? `${Math.round(amount)}!` : String(Math.round(amount)),
        target.x,
        target.y - target.sprite.height * 1.05,
        event.crit ? C.gold : color,
        event.crit,
      );
    }
    this.particles.emit('spark', target.x, target.y - target.sprite.height * 0.55,
      event.crit ? 12 : 7, color, {
        speed: event.crit ? 190 : 130,
        angle: event.angle,
        spread: 1.5,
        size: 2.6,
        life: 0.34,
      });

    bus.emit('damageDealt', {
      targetId: target.id,
      amount,
      type: event.type,
      crit: event.crit,
      x: target.x,
      y: target.y,
    });

    if (target.faction === 'player') {
      bus.emit('playerDamaged', { amount, remaining: target.health });
      this.shake(Math.min(7, 2 + amount * 0.08));
      this.sfx('player_hurt');
    } else {
      this.sfx(event.type === 'physical' ? 'impact_flesh' : `impact_${event.type}`);
    }

    if (target.health <= 0) this.killActor(target, event);
  }

  private killActor(target: Actor, event: DamageEvent): void {
    target.kill();
    this.particles.emit('smoke', target.x, target.y - target.sprite.height * 0.5, 8,
      C.deepNight, { speed: 45, size: 7, life: 0.9 });
    this.particles.emit('shard', target.x, target.y - target.sprite.height * 0.4, 10,
      target.sprite.accent, { speed: 150, angle: event.angle, spread: 2.4, size: 4, life: 0.7 });
    if (target.faction === 'player') {
      this.sfx('player_die');
      this.shake(10);
    } else {
      this.sfx('enemy_die');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Queries and helpers                                                 */
  /* ------------------------------------------------------------------ */

  nearestActor(
    x: number, y: number, faction: Faction, maxDist: number, exclude?: Actor,
  ): Actor | null {
    let best: Actor | null = null;
    let bestD2 = maxDist * maxDist;
    for (const a of this.actors) {
      if (a === exclude || a.isDead || a.faction !== faction) continue;
      const d2 = dist2(x, y, a.x, a.y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = a;
      }
    }
    return best;
  }

  actorsInRadius(x: number, y: number, radius: number, faction?: Faction): Actor[] {
    const out: Actor[] = [];
    for (const a of this.actors) {
      if (a.isDead) continue;
      if (faction && a.faction !== faction) continue;
      const reach = radius + a.radius;
      if (dist2(x, y, a.x, a.y) <= reach * reach) out.push(a);
    }
    return out;
  }

  emitParticles(
    kind: string, x: number, y: number, count: number, color: string,
    opts: Record<string, number> = {},
  ): void {
    if (state.settings.performanceMode) count = Math.ceil(count * 0.5);
    this.particles.emit(kind as ParticleKind, x, y, count, color, opts);
  }

  shake(amount: number): void {
    this.services.camera.shake(amount * state.settings.screenShake);
  }

  sfx(id: string, x?: number, y?: number): void {
    // Distance attenuation keeps a busy screen from turning into noise.
    let volume = 1;
    if (x !== undefined && y !== undefined) {
      const cam = this.services.camera;
      const d = Math.hypot(x - cam.x, y - cam.y);
      volume = clamp(1 - d / 900, 0, 1);
      if (volume <= 0.02) return;
    }
    this.services.audio.sfx(id, volume);
  }

  /** Draw order: flat decals, then props and actors merged by feet position. */
  private readonly renderList: Entity[] = [];

  /**
   * Renders the populated world. Props and entities are both depth-sorted, so
   * they are merged rather than concatenated-and-re-sorted: props are already
   * in order from load time and entities are a short list.
   */
  render(
    ctx: CanvasRenderingContext2D,
    quality: 'high' | 'low',
    view: { x: number; y: number; w: number; h: number },
  ): void {
    const left = view.x;
    const right = view.x + view.w;
    const top = view.y;
    const bottom = view.y + view.h;

    // Flat decals first: they belong to the ground, not the depth order.
    for (const p of this.props) {
      if (!p.flat) continue;
      if (p.x < left - 80 || p.x > right + 80 || p.y < top - 80 || p.y > bottom + 80) continue;
      drawPropInstance(ctx, p);
    }

    this.renderList.length = 0;
    for (const e of this.entities) {
      if (e.renderGround) e.renderGround(ctx, quality);
      this.renderList.push(e);
    }
    this.renderList.sort(byDepth);

    this.particles.render(ctx, quality);

    // Merge the two sorted streams.
    let pi = 0;
    let ei = 0;
    const props = this.props;
    while (pi < props.length || ei < this.renderList.length) {
      const p = props[pi];
      const e = this.renderList[ei];
      if (p !== undefined && (e === undefined || p.y <= e.depth)) {
        pi++;
        if (p.flat) continue;
        const spec = PROPS[p.type];
        const halfW = spec.w * p.scale;
        const h = spec.h * p.scale;
        if (p.x + halfW < left || p.x - halfW > right || p.y < top - h || p.y > bottom + h) {
          continue;
        }
        drawPropInstance(ctx, p);
      } else if (e !== undefined) {
        ei++;
        e.render(ctx, quality);
      }
    }

    for (const e of this.renderList) e.renderOverlay?.(ctx, quality);
    this.texts.render(ctx);
  }
}

function drawPropInstance(ctx: CanvasRenderingContext2D, p: PropInstance): void {
  drawProp(ctx, p.type, p.variant, p.x, p.y, p.scale);
}

function byDepth(a: Entity, b: Entity): number {
  return a.depth - b.depth;
}

const DAMAGE_COLORS: Record<string, string> = {
  physical: C.white,
  fire: C.ember,
  arcane: C.aether,
  nature: C.verdant,
  shadow: C.violet,
};
