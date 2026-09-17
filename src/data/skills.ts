import type { StatKey } from '../game/types';

/**
 * Character skill trees.
 *
 * A tree is a flat list of nodes positioned on a (tier, column) grid; the UI
 * draws connections from `requires`. Effects are declarative, so a new node
 * costs one record and zero code — unless it needs a passive the stats system
 * does not know about yet, in which case add the key to `PASSIVE_KEYS`.
 */

export type PassiveKey =
  | 'lifesteal'          // fraction of physical damage returned as health
  | 'spellVamp'          // same, for spell damage
  | 'dodgeIframes'       // extra seconds of dodge invulnerability
  | 'blockReduction'     // added fraction blocked
  | 'manaRegen'          // flat mana per second
  | 'healthRegen'        // flat health per second
  | 'xpBonus'            // multiplier on XP gained
  | 'goldBonus'          // multiplier on gold gained
  | 'critDamage'         // added crit multiplier
  | 'critChance'         // added crit chance
  | 'potionPotency'      // multiplier on consumable effects
  | 'moveSpeed'          // flat units/second
  | 'cooldownReduction'  // fraction removed from ability cooldowns
  | 'thorns';            // fraction of damage taken reflected

export type SkillEffect =
  | { kind: 'stat'; stat: StatKey; perRank: number }
  | { kind: 'passive'; key: PassiveKey; perRank: number }
  | { kind: 'unlockAbility'; abilityId: string }
  | {
      kind: 'abilityMod';
      abilityId: string;
      field: 'damage' | 'heal' | 'cooldown' | 'manaCost' | 'radius' | 'count' | 'duration';
      perRank: number;
      mode: 'add' | 'mult';
    };

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Row in the tree, 0 at the top. */
  tier: number;
  /** Column within the tier, 0-based. */
  column: number;
  maxRank: number;
  /** Skill points per rank. */
  cost: number;
  /** Node ids that must have at least one rank first. */
  requires?: readonly string[];
  levelReq?: number;
  effects: SkillEffect[];
  /** Branch name, used for colour-coding the tree. */
  branch: string;
}

export interface SkillTree {
  id: string;
  characterId: string;
  branches: Record<string, { name: string; color: string }>;
  nodes: SkillNode[];
}

export const SKILL_TREES: Record<string, SkillTree> = {
  eric: {
    id: 'eric',
    characterId: 'eric',
    branches: {
      bulwark: { name: 'Bulwark', color: '#f2c14e' },
      warblade: { name: 'Warblade', color: '#e0455e' },
      emberoath: { name: 'Emberoath', color: '#ff9a4d' },
    },
    nodes: [
      {
        id: 'eric_toughness', name: 'Toughness', branch: 'bulwark',
        description: 'Years of getting hit have made you harder to hit meaningfully.',
        icon: '🛡', tier: 0, column: 0, maxRank: 5, cost: 1,
        effects: [
          { kind: 'stat', stat: 'vitality', perRank: 3 },
          { kind: 'stat', stat: 'defense', perRank: 2 },
        ],
      },
      {
        id: 'eric_edge', name: 'Keen Edge', branch: 'warblade',
        description: 'Sharpen everything. Repeatedly.',
        icon: '🗡', tier: 0, column: 1, maxRank: 5, cost: 1,
        effects: [{ kind: 'stat', stat: 'strength', perRank: 3 }],
      },
      {
        id: 'eric_spark', name: 'Latent Spark', branch: 'emberoath',
        description: 'The aether has been answering you. You have decided to answer back.',
        icon: '✨', tier: 0, column: 2, maxRank: 5, cost: 1,
        effects: [
          { kind: 'stat', stat: 'magic', perRank: 2 },
          { kind: 'stat', stat: 'spirit', perRank: 2 },
        ],
      },

      {
        id: 'eric_ironwall', name: 'Iron Wall', branch: 'bulwark',
        description: 'Your guard holds against blows that should have broken it.',
        icon: '⛨', tier: 1, column: 0, maxRank: 3, cost: 1, requires: ['eric_toughness'], levelReq: 3,
        effects: [{ kind: 'passive', key: 'blockReduction', perRank: 0.06 }],
      },
      {
        id: 'eric_riposte', name: 'Riposte', branch: 'warblade',
        description: 'Every wound you open pays a little back.',
        icon: '🩸', tier: 1, column: 1, maxRank: 3, cost: 1, requires: ['eric_edge'], levelReq: 3,
        effects: [{ kind: 'passive', key: 'lifesteal', perRank: 0.03 }],
      },
      {
        id: 'eric_firebolt', name: 'Kindling', branch: 'emberoath',
        description: 'Learn Fire Bolt. Mira will be insufferable about this.',
        icon: '🔥', tier: 1, column: 2, maxRank: 1, cost: 2, requires: ['eric_spark'], levelReq: 4,
        effects: [{ kind: 'unlockAbility', abilityId: 'fireBolt' }],
      },

      {
        id: 'eric_immovable', name: 'Immovable', branch: 'bulwark',
        description: 'Staggering you takes a genuine effort.',
        icon: '🗿', tier: 2, column: 0, maxRank: 3, cost: 1, requires: ['eric_ironwall'], levelReq: 7,
        effects: [
          { kind: 'stat', stat: 'defense', perRank: 4 },
          { kind: 'passive', key: 'thorns', perRank: 0.05 },
        ],
      },
      {
        id: 'eric_brutality', name: 'Brutality', branch: 'warblade',
        description: 'When it lands clean, it lands very clean.',
        icon: '💥', tier: 2, column: 1, maxRank: 3, cost: 1, requires: ['eric_riposte'], levelReq: 7,
        effects: [
          { kind: 'passive', key: 'critChance', perRank: 0.03 },
          { kind: 'passive', key: 'critDamage', perRank: 0.15 },
        ],
      },
      {
        id: 'eric_shieldward', name: 'Wardbearer', branch: 'emberoath',
        description: 'Learn Arcane Shield, and hold it longer than a mage should.',
        icon: '🔵', tier: 2, column: 2, maxRank: 1, cost: 2, requires: ['eric_firebolt'], levelReq: 8,
        effects: [
          { kind: 'unlockAbility', abilityId: 'arcaneShield' },
          { kind: 'abilityMod', abilityId: 'arcaneShield', field: 'duration', perRank: 4, mode: 'add' },
        ],
      },

      {
        id: 'eric_bastion', name: 'Bastion of the Homestead', branch: 'bulwark',
        description: 'You do not fall. It is, at this point, a matter of principle.',
        icon: '🏰', tier: 3, column: 0, maxRank: 1, cost: 3, requires: ['eric_immovable'], levelReq: 12,
        effects: [
          { kind: 'stat', stat: 'vitality', perRank: 12 },
          { kind: 'passive', key: 'healthRegen', perRank: 2.5 },
        ],
      },
      {
        id: 'eric_cleaver', name: 'Sundering Blow', branch: 'warblade',
        description: 'Aether Cleave comes back around faster and hits wider.',
        icon: '✷', tier: 3, column: 1, maxRank: 2, cost: 2, requires: ['eric_brutality'], levelReq: 12,
        effects: [
          { kind: 'abilityMod', abilityId: 'aetherCleave', field: 'cooldown', perRank: -3, mode: 'add' },
          { kind: 'abilityMod', abilityId: 'aetherCleave', field: 'damage', perRank: 0.12, mode: 'mult' },
        ],
      },
      {
        id: 'eric_emberoath', name: 'Emberoath', branch: 'emberoath',
        description: 'Learn Flame Burst. Stand in the middle of it. That is the oath.',
        icon: '🌋', tier: 3, column: 2, maxRank: 1, cost: 3, requires: ['eric_shieldward'], levelReq: 13,
        effects: [
          { kind: 'unlockAbility', abilityId: 'flameBurst' },
          { kind: 'abilityMod', abilityId: 'flameBurst', field: 'radius', perRank: 24, mode: 'add' },
        ],
      },
    ],
  },

  lev: {
    id: 'lev',
    characterId: 'lev',
    branches: {
      arcanist: { name: 'Arcanist', color: '#5fe6d0' },
      umbral: { name: 'Umbral', color: '#8b5cf6' },
      verdant: { name: 'Verdant', color: '#4bbf7a' },
    },
    nodes: [
      {
        id: 'lev_attunement', name: 'Attunement', branch: 'arcanist',
        description: 'The aether stops arguing with you quite so much.',
        icon: '✦', tier: 0, column: 0, maxRank: 5, cost: 1,
        effects: [
          { kind: 'stat', stat: 'magic', perRank: 3 },
          { kind: 'stat', stat: 'spirit', perRank: 2 },
        ],
      },
      {
        id: 'lev_fleetness', name: 'Fleetness', branch: 'umbral',
        description: 'Being elsewhere is a skill like any other.',
        icon: '💨', tier: 0, column: 1, maxRank: 5, cost: 1,
        effects: [
          { kind: 'stat', stat: 'agility', perRank: 3 },
          { kind: 'passive', key: 'moveSpeed', perRank: 3 },
        ],
      },
      {
        id: 'lev_hardiness', name: 'Hedge-Hardiness', branch: 'verdant',
        description: 'Sleeping in ditches builds character, and apparently constitution.',
        icon: '🌱', tier: 0, column: 2, maxRank: 5, cost: 1,
        effects: [
          { kind: 'stat', stat: 'vitality', perRank: 3 },
          { kind: 'stat', stat: 'defense', perRank: 1 },
        ],
      },

      {
        id: 'lev_channeling', name: 'Deep Channel', branch: 'arcanist',
        description: 'Aether returns to you faster than it leaves.',
        icon: '🌀', tier: 1, column: 0, maxRank: 3, cost: 1, requires: ['lev_attunement'], levelReq: 3,
        effects: [
          { kind: 'passive', key: 'manaRegen', perRank: 0.9 },
          { kind: 'passive', key: 'spellVamp', perRank: 0.02 },
        ],
      },
      {
        id: 'lev_slipstream', name: 'Slipstream', branch: 'umbral',
        description: 'Your dodge lasts a heartbeat longer than it looks like it should.',
        icon: '≫', tier: 1, column: 1, maxRank: 3, cost: 1, requires: ['lev_fleetness'], levelReq: 3,
        effects: [{ kind: 'passive', key: 'dodgeIframes', perRank: 0.05 }],
      },
      {
        id: 'lev_bloom', name: 'Green Word', branch: 'verdant',
        description: 'Learn Healing Bloom. The Woods taught you, sort of.',
        icon: '❀', tier: 1, column: 2, maxRank: 1, cost: 2, requires: ['lev_hardiness'], levelReq: 4,
        effects: [{ kind: 'unlockAbility', abilityId: 'healingBloom' }],
      },

      {
        id: 'lev_overcharge', name: 'Overcharge', branch: 'arcanist',
        description: 'Arcane Bolt punches through another body before it gives up.',
        icon: '⚡', tier: 2, column: 0, maxRank: 2, cost: 1, requires: ['lev_channeling'], levelReq: 7,
        effects: [
          { kind: 'abilityMod', abilityId: 'arcaneBolt', field: 'count', perRank: 1, mode: 'add' },
          { kind: 'abilityMod', abilityId: 'arcaneBolt', field: 'damage', perRank: 0.08, mode: 'mult' },
        ],
      },
      {
        id: 'lev_strike', name: 'Umbral Strike', branch: 'umbral',
        description: 'Learn Shadow Strike. Arrive after the wound does.',
        icon: '⚔', tier: 2, column: 1, maxRank: 1, cost: 2, requires: ['lev_slipstream'], levelReq: 8,
        effects: [{ kind: 'unlockAbility', abilityId: 'shadowStrike' }],
      },
      {
        id: 'lev_thicket', name: 'Thicket', branch: 'verdant',
        description: 'Learn Vine Trap, and make it hold on.',
        icon: '🌿', tier: 2, column: 2, maxRank: 2, cost: 1, requires: ['lev_bloom'], levelReq: 8,
        effects: [
          { kind: 'unlockAbility', abilityId: 'vineTrap' },
          { kind: 'abilityMod', abilityId: 'vineTrap', field: 'duration', perRank: 1.5, mode: 'add' },
        ],
      },

      {
        id: 'lev_unbound', name: 'Unbound', branch: 'arcanist',
        description: 'Void Lance arrives sooner and leaves less behind.',
        icon: '⟁', tier: 3, column: 0, maxRank: 2, cost: 2, requires: ['lev_overcharge'], levelReq: 12,
        effects: [
          { kind: 'abilityMod', abilityId: 'voidLance', field: 'cooldown', perRank: -3.5, mode: 'add' },
          { kind: 'abilityMod', abilityId: 'voidLance', field: 'damage', perRank: 0.14, mode: 'mult' },
        ],
      },
      {
        id: 'lev_nightborn', name: 'Nightborn', branch: 'umbral',
        description: 'Everything you cast comes back around faster in the dark.',
        icon: '🌑', tier: 3, column: 1, maxRank: 3, cost: 2, requires: ['lev_strike'], levelReq: 12,
        effects: [
          { kind: 'passive', key: 'cooldownReduction', perRank: 0.05 },
          { kind: 'passive', key: 'critChance', perRank: 0.03 },
        ],
      },
      {
        id: 'lev_wildheart', name: 'Wildheart', branch: 'verdant',
        description: 'Learn Flame Burst, and let the Woods forgive you for it later.',
        icon: '🔥', tier: 3, column: 2, maxRank: 1, cost: 3, requires: ['lev_thicket'], levelReq: 13,
        effects: [
          { kind: 'unlockAbility', abilityId: 'flameBurst' },
          { kind: 'passive', key: 'potionPotency', perRank: 0.25 },
        ],
      },
    ],
  },
};

export function getSkillTree(id: string): SkillTree {
  const tree = SKILL_TREES[id];
  if (!tree) throw new Error(`Unknown skill tree: ${id}`);
  return tree;
}

export function getSkillNode(treeId: string, nodeId: string): SkillNode | undefined {
  return SKILL_TREES[treeId]?.nodes.find((n) => n.id === nodeId);
}
