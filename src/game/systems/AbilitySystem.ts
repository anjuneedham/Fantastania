import { C } from '../../art/palette';
import { fx } from '../../engine/Rng';
import { inCone } from '../../engine/math';
import { getAbility } from '../../data/abilities';
import type { Actor, Faction } from '../entities/Entity';
import { Projectile, Zone, creditLeech } from '../entities/Projectile';
import { bus } from '../events';
import type { World } from '../World';
import type { AbilityDef } from '../types';

/**
 * Executes abilities from their data definitions.
 *
 * This is the only file that knows how an ability turns into damage. Every
 * spell, every enemy special and both characters' basic attacks route through
 * it, which is why adding `fireBolt` required no code at all — only a record in
 * `data/abilities.ts`.
 */

export interface CastOptions {
  /** Direction to fire in. Defaults to the caster's facing. */
  angle?: number;
  /** Ground target for zone abilities. Defaults to `range` ahead of the caster. */
  targetX?: number;
  targetY?: number;
  /** Skips mana and cooldown; used for basic attacks backed by an ability. */
  free?: boolean;
}

export type CastFailure = 'cooldown' | 'mana' | 'busy' | 'dead';

export interface CastResult {
  ok: boolean;
  reason?: CastFailure;
}

/** Cheap pre-check so the UI can grey out a button without side effects. */
export function canCast(caster: Actor, ability: AbilityDef, free = false): CastResult {
  if (caster.isDead) return { ok: false, reason: 'dead' };
  if (caster.busy > 0 || caster.staggered > 0) return { ok: false, reason: 'busy' };
  if (!free) {
    if (caster.cooldowns[ability.id] > 0) return { ok: false, reason: 'cooldown' };
    const cost = caster.modifyAbility(ability.id, 'manaCost', ability.manaCost);
    if (cost > caster.mana) return { ok: false, reason: 'mana' };
  }
  return { ok: true };
}

/**
 * Starts a cast. The caster is locked immediately and the effect resolves after
 * the ability's `castTime`, so the wind-up animation and the damage always
 * agree — which is what makes an attack feel dodgeable rather than arbitrary.
 */
export function castAbility(
  world: World,
  caster: Actor,
  abilityOrId: AbilityDef | string,
  opts: CastOptions = {},
): CastResult {
  const ability = typeof abilityOrId === 'string' ? getAbility(abilityOrId) : abilityOrId;
  const free = opts.free ?? false;

  const check = canCast(caster, ability, free);
  if (!check.ok) {
    if (caster.faction === 'player') {
      bus.emit('abilityFailed', {
        abilityId: ability.id,
        reason: check.reason === 'dead' ? 'busy' : (check.reason ?? 'busy'),
      });
    }
    return check;
  }

  if (!free) {
    caster.mana -= caster.modifyAbility(ability.id, 'manaCost', ability.manaCost);
    const cooldown = caster.modifyAbility(ability.id, 'cooldown', ability.cooldown);
    if (cooldown > 0) caster.cooldowns[ability.id] = cooldown;
  }

  const angle = opts.angle ?? caster.pose.facing;
  caster.pose.facing = angle;
  caster.busy = ability.castTime + ability.recovery;
  caster.pose.attackKind = 'cast';
  caster.pose.attackProgress = 0;
  if (ability.iframes) caster.invuln = Math.max(caster.invuln, ability.iframes);

  if (ability.sfx?.cast) world.sfx(ability.sfx.cast, caster.x, caster.y);
  if (caster.faction === 'player') bus.emit('abilityUsed', { abilityId: ability.id });

  // Wind-up tell: motes gathering at the caster. The player learns to read this.
  if (ability.castTime > 0.15) {
    world.emitParticles('spark', caster.x, caster.y - caster.sprite.height * 0.5, 6,
      ability.vfx.color, { speed: 40, size: 3, life: ability.castTime, drag: 1 });
  }

  const resolve = () => {
    if (caster.isDead) return;
    applyEffect(world, caster, ability, angle, opts);
  };
  if (ability.castTime > 0) world.schedule(ability.castTime, resolve);
  else resolve();

  return { ok: true };
}

/* ------------------------------------------------------------------ */

function hostileFaction(caster: Actor): Faction {
  return caster.faction === 'player' ? 'enemy' : 'player';
}

/** Rolls the ability's damage, including the caster's crit. */
function rollDamage(caster: Actor, ability: AbilityDef): { amount: number; crit: boolean } {
  let base = ability.damage ?? 0;
  if (ability.scaling) base += caster.statValue(ability.scaling.stat) * ability.scaling.mult;
  base = caster.modifyAbility(ability.id, 'damage', base);
  const crit = fx.chance(caster.critChance);
  if (crit) base *= caster.critDamage;
  // ±8% variance stops repeated hits reading as a spreadsheet.
  return { amount: Math.max(1, Math.round(base * fx.range(0.92, 1.08))), crit };
}

function rollHeal(caster: Actor, ability: AbilityDef): number {
  let base = ability.heal ?? 0;
  if (ability.scaling) base += caster.statValue(ability.scaling.stat) * ability.scaling.mult;
  return Math.round(caster.modifyAbility(ability.id, 'heal', base));
}

function applyEffect(
  world: World,
  caster: Actor,
  ability: AbilityDef,
  angle: number,
  opts: CastOptions,
): void {
  const target = hostileFaction(caster);

  switch (ability.shape) {
    case 'projectile':
      fireProjectiles(world, caster, ability, angle, target);
      break;

    case 'nova':
      areaHit(world, caster, ability, caster.x, caster.y,
        caster.modifyAbility(ability.id, 'radius', ability.radius ?? 100), target);
      novaVfx(world, caster.x, caster.y, ability);
      break;

    case 'cone': {
      const range = ability.range;
      const arc = ability.arc ?? 0.9;
      let hits = 0;
      for (const actor of world.actors) {
        if (actor.isDead || actor.faction !== target) continue;
        if (!inCone(caster.x, caster.y, angle, arc, range, actor.x, actor.y, actor.radius)) continue;
        damageActor(world, caster, ability, actor, angle);
        hits++;
      }
      world.particles.slash(
        caster.x + Math.cos(angle) * range * 0.4,
        caster.y + Math.sin(angle) * range * 0.4,
        angle, range * 0.7, ability.vfx.color,
      );
      world.emitParticles('spark', caster.x + Math.cos(angle) * range * 0.5,
        caster.y + Math.sin(angle) * range * 0.5, 14, ability.vfx.color,
        { speed: 210, angle, spread: arc * 2, size: 3.4, life: 0.4 });
      if (hits > 0) world.shake(3);
      break;
    }

    case 'self': {
      const heal = rollHeal(caster, ability);
      if (heal > 0) {
        const healed = caster.heal(heal);
        if (healed > 0) {
          world.texts.push(`+${healed}`, caster.x, caster.y - caster.sprite.height, C.verdant);
          if (caster.faction === 'player') bus.emit('playerHealed', { amount: healed });
        }
      }
      novaVfx(world, caster.x, caster.y, ability);
      break;
    }

    case 'dash': {
      const distance = caster.modifyAbility(ability.id, 'range', ability.range);
      const duration = 0.22;
      caster.startDash(Math.cos(angle), Math.sin(angle), distance, duration);
      caster.invuln = Math.max(caster.invuln, ability.iframes ?? duration);

      // Damaging dashes hit everything along the path, sampled as it travels.
      if (ability.damage) {
        const hit = new Set<number>();
        const radius = ability.radius ?? 30;
        const samples = 6;
        for (let i = 1; i <= samples; i++) {
          world.schedule((duration * i) / samples, () => {
            if (caster.isDead) return;
            for (const actor of world.actors) {
              if (actor.isDead || actor.faction !== target || hit.has(actor.id)) continue;
              const reach = radius + actor.radius;
              const dx = actor.x - caster.x;
              const dy = actor.y - caster.y;
              if (dx * dx + dy * dy > reach * reach) continue;
              hit.add(actor.id);
              damageActor(world, caster, ability, actor, angle);
            }
          });
        }
      }

      // Afterimages: the clearest way to show an i-frame window happened.
      for (let i = 0; i < 5; i++) {
        world.schedule(i * 0.04, () => {
          world.emitParticles('spark', caster.x, caster.y - caster.sprite.height * 0.4, 3,
            ability.vfx.color, { speed: 20, size: 4, life: 0.35, drag: 6 });
        });
      }
      break;
    }

    case 'zone': {
      const range = ability.range;
      const tx = opts.targetX ?? caster.x + Math.cos(angle) * range;
      const ty = opts.targetY ?? caster.y + Math.sin(angle) * range;
      const zone = new Zone();
      zone.x = tx;
      zone.y = ty;
      zone.owner = caster;
      zone.targetFaction = target;
      zone.radius = caster.modifyAbility(ability.id, 'radius', ability.radius ?? 80);
      zone.duration = caster.modifyAbility(ability.id, 'duration', ability.duration ?? 4);
      zone.damagePerTick = ability.damage
        ? Math.max(1, Math.round(rollDamage(caster, ability).amount * 0.5))
        : 0;
      zone.damageType = ability.damageType ?? 'nature';
      zone.applies = ability.applies;
      zone.color = ability.vfx.color;
      zone.accent = ability.vfx.accent ?? ability.vfx.color;
      world.spawn(zone);
      break;
    }
  }

  if (ability.selfApplies) {
    for (const status of ability.selfApplies) caster.applyStatus(status);
  }
}

function fireProjectiles(
  world: World, caster: Actor, ability: AbilityDef, angle: number, target: Faction,
): void {
  const count = Math.max(1, Math.round(caster.modifyAbility(ability.id, 'count', ability.count ?? 1)));
  const spread = ability.spread ?? 0;
  const muzzle = caster.radius + 6;

  for (let i = 0; i < count; i++) {
    // Fan evenly around the aim direction; a single shot goes dead ahead.
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
    const a = angle + offset;
    const roll = rollDamage(caster, ability);

    const p = new Projectile();
    p.x = caster.x + Math.cos(a) * muzzle;
    p.y = caster.y + Math.sin(a) * muzzle;
    p.angle = a;
    p.owner = caster;
    p.targetFaction = target;
    p.damage = roll.amount;
    p.crit = roll.crit;
    p.damageType = ability.damageType ?? 'arcane';
    p.knockback = ability.knockback ?? 0;
    p.staggerPower = ability.staggerPower ?? 0;
    p.pierce = ability.pierce ?? 0;
    p.speed = ability.speed ?? 420;
    p.rangeLeft = ability.range;
    p.size = ability.vfx.size ?? 6;
    p.radius = Math.max(5, (ability.vfx.size ?? 6) * 0.9);
    p.color = ability.vfx.color;
    p.accent = ability.vfx.accent ?? ability.vfx.color;
    p.trail = ability.vfx.trail ?? 0;
    p.impact = ability.vfx.impact ?? 'burst';
    p.impactSfx = ability.sfx?.impact;
    p.applies = ability.applies;
    world.spawn(p);
  }
}

function areaHit(
  world: World, caster: Actor, ability: AbilityDef,
  x: number, y: number, radius: number, target: Faction,
): void {
  let hits = 0;
  for (const actor of world.actors) {
    if (actor.isDead || actor.faction !== target) continue;
    const reach = radius + actor.radius;
    const dx = actor.x - x;
    const dy = actor.y - y;
    if (dx * dx + dy * dy > reach * reach) continue;
    damageActor(world, caster, ability, actor, Math.atan2(dy, dx));
    hits++;
  }
  if (hits > 0) world.shake(Math.min(8, 2 + hits));
}

function damageActor(
  world: World, caster: Actor, ability: AbilityDef, actor: Actor, angle: number,
): void {
  const roll = rollDamage(caster, ability);
  const hitAngle = Math.atan2(actor.y - caster.y, actor.x - caster.x) || angle;
  world.damage(actor, {
    amount: roll.amount,
    type: ability.damageType ?? 'arcane',
    crit: roll.crit,
    sourceId: caster.id,
    knockback: ability.knockback ?? 0,
    staggerPower: ability.staggerPower ?? 0,
    angle: hitAngle,
  });
  if (ability.applies) for (const status of ability.applies) actor.applyStatus(status);
  creditLeech(caster, roll.amount, ability.damageType ?? 'arcane');
}

function novaVfx(world: World, x: number, y: number, ability: AbilityDef): void {
  const radius = ability.radius ?? ability.vfx.size ?? 80;
  world.particles.ring(x, y, radius, ability.vfx.color, 0.5);
  world.emitParticles('ember', x, y, 22, ability.vfx.color, {
    speed: radius * 2.4, size: 4, life: 0.55,
  });
  if (ability.vfx.accent) {
    world.emitParticles('spark', x, y, 12, ability.vfx.accent, {
      speed: radius * 1.6, size: 2.6, life: 0.4,
    });
  }
}
