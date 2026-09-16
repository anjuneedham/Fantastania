import { getCharacter } from '../data/characters';
import { SKILL_TREES } from '../data/skills';
import { state } from './GameState';

/**
 * Sets up a fresh save for a character.
 *
 * Everything a character starts with — abilities, gear, items — comes from its
 * CharacterDef, so a third character needs no changes here.
 */
export function startNewGame(characterId: string): void {
  const def = getCharacter(characterId);
  state.reset(characterId);

  state.loadout = {
    ability1: def.startingAbilities.ability1,
    ability2: def.startingAbilities.ability2,
    ultimate: def.startingAbilities.ultimate,
  };
  state.unlockedAbilities = [
    def.startingAbilities.ability1,
    def.startingAbilities.ability2,
    def.startingAbilities.ultimate,
  ];

  state.inventory = def.startingItems.map((entry) => ({
    itemId: entry.itemId,
    count: entry.count,
  }));
  state.equipment = {
    weapon: def.startingEquipment.weapon ?? null,
    armor: def.startingEquipment.armor ?? null,
    accessory: def.startingEquipment.accessory ?? null,
  };

  state.currentAreaId = 'homestead';
  state.spawnPointId = 'default';
  state.unlockedAreas = ['homestead'];
  state.currentHealth = -1;
  state.currentMana = -1;
}

/**
 * Recomputes which abilities the player has unlocked from their spent skill
 * points, and repairs a loadout that references something they cannot use.
 * Safe to call after loading an old save whose data has since changed.
 */
export function refreshUnlockedAbilities(): void {
  const def = getCharacter(state.characterId);
  const unlocked = new Set<string>([
    def.startingAbilities.ability1,
    def.startingAbilities.ability2,
    def.startingAbilities.ultimate,
  ]);

  const tree = SKILL_TREES[def.skillTreeId];
  if (tree) {
    for (const node of tree.nodes) {
      if ((state.learnedSkills[node.id] ?? 0) <= 0) continue;
      for (const effect of node.effects) {
        if (effect.kind === 'unlockAbility') unlocked.add(effect.abilityId);
      }
    }
  }
  state.unlockedAbilities = Array.from(unlocked);

  // Drop any slot pointing at something no longer available.
  for (const slot of ['ability1', 'ability2', 'ultimate'] as const) {
    const current = state.loadout[slot];
    if (current && !unlocked.has(current)) state.loadout[slot] = null;
  }
  if (!state.loadout.ultimate) state.loadout.ultimate = def.startingAbilities.ultimate;
  if (!state.loadout.ability1) state.loadout.ability1 = def.startingAbilities.ability1;
  if (!state.loadout.ability2) state.loadout.ability2 = def.startingAbilities.ability2;
}
