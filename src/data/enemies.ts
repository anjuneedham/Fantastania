import type { ActorSprite } from '../art/sprites';
import { C } from '../art/palette';
import type { AttackDef } from '../game/types';

/**
 * The bestiary.
 *
 * Every enemy is a record: stats, a sprite, an attack, an AI profile and an
 * optional ability list. The Enemy entity reads these and has no per-monster
 * branches, so adding a creature means adding a record here and referencing its
 * id from an area's spawn list.
 */

export type Archetype = 'melee' | 'ranged' | 'charger' | 'swarm' | 'boss';

export interface AiProfile {
  /** Distance at which the enemy notices the player. */
  detectRadius: number;
  /** Distance at which it gives up and returns to its post. */
  loseRadius: number;
  /** Distance it tries to hold while not attacking. */
  preferredRange: number;
  /** Seconds between noticing the player and reacting. Higher = more readable. */
  reactionTime: number;
  /** 0..1: how likely it is to press an attack rather than reposition. */
  aggression: number;
  /** Multiplier on move speed while patrolling. */
  patrolSpeed: number;
  /** Multiplier on move speed while chasing. */
  chaseSpeed: number;
  /** Sidesteps instead of walking straight in. Makes ranged enemies awkward. */
  strafe?: boolean;
  /** Alerts allies within this radius when it spots the player. 0 = loner. */
  packRadius?: number;
  /** Runs away below this fraction of health. */
  fleeBelowHealth?: number;
  /** Seconds of pause after an attack before it may act again. */
  recovery: number;
}

export interface EnemyAbilityUse {
  abilityId: string;
  /** Relative likelihood of picking this when several are ready. */
  weight: number;
  minRange?: number;
  maxRange?: number;
  /** Only usable below this fraction of the enemy's health. */
  belowHealth?: number;
}

export interface BossPhase {
  /** Phase begins when health drops below this fraction. */
  atHealth: number;
  name: string;
  /** Shout displayed when the phase starts. */
  line?: string;
  /** Multipliers applied for the rest of the fight. */
  speedMult?: number;
  damageMult?: number;
  /** Abilities unlocked in this phase. */
  abilities?: EnemyAbilityUse[];
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Shown under elite/boss nameplates. */
  title?: string;
  description: string;
  archetype: Archetype;

  /** Stats at level 1. */
  health: number;
  damage: number;
  defense: number;
  /** Used by spell scaling for casters. */
  magic: number;
  moveSpeed: number;
  radius: number;

  /** Added per level above 1. */
  perLevel: {
    health: number;
    damage: number;
    defense: number;
    magic: number;
  };

  /** Base XP before the level-difference curve. */
  xp: number;
  gold: number;
  lootTableId: string;

  attack: AttackDef;
  abilities?: EnemyAbilityUse[];
  ai: AiProfile;
  sprite: ActorSprite;
  /**
   * Optional sprite-sheet id (see data/spriteSheets.ts). When present and the
   * sheet has finished loading, Enemy draws frames from it instead of the
   * procedural `sprite`; `sprite` is always required regardless, since it is
   * the guaranteed fallback while the image loads (or if it fails to).
   */
  spriteSheetId?: string;
  /** Uniform scale applied to sprite-sheet frames, independent of the grid's pixel size. */
  spriteSheetScale?: number;

  /** Spawns smaller copies on death. */
  splitsInto?: { enemyId: string; count: number; levelDelta: number };
  /** Seconds the corpse lingers. */
  corpseDuration?: number;
  sfx?: { alert?: string; attack?: string; die?: string; move?: string };
  boss?: { phases: BossPhase[] };
}

export const ENEMIES: Record<string, EnemyDef> = {
  shadowWolf: {
    id: 'shadowWolf',
    name: 'Shadow Wolf',
    description:
      'A wolf the dark got into. It still hunts like a wolf, which is the ' +
      'problem — it hunts in threes and it waits for you to commit.',
    archetype: 'charger',
    health: 42,
    damage: 7,
    defense: 2,
    magic: 0,
    moveSpeed: 168,
    radius: 15,
    perLevel: { health: 13, damage: 2.4, defense: 1.1, magic: 0 },
    xp: 22,
    gold: 5,
    lootTableId: 'shadowWolf',
    attack: {
      damageMult: 1,
      range: 52,
      arc: 0.7,
      windup: 0.34,
      active: 0.1,
      recovery: 0.45,
      staggerPower: 0.9,
      knockback: 160,
      lunge: 120,
      shake: 2,
      sfx: 'swing_light',
      hitSfx: 'impact_flesh',
    },
    ai: {
      detectRadius: 300,
      loseRadius: 560,
      preferredRange: 40,
      reactionTime: 0.25,
      aggression: 0.85,
      patrolSpeed: 0.42,
      chaseSpeed: 1,
      packRadius: 340,
      recovery: 0.35,
    },
    sprite: {
      shape: 'beast',
      height: 40,
      build: 1,
      skin: '#2a2438',
      hair: '#1a1526',
      primary: '#332a4a',
      secondary: '#4a3f68',
      accent: C.violet,
      eyeColor: C.violet,
      eyeGlow: true,
      aura: { color: C.violet, radius: 46, intensity: 0.35 },
    },
    sfx: { alert: 'wolf_howl', die: 'enemy_die' },
  },

  forestGoblin: {
    id: 'forestGoblin',
    name: 'Forest Goblin',
    description:
      'Small, fast, and entirely convinced it is winning. Fights in groups and ' +
      'retreats the instant it stops being one.',
    archetype: 'melee',
    health: 34,
    damage: 6,
    defense: 3,
    magic: 0,
    moveSpeed: 142,
    radius: 12,
    perLevel: { health: 10, damage: 2, defense: 1.3, magic: 0 },
    xp: 18,
    gold: 8,
    lootTableId: 'forestGoblin',
    attack: {
      damageMult: 1,
      range: 46,
      arc: 0.8,
      windup: 0.26,
      active: 0.09,
      recovery: 0.34,
      staggerPower: 0.6,
      knockback: 110,
      lunge: 30,
      shake: 1.2,
      sfx: 'swing_light',
      hitSfx: 'impact_flesh',
    },
    ai: {
      detectRadius: 250,
      loseRadius: 480,
      preferredRange: 36,
      reactionTime: 0.35,
      aggression: 0.6,
      patrolSpeed: 0.5,
      chaseSpeed: 1,
      packRadius: 260,
      fleeBelowHealth: 0.2,
      recovery: 0.4,
    },
    sprite: {
      shape: 'humanoid',
      height: 32,
      build: 0.88,
      skin: '#6f9b52',
      hair: '#2f3d24',
      primary: '#6b4b2e',
      secondary: '#8a6a3a',
      accent: C.rot,
      legs: '#3f2f1e',
      eyeColor: '#1a1a10',
      horns: false,
      weapon: { kind: 'dagger', length: 0.42, color: '#9aa0ad' },
    },
    sfx: { alert: 'enemy_alert', die: 'enemy_die' },
  },

  arcaneSlime: {
    id: 'arcaneSlime',
    name: 'Arcane Slime',
    description:
      'Aether that got into standing water and decided to stay. Splits when ' +
      'struck hard enough, which everyone finds out exactly once.',
    archetype: 'swarm',
    health: 50,
    damage: 5,
    defense: 5,
    magic: 8,
    moveSpeed: 74,
    radius: 16,
    perLevel: { health: 15, damage: 1.7, defense: 1.6, magic: 2.2 },
    xp: 20,
    gold: 4,
    lootTableId: 'arcaneSlime',
    attack: {
      damageMult: 1,
      range: 42,
      arc: Math.PI,
      windup: 0.4,
      active: 0.14,
      recovery: 0.55,
      staggerPower: 0.5,
      knockback: 140,
      shake: 1.6,
      sfx: 'slime_move',
      hitSfx: 'impact_nature',
    },
    abilities: [
      { abilityId: 'splitSpray', weight: 1, minRange: 60, maxRange: 200 },
    ],
    ai: {
      detectRadius: 210,
      loseRadius: 380,
      preferredRange: 34,
      reactionTime: 0.6,
      aggression: 0.55,
      patrolSpeed: 0.5,
      chaseSpeed: 1,
      recovery: 0.6,
    },
    sprite: {
      shape: 'blob',
      height: 34,
      build: 1,
      skin: C.aether,
      hair: C.aether,
      primary: '#3fb3a6',
      secondary: C.aetherSoft,
      accent: C.aether,
      eyeColor: '#08141a',
    },
    splitsInto: { enemyId: 'arcaneSlimelet', count: 2, levelDelta: -1 },
    sfx: { alert: 'slime_move', die: 'enemy_die', move: 'slime_move' },
  },

  arcaneSlimelet: {
    id: 'arcaneSlimelet',
    name: 'Slimelet',
    description: 'Half a slime, twice as annoyed.',
    archetype: 'swarm',
    health: 18,
    damage: 3,
    defense: 2,
    magic: 4,
    moveSpeed: 108,
    radius: 10,
    perLevel: { health: 5, damage: 1, defense: 0.6, magic: 1 },
    xp: 6,
    gold: 1,
    lootTableId: 'none',
    attack: {
      damageMult: 1,
      range: 30,
      arc: Math.PI,
      windup: 0.3,
      active: 0.1,
      recovery: 0.4,
      staggerPower: 0.2,
      knockback: 70,
      sfx: 'slime_move',
      hitSfx: 'impact_nature',
    },
    ai: {
      detectRadius: 240,
      loseRadius: 400,
      preferredRange: 24,
      reactionTime: 0.3,
      aggression: 0.8,
      patrolSpeed: 0.6,
      chaseSpeed: 1,
      recovery: 0.4,
    },
    sprite: {
      shape: 'blob',
      height: 20,
      build: 1,
      skin: C.aether,
      hair: C.aether,
      primary: '#4fc3b6',
      secondary: C.aetherSoft,
      accent: C.aether,
      eyeColor: '#08141a',
    },
    corpseDuration: 1.2,
    sfx: { die: 'enemy_die' },
  },

  skeletonWarrior: {
    id: 'skeletonWarrior',
    name: 'Skeleton Warrior',
    description:
      'Somebody who was buried in armour and has not been allowed to stop ' +
      'wearing it. Slow, heavy, and genuinely dangerous if you get greedy.',
    archetype: 'melee',
    health: 86,
    damage: 11,
    defense: 9,
    magic: 0,
    moveSpeed: 104,
    radius: 14,
    perLevel: { health: 21, damage: 3.4, defense: 2.4, magic: 0 },
    xp: 42,
    gold: 14,
    lootTableId: 'skeletonWarrior',
    attack: {
      damageMult: 1,
      range: 64,
      arc: 0.9,
      windup: 0.52,
      active: 0.13,
      recovery: 0.6,
      staggerPower: 1.6,
      knockback: 230,
      lunge: 42,
      shake: 3.5,
      sfx: 'swing_heavy',
      hitSfx: 'impact_blunt',
    },
    ai: {
      detectRadius: 270,
      loseRadius: 520,
      preferredRange: 52,
      reactionTime: 0.55,
      aggression: 0.75,
      patrolSpeed: 0.4,
      chaseSpeed: 1,
      packRadius: 200,
      recovery: 0.6,
    },
    sprite: {
      shape: 'skeleton',
      height: 44,
      build: 1.05,
      skin: '#ddd6c2',
      hair: '#ddd6c2',
      primary: '#5a5346',
      secondary: '#7d7362',
      accent: C.ember,
      legs: '#4a4438',
      eyeColor: C.ember,
      eyeGlow: true,
      weapon: { kind: 'axe', length: 0.55, color: '#a8a296' },
    },
    sfx: { alert: 'enemy_alert', die: 'enemy_die' },
  },

  corruptedMage: {
    id: 'corruptedMage',
    name: 'Corrupted Mage',
    description:
      'They were studying the aether. The aether returned the interest. Keeps ' +
      'its distance and punishes anyone who stands still.',
    archetype: 'ranged',
    health: 62,
    damage: 6,
    defense: 4,
    magic: 16,
    moveSpeed: 122,
    radius: 13,
    perLevel: { health: 15, damage: 1.6, defense: 1.5, magic: 4.2 },
    xp: 52,
    gold: 20,
    lootTableId: 'corruptedMage',
    attack: {
      damageMult: 1,
      range: 44,
      arc: 0.8,
      windup: 0.34,
      active: 0.1,
      recovery: 0.5,
      staggerPower: 0.5,
      knockback: 90,
      sfx: 'swing_light',
      hitSfx: 'impact_flesh',
    },
    abilities: [
      { abilityId: 'corruptBolt', weight: 3, minRange: 90, maxRange: 340 },
      { abilityId: 'shadowHowl', weight: 1, belowHealth: 0.6 },
    ],
    ai: {
      detectRadius: 360,
      loseRadius: 620,
      preferredRange: 230,
      reactionTime: 0.4,
      aggression: 0.5,
      patrolSpeed: 0.35,
      chaseSpeed: 0.85,
      strafe: true,
      fleeBelowHealth: 0.15,
      recovery: 0.5,
    },
    sprite: {
      shape: 'wisp',
      height: 44,
      build: 1,
      skin: '#8f7fae',
      hair: '#1b1430',
      primary: '#3d2a5e',
      secondary: '#6b4fa0',
      accent: C.violet,
      hood: true,
      eyeColor: C.rot,
      eyeGlow: true,
      aura: { color: C.violet, radius: 56, intensity: 0.5 },
      weapon: { kind: 'staff', length: 0.6, color: '#2f2545', glow: C.violet },
    },
    spriteSheetId: 'corruptedMage',
    spriteSheetScale: 1.05,
    sfx: { alert: 'enemy_alert', die: 'enemy_die' },
  },

  hollowWarden: {
    id: 'hollowWarden',
    name: 'The Hollow Warden',
    title: 'Keeper of the Fifth Plinth',
    description:
      'Whatever stood on the fifth plinth has been walking the vigil ever ' +
      'since, in armour that no longer contains anyone.',
    archetype: 'boss',
    health: 620,
    damage: 18,
    defense: 14,
    magic: 20,
    moveSpeed: 118,
    radius: 26,
    perLevel: { health: 68, damage: 3.8, defense: 2.6, magic: 3.4 },
    xp: 900,
    gold: 420,
    lootTableId: 'wardenHoard',
    attack: {
      damageMult: 1,
      range: 96,
      arc: 1.1,
      windup: 0.62,
      active: 0.16,
      recovery: 0.7,
      staggerPower: 2.6,
      knockback: 340,
      lunge: 70,
      shake: 6,
      sfx: 'swing_heavy',
      hitSfx: 'impact_blunt',
    },
    abilities: [
      { abilityId: 'riftSlam', weight: 2, minRange: 0, maxRange: 260 },
      { abilityId: 'corruptBolt', weight: 2, minRange: 160, maxRange: 480 },
    ],
    ai: {
      detectRadius: 460,
      loseRadius: 1400,
      preferredRange: 80,
      reactionTime: 0.35,
      aggression: 0.8,
      patrolSpeed: 0.3,
      chaseSpeed: 1,
      recovery: 0.55,
    },
    sprite: {
      shape: 'humanoid',
      height: 76,
      build: 1.5,
      skin: '#2b2540',
      hair: '#160f28',
      primary: '#241b3d',
      secondary: '#6b4fa0',
      accent: C.violet,
      legs: '#1a1430',
      hood: true,
      horns: true,
      eyeColor: C.aether,
      eyeGlow: true,
      eyeCount: 3,
      aura: { color: C.violet, radius: 120, intensity: 0.8 },
      cloak: '#170f2b',
      weapon: { kind: 'sword', length: 0.75, color: '#3c3358', glow: C.violet },
    },
    corpseDuration: 6,
    sfx: { alert: 'boss_roar', die: 'boss_roar' },
    boss: {
      phases: [
        {
          atHealth: 0.65,
          name: 'Waking',
          line: 'YOU ARE NOT THE ONE WHO LEFT.',
          speedMult: 1.15,
          abilities: [{ abilityId: 'riftSlam', weight: 3, maxRange: 300 }],
        },
        {
          atHealth: 0.3,
          name: 'Unbound',
          line: 'THEN I WILL WAIT FOR SOMEONE ELSE.',
          speedMult: 1.3,
          damageMult: 1.25,
          abilities: [
            { abilityId: 'riftSlam', weight: 4, maxRange: 340 },
            { abilityId: 'corruptBolt', weight: 3, minRange: 120, maxRange: 560 },
          ],
        },
      ],
    },
  },
};

export function getEnemy(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy id: ${id}`);
  return def;
}

/** Stats for an enemy at a given level. */
export function enemyStatsAt(def: EnemyDef, level: number): {
  health: number; damage: number; defense: number; magic: number;
} {
  const n = Math.max(0, level - 1);
  return {
    health: Math.round(def.health + def.perLevel.health * n),
    damage: def.damage + def.perLevel.damage * n,
    defense: def.defense + def.perLevel.defense * n,
    magic: def.magic + def.perLevel.magic * n,
  };
}
