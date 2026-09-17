import { C, alpha } from '../../art/palette';
import { TAU, circleRectOverlap, clamp01, dist2 } from '../../engine/math';
import { fx } from '../../engine/Rng';
import type { AbilityDef, DamageType } from '../types';
import { Actor, Entity, type Faction, type WorldLike } from './Entity';

/**
 * A travelling attack. One class covers every projectile in the game — the
 * differences (speed, size, pierce, colour, impact shape) all come from the
 * ability definition that spawned it.
 */
export class Projectile extends Entity {
  override solid = false;

  /** Who fired it; used for faction filtering and lifesteal credit. */
  owner: Actor | null = null;
  targetFaction: Faction = 'enemy';

  damage = 10;
  damageType: DamageType = 'arcane';
  crit = false;
  knockback = 0;
  staggerPower = 0;
  /** Extra targets it passes through after the first. */
  pierce = 0;

  speed = 400;
  /** Remaining travel distance. */
  rangeLeft = 300;
  angle = 0;
  size = 6;
  color: string = C.aether;
  accent: string = C.aetherSoft;
  trail = 1;
  impact: NonNullable<AbilityDef['vfx']['impact']> = 'burst';
  impactSfx?: string;
  /** Statuses applied to everything it hits. */
  applies: AbilityDef['applies'];

  private hits = new Set<number>();
  private age = 0;
  private trailAccumulator = 0;

  /** Projectiles draw above ground effects but below actors' heads. */
  override get depth(): number {
    return this.y + 1;
  }

  update(dt: number, world: WorldLike): void {
    this.age += dt;
    const step = this.speed * dt;
    const dx = Math.cos(this.angle) * step;
    const dy = Math.sin(this.angle) * step;

    // Substep when a fast projectile would tunnel through a thin target.
    const substeps = step > this.radius ? Math.ceil(step / Math.max(4, this.radius)) : 1;
    for (let i = 0; i < substeps; i++) {
      this.x += dx / substeps;
      this.y += dy / substeps;
      if (this.collide(world)) return;
    }

    this.rangeLeft -= step;
    if (this.rangeLeft <= 0) {
      this.burst(world, false);
      return;
    }

    if (this.trail > 0) {
      this.trailAccumulator += this.trail * 34 * dt;
      while (this.trailAccumulator >= 1) {
        this.trailAccumulator -= 1;
        world.emitParticles('spark', this.x, this.y, 1, this.color, {
          speed: 26, size: this.size * 0.45, life: 0.28, drag: 5,
        });
      }
    }
  }

  /** Returns true when the projectile has been consumed. */
  private collide(world: WorldLike): boolean {
    for (const actor of world.actors) {
      if (actor.isDead || actor.faction !== this.targetFaction) continue;
      if (this.hits.has(actor.id)) continue;
      const reach = this.radius + actor.radius;
      if (dist2(this.x, this.y, actor.x, actor.y) > reach * reach) continue;

      this.hits.add(actor.id);
      world.damage(actor, {
        amount: this.damage,
        type: this.damageType,
        crit: this.crit,
        sourceId: this.owner?.id ?? -1,
        knockback: this.knockback,
        staggerPower: this.staggerPower,
        angle: this.angle,
      });
      if (this.applies) for (const status of this.applies) actor.applyStatus(status);
      if (this.owner) creditLeech(this.owner, this.damage, this.damageType);

      if (this.pierce > 0) {
        this.pierce--;
        continue;
      }
      this.burst(world, true);
      return true;
    }

    // Geometry stops projectiles, so cover is real cover.
    for (const ob of world.obstacles) {
      const blocked = ob.kind === 'rect'
        ? circleRectOverlap(this.x, this.y, this.radius, ob)
        : dist2(this.x, this.y, ob.x, ob.y) < (ob.r + this.radius) * (ob.r + this.radius);
      if (blocked) {
        this.burst(world, false);
        return true;
      }
    }
    return false;
  }

  private burst(world: WorldLike, hitSomething: boolean): void {
    this.expired = true;
    if (this.impactSfx) world.sfx(this.impactSfx, this.x, this.y);

    switch (this.impact) {
      case 'ring':
        world.emitParticles('spark', this.x, this.y, 10, this.color, {
          speed: 150, size: this.size * 0.5, life: 0.4,
        });
        break;
      case 'shatter':
        world.emitParticles('shard', this.x, this.y, hitSomething ? 10 : 5, this.accent, {
          speed: 180, angle: this.angle + Math.PI, spread: 2.2,
          size: this.size * 0.6, life: 0.5,
        });
        break;
      case 'bloom':
        world.emitParticles('leaf', this.x, this.y, 8, this.color, {
          speed: 80, size: this.size * 0.7, life: 0.7,
        });
        break;
      case 'slash':
        world.emitParticles('spark', this.x, this.y, 8, this.color, {
          speed: 200, angle: this.angle, spread: 0.8, size: this.size * 0.5, life: 0.3,
        });
        break;
      default:
        world.emitParticles('ember', this.x, this.y, hitSomething ? 12 : 6, this.color, {
          speed: 130, size: this.size * 0.55, life: 0.45,
        });
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    const wobble = 1 + Math.sin(this.age * 22) * 0.1;
    const r = this.size * wobble;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (quality === 'high') {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.2);
      grad.addColorStop(0, alpha(this.color, 0.55));
      grad.addColorStop(1, alpha(this.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 3.2, 0, TAU);
      ctx.fill();
    }

    // A stretched core along the direction of travel reads as speed.
    ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.7, r, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = alpha(this.accent, 0.95);
    ctx.beginPath();
    ctx.ellipse(r * 0.3, 0, r * 0.7, r * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** Applies life/spell steal from a landed hit. */
export function creditLeech(owner: Actor, amount: number, type: DamageType): void {
  const rate = type === 'physical' ? owner.lifesteal : owner.spellVamp;
  if (rate > 0) owner.heal(amount * rate);
}

/* ------------------------------------------------------------------ */

/**
 * A persistent ground effect (Vine Trap and anything like it). Ticks damage and
 * re-applies its statuses on an interval rather than every frame, so a zone's
 * strength does not depend on the frame rate.
 */
export class Zone extends Entity {
  override solid = false;

  owner: Actor | null = null;
  targetFaction: Faction = 'enemy';
  damagePerTick = 0;
  damageType: DamageType = 'nature';
  applies: AbilityDef['applies'];
  color: string = C.verdant;
  accent: string = C.moss;
  duration = 4;
  tickInterval = 0.5;

  private age = 0;
  private nextTick = 0;

  /** Ground effects always draw beneath actors. */
  override get depth(): number {
    return -Infinity;
  }

  update(dt: number, world: WorldLike): void {
    this.age += dt;
    if (this.age >= this.duration) {
      this.expired = true;
      return;
    }

    this.nextTick -= dt;
    if (this.nextTick <= 0) {
      this.nextTick = this.tickInterval;
      for (const actor of world.actors) {
        if (actor.isDead || actor.faction !== this.targetFaction) continue;
        const reach = this.radius + actor.radius;
        if (dist2(this.x, this.y, actor.x, actor.y) > reach * reach) continue;

        if (this.damagePerTick > 0) {
          world.damage(actor, {
            amount: this.damagePerTick,
            type: this.damageType,
            crit: false,
            sourceId: this.owner?.id ?? -1,
            knockback: 0,
            staggerPower: 0,
            angle: Math.atan2(actor.y - this.y, actor.x - this.x),
          });
        }
        if (this.applies) for (const status of this.applies) actor.applyStatus(status);
      }
    }

    if (fx.chance(dt * 14)) {
      const a = fx.angle();
      const d = Math.sqrt(fx.next()) * this.radius;
      world.emitParticles('leaf', this.x + Math.cos(a) * d, this.y + Math.sin(a) * d * 0.6,
        1, this.color, { speed: 20, size: 3, life: 0.8, rise: 20 });
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Fade in quickly, hold, then fade out over the last half second.
    const fade = Math.min(clamp01(this.age / 0.25), clamp01((this.duration - this.age) / 0.5));
    const pulse = 0.85 + Math.sin(this.age * 4) * 0.15;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(1, 0.6);

    const grad = ctx.createRadialGradient(0, 0, this.radius * 0.2, 0, 0, this.radius);
    grad.addColorStop(0, alpha(this.color, 0.3 * fade));
    grad.addColorStop(0.7, alpha(this.color, 0.16 * fade));
    grad.addColorStop(1, alpha(this.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * pulse, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = alpha(this.accent, 0.5 * fade);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * pulse, 0, TAU);
    ctx.stroke();

    // Radiating spokes; cheap, and they make the zone read as active.
    ctx.strokeStyle = alpha(this.color, 0.35 * fade);
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + this.age * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * this.radius * 0.35, Math.sin(a) * this.radius * 0.35);
      ctx.lineTo(Math.cos(a) * this.radius * pulse, Math.sin(a) * this.radius * pulse);
      ctx.stroke();
    }
    ctx.restore();
  }
}
