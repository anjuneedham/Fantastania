import { CHARACTERS, getCharacter } from '../../data/characters';
import { tryGetItem } from '../../data/items';
import { SKILL_TREES, type PassiveKey } from '../../data/skills';
import { state } from '../GameState';
import {
  critChanceFrom, manaRegenFrom, maxHealthFrom, maxManaFrom, moveSpeedFrom, statsAtLevel,
} from '../progression';
import { addStats, emptyStats, type StatBlock, type StatKey } from '../types';

/**
 * The single place effective stats are computed.
 *
 * Contributions stack in a fixed order — base + level growth, then skill tree
 * ranks, then equipment, then temporary buffs — so the character sheet can show
 * the player exactly where each point came from.
 */

export type Passives = Record<PassiveKey, number>;

export function emptyPassives(): Passives {
  return {
    lifesteal: 0,
    spellVamp: 0,
    dodgeIframes: 0,
    blockReduction: 0,
    manaRegen: 0,
    healthRegen: 0,
    xpBonus: 0,
    goldBonus: 0,
    critDamage: 0,
    critChance: 0,
    potionPotency: 0,
    moveSpeed: 0,
    cooldownReduction: 0,
    thorns: 0,
  };
}

export interface AbilityMods {
  /** Multiplicative modifiers keyed `abilityId:field`. */
  mult: Record<string, number>;
  /** Additive modifiers keyed `abilityId:field`. */
  add: Record<string, number>;
}

export interface EffectiveStats {
  /** Attributes before temporary buffs. */
  base: StatBlock;
  fromLevel: StatBlock;
  fromSkills: StatBlock;
  fromEquipment: StatBlock;
  /** Everything summed, including buff statuses passed in. */
  total: StatBlock;

  maxHealth: number;
  maxMana: number;
  manaRegen: number;
  healthRegen: number;
  moveSpeed: number;
  critChance: number;
  critDamage: number;

  /** Weapon-derived multipliers; 1.0 when unarmed. */
  weaponPower: number;
  weaponReach: number;
  weaponSpeed: number;

  passives: Passives;
  abilityMods: AbilityMods;
}

/**
 * Computes effective stats from persistent state. `buffs` comes from live
 * status effects on the player entity and is kept separate so this stays a pure
 * function of the save data plus one argument.
 */
export function computeStats(buffs?: Partial<StatBlock>): EffectiveStats {
  const char = getCharacter(state.characterId);
  const fromLevel = statsAtLevel(char.baseStats, char.growth, state.level);

  const fromSkills = emptyStats();
  const passives = emptyPassives();
  const abilityMods: AbilityMods = { mult: {}, add: {} };

  const tree = SKILL_TREES[char.skillTreeId];
  if (tree) {
    for (const node of tree.nodes) {
      const rank = state.learnedSkills[node.id] ?? 0;
      if (rank <= 0) continue;
      for (const effect of node.effects) {
        switch (effect.kind) {
          case 'stat':
            fromSkills[effect.stat] += effect.perRank * rank;
            break;
          case 'passive':
            passives[effect.key] += effect.perRank * rank;
            break;
          case 'abilityMod': {
            const key = `${effect.abilityId}:${effect.field}`;
            if (effect.mode === 'add') {
              abilityMods.add[key] = (abilityMods.add[key] ?? 0) + effect.perRank * rank;
            } else {
              abilityMods.mult[key] = (abilityMods.mult[key] ?? 0) + effect.perRank * rank;
            }
            break;
          }
          case 'unlockAbility':
            // Handled by SkillSystem when the point is spent; nothing to do here.
            break;
        }
      }
    }
  }

  const fromEquipment = emptyStats();
  let weaponPower = 1;
  let weaponReach = 1;
  let weaponSpeed = 1;
  for (const itemId of Object.values(state.equipment)) {
    if (!itemId) continue;
    const item = tryGetItem(itemId);
    if (!item) continue;
    if (item.stats) addStats(fromEquipment, item.stats);
    if (item.weapon) {
      weaponPower = item.weapon.power;
      weaponReach = item.weapon.reach;
      weaponSpeed = item.weapon.speed;
    }
  }

  const total = emptyStats();
  for (const key of Object.keys(total) as StatKey[]) {
    total[key] = fromLevel[key] + fromSkills[key] + fromEquipment[key] + (buffs?.[key] ?? 0);
    // Equipment can carry penalties; never let a stat go negative.
    if (total[key] < 0) total[key] = 0;
  }

  return {
    base: char.baseStats,
    fromLevel,
    fromSkills,
    fromEquipment,
    total,
    maxHealth: maxHealthFrom(total),
    maxMana: maxManaFrom(total),
    manaRegen: manaRegenFrom(total) + passives.manaRegen,
    healthRegen: char.healthRegen + passives.healthRegen,
    moveSpeed: moveSpeedFrom(char.moveSpeed, total) + passives.moveSpeed,
    critChance: Math.min(0.75, critChanceFrom(total) + passives.critChance),
    critDamage: 1.6 + passives.critDamage,
    weaponPower,
    weaponReach,
    weaponSpeed,
    passives,
    abilityMods,
  };
}

/** Applies skill-tree modifiers to a numeric ability field. */
export function modifyAbilityValue(
  mods: AbilityMods,
  abilityId: string,
  field: string,
  value: number,
): number {
  const key = `${abilityId}:${field}`;
  const added = mods.add[key] ?? 0;
  const multiplied = 1 + (mods.mult[key] ?? 0);
  return (value + added) * multiplied;
}

/** Every character id, for the selection screen and future additions. */
export function allCharacters() {
  return Object.values(CHARACTERS);
}
