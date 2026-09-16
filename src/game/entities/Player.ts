import { getCharacter } from '../../data/characters';
import { tryGetItem } from '../../data/items';
import type { Controls } from '../../engine/Controls';
import { clamp, clamp01, damp } from '../../engine/math';
import { state } from '../GameState';
import { computeStats, type EffectiveStats } from '../systems/StatsSystem';
import { mitigate } from '../progression';
import type { CharacterDef, DamageEvent, StatBlock } from '../types';
import { emptyStats } from '../types';
import { Actor, type WorldLike } from './Entity';

/**
 * The player-controlled actor.
 *
 * Holds no progression data of its own — everything authoritative lives in
 * GameState, and this reads a cached EffectiveStats snapshot that is refreshed
 * whenever equipment, level or skills change. That split is what makes saving
 * and loading trivial: the entity is disposable.
 */

export type PlayerAction = 'none' | 'light' | 'heavy' | 'cast' | 'dodge';

export class Player extends Actor {
  override faction = 'player' as const;
  def!: CharacterDef;
  stats!: EffectiveStats;

  action: PlayerAction = 'none';
  /** Seconds elapsed in the current action. */
  actionTime = 0;
  /** Total duration of the current action. */
  actionDuration = 0;
  /** Which combo step a light attack is on, 0-based. */
  comboStep = 0;
  /** Seconds left in which another light attack continues the combo. */
  comboWindow = 0;
  /** Set true once the current attack has applied its damage. */
  actionResolved = false;

  dodgeCooldown = 0;
  dodgeDirX = 1;
  dodgeDirY = 0;

  /** Ability id -> seconds remaining. */
  cooldowns: Record<string, number> = {};

  /** Seconds since the player last took or dealt damage. */
  outOfCombat = 0;
  /** Seconds the player must wait before respawning after death. */
  respawnTimer = 0;

  /** Temporary stat buffs from consumables, keyed by stat. */
  consumableBuffs: Array<{ stat: keyof StatBlock; amount: number; remaining: number }> = [];

  constructor(characterId: string) {
    super();
    this.setCharacter(characterId);
  }

  setCharacter(characterId: string): void {
    this.def = getCharacter(characterId);
    this.name = this.def.name;
    this.radius = this.def.radius;
    this.sprite = { ...this.def.sprite };
    this.corpseDuration = Infinity;
    this.refreshStats();
    this.health = this.maxHealth;
    this.mana = this.maxMana;
  }

  /**
   * Recomputes derived stats. Called on level-up, equip, skill purchase and
   * buff expiry — never per frame.
   */
  refreshStats(): void {
    const buffs = emptyStats();
    for (const b of this.consumableBuffs) buffs[b.stat] += b.amount;
    for (const s of this.statuses) {
      if (s.kind === 'buff' && s.stat) buffs[s.stat as keyof StatBlock] += s.magnitude;
    }

    const healthPct = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
    const manaPct = this.maxMana > 0 ? this.mana / this.maxMana : 1;

    this.stats = computeStats(buffs);
    this.maxHealth = this.stats.maxHealth;
    this.maxMana = this.stats.maxMana;
    // Preserve the *fraction* so a +vitality buff does not silently heal you and
    // its expiry does not kill you.
    this.health = clamp(healthPct * this.maxHealth, 1, this.maxHealth);
    this.mana = clamp(manaPct * this.maxMana, 0, this.maxMana);

    // Equipping a weapon changes what the character visibly holds.
    const weaponId = state.equipment.weapon;
    const weapon = weaponId ? tryGetItem(weaponId) : undefined;
    this.sprite = {
      ...this.def.sprite,
      weapon: weapon?.weapon?.visual ?? this.def.sprite.weapon,
    };
  }

  override get physicalPower(): number {
    return 6 + this.stats.total.strength * 1.15 * this.stats.weaponPower;
  }

  override get magicPower(): number {
    return 5 + this.stats.total.magic * 1.2 * this.stats.weaponPower;
  }

  override get armor(): number {
    return this.stats.total.defense;
  }

  get isBlocking(): boolean {
    return this.pose.block > 0.5;
  }

  /** True when the player can start a new action. */
  get canAct(): boolean {
    return !this.isDead && this.busy <= 0 && this.staggered <= 0;
  }

  update(dt: number, world: WorldLike): void {
    this.tickCommon(dt, world);
    if (this.isDead) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      return;
    }

    this.outOfCombat += dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    if (this.comboWindow <= 0) this.comboStep = 0;

    for (const key of Object.keys(this.cooldowns)) {
      const left = this.cooldowns[key] - dt;
      if (left <= 0) delete this.cooldowns[key];
      else this.cooldowns[key] = left;
    }

    let buffsChanged = false;
    for (let i = this.consumableBuffs.length - 1; i >= 0; i--) {
      this.consumableBuffs[i].remaining -= dt;
      if (this.consumableBuffs[i].remaining <= 0) {
        this.consumableBuffs.splice(i, 1);
        buffsChanged = true;
      }
    }
    if (buffsChanged) this.refreshStats();

    this.regenerate(dt);
    this.advanceAction(dt, world);
    state.playtime += dt;
  }

  private regenerate(dt: number): void {
    if (this.maxMana > 0) {
      this.mana = Math.min(this.maxMana, this.mana + this.stats.manaRegen * dt);
    }
    // Health only returns out of combat, so healing items keep their value.
    if (this.outOfCombat > 5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.stats.healthRegen * dt);
    }
  }

  /** Advances whatever action is running; movement happens in `applyInput`. */
  private advanceAction(dt: number, world: WorldLike): void {
    if (this.action === 'none') return;
    this.actionTime += dt;

    if (this.action === 'dodge') {
      const d = this.def.dodge;
      const t = clamp01(this.actionTime / d.duration);
      // Ease-out: fast off the mark, settling at the end. Reads as a real roll.
      const speed = (d.distance / d.duration) * (1 - t * t) * 1.5;
      world.moveWithCollision(this, this.dodgeDirX * speed * dt, this.dodgeDirY * speed * dt);
    }

    if (this.actionTime >= this.actionDuration) {
      this.action = 'none';
      this.actionTime = 0;
      this.actionDuration = 0;
      this.pose.attackProgress = -1;
      this.pose.attackKind = null;
    } else if (this.action !== 'dodge') {
      this.pose.attackProgress = clamp01(this.actionTime / this.actionDuration);
    }
  }

  /**
   * Applies movement input for this frame. Attack and ability input is handled
   * by CombatSystem, which owns the rules about what may interrupt what.
   */
  applyInput(controls: Controls, dt: number, world: WorldLike): void {
    if (this.isDead) return;

    const blocking =
      this.def.canBlock && controls.down('block') && this.canAct && this.action === 'none';
    this.pose.block = damp(this.pose.block, blocking ? 1 : 0, 18, dt);

    let mx = controls.moveX;
    let my = controls.moveY;
    const moving = mx !== 0 || my !== 0;

    // Staggered, rooted or mid-dodge: no steering.
    if (this.staggered > 0 || this.rooted || this.action === 'dodge') {
      mx = 0;
      my = 0;
    }

    let speed = this.stats.moveSpeed * this.speedMult;
    if (blocking && this.def.block) speed *= this.def.block.moveScale;
    // Attacks root you briefly; that commitment is what makes dodging matter.
    if (this.action === 'light' || this.action === 'heavy' || this.action === 'cast') {
      speed *= 0.28;
    }

    // Accelerate towards the target velocity rather than snapping, so the
    // character has a little weight without feeling floaty.
    const targetVx = mx * speed;
    const targetVy = my * speed;
    const accel = moving ? 14 : 18;
    this.vx = damp(this.vx, targetVx, accel, dt);
    this.vy = damp(this.vy, targetVy, accel, dt);

    if (Math.abs(this.vx) > 0.5 || Math.abs(this.vy) > 0.5) {
      world.moveWithCollision(this, this.vx * dt, this.vy * dt);
    }

    // Facing: aim beats movement, movement beats standing still.
    if (this.action === 'none' || this.action === 'dodge') {
      if (controls.aiming) {
        this.faceTowards(controls.aimWorldX, controls.aimWorldY);
      } else if (moving) {
        this.pose.facing = Math.atan2(my, mx);
      }
    }

    this.pose.moveSpeed01 = clamp01(Math.hypot(this.vx, this.vy) / Math.max(1, speed));
  }

  /** Starts a dodge roll. Returns false when it is not available. */
  startDodge(dirX: number, dirY: number): boolean {
    if (!this.canAct || this.dodgeCooldown > 0) return false;
    const d = this.def.dodge;
    if (d.manaCost > 0 && this.mana < d.manaCost) return false;

    const len = Math.hypot(dirX, dirY);
    if (len < 0.01) {
      // No input direction: dodge the way we are facing.
      this.dodgeDirX = Math.cos(this.pose.facing);
      this.dodgeDirY = Math.sin(this.pose.facing);
    } else {
      this.dodgeDirX = dirX / len;
      this.dodgeDirY = dirY / len;
    }

    this.mana -= d.manaCost;
    this.action = 'dodge';
    this.actionTime = 0;
    this.actionDuration = d.duration;
    this.busy = d.duration * 0.8;
    this.dodgeCooldown = d.cooldown;
    this.invuln = Math.max(this.invuln, d.iframes + this.stats.passives.dodgeIframes);
    this.pose.facing = Math.atan2(this.dodgeDirY, this.dodgeDirX);
    this.pose.squash = 0.86;
    return true;
  }

  /** Begins an attack or cast. Duration comes from the caller's definition. */
  beginAction(kind: Exclude<PlayerAction, 'none' | 'dodge'>, duration: number): void {
    this.action = kind;
    this.actionTime = 0;
    this.actionDuration = duration;
    this.actionResolved = false;
    this.busy = duration;
    this.pose.attackKind = kind === 'cast' ? 'cast' : kind;
    this.pose.attackProgress = 0;
  }

  /** Mitigation hook used by the world's damage pipeline. */
  mitigateIncoming(event: DamageEvent): number {
    let amount = event.amount * this.damageTakenMult;
    if (event.type === 'physical') {
      amount = mitigate(amount, this.armor);
    } else {
      // Magic is resisted by a mix of defense and spirit, at a lower rate, so
      // armour is not a universal answer.
      amount = mitigate(amount, this.armor * 0.4 + this.stats.total.spirit * 0.5);
    }
    if (this.isBlocking && this.def.block) {
      const reduction = clamp01(this.def.block.reduction + this.stats.passives.blockReduction);
      amount *= 1 - reduction;
    }
    return Math.max(1, Math.round(amount));
  }

  override onDamaged(event: DamageEvent): void {
    super.onDamaged(event);
    this.outOfCombat = 0;
    // Blocking converts a stagger into a much shorter flinch.
    if (this.isBlocking) this.staggered *= 0.3;
  }

  /** Puts the player back on their feet at a spawn point. */
  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.pushX = 0;
    this.pushY = 0;
    this.deathTime = -1;
    this.solid = true;
    this.health = Math.max(1, Math.round(this.maxHealth * 0.5));
    this.mana = Math.round(this.maxMana * 0.5);
    this.pose.death = 0;
    this.pose.hitFlash = 0;
    this.action = 'none';
    this.busy = 0;
    this.staggered = 0;
    this.invuln = 1.5;
    this.cooldowns = {};
    this.clearStatuses();
  }
}
