import { C } from '../../art/palette';
import { NPCS } from '../../data/npcs';
import { getQuest, questList } from '../../data/quests';
import { bus } from '../events';
import { state, type QuestProgress } from '../GameState';
import type { QuestDef, QuestObjective } from '../questTypes';
import { checkRequirement } from './AreaManager';
import { addItem, countOf, removeItem } from './InventorySystem';

/**
 * Quest tracking.
 *
 * Objectives advance by listening to the event bus, never by being called from
 * combat or exploration code. That is why a wolf killed by a Vine Trap counts
 * the same as one killed by a sword, and why adding an objective type means
 * adding one case to `matches`.
 */
export class QuestSystem {
  private unsubscribes: Array<() => void> = [];

  attach(): void {
    const on = <K extends Parameters<typeof bus.on>[0]>(
      event: K, fn: Parameters<typeof bus.on<K>>[1],
    ) => {
      this.unsubscribes.push(bus.on(event, fn));
    };

    on('enemyKilled', ({ enemyId }) => this.advance((o) => o.kind === 'kill' && o.enemyId === enemyId));
    on('locationDiscovered', ({ locationId }) =>
      this.advance((o) => o.kind === 'explore' && o.locationId === locationId));
    on('secretFound', ({ secretId }) =>
      this.advance((o) => o.kind === 'secret' && o.secretId === secretId));
    on('bossDefeated', ({ bossId }) =>
      this.advance((o) => o.kind === 'boss' && o.bossId === bossId));
    on('npcTalked', ({ npcId }) =>
      this.advance((o) => o.kind === 'talk' && o.npcId === npcId));
    on('itemDelivered', ({ npcId, itemId }) =>
      this.advance((o) => o.kind === 'deliver' && o.npcId === npcId && o.itemId === itemId));
    on('flagSet', ({ flag }) => this.advance((o) => o.kind === 'flag' && o.flag === flag));

    // Collect objectives read the inventory directly, so any change re-checks.
    on('itemGained', () => this.refreshCollectObjectives());
    on('itemRemoved', () => this.refreshCollectObjectives());
  }

  detach(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
  }

  /* ------------------------------------------------------------------ */

  /** Quests this NPC can offer right now. */
  availableFrom(npcId: string): QuestDef[] {
    return questList().filter((q) => {
      if (q.giver !== npcId) return false;
      if (state.hasCompletedQuest(q.id)) return false;
      if (state.questProgressFor(q.id)) return false;
      return checkRequirement(q.requires).ok;
    });
  }

  isActive(questId: string): boolean {
    return !!state.questProgressFor(questId);
  }

  accept(questId: string): boolean {
    if (state.hasCompletedQuest(questId) || this.isActive(questId)) return false;
    const def = getQuest(questId);

    const progress: QuestProgress = {
      questId,
      counters: def.objectives.map(() => 0),
      readyToTurnIn: false,
      acceptedAt: state.playtime,
    };
    state.activeQuests.push(progress);
    bus.emit('questAccepted', { questId });
    bus.emit('toast', { text: `Quest: ${def.name}`, color: C.gold, icon: '❖' });

    // A collect objective may already be satisfied from earlier looting.
    this.refreshCollectObjectives();
    this.checkCompletion(progress, def);
    return true;
  }

  /** Grants rewards and closes the quest. */
  turnIn(questId: string): boolean {
    const progress = state.questProgressFor(questId);
    if (!progress?.readyToTurnIn) return false;
    const def = getQuest(questId);

    // Consume anything the quest said it would take.
    def.objectives.forEach((objective) => {
      if (objective.kind === 'collect' && objective.consume) {
        removeItem(objective.itemId, objective.count);
      }
      if (objective.kind === 'deliver') {
        removeItem(objective.itemId, objective.count);
      }
    });

    state.activeQuests = state.activeQuests.filter((q) => q.questId !== questId);
    if (!state.completedQuests.includes(questId)) state.completedQuests.push(questId);
    if (!state.turnedInQuests.includes(questId)) state.turnedInQuests.push(questId);

    const rewards = def.rewards;
    if (rewards.xp) state.addXp(rewards.xp, 'quest');
    if (rewards.gold) state.addGold(rewards.gold);
    if (rewards.skillPoints) state.skillPoints += rewards.skillPoints;
    for (const item of rewards.items ?? []) addItem(item.itemId, item.count);
    for (const flag of rewards.flags ?? []) state.setFlag(flag);
    if (rewards.unlocksArea) state.unlockArea(rewards.unlocksArea);

    bus.emit('questTurnedIn', { questId });
    bus.emit('toast', { text: `Completed: ${def.name}`, color: C.gold, icon: '★' });
    return true;
  }

  /** Abandons an active quest, keeping any items already gathered. */
  abandon(questId: string): boolean {
    const before = state.activeQuests.length;
    state.activeQuests = state.activeQuests.filter((q) => q.questId !== questId);
    state.completedQuests = state.completedQuests.filter((id) => id !== questId);
    return state.activeQuests.length < before;
  }

  /* ------------------------------------------------------------------ */

  /** Advances every active objective matching the predicate by one. */
  private advance(matches: (objective: QuestObjective) => boolean): void {
    for (const progress of [...state.activeQuests]) {
      const def = getQuest(progress.questId);
      let changed = false;

      def.objectives.forEach((objective, index) => {
        if (!matches(objective)) return;
        const required = requiredCount(objective);
        if (progress.counters[index] >= required) return;
        progress.counters[index] = Math.min(required, progress.counters[index] + 1);
        changed = true;
        bus.emit('questProgress', {
          questId: def.id,
          objectiveIndex: index,
          current: progress.counters[index],
          required,
        });
        if (progress.counters[index] >= required) {
          bus.emit('questObjectiveComplete', { questId: def.id, objectiveIndex: index });
        }
      });

      if (changed) this.checkCompletion(progress, def);
    }
  }

  /**
   * Collect objectives track what is *currently held* rather than what was ever
   * picked up, so selling a quest item correctly un-completes the objective.
   */
  private refreshCollectObjectives(): void {
    for (const progress of [...state.activeQuests]) {
      const def = getQuest(progress.questId);
      let changed = false;

      def.objectives.forEach((objective, index) => {
        if (objective.kind !== 'collect') return;
        const held = Math.min(objective.count, countOf(objective.itemId));
        if (held === progress.counters[index]) return;
        progress.counters[index] = held;
        changed = true;
        bus.emit('questProgress', {
          questId: def.id, objectiveIndex: index, current: held, required: objective.count,
        });
      });

      if (changed) this.checkCompletion(progress, def);
    }
  }

  private checkCompletion(progress: QuestProgress, def: QuestDef): void {
    const done = def.objectives.every(
      (objective, i) => progress.counters[i] >= requiredCount(objective),
    );
    if (done === progress.readyToTurnIn) return;

    progress.readyToTurnIn = done;
    if (done) {
      if (!state.completedQuests.includes(def.id)) state.completedQuests.push(def.id);
      bus.emit('questCompleted', { questId: def.id });
      const turnInTo = def.turnInTo ?? def.giver;
      bus.emit('toast', {
        text: `${def.name} — return to ${npcDisplayName(turnInTo)}`,
        color: C.gold,
        icon: '❖',
      });
    } else {
      state.completedQuests = state.completedQuests.filter((id) => id !== def.id);
    }
  }
}

export function requiredCount(objective: QuestObjective): number {
  switch (objective.kind) {
    case 'kill':
    case 'collect':
    case 'deliver':
      return objective.count;
    default:
      return 1;
  }
}

/** Objective progress for the quest log and tracker. */
export function objectiveProgress(
  questId: string, index: number,
): { current: number; required: number; done: boolean } {
  const def = getQuest(questId);
  const objective = def.objectives[index];
  const required = requiredCount(objective);
  const progress = state.questProgressFor(questId);

  if (!progress) {
    const done = state.hasCompletedQuest(questId);
    return { current: done ? required : 0, required, done };
  }
  const current = progress.counters[index] ?? 0;
  return { current, required, done: current >= required };
}

/** Name lookup that tolerates an unknown id rather than throwing in the UI. */
function npcDisplayName(npcId: string): string {
  return NPCS[npcId]?.name ?? npcId;
}

export const quests = new QuestSystem();
