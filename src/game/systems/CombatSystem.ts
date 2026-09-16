import { C } from '../../art/palette';
import type { Controls } from '../../engine/Controls';
import { dist2, inCone } from '../../engine/math';
import { fx } from '../../engine/Rng';
import { getAbility } from '../../data/abilities';
import type { Player } from '../entities/Player';
import { creditLeech } from '../entities/Projectile';
import { bus } from '../events';
import { state } from '../GameState';
import type { World } from '../World';
import type { AttackDef } from '../types';
import { castAbility } from './AbilitySystem';

/**
 * Translates player input into attacks.
 *
 * Melee swings resolve as cones on a schedule tied to the attack's wind-up, the
 * same way enemy attacks do, so "I dodged that" always means the same thing
 * regardless of who swung. Ranged basic attacks reuse the ability system via
 * `AttackDef.abilityId`, which is why Lev needs no second code path.
 */
export class CombatSystem {
  constructor(
    private readonly world: World,
    private readonly player: Player,
  ) {}

  update(controls: Controls): void {
    const player = this.player;
    if (player.isDead) return;

    if (controls.pressed('attack')) this.tryBasic('light');
    else if (controls.pressed('heavy')) this.tryBasic('heavy');

    if (controls.pressed('ability1')) this.tryAbility(state.loadout.ability1);
    if (controls.pressed('ability2')) this.tryAbility(state.loadout.ability2);
    if (controls.pressed('ultimate')) this.tryAbility(state.loadout.ultimate);
  }

  /**
   * Chooses the direction an attack goes in. On touch there is no aim stick, so
   * an attack snaps to the nearest enemy inside a generous cone — without it,
   * touch combat is unplayable; with it, the player still has to face roughly
   * the right way.
   */
  private aimAngle(range: number): number {
    const player = this.player;
    const facing = player.pose.facing;
    if (!state.settings.aimAssist) return facing;

    const searchRange = range + 90;
    let best: { angle: number; score: number } | null = null;
    for (const actor of this.world.actors) {
      if (actor.isDead || actor.faction !== 'enemy') continue;
      const d2 = dist2(player.x, player.y, actor.x, actor.y);
      if (d2 > searchRange * searchRange) continue;
      const angle = Math.atan2(actor.y - player.y, actor.x - player.x);
      let delta = Math.abs(((angle - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      // Only snap within a 70-degree cone; beyond that the player meant it.
      if (delta > 1.2) continue;
      // Prefer close targets, then well-aligned ones.
      const score = Math.sqrt(d2) + delta * 90;
      if (!best || score < best.score) best = { angle, score };
      delta = 0;
    }
    return best ? best.angle : facing;
  }

  private tryBasic(kind: 'light' | 'heavy'): void {
    const player = this.player;
    if (!player.canAct) return;

    const def = player.def;
    const attack = kind === 'light' ? def.lightAttack : def.heavyAttack;
    const speed = Math.max(0.5, player.stats.weaponSpeed);
    const range = attack.range * (attack.abilityId ? 1 : player.stats.weaponReach);
    const angle = this.aimAngle(range);
    player.pose.facing = angle;

    // A ranged basic attack is just a free cast; no second combat path.
    if (attack.abilityId) {
      const ability = getAbility(attack.abilityId);
      const result = castAbility(this.world, player, ability, { angle, free: true });
      if (result.ok) {
        // The attack's own timing governs the rhythm, not the ability's.
        player.busy = (attack.windup + attack.recovery) / speed;
        player.beginAction(kind === 'light' ? 'light' : 'heavy', player.busy);
        player.outOfCombat = 0;
        this.advanceCombo(kind);
      }
      return;
    }

    const windup = attack.windup / speed;
    const total = (attack.windup + attack.active + attack.recovery) / speed;
    player.beginAction(kind, total);
    player.outOfCombat = 0;
    if (attack.sfx) this.world.sfx(attack.sfx);

    const comboStep = this.advanceCombo(kind);
    this.world.schedule(windup, () => {
      if (player.isDead || player.staggered > 0) return;
      this.resolveMelee(attack, angle, kind, comboStep, range);
    });
  }

  /** Advances the light-attack combo counter and returns the step just used. */
  private advanceCombo(kind: 'light' | 'heavy'): number {
    const player = this.player;
    if (kind === 'heavy') {
      player.comboStep = 0;
      player.comboWindow = 0;
      return 0;
    }
    const step = player.comboStep;
    player.comboStep = (player.comboStep + 1) % player.def.comboLength;
    // The window is generous: missing a combo because of a dropped frame on a
    // phone is not an interesting failure.
    player.comboWindow = 0.85;
    return step;
  }

  private resolveMelee(
    attack: AttackDef, angle: number, kind: 'light' | 'heavy', comboStep: number, range: number,
  ): void {
    const player = this.player;
    const world = this.world;

    if (attack.lunge) {
      player.startDash(Math.cos(angle), Math.sin(angle), attack.lunge, attack.active + 0.06);
    }

    // The final light attack in a chain hits harder: the reward for committing.
    const finisher = kind === 'light' && comboStep === player.def.comboLength - 1;
    const comboMult = finisher ? 1.45 : 1 + comboStep * 0.08;
    const power = player.physicalPower * attack.damageMult * comboMult;

    let hits = 0;
    for (const actor of world.actors) {
      if (actor.isDead || actor.faction !== 'enemy') continue;
      if (!inCone(player.x, player.y, angle, attack.arc, range, actor.x, actor.y, actor.radius)) {
        continue;
      }
      const crit = fx.chance(player.stats.critChance);
      let amount = power * fx.range(0.92, 1.08);
      if (crit) amount *= player.stats.critDamage;

      world.damage(actor, {
        amount,
        type: 'physical',
        crit,
        sourceId: player.id,
        knockback: attack.knockback,
        staggerPower: attack.staggerPower * (finisher ? 1.6 : 1),
        angle: Math.atan2(actor.y - player.y, actor.x - player.x),
      });
      creditLeech(player, amount, 'physical');
      hits++;
    }

    // Swing arc VFX, tinted by whether it connected — immediate, honest feedback.
    const cx = player.x + Math.cos(angle) * range * 0.45;
    const cy = player.y + Math.sin(angle) * range * 0.45;
    world.particles.slash(cx, cy, angle, range * 0.8,
      finisher ? C.gold : hits > 0 ? C.white : C.haze);

    if (hits > 0) {
      world.emitParticles('spark', cx, cy, finisher ? 16 : 8, finisher ? C.gold : C.white, {
        speed: 190, angle, spread: attack.arc * 1.8, size: 3, life: 0.32,
      });
      world.shake((attack.shake ?? 2) * (finisher ? 1.8 : 1));
      if (attack.hitSfx) world.sfx(attack.hitSfx);
      // Hit-stop: a few frames of slowdown on a solid connect. The cheapest
      // trick in action games and the one players feel most.
      if (finisher || kind === 'heavy') world.requestHitStop(0.07);
    }
  }

  private tryAbility(abilityId: string | null): void {
    if (!abilityId) return;
    const player = this.player;
    const ability = getAbility(abilityId);

    // Zone abilities land where the player is aiming, clamped to their range.
    let targetX: number | undefined;
    let targetY: number | undefined;
    const angle = this.aimAngle(ability.range);
    if (ability.shape === 'zone') {
      const nearest = this.world.nearestActor(player.x, player.y, 'enemy', ability.range);
      if (nearest) {
        targetX = nearest.x;
        targetY = nearest.y;
      }
    }

    const result = castAbility(this.world, player, ability, { angle, targetX, targetY });
    if (!result.ok) {
      if (result.reason === 'mana') {
        bus.emit('toast', { text: 'Not enough aether.', color: C.aether, icon: '✦' });
        this.world.sfx('ui_error');
      }
      return;
    }
    player.outOfCombat = 0;
  }
}
