import type { ActorPose, ActorSprite } from '../../art/sprites';
import { createPose, drawActor } from '../../art/sprites';
import type { DamageEvent, StatKey, StatusEffectDef, StatusKind } from '../types';
import { TAU, clamp, clamp01 } from '../../engine/math';

export type Faction = 'player' | 'enemy' | 'neutral';

let nextEntityId = 1;

/** Resets ids when a new game starts, so save files stay small and stable. */
export function resetEntityIds(): void {
  nextEntityId = 1;
}

/**
 * Anything that exists in the world and can be drawn. Entities are kept in a
 * flat list and sorted by their feet Y each frame, which is what produces
 * correct overlap in a top-down view without a z-buffer.
 */
export abstract class Entity {
  readonly id = nextEntityId++;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 12;
  /** Removed from the world at the end of the frame when true. */
  expired = false;
  /** Entities with `solid` push each other apart. */
  solid = true;
  faction: Faction = 'neutral';

  /** Sort key for draw order; overridden by ground decals to draw underneath. */
  get depth(): number {
    return this.y;
  }

  abstract update(dt: number, world: WorldLike): void;
  abstract render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void;

  /** Optional pass drawn under every actor (shadows, ground effects). */
  renderGround?(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void;
  /** Optional pass drawn over everything (health bars, nameplates). */
  renderOverlay?(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void;
}

/** Minimal surface the entities need from the world, to avoid a cyclic import. */
export interface WorldLike {
  readonly time: number;
  entities: Entity[];
  actors: Actor[];
  /** The current area's playable rectangle. See `World.clampToBounds`. */
  readonly bounds: { x: number; y: number; w: number; h: number };
  /** Level geometry; projectiles and AI line-of-sight both consult it. */
  obstacles: ReadonlyArray<
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
    | { kind: 'circle'; x: number; y: number; r: number }
  >;
  /** True when a circle at this position would be clear of geometry. */
  isClear(x: number, y: number, r: number): boolean;
  /** Runs a callback after `delay` seconds of simulated time. */
  schedule(delay: number, fn: () => void): void;
  /** Casts a data-defined ability. Returns false when it could not be cast. */
  castAbility(
    caster: Actor,
    abilityId: string,
    opts?: { angle?: number; targetX?: number; targetY?: number; free?: boolean },
  ): boolean;
  /** Resolves movement against level geometry, mutating the entity in place. */
  moveWithCollision(entity: Entity, dx: number, dy: number): void;
  spawn(entity: Entity): void;
  damage(target: Actor, event: DamageEvent): void;
  emitParticles(kind: string, x: number, y: number, count: number, color: string, opts?: Record<string, number>): void;
  shake(amount: number): void;
  sfx(id: string, x?: number, y?: number): void;
  nearestActor(x: number, y: number, faction: Faction, maxDist: number, exclude?: Actor): Actor | null;
}

export interface ActiveStatus {
  kind: StatusKind;
  remaining: number;
  magnitude: number;
  multiplier: number;
  stat?: string;
  color: string;
  /** Accumulates fractional damage/heal so low tick rates stay accurate. */
  accumulator: number;
}

/**
 * An entity with health, a sprite and the shared combat state machine. Players,
 * enemies and NPCs all derive from this, which is what lets one damage
 * pipeline, one status system and one renderer serve all of them.
 */
export abstract class Actor extends Entity {
  name = 'Actor';
  sprite!: ActorSprite;
  pose: ActorPose = createPose();

  health = 100;
  maxHealth = 100;
  mana = 0;
  maxMana = 0;

  /** Seconds remaining of invulnerability. */
  invuln = 0;
  /** Seconds remaining of the action lock (attacking, casting, dodging). */
  busy = 0;
  /** Seconds remaining of hit-stagger; movement input is ignored while > 0. */
  staggered = 0;
  /** Seconds since death, used to drive the collapse animation. */
  deathTime = -1;
  /** How long the corpse lingers before being removed. */
  corpseDuration = 2.2;

  /** Accumulated knockback velocity, decays quickly. */
  pushX = 0;
  pushY = 0;

  /** Ability id -> seconds remaining. */
  cooldowns: Record<string, number> = {};
  /** Active dash movement, driven by abilities and dodges. */
  dash: { dirX: number; dirY: number; speed: number; timeLeft: number; duration: number } | null = null;

  statuses: ActiveStatus[] = [];
  /** Absorbing shield points from Arcane Shield and similar. */
  shieldPoints = 0;

  /** Multipliers recomputed from statuses each frame. */
  speedMult = 1;
  damageTakenMult = 1;
  rooted = false;

  get isDead(): boolean {
    return this.deathTime >= 0;
  }

  get healthPct(): number {
    return this.maxHealth > 0 ? clamp01(this.health / this.maxHealth) : 0;
  }

  get manaPct(): number {
    return this.maxMana > 0 ? clamp01(this.mana / this.maxMana) : 0;
  }

  /** Physical power before weapon multipliers; overridden by subclasses. */
  get physicalPower(): number {
    return 10;
  }

  get magicPower(): number {
    return 10;
  }

  /** Flat damage reduction applied in the damage pipeline. */
  get armor(): number {
    return 0;
  }

  /**
   * Attribute lookup used by ability scaling. Players read their full stat
   * block; enemies expose a simplified one. Having both answer the same
   * question is what lets one ability system serve both.
   */
  statValue(_stat: StatKey): number {
    return 0;
  }

  get critChance(): number {
    return 0.03;
  }

  get critDamage(): number {
    return 1.5;
  }

  /** Hook for skill-tree modifiers; enemies return the value unchanged. */
  modifyAbility(_abilityId: string, _field: string, value: number): number {
    return value;
  }

  /** Starts a dash in a direction. Distance is covered over `duration`. */
  startDash(dirX: number, dirY: number, distance: number, duration: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    this.dash = {
      dirX: dirX / len,
      dirY: dirY / len,
      speed: distance / duration,
      timeLeft: duration,
      duration,
    };
  }

  /** Fraction of damage dealt returned as health. */
  get lifesteal(): number {
    return 0;
  }

  get spellVamp(): number {
    return 0;
  }

  applyStatus(def: StatusEffectDef): void {
    // Refresh rather than stack: stacking durations makes balance unreadable
    // and lets a player chain-lock an enemy forever.
    const existing = this.statuses.find(
      (s) => s.kind === def.kind && s.stat === def.stat,
    );
    if (existing) {
      existing.remaining = Math.max(existing.remaining, def.duration);
      existing.magnitude = Math.max(existing.magnitude, def.magnitude);
      return;
    }
    if (def.kind === 'shield') {
      this.shieldPoints = Math.max(this.shieldPoints, def.magnitude);
    }
    this.statuses.push({
      kind: def.kind,
      remaining: def.duration,
      magnitude: def.magnitude,
      multiplier: def.multiplier ?? 1,
      stat: def.stat,
      color: def.color ?? '#ffffff',
      accumulator: 0,
    });
  }

  hasStatus(kind: StatusKind): boolean {
    return this.statuses.some((s) => s.kind === kind);
  }

  clearStatuses(): void {
    this.statuses.length = 0;
    this.shieldPoints = 0;
  }

  /** Ticks statuses and recomputes derived multipliers. */
  protected updateStatuses(dt: number, world: WorldLike): void {
    this.speedMult = 1;
    this.damageTakenMult = 1;
    this.rooted = false;

    for (let i = this.statuses.length - 1; i >= 0; i--) {
      const s = this.statuses[i];
      s.remaining -= dt;

      switch (s.kind) {
        case 'burn': {
          s.accumulator += s.magnitude * dt;
          if (s.accumulator >= 1) {
            const tick = Math.floor(s.accumulator);
            s.accumulator -= tick;
            world.damage(this, {
              amount: tick,
              type: 'fire',
              crit: false,
              sourceId: -1,
              knockback: 0,
              staggerPower: 0,
              angle: 0,
            });
          }
          break;
        }
        case 'regen': {
          s.accumulator += s.magnitude * dt;
          if (s.accumulator >= 1) {
            const tick = Math.floor(s.accumulator);
            s.accumulator -= tick;
            this.heal(tick);
          }
          break;
        }
        case 'slow':
          this.speedMult *= s.multiplier || 0.6;
          break;
        case 'haste':
          this.speedMult *= s.multiplier || 1.3;
          break;
        case 'root':
          this.rooted = true;
          break;
        case 'vulnerable':
          this.damageTakenMult *= s.multiplier || 1.2;
          break;
        case 'shield':
          if (this.shieldPoints <= 0) s.remaining = 0;
          break;
        default:
          break;
      }

      if (s.remaining <= 0) {
        if (s.kind === 'shield') this.shieldPoints = 0;
        this.statuses.splice(i, 1);
      }
    }
  }

  heal(amount: number): number {
    if (this.isDead || amount <= 0) return 0;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  /** Called by the world's damage pipeline once mitigation is resolved. */
  onDamaged(event: DamageEvent): void {
    this.pose.hitFlash = 1;
    if (event.knockback > 0) {
      this.pushX += Math.cos(event.angle) * event.knockback;
      this.pushY += Math.sin(event.angle) * event.knockback;
    }
    // Stagger resists scale with max health, so a boss shrugs off what staggers
    // a goblin without every enemy needing a hand-tuned stagger stat.
    const resist = 1 + this.maxHealth / 120;
    const stagger = event.staggerPower / resist;
    if (stagger > 0.25) {
      this.staggered = Math.max(this.staggered, clamp(stagger * 0.28, 0.1, 0.65));
      this.busy = Math.max(this.busy, this.staggered);
    }
  }

  kill(): void {
    if (this.isDead) return;
    this.health = 0;
    this.deathTime = 0;
    this.solid = false;
    this.clearStatuses();
  }

  /**
   * Called once by the damage pipeline after death is confirmed. Subclasses use
   * it to award XP, drop loot or split — World stays ignorant of any of that.
   */
  onKilled(_world: WorldLike, _killerId: number): void {}

  /** Shared per-frame housekeeping. Subclasses call this from `update`. */
  protected tickCommon(dt: number, world: WorldLike): void {
    this.pose.animTime += dt;
    this.pose.hitFlash = Math.max(0, this.pose.hitFlash - dt * 4);
    this.invuln = Math.max(0, this.invuln - dt);
    this.busy = Math.max(0, this.busy - dt);
    this.staggered = Math.max(0, this.staggered - dt);
    this.pose.stagger = this.staggered;
    this.pose.squash += (1 - this.pose.squash) * Math.min(1, dt * 12);

    if (this.isDead) {
      this.deathTime += dt;
      this.pose.death = clamp01(this.deathTime / 0.55);
      if (this.deathTime > this.corpseDuration) this.expired = true;
      return;
    }

    this.updateStatuses(dt, world);

    for (const key of Object.keys(this.cooldowns)) {
      const left = this.cooldowns[key] - dt;
      if (left <= 0) delete this.cooldowns[key];
      else this.cooldowns[key] = left;
    }

    if (this.dash) {
      const d = this.dash;
      d.timeLeft -= dt;
      // Ease-out along the dash so it launches hard and settles.
      const t = 1 - Math.max(0, d.timeLeft) / d.duration;
      const speed = d.speed * (1 - t * t) * 1.5;
      world.moveWithCollision(this, d.dirX * speed * dt, d.dirY * speed * dt);
      if (d.timeLeft <= 0) this.dash = null;
    }

    // Knockback decays fast so hits feel punchy without launching anyone into
    // next week.
    const decay = Math.exp(-9 * dt);
    this.pushX *= decay;
    this.pushY *= decay;
    if (Math.abs(this.pushX) > 1 || Math.abs(this.pushY) > 1) {
      world.moveWithCollision(this, this.pushX * dt, this.pushY * dt);
    }
  }

  override render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    drawActor(ctx, this.sprite, this.pose, this.x, this.y, quality);
    if (this.shieldPoints > 0 && !this.isDead) this.renderShield(ctx);
  }

  private renderShield(ctx: CanvasRenderingContext2D): void {
    const r = this.radius * 2.1;
    const t = this.pose.animTime;
    ctx.save();
    ctx.translate(this.x, this.y - this.sprite.height * 0.5);
    ctx.strokeStyle = `rgba(95,230,208,${0.35 + Math.sin(t * 4) * 0.12})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.15, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** Faces a world point. */
  faceTowards(x: number, y: number): void {
    this.pose.facing = Math.atan2(y - this.y, x - this.x);
  }
}
