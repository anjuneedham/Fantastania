import { C } from '../../art/palette';
import { getNpc } from '../../data/npcs';
import { QUESTS } from '../../data/quests';
import type { Player } from '../entities/Player';
import { bus } from '../events';
import { state } from '../GameState';
import type { DialogueChoice, DialogueEffect, DialogueNode, QuestDef } from '../questTypes';
import { checkRequirement } from './AreaManager';
import { addItem, removeItem } from './InventorySystem';
import { quests } from './QuestSystem';
import { respec } from './SkillSystem';

/**
 * Runs a conversation.
 *
 * Holds only a cursor into the dialogue data — which node, which page — so the
 * UI is a pure view of this state and a conversation can be re-rendered,
 * resized or restyled without the system noticing.
 */

export interface DialogueLine {
  speaker: string;
  text: string;
  /** True when more pages follow in the same node. */
  hasMore: boolean;
}

export interface PresentedChoice {
  index: number;
  text: string;
  enabled: boolean;
  /** Why it is disabled, shown as a hint. */
  reason?: string;
  tone?: DialogueChoice['tone'];
}

export class DialogueSystem {
  npcId: string | null = null;
  private nodeId: string | null = null;
  private page = 0;
  /** Set when a dialogue effect asks to open the merchant view. */
  shopRequested = false;

  get active(): boolean {
    return this.npcId !== null;
  }

  /** Starts a conversation, choosing the first entry whose gate passes. */
  start(npcId: string, player: Player): boolean {
    const npc = getNpc(npcId);
    const entry = npc.dialogue.entries.find((e) => checkRequirement(e.requires).ok);
    if (!entry) return false;

    this.npcId = npcId;
    this.page = 0;
    this.shopRequested = false;

    if (!state.metNpcs.includes(npcId)) state.metNpcs.push(npcId);
    bus.emit('npcTalked', { npcId });

    // Delivering a quest item is implicit: walking up with it counts.
    this.checkDeliveries(npcId);

    this.enterNode(entry.node, player);
    return this.npcId !== null;
  }

  end(): void {
    this.npcId = null;
    this.nodeId = null;
    this.page = 0;
  }

  private get node(): DialogueNode | null {
    if (!this.npcId || !this.nodeId) return null;
    return getNpc(this.npcId).dialogue.nodes[this.nodeId] ?? null;
  }

  /** The line currently on screen. */
  currentLine(): DialogueLine | null {
    const node = this.node;
    if (!node || !this.npcId) return null;
    const npc = getNpc(this.npcId);
    const pages = Array.isArray(node.text) ? node.text : [node.text];
    return {
      speaker: node.speaker ?? npc.name,
      text: pages[Math.min(this.page, pages.length - 1)],
      hasMore: this.page < pages.length - 1,
    };
  }

  /** Choices for the current node, once all its pages have been read. */
  currentChoices(): PresentedChoice[] {
    const node = this.node;
    if (!node?.choices) return [];
    const line = this.currentLine();
    if (line?.hasMore) return [];

    const out: PresentedChoice[] = [];
    node.choices.forEach((choice, index) => {
      const gate = checkRequirement(choice.requires);
      if (!gate.ok && choice.hideIfLocked) return;
      out.push({
        index,
        text: choice.text,
        enabled: gate.ok,
        reason: gate.ok ? undefined : gate.reason,
        tone: choice.tone,
      });
    });
    return out;
  }

  /**
   * Advances a page, or follows `next` when the node has no choices. Returns
   * false when the conversation has ended.
   */
  advance(player: Player): boolean {
    const node = this.node;
    if (!node) return false;

    const pages = Array.isArray(node.text) ? node.text : [node.text];
    if (this.page < pages.length - 1) {
      this.page++;
      return true;
    }
    if (node.choices && node.choices.length > 0) return true;
    if (node.next) {
      this.enterNode(node.next, player);
      return this.npcId !== null;
    }
    this.end();
    return false;
  }

  /** Picks a choice by index. Returns false when the conversation ended. */
  choose(index: number, player: Player): boolean {
    const node = this.node;
    if (!node?.choices) return false;
    const choice = node.choices[index];
    if (!choice) return false;
    if (!checkRequirement(choice.requires).ok) return false;

    this.runEffects(choice.effects, player);
    if (!this.npcId) return false;

    if (choice.next) {
      this.enterNode(choice.next, player);
      return this.npcId !== null;
    }
    this.end();
    return false;
  }

  private enterNode(nodeId: string, player: Player): void {
    if (!this.npcId) return;
    const npc = getNpc(this.npcId);
    const node = npc.dialogue.nodes[nodeId];
    if (!node) {
      console.warn(`[dialogue] ${npc.id} has no node "${nodeId}"`);
      this.end();
      return;
    }
    this.nodeId = nodeId;
    this.page = 0;
    this.runEffects(node.effects, player);
  }

  /**
   * An NPC who is the turn-in target for a delivery objective accepts the item
   * simply by being spoken to while you carry it.
   */
  private checkDeliveries(npcId: string): void {
    for (const progress of state.activeQuests) {
      const def = questDefFor(progress.questId);
      if (!def) continue;
      def.objectives.forEach((objective) => {
        if (objective.kind !== 'deliver' || objective.npcId !== npcId) return;
        bus.emit('itemDelivered', { npcId, itemId: objective.itemId });
      });
    }
  }

  private runEffects(effects: DialogueEffect[] | undefined, player: Player): void {
    if (!effects) return;
    for (const effect of effects) {
      switch (effect.kind) {
        case 'setFlag':
          state.setFlag(effect.flag, effect.value ?? true);
          break;
        case 'startQuest':
          quests.accept(effect.questId);
          break;
        case 'turnInQuest':
          quests.turnIn(effect.questId);
          break;
        case 'giveItem':
          addItem(effect.itemId, effect.count);
          break;
        case 'takeItem':
          removeItem(effect.itemId, effect.count);
          break;
        case 'giveGold':
          state.addGold(effect.amount);
          break;
        case 'takeGold':
          state.addGold(-effect.amount);
          break;
        case 'openShop':
          this.shopRequested = true;
          break;
        case 'heal': {
          const healed = player.maxHealth - player.health;
          player.health = player.maxHealth;
          player.mana = player.maxMana;
          player.clearStatuses();
          if (healed > 0) bus.emit('playerHealed', { amount: healed });
          bus.emit('toast', { text: 'You feel whole again.', color: C.verdant, icon: '✚' });
          break;
        }
        case 'respec': {
          const refunded = respec(player);
          bus.emit('toast', {
            text: `${refunded} skill point${refunded === 1 ? '' : 's'} returned.`,
            color: C.aether, icon: '✦',
          });
          break;
        }
        case 'unlockArea':
          state.unlockArea(effect.areaId);
          break;
      }
    }
  }
}

/**
 * Quest lookup that tolerates an id the data no longer defines, so a save from
 * an older build cannot crash a conversation.
 */
function questDefFor(questId: string): QuestDef | undefined {
  return QUESTS[questId];
}

export const dialogue = new DialogueSystem();
