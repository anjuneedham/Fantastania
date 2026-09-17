import type { ActorSprite } from '../art/sprites';

/**
 * Shared vocabulary for game data. These types are what make the `data/`
 * folder authorable: a designer adds a record, and the systems pick it up
 * without any new code.
 */

export type StatKey = 'strength' | 'defense' | 'magic' | 'agility' | 'vitality' | 'spirit';

/** The six primary attributes. Health and mana are derived from them. */
export interface StatBlock {
  /** Physical damage and carry weight. */
  strength: number;
  /** Reduces incoming physical damage. */
  defense: number;
  /** Spell damage and healing power. */
  magic: number;
  /** Move speed, dodge recovery, crit chance. */
  agility: number;
  /** Max health. */
  vitality: number;
  /** Max mana and mana regeneration. */
  spirit: number;
}

export function emptyStats(): StatBlock {
  return { strength: 0, defense: 0, magic: 0, agility: 0, vitality: 0, spirit: 0 };
}

export function addStats(target: StatBlock, add: Partial<StatBlock>): StatBlock {
  for (const key of Object.keys(add) as StatKey[]) {
    const v = add[key];
    if (typeof v === 'number') target[key] += v;
  }
  return target;
}

export const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  defense: 'Defense',
  magic: 'Magic',
  agility: 'Agility',
  vitality: 'Vitality',
  spirit: 'Spirit',
};

export const STAT_DESCRIPTIONS: Record<StatKey, string> = {
  strength: 'Increases physical damage.',
  defense: 'Reduces physical damage taken.',
  magic: 'Increases spell damage and healing.',
  agility: 'Increases move speed and critical chance.',
  vitality: 'Increases maximum health.',
  spirit: 'Increases maximum mana and mana regeneration.',
};

/** Conversion rates from attributes to derived pools. Tuned, not arbitrary. */
export const DERIVED = {
  healthPerVitality: 9,
  manaPerSpirit: 6,
  manaRegenPerSpirit: 0.06,
  moveSpeedPerAgility: 0.55,
  critPerAgility: 0.0032,
} as const;

/** A melee swing or a monster's bite, described as data. */
export interface AttackDef {
  /** Multiplier applied to the attacker's physical power. */
  damageMult: number;
  /** Reach in world units, measured from the attacker's centre. */
  range: number;
  /** Half-angle of the damage cone in radians. */
  arc: number;
  /** Seconds of wind-up before the hit lands. */
  windup: number;
  /** Seconds the hitbox is live. */
  active: number;
  /** Seconds of recovery before another action is allowed. */
  recovery: number;
  /** Chance-weighted stagger applied to the victim. */
  staggerPower: number;
  /** Impulse applied to the victim, in units/second. */
  knockback: number;
  /** Camera shake on a connect. */
  shake?: number;
  sfx?: string;
  hitSfx?: string;
  /** Movement the attacker slides forward while swinging. */
  lunge?: number;
  /**
   * When set, the attack resolves by casting this ability instead of sweeping a
   * melee cone, and ignores its mana cost and cooldown. This is how a ranged
   * character gets a ranged basic attack without a second combat code path.
   */
  abilityId?: string;
}

export type DamageType = 'physical' | 'fire' | 'arcane' | 'nature' | 'shadow';

export interface DamageEvent {
  amount: number;
  type: DamageType;
  crit: boolean;
  /** Source entity id, or -1 for the world. */
  sourceId: number;
  knockback: number;
  staggerPower: number;
  /** Direction of the hit, radians. */
  angle: number;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: readonly Rarity[] = [
  'common', 'uncommon', 'rare', 'epic', 'legendary',
];

export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export type ItemKind = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'quest';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  description: string;
  /** Base sell value in gold. */
  value: number;
  /** Max per inventory stack. 1 means unstackable (all equipment). */
  stack: number;
  /** Stats granted while equipped. */
  stats?: Partial<StatBlock>;
  /** Equipment only: which slot it occupies. */
  slot?: EquipSlot;
  /** Weapon only: visual and swing characteristics. */
  weapon?: {
    visual: NonNullable<ActorSprite['weapon']>;
    /** Multiplier on the wielder's light/heavy attack damage. */
    power: number;
    /** Multiplier on attack reach. */
    reach: number;
    /** Multiplier on attack speed. */
    speed: number;
  };
  /** Consumable only: what using it does. */
  use?: {
    health?: number;
    mana?: number;
    /** Percentage-of-max healing, applied in addition to flat values. */
    healthPercent?: number;
    manaPercent?: number;
    buff?: { stat: StatKey; amount: number; duration: number };
    /** Text shown in the combat log when consumed. */
    message?: string;
  };
  /** Which characters may equip this. Empty/undefined means anyone. */
  restrictedTo?: readonly string[];
  /** Level required to equip. */
  levelReq?: number;
  /** Icon glyph drawn in the inventory grid. */
  icon: string;
}

export interface LootEntry {
  itemId: string;
  weight: number;
  min: number;
  max: number;
  /** Independent chance this entry rolls at all, 0..1. */
  chance: number;
}

export interface LootTable {
  id: string;
  gold: { min: number; max: number };
  /** Every entry is rolled independently against its `chance`. */
  entries: LootEntry[];
  /** Guaranteed drops, used for quest items and boss rewards. */
  guaranteed?: Array<{ itemId: string; count: number }>;
}

/* ------------------------------------------------------------------ */
/* Abilities and status effects                                        */
/* ------------------------------------------------------------------ */

export type School = 'physical' | 'fire' | 'arcane' | 'nature' | 'shadow';

export const SCHOOL_LABELS: Record<School, string> = {
  physical: 'Might',
  fire: 'Fire',
  arcane: 'Arcane',
  nature: 'Nature',
  shadow: 'Shadow',
};

/**
 * How an ability delivers its effect. Adding a new shape is the only case that
 * needs engine work; every other ability parameter is pure data.
 */
export type AbilityShape =
  | 'projectile'   // travels forward, hits on contact
  | 'nova'         // instant radial burst centred on the caster
  | 'cone'         // instant wedge in front of the caster
  | 'self'         // applies effects to the caster only
  | 'dash'         // moves the caster, optionally damaging along the path
  | 'zone';        // persistent area left on the ground

export type StatusKind =
  | 'burn' | 'root' | 'slow' | 'shield' | 'regen' | 'buff' | 'vulnerable' | 'haste';

export interface StatusEffectDef {
  kind: StatusKind;
  duration: number;
  /** Damage or heal per second for burn/regen; flat amount for shield. */
  magnitude: number;
  /** For `buff`: which stat is modified. */
  stat?: StatKey;
  /** For slow/haste/vulnerable: multiplier applied while active. */
  multiplier?: number;
  damageType?: DamageType;
  color?: string;
}

export interface AbilityDef {
  id: string;
  name: string;
  school: School;
  description: string;
  /** Single glyph drawn on the hotbar button. */
  glyph: string;
  shape: AbilityShape;

  manaCost: number;
  cooldown: number;
  /** Seconds of cast animation before the effect fires. */
  castTime: number;
  /** Seconds the caster is locked after firing. */
  recovery: number;

  /** Flat damage before scaling. Omit for pure utility. */
  damage?: number;
  /** Damage added per point of the scaling stat. */
  scaling?: { stat: StatKey; mult: number };
  damageType?: DamageType;

  /** Flat healing, scaled the same way as damage. */
  heal?: number;

  /** Max distance for projectiles/dashes, or targeting reach for cones. */
  range: number;
  /** Blast/zone radius. */
  radius?: number;
  /** Projectile speed in units/second. */
  speed?: number;
  /** Seconds a zone or projectile persists. */
  duration?: number;
  /** Projectiles fired per cast. */
  count?: number;
  /** Total spread across all projectiles, radians. */
  spread?: number;
  /** How many enemies a projectile passes through. 0 = stops on first. */
  pierce?: number;
  /** Half-angle for cone shapes. */
  arc?: number;

  knockback?: number;
  staggerPower?: number;
  /** Seconds of invulnerability granted (dashes, defensive abilities). */
  iframes?: number;

  /** Applied to everything the ability hits. */
  applies?: StatusEffectDef[];
  /** Applied to the caster on use. */
  selfApplies?: StatusEffectDef[];

  vfx: {
    color: string;
    /** Secondary colour for gradients and sparks. */
    accent?: string;
    /** Particle trail density, 0 = none. */
    trail?: number;
    impact?: 'burst' | 'ring' | 'shatter' | 'bloom' | 'slash';
    /** Drawn size of the projectile core. */
    size?: number;
  };
  sfx?: { cast?: string; impact?: string };

  /** Characters who can learn this. Undefined means anyone. */
  characters?: readonly string[];
  /** Shown in the skill tree as a short flavour line. */
  flavor?: string;
  tags?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  /** One-line hook shown on the selection card. */
  tagline: string;
  description: string;
  /** Plain-language summary of how the character plays. */
  playstyle: string;
  /** 1 = approachable, 3 = demanding. Shown as pips on the select screen. */
  complexity: 1 | 2 | 3;

  baseStats: StatBlock;
  /** Added at every level-up, before spent skill points. */
  growth: StatBlock;

  /** World units per second at zero agility. */
  moveSpeed: number;
  /** Collision radius. */
  radius: number;

  dodge: {
    distance: number;
    duration: number;
    cooldown: number;
    /** Seconds of invulnerability, starting at the dodge's first frame. */
    iframes: number;
    /** Cost in mana; 0 for a free dodge. */
    manaCost: number;
  };

  /** Whether the hold-to-block button exists for this character. */
  canBlock: boolean;
  block?: {
    /** Fraction of incoming damage absorbed, 0..1. */
    reduction: number;
    /** Move speed multiplier while blocking. */
    moveScale: number;
    /** Seconds after raising the guard that counts as a perfect parry. */
    parryWindow: number;
  };

  lightAttack: AttackDef;
  heavyAttack: AttackDef;
  /** Max chained light attacks before the combo resets. */
  comboLength: number;

  /** Ability ids bound to slots 1, 2 and ultimate at level 1. */
  startingAbilities: { ability1: string; ability2: string; ultimate: string };
  skillTreeId: string;
  startingItems: Array<{ itemId: string; count: number }>;
  startingEquipment: Partial<Record<EquipSlot, string>>;

  sprite: ActorSprite;
  /** Accent colour used across the UI while playing this character. */
  themeColor: string;
  /** Regenerated health per second out of combat. */
  healthRegen: number;
}
