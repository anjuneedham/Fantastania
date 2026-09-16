import type { CharacterDef } from '../game/types';
import { C } from '../art/palette';

/**
 * Playable characters.
 *
 * Eric and Lev are built to be equal in power and opposite in texture: Eric
 * trades reach and speed for the ability to stand still and win, Lev trades
 * durability for range, mobility and burst. Neither is the "easy mode" version
 * of the other — Eric is simply more forgiving of mistakes.
 *
 * Adding a third character is a matter of appending a record here plus a skill
 * tree in `skills.ts`. Nothing else in the codebase enumerates characters.
 */
export const CHARACTERS: Record<string, CharacterDef> = {
  eric: {
    id: 'eric',
    name: 'Eric',
    title: 'the Unbroken',
    tagline: 'Stands where others fall back.',
    description:
      'A hearth-guard from the Homestead who never asked to be important. Eric ' +
      'fights the way he does everything else: squarely, patiently, and with ' +
      'more stubbornness than strictly necessary. The aether has started ' +
      'answering him lately, which he finds deeply suspicious.',
    playstyle:
      'Wade in, hold the line, punish anything that overcommits. Blocking and ' +
      'a deep health pool let you trade hits that would kill anyone else.',
    complexity: 1,

    baseStats: { strength: 12, defense: 11, magic: 5, agility: 7, vitality: 14, spirit: 6 },
    growth: { strength: 2.2, defense: 1.8, magic: 0.8, agility: 1.0, vitality: 2.4, spirit: 0.9 },

    moveSpeed: 148,
    radius: 13,

    dodge: { distance: 128, duration: 0.26, cooldown: 0.75, iframes: 0.22, manaCost: 0 },

    canBlock: true,
    block: { reduction: 0.68, moveScale: 0.42, parryWindow: 0.2 },

    lightAttack: {
      damageMult: 1.0,
      range: 62,
      arc: 0.85,
      windup: 0.12,
      active: 0.09,
      recovery: 0.2,
      staggerPower: 0.8,
      knockback: 120,
      shake: 1.5,
      lunge: 26,
      sfx: 'swing_light',
      hitSfx: 'impact_flesh',
    },
    heavyAttack: {
      damageMult: 2.1,
      range: 76,
      arc: 1.15,
      windup: 0.34,
      active: 0.12,
      recovery: 0.38,
      staggerPower: 2.0,
      knockback: 300,
      shake: 5,
      lunge: 48,
      sfx: 'swing_heavy',
      hitSfx: 'impact_blunt',
    },
    comboLength: 3,

    startingAbilities: { ability1: 'shieldBash', ability2: 'ironVow', ultimate: 'aetherCleave' },
    skillTreeId: 'eric',
    startingItems: [
      { itemId: 'potionMinorHealth', count: 3 },
      { itemId: 'breadRation', count: 2 },
    ],
    startingEquipment: { weapon: 'wornBlade', armor: 'hearthguardVest' },

    themeColor: C.gold,
    healthRegen: 1.2,

    sprite: {
      shape: 'humanoid',
      height: 46,
      build: 1.14,
      skin: '#d9a884',
      hair: '#5b3a24',
      primary: '#2f5d8a',
      secondary: '#c9a227',
      legs: '#4a3f2e',
      accent: C.gold,
      cloak: '#1d3e5e',
      eyeColor: '#241a12',
      weapon: { kind: 'sword', length: 0.62, color: '#c9ccd8' },
    },
  },

  lev: {
    id: 'lev',
    name: 'Lev',
    title: 'the Unbound',
    tagline: 'Never where the blow lands.',
    description:
      'A hedge-mage with a staff held together by optimism and copper wire. ' +
      'Lev reads aether the way other people read weather, which makes them ' +
      'brilliant at finding ruins and terrible at leaving them alone. Runs ' +
      'first, explains later.',
    playstyle:
      'Kite, blink and burst. You have answers at every range, but almost no ' +
      'margin for standing still — every hit you take is one you should have ' +
      'dodged.',
    complexity: 3,

    baseStats: { strength: 7, defense: 6, magic: 13, agility: 13, vitality: 9, spirit: 12 },
    growth: { strength: 1.0, defense: 0.9, magic: 2.4, agility: 2.0, vitality: 1.4, spirit: 2.1 },

    moveSpeed: 172,
    radius: 11,

    dodge: { distance: 162, duration: 0.22, cooldown: 0.6, iframes: 0.26, manaCost: 0 },

    canBlock: false,

    lightAttack: {
      damageMult: 1.0,
      range: 300,
      arc: 0.5,
      windup: 0.1,
      active: 0.02,
      recovery: 0.16,
      staggerPower: 0.2,
      knockback: 30,
      shake: 0.6,
      abilityId: 'aetherDart',
      sfx: 'swing_light',
    },
    heavyAttack: {
      damageMult: 1.0,
      range: 92,
      arc: Math.PI,
      windup: 0.3,
      active: 0.05,
      recovery: 0.34,
      staggerPower: 1.1,
      knockback: 220,
      shake: 4,
      abilityId: 'aetherPulse',
      sfx: 'swing_heavy',
    },
    comboLength: 4,

    startingAbilities: { ability1: 'arcaneBolt', ability2: 'shadowDash', ultimate: 'voidLance' },
    skillTreeId: 'lev',
    startingItems: [
      { itemId: 'potionMinorMana', count: 3 },
      { itemId: 'potionMinorHealth', count: 1 },
    ],
    startingEquipment: { weapon: 'copperStaff', armor: 'wanderersWrap' },

    themeColor: C.aether,
    healthRegen: 0.7,

    sprite: {
      shape: 'humanoid',
      height: 43,
      build: 0.92,
      skin: '#c98f6b',
      hair: '#1f1b2e',
      primary: '#3a2f6b',
      secondary: '#5fe6d0',
      legs: '#2b2440',
      accent: C.aether,
      cloak: '#241c47',
      eyeColor: C.aetherSoft,
      eyeGlow: true,
      weapon: { kind: 'staff', length: 0.78, color: '#7a5b3a', glow: C.aether },
    },
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

export function getCharacter(id: string): CharacterDef {
  const def = CHARACTERS[id];
  if (!def) throw new Error(`Unknown character id: ${id}`);
  return def;
}
