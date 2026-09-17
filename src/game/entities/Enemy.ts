import { C, alpha, bodyFont, displayFont } from '../../art/palette';
import { roundRect } from '../../art/sprites';
import { clamp, clamp01, dist2, inCone } from '../../engine/math';
import { fx } from '../../engine/Rng';
import { ENEMIES, enemyStatsAt, type EnemyAbilityUse, type EnemyDef } from '../../data/enemies';
import { getAbility } from '../../data/abilities';
import { trySpriteSheet } from '../../data/spriteSheets';
import { isSheetReady, preloadSheet, SpriteAnimator, type SpriteSheetDef } from '../../engine/SpriteSheet';
import { bus } from '../events';
import { mitigate } from '../progression';
import type { DamageEvent, StatKey } from '../types';
import { Actor, type WorldLike } from './Entity';

/**
 * A hostile actor driven by a data-defined AI profile.
 *
 * The state machine is intentionally small and shared: idle, patrol, alert,
 * chase, attack, reposition, flee, return. Every behavioural difference between
 * a wolf and a mage comes from the numbers in their EnemyDef — detection
 * radius, preferred range, aggression, whether they strafe — not from branches
 * in here.
 */

export type AiState =
  | 'idle' | 'patrol' | 'alert' | 'chase' | 'attack' | 'reposition' | 'flee' | 'return';

export class Enemy extends Actor {
  override faction = 'enemy' as const;
  readonly def: EnemyDef;
  level: number;
  elite: boolean;
  /** Spawn record this enemy came from; used for respawn bookkeeping. */
  spawnId: string;

  /** Where it returns to when it loses the player. */
  homeX = 0;
  homeY = 0;
  patrolRadius = 120;

  state: AiState = 'idle';
  stateTime = 0;
  target: Actor | null = null;

  private damage: number;
  private defenseStat: number;
  private magicStat: number;
  private moveSpeed: number;
  private wanderX = 0;
  private wanderY = 0;
  /** Chosen strafe direction, flipped occasionally so it is not predictable. */
  private strafeDir = 1;
  private strafeTimer = 0;
  private attackCooldown = 0;
  private alerted = false;
  /** Multipliers applied by boss phases. */
  private phaseSpeed = 1;
  private phaseDamage = 1;
  private phaseIndex = -1;
  private extraAbilities: EnemyAbilityUse[] = [];

  /** Set by the boss encounter so the arena can react to the fight starting. */
  onPhaseChange: ((phase: string, line?: string) => void) | null = null;

  /** Present only when the enemy's definition names a registered sheet. */
  private readonly spriteSheet: SpriteSheetDef | undefined;
  private readonly animator: SpriteAnimator | null;
  /** Seconds left where a hit-reaction clip takes priority over other states. */
  private hurtClipTimer = 0;

  constructor(enemyId: string, level: number, elite = false, spawnId = '') {
    super();
    const def = ENEMIES[enemyId];
    if (!def) throw new Error(`Unknown enemy id: ${enemyId}`);
    this.def = def;
    this.level = level;
    this.elite = elite;
    this.spawnId = spawnId;

    const stats = enemyStatsAt(def, level);
    // Elites are a meaningful step up without needing their own record.
    const eliteScale = elite ? 2.2 : 1;
    this.maxHealth = Math.round(stats.health * eliteScale);
    this.health = this.maxHealth;
    this.damage = stats.damage * (elite ? 1.3 : 1);
    this.defenseStat = stats.defense * (elite ? 1.2 : 1);
    this.magicStat = stats.magic;
    this.moveSpeed = def.moveSpeed;
    this.radius = def.radius * (elite ? 1.15 : 1);
    this.name = elite ? `Elite ${def.name}` : def.name;
    this.corpseDuration = def.corpseDuration ?? 2.4;
    this.patrolRadius = 120;

    this.sprite = elite
      ? { ...def.sprite, height: def.sprite.height * 1.18, accent: C.gold,
          aura: { color: C.gold, radius: def.sprite.height * 1.5, intensity: 0.5 } }
      : { ...def.sprite };

    // Elites and split-spawns keep the procedural look: the sheet has one
    // fixed size and palette, and re-deriving a gold-rimmed variant from raw
    // pixels is not something a frame grid can do the way the ActorSprite
    // tint pipeline already does. A named sheet only drives the base form.
    this.spriteSheet = !elite ? trySpriteSheet(def.spriteSheetId) : undefined;
    this.animator = this.spriteSheet ? new SpriteAnimator() : null;
    if (this.spriteSheet) preloadSheet(this.spriteSheet);
  }

  get isBoss(): boolean {
    return this.def.archetype === 'boss';
  }

  override get physicalPower(): number {
    return this.damage * this.phaseDamage;
  }

  override get magicPower(): number {
    return this.magicStat;
  }

  override get armor(): number {
    return this.defenseStat;
  }

  override statValue(stat: StatKey): number {
    switch (stat) {
      case 'magic': return this.magicStat;
      case 'strength': return this.damage;
      case 'defense': return this.defenseStat;
      case 'agility': return this.moveSpeed * 0.1;
      default: return this.level * 2;
    }
  }

  override get critChance(): number {
    return this.elite ? 0.12 : 0.05;
  }

  /** Mitigation hook used by the world's damage pipeline. */
  mitigateIncoming(event: DamageEvent): number {
    const raw = event.amount * this.damageTakenMult;
    const defense = event.type === 'physical'
      ? this.defenseStat
      : this.defenseStat * 0.5 + this.magicStat * 0.3;
    return Math.max(1, Math.round(mitigate(raw, defense)));
  }

  setHome(x: number, y: number, patrolRadius: number): void {
    this.homeX = x;
    this.homeY = y;
    this.patrolRadius = patrolRadius;
    this.wanderX = x;
    this.wanderY = y;
  }

  update(dt: number, world: WorldLike): void {
    this.tickCommon(dt, world);
    this.updateSpriteAnimation(dt);
    if (this.isDead) return;

    this.stateTime += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = fx.range(1.1, 2.4);
      this.strafeDir = fx.chance(0.5) ? 1 : -1;
    }

    if (this.isBoss) this.updateBossPhase(world);

    // Staggered or committed to an attack: no steering, no decisions.
    if (this.staggered > 0 || this.busy > 0) {
      this.pose.moveSpeed01 = 0;
      return;
    }

    this.think(dt, world);
  }

  private setState(state: AiState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
  }

  private think(dt: number, world: WorldLike): void {
    const ai = this.def.ai;
    const player = world.nearestActor(this.x, this.y, 'player', ai.loseRadius);

    // Acquire and lose the target.
    if (player && !player.isDead) {
      const d2 = dist2(this.x, this.y, player.x, player.y);
      if (!this.target && d2 <= ai.detectRadius * ai.detectRadius && this.hasLineOfSight(world, player)) {
        this.target = player;
        this.setState('alert');
        this.onAlerted(world);
      } else if (this.target && d2 > ai.loseRadius * ai.loseRadius) {
        this.target = null;
        this.setState('return');
      }
    } else if (this.target) {
      this.target = null;
      this.setState('return');
    }

    if (this.target && ai.fleeBelowHealth && this.healthPct < ai.fleeBelowHealth) {
      this.setState('flee');
    }

    switch (this.state) {
      case 'idle':
        this.pose.moveSpeed01 = 0;
        // Wander occasionally so a quiet area still looks inhabited.
        if (this.stateTime > fx.range(1.5, 4) && this.patrolRadius > 20) {
          const a = fx.angle();
          const d = fx.next() * this.patrolRadius;
          this.wanderX = this.homeX + Math.cos(a) * d;
          this.wanderY = this.homeY + Math.sin(a) * d;
          this.setState('patrol');
        }
        break;

      case 'patrol': {
        const arrived = this.moveToward(this.wanderX, this.wanderY, ai.patrolSpeed, dt, world, 18);
        if (arrived || this.stateTime > 6) this.setState('idle');
        break;
      }

      case 'alert':
        this.pose.moveSpeed01 = 0;
        if (this.target) this.faceTowards(this.target.x, this.target.y);
        // A visible pause before the charge; this is the player's warning.
        if (this.stateTime >= ai.reactionTime) this.setState('chase');
        break;

      case 'chase': {
        const target = this.target;
        if (!target) {
          this.setState('return');
          break;
        }
        this.faceTowards(target.x, target.y);
        const d = Math.sqrt(dist2(this.x, this.y, target.x, target.y));

        const ability = this.pickAbility(d);
        if (ability && this.attackCooldown <= 0) {
          this.castEnemyAbility(world, ability);
          break;
        }

        const reach = this.def.attack.range + target.radius;
        if (d <= reach && this.attackCooldown <= 0 && fx.chance(ai.aggression)) {
          this.startAttack(world, target);
          break;
        }

        if (d > ai.preferredRange + 12) {
          this.moveToward(target.x, target.y, ai.chaseSpeed, dt, world, 0);
        } else if (d < ai.preferredRange - 30) {
          // Too close for a ranged enemy: back off rather than melee.
          this.moveToward(
            this.x - (target.x - this.x), this.y - (target.y - this.y),
            ai.chaseSpeed * 0.8, dt, world, 0,
          );
        } else if (ai.strafe) {
          this.strafeAround(target, ai.chaseSpeed * 0.7, dt, world);
        } else {
          this.pose.moveSpeed01 = 0;
        }
        break;
      }

      case 'flee': {
        const target = this.target;
        if (!target || this.healthPct > (ai.fleeBelowHealth ?? 0) + 0.15) {
          this.setState('chase');
          break;
        }
        this.moveToward(
          this.x - (target.x - this.x) * 2, this.y - (target.y - this.y) * 2,
          ai.chaseSpeed * 1.1, dt, world, 0,
        );
        break;
      }

      case 'return': {
        const arrived = this.moveToward(this.homeX, this.homeY, ai.patrolSpeed * 1.4, dt, world, 24);
        // Regenerate on the way home, so a fled fight is a real reset.
        this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.22 * dt);
        if (arrived) {
          this.alerted = false;
          this.setState('idle');
        }
        break;
      }

      default:
        this.setState('chase');
        break;
    }
  }

  /** Walks toward a point. Returns true once within `tolerance`. */
  private moveToward(
    tx: number, ty: number, speedScale: number, dt: number, world: WorldLike, tolerance: number,
  ): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= tolerance) {
      this.pose.moveSpeed01 = 0;
      return true;
    }
    const speed = this.moveSpeed * speedScale * this.speedMult * this.phaseSpeed;
    if (this.rooted) {
      this.pose.moveSpeed01 = 0;
      return false;
    }

    let nx = dx / d;
    let ny = dy / d;

    // Wall-slide: if walking straight in is blocked, try sidestepping. Crude
    // versus a navmesh, but it stops enemies grinding into corners forever.
    const probe = this.radius + 6;
    if (!world.isClear(this.x + nx * probe, this.y + ny * probe, this.radius)) {
      const side = this.strafeDir;
      const sx = -ny * side;
      const sy = nx * side;
      if (world.isClear(this.x + sx * probe, this.y + sy * probe, this.radius)) {
        nx = sx;
        ny = sy;
      } else {
        this.strafeDir = -side;
      }
    }

    world.moveWithCollision(this, nx * speed * dt, ny * speed * dt);
    this.pose.facing = Math.atan2(ny, nx);
    this.pose.moveSpeed01 = clamp01(speedScale);
    return false;
  }

  private strafeAround(target: Actor, speedScale: number, dt: number, world: WorldLike): void {
    const a = Math.atan2(this.y - target.y, this.x - target.x) + this.strafeDir * 0.9;
    const d = this.def.ai.preferredRange;
    this.moveToward(target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, speedScale, dt, world, 6);
    this.faceTowards(target.x, target.y);
  }

  /** Wakes nearby allies of the same pack. */
  private onAlerted(world: WorldLike): void {
    if (this.alerted) return;
    this.alerted = true;
    if (this.def.sfx?.alert) world.sfx(this.def.sfx.alert, this.x, this.y);

    const radius = this.def.ai.packRadius ?? 0;
    if (radius <= 0) return;
    for (const other of world.actors) {
      if (other === this || other.isDead || other.faction !== 'enemy') continue;
      if (!(other instanceof Enemy) || other.target) continue;
      if (dist2(this.x, this.y, other.x, other.y) > radius * radius) continue;
      other.target = this.target;
      other.alerted = true;
      other.setState('alert');
    }
  }

  /**
   * Cheap line of sight: samples along the ray. Enough to stop enemies charging
   * through a building, and far cheaper than a real raycast against every wall.
   */
  private hasLineOfSight(world: WorldLike, target: Actor): boolean {
    const steps = 8;
    const dx = (target.x - this.x) / steps;
    const dy = (target.y - this.y) / steps;
    for (let i = 1; i < steps; i++) {
      if (!world.isClear(this.x + dx * i, this.y + dy * i, 4)) return false;
    }
    return true;
  }

  private startAttack(world: WorldLike, target: Actor): void {
    const attack = this.def.attack;
    this.faceTowards(target.x, target.y);
    this.busy = attack.windup + attack.active + attack.recovery;
    this.attackCooldown = this.busy + this.def.ai.recovery;
    this.pose.attackKind = 'light';
    this.pose.attackProgress = 0;
    this.setState('attack');
    if (attack.sfx) world.sfx(attack.sfx, this.x, this.y);

    const angle = this.pose.facing;
    world.schedule(attack.windup, () => {
      if (this.isDead || this.staggered > 0) return;

      if (attack.lunge) {
        this.startDash(Math.cos(angle), Math.sin(angle), attack.lunge, attack.active + 0.08);
      }

      let hit = false;
      for (const actor of world.actors) {
        if (actor.isDead || actor.faction !== 'player') continue;
        if (!inCone(this.x, this.y, angle, attack.arc, attack.range, actor.x, actor.y, actor.radius)) {
          continue;
        }
        const crit = fx.chance(this.critChance);
        let amount = this.physicalPower * attack.damageMult * fx.range(0.9, 1.1);
        if (crit) amount *= 1.5;
        world.damage(actor, {
          amount,
          type: 'physical',
          crit,
          sourceId: this.id,
          knockback: attack.knockback,
          staggerPower: attack.staggerPower,
          angle: Math.atan2(actor.y - this.y, actor.x - this.x),
        });
        hit = true;
      }

      world.emitParticles('spark', this.x + Math.cos(angle) * attack.range * 0.6,
        this.y + Math.sin(angle) * attack.range * 0.6, hit ? 8 : 4,
        hit ? C.blood : this.sprite.accent,
        { speed: 140, angle, spread: attack.arc * 1.6, size: 3, life: 0.3 });
      if (hit && attack.shake) world.shake(attack.shake);
      if (hit && attack.hitSfx) world.sfx(attack.hitSfx, this.x, this.y);
    });

    world.schedule(this.busy, () => {
      if (!this.isDead && this.state === 'attack') this.setState('chase');
    });
  }

  /** Picks a ready ability whose range band contains the current distance. */
  private pickAbility(distance: number): EnemyAbilityUse | null {
    const pool = [...(this.def.abilities ?? []), ...this.extraAbilities];
    if (pool.length === 0) return null;

    const eligible = pool.filter((use) => {
      if (this.cooldowns[use.abilityId] > 0) return false;
      if (use.minRange !== undefined && distance < use.minRange) return false;
      if (use.maxRange !== undefined && distance > use.maxRange) return false;
      if (use.belowHealth !== undefined && this.healthPct > use.belowHealth) return false;
      return true;
    });
    if (eligible.length === 0) return null;
    return fx.weighted(eligible, (u) => u.weight);
  }

  private castEnemyAbility(world: WorldLike, use: EnemyAbilityUse): void {
    const ability = getAbility(use.abilityId);
    const target = this.target;
    if (target) this.faceTowards(target.x, target.y);

    // Telegraph: a growing ring on the ground during the wind-up. Enemy casts
    // must be dodgeable, which means they must be visible before they land.
    if (ability.castTime > 0.25) {
      const radius = ability.radius ?? 80;
      world.emitParticles('rune', this.x, this.y, 8, ability.vfx.color, {
        speed: radius * 0.6, size: 4, life: ability.castTime, drag: 1,
      });
    }

    // Enemy casts route through the same system the player's do.
    world.castAbility(this, use.abilityId);
    this.attackCooldown = ability.castTime + ability.recovery + this.def.ai.recovery;
    this.setState('chase');
  }

  private updateBossPhase(world: WorldLike): void {
    const phases = this.def.boss?.phases;
    if (!phases) return;
    for (let i = phases.length - 1; i > this.phaseIndex; i--) {
      const phase = phases[i];
      if (this.healthPct > phase.atHealth) continue;
      this.phaseIndex = i;
      this.phaseSpeed = phase.speedMult ?? this.phaseSpeed;
      this.phaseDamage = phase.damageMult ?? this.phaseDamage;
      if (phase.abilities) this.extraAbilities = phase.abilities;
      // A phase change is a moment: clear the current action and announce it.
      this.busy = 0;
      this.invuln = Math.max(this.invuln, 0.6);
      world.shake(12);
      world.sfx('boss_roar', this.x, this.y);
      world.emitParticles('rune', this.x, this.y - this.sprite.height * 0.5, 26,
        this.sprite.accent, { speed: 260, size: 6, life: 1 });
      this.onPhaseChange?.(phase.name, phase.line);
      break;
    }
  }

  override onKilled(world: WorldLike, killerId: number): void {
    bus.emit('enemyKilled', {
      enemyId: this.def.id,
      level: this.level,
      x: this.x,
      y: this.y,
    });
    if (this.isBoss) bus.emit('bossDefeated', { bossId: this.def.id });

    // Slimes split. Expressed as data, so any enemy can do it.
    const split = this.def.splitsInto;
    if (split && killerId >= 0) {
      for (let i = 0; i < split.count; i++) {
        const child = new Enemy(
          split.enemyId,
          Math.max(1, this.level + split.levelDelta),
          false,
          this.spawnId,
        );
        const a = (i / split.count) * Math.PI * 2 + fx.angle();
        // A slime that dies flush against the map edge must not hand its
        // children a spawn point outside it — clamp before setHome, since the
        // child's patrol home (and so its whole roaming range) is derived
        // from this same point.
        const b = world.bounds;
        child.x = clamp(this.x + Math.cos(a) * (this.radius + 8), b.x + child.radius, b.x + b.w - child.radius);
        child.y = clamp(this.y + Math.sin(a) * (this.radius + 8), b.y + child.radius, b.y + b.h - child.radius);
        child.setHome(child.x, child.y, 90);
        child.target = this.target;
        child.state = 'chase';
        world.spawn(child);
      }
      world.emitParticles('spark', this.x, this.y - this.sprite.height * 0.4, 14,
        this.sprite.accent, { speed: 180, size: 4, life: 0.5 });
    }
  }

  override onDamaged(event: DamageEvent): void {
    super.onDamaged(event);
    // Being hit from out of nowhere pulls aggro even past the detect radius.
    if (!this.target && event.sourceId >= 0) this.setState('alert');
    // A brief window where the hurt clip wins over idle/walk, but never over
    // an attack or cast already in flight — getting flinch-cancelled out of a
    // telegraphed swing by a chip hit would make attacks unreadable.
    if (this.busy <= 0) this.hurtClipTimer = 0.3;
  }

  /**
   * Picks and advances the sheet clip that matches the current AI/pose state.
   * Runs every frame regardless of sprite-sheet presence — the state machine
   * itself is the single source of truth for "what is this enemy doing", and
   * this is just one more reader of it, the same as the procedural renderer.
   */
  private updateSpriteAnimation(dt: number): void {
    this.hurtClipTimer = Math.max(0, this.hurtClipTimer - dt);
    if (!this.animator || !this.spriteSheet) return;

    let clip: string;
    if (this.isDead) {
      clip = 'death';
    } else if (this.pose.attackKind === 'cast') {
      clip = 'cast';
    } else if (this.pose.attackKind === 'light' || this.pose.attackKind === 'heavy') {
      clip = 'attack';
    } else if (this.hurtClipTimer > 0) {
      clip = 'hurt';
    } else if (this.pose.moveSpeed01 > 0.05) {
      clip = 'walk';
    } else {
      clip = 'idle';
    }

    // A one-shot clip (attack/cast/hurt) plays to completion once started,
    // even if the underlying state flips back to idle a frame early — cutting
    // a swing off mid-animation reads as a glitch, not as responsiveness.
    const current = this.spriteSheet.clips[this.animator.clipName];
    if (current && !current.loop && !this.animator.finished && this.animator.clipName !== clip) {
      clip = this.animator.clipName;
    }

    this.animator.play(clip);
    this.animator.update(dt, this.spriteSheet);
  }

  override render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    if (this.spriteSheet && this.animator && isSheetReady(this.spriteSheet)) {
      // Scale the sheet's fixed pixel grid to this enemy's design height, so a
      // sprite-driven enemy still composes correctly with elites, health bars
      // and everything else keyed off `sprite.height`.
      const scale = (this.sprite.height / 92) * (this.def.spriteSheetScale ?? 1);
      const flip = Math.cos(this.pose.facing) < 0;

      // The procedural renderer draws a ground-contact shadow for every actor
      // (see drawActor); a sprite frame carries no shadow of its own, so
      // without one a sprite-driven enemy visibly floats above the ground.
      const shadowFade = 1 - this.pose.death * 0.7;
      ctx.globalAlpha = 0.34 * shadowFade;
      ctx.fillStyle = C.void;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius * 1.7 * shadowFade, this.radius * 0.7 * shadowFade, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const drawn = this.animator.render(ctx, this.spriteSheet, this.x, this.y, scale, flip);
      if (drawn) {
        if (this.shieldPoints > 0 && !this.isDead) this.renderShieldRing(ctx);
        return;
      }
    }
    // Fallback: sheet still loading, failed to load, or this is an elite —
    // the procedural renderer always works, so nothing is ever left blank.
    super.render(ctx, quality);
  }

  private renderShieldRing(ctx: CanvasRenderingContext2D): void {
    const r = this.radius * 2.1;
    const t = this.pose.animTime;
    ctx.save();
    ctx.translate(this.x, this.y - this.sprite.height * 0.5);
    ctx.strokeStyle = `rgba(95,230,208,${0.35 + Math.sin(t * 4) * 0.12})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Health bar and nameplate. Only shown once the enemy matters to the player. */
  override renderOverlay(ctx: CanvasRenderingContext2D): void {
    if (this.isDead) return;
    const hurt = this.health < this.maxHealth;
    const engaged = this.target !== null;
    if (!hurt && !engaged && !this.elite && !this.isBoss) return;

    // Sized from the sprite so a bar never outweighs the creature wearing it.
    const w = this.isBoss ? 96 : Math.max(26, this.sprite.height * (this.elite ? 0.8 : 0.62));
    const h = this.isBoss ? 7 : 3.2;
    const y = this.y - this.sprite.height - (this.isBoss ? 26 : 14);
    const x = this.x - w / 2;

    ctx.fillStyle = alpha(C.void, 0.66);
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 2.5);
    ctx.fill();

    const pct = this.healthPct;
    ctx.fillStyle = this.isBoss
      ? C.blood
      : pct > 0.5 ? C.verdantDeep : pct > 0.25 ? C.goldDeep : C.bloodDeep;
    roundRect(ctx, x, y, Math.max(1, w * pct), h, 2);
    ctx.fill();

    if (this.shieldPoints > 0) {
      ctx.fillStyle = alpha(C.aether, 0.8);
      roundRect(ctx, x, y, Math.max(1, w * clamp(this.shieldPoints / this.maxHealth, 0, 1)), h * 0.4, 2);
      ctx.fill();
    }

    if (this.elite || this.isBoss) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = this.isBoss ? displayFont(13) : bodyFont(10, 600);
      ctx.fillStyle = this.isBoss ? C.blood : C.gold;
      ctx.fillText(this.name, this.x, y - 4);
      if (this.isBoss && this.def.title) {
        ctx.font = bodyFont(9, 500);
        ctx.fillStyle = alpha(C.boneDim, 0.9);
        ctx.fillText(this.def.title, this.x, y - 18);
      }
    }
  }
}
