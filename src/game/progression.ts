import { DERIVED, type StatBlock, type StatKey, emptyStats } from './types';

/**
 * Levelling maths. Kept in one file so the curve can be retuned without
 * touching a single system that consumes it.
 */

export const MAX_LEVEL = 30;
/** Skill points granted per level-up. */
export const SKILL_POINTS_PER_LEVEL = 1;
/** Bonus points at these levels, to give progression a rhythm. */
export const BONUS_POINT_LEVELS = new Set([5, 10, 15, 20, 25, 30]);

/** Total XP required to advance *from* `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(58 * Math.pow(level, 1.52) + 42 * level);
}

/** Cumulative XP needed to reach `level` from level 1. */
export function xpTotalFor(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpToNext(i);
  return total;
}

/** XP a defeated enemy of `enemyLevel` awards to a player of `playerLevel`. */
export function xpReward(baseXp: number, enemyLevel: number, playerLevel: number): number {
  // Diminishing returns on trivial content, so grinding low-level packs stops
  // being the optimal play without ever hitting a hard zero.
  const delta = playerLevel - enemyLevel;
  const scale = delta <= 0 ? 1 : Math.max(0.12, 1 - delta * 0.18);
  return Math.max(1, Math.round(baseXp * scale));
}

/** Stats a character has at `level` before equipment and spent skill points. */
export function statsAtLevel(base: StatBlock, growth: StatBlock, level: number): StatBlock {
  const out = emptyStats();
  const levels = Math.max(0, level - 1);
  for (const key of Object.keys(base) as StatKey[]) {
    out[key] = Math.round((base[key] + growth[key] * levels) * 10) / 10;
  }
  return out;
}

export function maxHealthFrom(stats: StatBlock): number {
  return Math.round(42 + stats.vitality * DERIVED.healthPerVitality);
}

export function maxManaFrom(stats: StatBlock): number {
  return Math.round(18 + stats.spirit * DERIVED.manaPerSpirit);
}

export function manaRegenFrom(stats: StatBlock): number {
  return 0.8 + stats.spirit * DERIVED.manaRegenPerSpirit;
}

export function critChanceFrom(stats: StatBlock): number {
  return Math.min(0.5, 0.03 + stats.agility * DERIVED.critPerAgility);
}

export function moveSpeedFrom(base: number, stats: StatBlock): number {
  return base + stats.agility * DERIVED.moveSpeedPerAgility;
}

/**
 * Damage mitigation. An asymptotic curve, so defense always helps but never
 * reaches immunity — 40 defense is roughly 40% reduction, 100 is roughly 62%.
 */
export function mitigate(amount: number, defense: number): number {
  const reduction = defense / (defense + 60);
  return Math.max(1, amount * (1 - reduction));
}

/** Gold dropped scales mildly with level so early areas stay worth clearing. */
export function goldReward(base: number, enemyLevel: number): number {
  return Math.max(1, Math.round(base * (1 + enemyLevel * 0.08)));
}
