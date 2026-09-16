import type { Requirement } from './areaTypes';

/**
 * Quest and dialogue schemas.
 *
 * Objectives are tagged records the quest system matches against bus events, so
 * "kill five wolves" and "find the glade" are the same machinery. Dialogue is a
 * graph of nodes with conditional choices and declarative effects — no
 * conversation anywhere in the game is written in gameplay code.
 */

export type QuestObjective =
  | { kind: 'kill'; enemyId: string; count: number; label: string }
  | { kind: 'collect'; itemId: string; count: number; label: string; consume?: boolean }
  | { kind: 'explore'; locationId: string; label: string }
  | { kind: 'talk'; npcId: string; label: string }
  | { kind: 'deliver'; npcId: string; itemId: string; count: number; label: string }
  | { kind: 'boss'; bossId: string; label: string }
  | { kind: 'secret'; secretId: string; label: string }
  | { kind: 'flag'; flag: string; label: string };

export interface QuestReward {
  xp?: number;
  gold?: number;
  items?: Array<{ itemId: string; count: number }>;
  /** Area unlocked on turn-in. */
  unlocksArea?: string;
  /** Flags set on turn-in; how quests advance the story. */
  flags?: string[];
  /** Skill points granted directly. */
  skillPoints?: number;
}

export type QuestKind = 'main' | 'side';

export interface QuestDef {
  id: string;
  name: string;
  kind: QuestKind;
  /** One line for the quest tracker. */
  summary: string;
  /** Full text for the quest log. */
  description: string;
  /** Flavour shown once the quest is complete. */
  completionText?: string;
  /** NPC who offers it. */
  giver: string;
  /** NPC it is turned in to. Defaults to the giver. */
  turnInTo?: string;
  /** Suggested level, shown in the log. */
  level: number;
  /** Gate on offering it at all. */
  requires?: Requirement;
  objectives: QuestObjective[];
  rewards: QuestReward;
  /** Quest offered immediately after this one is turned in. */
  nextQuest?: string;
  /** Area the objectives are in, used by the log and the map. */
  areaId?: string;
}

/* ------------------------------------------------------------------ */
/* Dialogue                                                            */
/* ------------------------------------------------------------------ */

export type DialogueEffect =
  | { kind: 'setFlag'; flag: string; value?: number | string | boolean }
  | { kind: 'startQuest'; questId: string }
  | { kind: 'turnInQuest'; questId: string }
  | { kind: 'giveItem'; itemId: string; count: number }
  | { kind: 'takeItem'; itemId: string; count: number }
  | { kind: 'giveGold'; amount: number }
  | { kind: 'takeGold'; amount: number }
  | { kind: 'openShop' }
  | { kind: 'heal' }
  | { kind: 'respec' }
  | { kind: 'unlockArea'; areaId: string };

export interface DialogueChoice {
  text: string;
  /** Node to move to. Omit to end the conversation. */
  next?: string;
  requires?: Requirement;
  effects?: DialogueEffect[];
  /** When the requirement fails: hide the choice instead of disabling it. */
  hideIfLocked?: boolean;
  /** Marks the choice visually in the UI. */
  tone?: 'quest' | 'shop' | 'leave' | 'lore';
}

export interface DialogueNode {
  /** Overrides the NPC's name for this line. */
  speaker?: string;
  /** One or more pages of text; the player advances through them. */
  text: string | string[];
  requires?: Requirement;
  effects?: DialogueEffect[];
  choices?: DialogueChoice[];
  /** Followed automatically when there are no choices. */
  next?: string;
}

export interface DialogueTree {
  id: string;
  /**
   * Entry points, evaluated in order; the first whose requirement passes is
   * used. This is how an NPC says something different once you have their
   * quest, without any branching logic outside the data.
   */
  entries: Array<{ node: string; requires?: Requirement }>;
  nodes: Record<string, DialogueNode>;
}
