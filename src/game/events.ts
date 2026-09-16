import { EventBus } from '../engine/EventBus';
import type { DamageType, EquipSlot, Rarity } from './types';

/**
 * Every cross-system signal in the game. Systems talk through this bus rather
 * than calling each other, which is why the quest system can react to a kill, a
 * pickup, a conversation and a door without any of those knowing quests exist.
 */
export interface GameEvents {
  /* progression */
  xpGained: { amount: number; source: string };
  levelUp: { level: number; skillPoints: number };
  goldChanged: { amount: number; total: number };
  skillLearned: { nodeId: string; rank: number };
  abilityUnlocked: { abilityId: string };

  /* combat */
  damageDealt: { targetId: number; amount: number; type: DamageType; crit: boolean; x: number; y: number };
  playerDamaged: { amount: number; remaining: number };
  playerHealed: { amount: number };
  enemyKilled: { enemyId: string; level: number; x: number; y: number };
  bossDefeated: { bossId: string };
  playerDied: { areaId: string };
  playerRespawned: { areaId: string };
  abilityUsed: { abilityId: string };
  abilityFailed: { abilityId: string; reason: 'mana' | 'cooldown' | 'busy' };

  /* items */
  itemGained: { itemId: string; count: number; rarity: Rarity };
  itemRemoved: { itemId: string; count: number };
  itemUsed: { itemId: string };
  itemEquipped: { slot: EquipSlot; itemId: string | null };
  lootDropped: { itemId: string; x: number; y: number };
  goldPickedUp: { amount: number };

  /* world & story */
  areaEntered: { areaId: string };
  areaUnlocked: { areaId: string };
  locationDiscovered: { locationId: string; areaId: string };
  secretFound: { secretId: string; areaId: string };
  chestOpened: { chestId: string };
  flagSet: { flag: string; value: number | string | boolean };

  /* npcs & quests */
  npcTalked: { npcId: string };
  itemDelivered: { npcId: string; itemId: string };
  questAccepted: { questId: string };
  questProgress: { questId: string; objectiveIndex: number; current: number; required: number };
  questObjectiveComplete: { questId: string; objectiveIndex: number };
  questCompleted: { questId: string };
  questTurnedIn: { questId: string };

  /* ui */
  toast: { text: string; color?: string; icon?: string };
  combatLog: { text: string; color?: string };
  saved: { slot: number };
  loaded: { slot: number };
}

export const bus = new EventBus<GameEvents>();
