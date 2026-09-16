import { C } from '../../art/palette';
import { getCharacter } from '../../data/characters';
import { getSkillTree, type SkillNode, type SkillTree } from '../../data/skills';
import type { Player } from '../entities/Player';
import { bus } from '../events';
import { state } from '../GameState';
import { refreshUnlockedAbilities } from '../newGame';

/**
 * Skill point spending. Rules live here rather than in the UI so the same
 * checks apply whether a point is spent from the skill screen, a level-up
 * shortcut or a future auto-spend option.
 */

export interface NodeStatus {
  node: SkillNode;
  rank: number;
  maxed: boolean;
  /** Every prerequisite is satisfied. */
  unlocked: boolean;
  /** Unlocked, not maxed, and the player can pay for it. */
  affordable: boolean;
  /** Why it cannot be bought, when it cannot. */
  blockedReason?: string;
}

export function activeTree(): SkillTree {
  return getSkillTree(getCharacter(state.characterId).skillTreeId);
}

export function rankOf(nodeId: string): number {
  return state.learnedSkills[nodeId] ?? 0;
}

export function nodeStatus(node: SkillNode): NodeStatus {
  const rank = rankOf(node.id);
  const maxed = rank >= node.maxRank;

  let unlocked = true;
  let blockedReason: string | undefined;

  if (node.levelReq && state.level < node.levelReq) {
    unlocked = false;
    blockedReason = `Requires level ${node.levelReq}`;
  }
  for (const req of node.requires ?? []) {
    if (rankOf(req) > 0) continue;
    unlocked = false;
    const tree = activeTree();
    const reqNode = tree.nodes.find((n) => n.id === req);
    blockedReason = `Requires ${reqNode?.name ?? req}`;
    break;
  }

  const affordable = unlocked && !maxed && state.skillPoints >= node.cost;
  if (unlocked && !maxed && !affordable) blockedReason = 'Not enough skill points';

  return { node, rank, maxed, unlocked, affordable, blockedReason };
}

export interface SpendResult {
  ok: boolean;
  reason?: string;
}

/** Buys one rank of a node. */
export function spendPoint(nodeId: string, player: Player): SpendResult {
  const tree = activeTree();
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, reason: 'Unknown skill.' };

  const status = nodeStatus(node);
  if (status.maxed) return { ok: false, reason: 'Already mastered.' };
  if (!status.unlocked) return { ok: false, reason: status.blockedReason ?? 'Locked.' };
  if (state.skillPoints < node.cost) return { ok: false, reason: 'Not enough skill points.' };

  state.skillPoints -= node.cost;
  const rank = status.rank + 1;
  state.learnedSkills[nodeId] = rank;

  // A node can unlock an ability; recompute so the loadout sees it immediately.
  const unlocks = node.effects.filter((e) => e.kind === 'unlockAbility');
  if (unlocks.length > 0) {
    refreshUnlockedAbilities();
    for (const effect of unlocks) {
      if (effect.kind !== 'unlockAbility') continue;
      bus.emit('abilityUnlocked', { abilityId: effect.abilityId });
    }
  }

  player.refreshStats();
  bus.emit('skillLearned', { nodeId, rank });
  bus.emit('toast', {
    text: `${node.name}${node.maxRank > 1 ? ` ${rank}/${node.maxRank}` : ''}`,
    color: tree.branches[node.branch]?.color ?? C.gold,
    icon: node.icon,
  });
  return { ok: true };
}

/**
 * Refunds every point spent. Offered by an NPC later; implemented here so the
 * rules for un-spending live next to the rules for spending.
 */
export function respec(player: Player): number {
  let refunded = 0;
  const tree = activeTree();
  for (const node of tree.nodes) {
    const rank = rankOf(node.id);
    if (rank > 0) refunded += rank * node.cost;
  }
  state.learnedSkills = {};
  state.skillPoints += refunded;
  refreshUnlockedAbilities();
  player.refreshStats();
  return refunded;
}

/** Total points the player has ever earned, for the character screen. */
export function pointsSpent(): number {
  const tree = activeTree();
  let spent = 0;
  for (const node of tree.nodes) spent += rankOf(node.id) * node.cost;
  return spent;
}
