import type { QuestDef } from '../game/questTypes';

/**
 * Quests.
 *
 * Objectives are matched against bus events by QuestSystem, so every quest type
 * the design called for — kill, collect, explore, talk, deliver, boss, secret —
 * is a record here and nothing more. The main line threads Homestead → Woods →
 * Ruins → Caves → Shrine → Vigil; side quests hang off it.
 */
export const QUESTS: Record<string, QuestDef> = {
  /* ------------------------- Main line ------------------------- */
  troubleInTheWoods: {
    id: 'troubleInTheWoods',
    name: 'Trouble in the Woods',
    kind: 'main',
    level: 2,
    giver: 'mira',
    areaId: 'whisperingWoods',
    summary: 'Thin out the wolves in the Whispering Woods.',
    description:
      'Mira says the wolves have come down out of the deep woods three nights ' +
      'running, and that they are not behaving like wolves. She would like ' +
      'five fewer of them, and she would like you to come back afterwards.',
    completionText:
      'Mira counts the pelts without looking at them. "That is five. That is ' +
      'not all of them." She does not say how she knows.',
    objectives: [
      { kind: 'kill', enemyId: 'shadowWolf', count: 5, label: 'Defeat Shadow Wolves' },
    ],
    rewards: {
      xp: 180,
      gold: 60,
      items: [{ itemId: 'potionMinorHealth', count: 3 }],
      flags: ['woodsThinned'],
    },
    nextQuest: 'whatTheWoodsTook',
  },

  whatTheWoodsTook: {
    id: 'whatTheWoodsTook',
    name: 'What the Woods Took',
    kind: 'main',
    level: 3,
    giver: 'mira',
    turnInTo: 'hollow',
    areaId: 'whisperingWoods',
    requires: { questCompleted: 'troubleInTheWoods' },
    summary: 'Find the hermit living in the Whispering Woods.',
    description:
      'There is somebody living out there who was not living out there last ' +
      'year. Mira wants you to find them and, in her words, "see how much of ' +
      'them is left."',
    completionText:
      'The hermit listens to the whole question, then answers a different one. ' +
      '"The Shrine is awake. It has been awake since the fire. It is only now ' +
      'getting round to us."',
    objectives: [
      { kind: 'talk', npcId: 'hollow', label: 'Speak with the hermit' },
    ],
    rewards: {
      xp: 220,
      gold: 40,
      flags: ['metHollow'],
    },
    nextQuest: 'ashesAndAnswers',
  },

  ashesAndAnswers: {
    id: 'ashesAndAnswers',
    name: 'Ashes and Answers',
    kind: 'main',
    level: 5,
    giver: 'hollow',
    turnInTo: 'wren',
    areaId: 'ashenRuins',
    requires: { questCompleted: 'whatTheWoodsTook' },
    summary: 'Search the Ashen Ruins and find what burned them.',
    description:
      'The hermit will not go back to the Ruins. They will, however, tell you ' +
      'exactly where to look, in detail, twice, which suggests they have ' +
      'thought about it more than they let on.',
    completionText:
      'Wren reads the journal page twice. "It answers to both names." She ' +
      'looks at you differently after that.',
    objectives: [
      { kind: 'explore', locationId: 'ar_plaza', label: 'Reach the Turned Plaza' },
      { kind: 'kill', enemyId: 'skeletonWarrior', count: 6, label: 'Clear the risen dead' },
      { kind: 'collect', itemId: 'ruinedJournal', count: 1, label: 'Recover the journal' },
    ],
    rewards: {
      xp: 520,
      gold: 180,
      items: [{ itemId: 'potionGreaterHealth', count: 2 }],
      flags: ['readJournal'],
      skillPoints: 1,
    },
    nextQuest: 'theResonantStones',
  },

  theResonantStones: {
    id: 'theResonantStones',
    name: 'The Resonant Stones',
    kind: 'main',
    level: 8,
    giver: 'wren',
    areaId: 'arcaneCaves',
    requires: { questCompleted: 'ashesAndAnswers' },
    summary: 'Wake the three stones in the Arcane Caves.',
    description:
      'The journal describes three stones set in a triangle and a way through ' +
      'that only opens when all three are sounding. Wren has the sigil that ' +
      'gets you in. She is not coming.',
    completionText:
      'The third stone takes the note and holds it. Something far under the ' +
      'floor answers, and keeps answering after you stop listening.',
    objectives: [
      { kind: 'explore', locationId: 'ac_hall', label: 'Find the Resonant Hall' },
      { kind: 'flag', flag: 'cavesResonanceSolved', label: 'Wake all three stones' },
    ],
    rewards: {
      xp: 900,
      gold: 300,
      items: [{ itemId: 'aetherlens', count: 1 }],
      unlocksArea: 'forgottenShrine',
      skillPoints: 1,
    },
    nextQuest: 'theFifthPlinth',
  },

  theFifthPlinth: {
    id: 'theFifthPlinth',
    name: 'The Fifth Plinth',
    kind: 'main',
    level: 12,
    giver: 'wren',
    turnInTo: 'keeper',
    areaId: 'forgottenShrine',
    requires: { questCompleted: 'theResonantStones' },
    summary: 'Reach the Forgotten Shrine and speak to whoever is keeping it.',
    description:
      'Four statues, four plinths, and a fifth that is empty and swept clean. ' +
      'Somebody removed what stood there, recently and carefully. The Keeper ' +
      'will know. The Keeper may also be the reason.',
    completionText:
      'The Keeper does not deny it. "It was mine to watch. It is still mine to ' +
      'watch. It has simply stopped agreeing."',
    objectives: [
      { kind: 'explore', locationId: 'fs_terrace', label: 'Reach the Shrine terrace' },
      { kind: 'talk', npcId: 'keeper', label: 'Speak with the Keeper' },
    ],
    rewards: {
      xp: 1400,
      gold: 420,
      flags: ['shrineAwakened'],
      skillPoints: 1,
    },
    nextQuest: 'theWardensVigil',
  },

  theWardensVigil: {
    id: 'theWardensVigil',
    name: "The Warden's Vigil",
    kind: 'main',
    level: 15,
    giver: 'keeper',
    areaId: 'bossArena',
    requires: { questCompleted: 'theFifthPlinth' },
    summary: 'End the vigil above the Shrine.',
    description:
      'Whatever stood on the fifth plinth has been walking a circle above the ' +
      'Shrine since the night the Ruins burned. The Keeper says it cannot be ' +
      'reasoned with. The Keeper has, it becomes clear, tried.',
    completionText:
      'The armour comes apart the way a held breath goes out. Underneath it ' +
      'there is nothing at all, which is somehow worse.',
    objectives: [
      { kind: 'boss', bossId: 'hollowWarden', label: 'Defeat the Hollow Warden' },
    ],
    rewards: {
      xp: 3000,
      gold: 1200,
      items: [{ itemId: 'shrinewardSigil', count: 1 }],
      flags: ['wardenDefeated', 'chapterOneComplete'],
      skillPoints: 2,
    },
  },

  /* ------------------------- Side quests ------------------------- */
  peltsForGarrick: {
    id: 'peltsForGarrick',
    name: 'Cold Work',
    kind: 'side',
    level: 2,
    giver: 'garrick',
    areaId: 'whisperingWoods',
    summary: 'Bring Garrick four Shadow Pelts.',
    description:
      'Garrick can line a coat with shadow pelt and sell it for four times ' +
      'what a coat is worth. He is very open about this. He calls it "honest ' +
      'about being dishonest".',
    completionText:
      '"Four. Good." He is already cutting. "Do not tell Mira what I pay you."',
    objectives: [
      { kind: 'collect', itemId: 'wolfPelt', count: 4, label: 'Shadow Pelts', consume: true },
    ],
    rewards: {
      xp: 140,
      gold: 120,
      items: [{ itemId: 'hearthguardVest', count: 1 }],
    },
  },

  tobinsDare: {
    id: 'tobinsDare',
    name: "Tobin's Dare",
    kind: 'side',
    level: 2,
    giver: 'tobin',
    areaId: 'whisperingWoods',
    summary: 'Find the clearing Tobin swears is real.',
    description:
      'Tobin is nine and insists there is a clearing in the Woods where the ' +
      'whispering stops. Nobody believes him. Tobin is offering his entire ' +
      'savings on the matter.',
    completionText:
      '"I KNEW it." He pays you in coins that are still warm from his pocket.',
    objectives: [
      { kind: 'secret', secretId: 'ww_glade', label: 'Find the Quiet Glade' },
    ],
    rewards: {
      xp: 160,
      gold: 45,
      items: [{ itemId: 'copperBand', count: 1 }],
    },
  },

  mirasLocket: {
    id: 'mirasLocket',
    name: 'A Locket, Empty',
    kind: 'side',
    level: 4,
    giver: 'tobin',
    turnInTo: 'mira',
    areaId: 'homestead',
    requires: { questCompleted: 'troubleInTheWoods' },
    summary: "Return Mira's locket to her.",
    description:
      'Tobin found a locket in the road and has been carrying it around for a ' +
      'week working up the nerve to give it back. He would like you to do it ' +
      'instead. He would like this very much.',
    completionText:
      'She holds it a long moment. "It was always empty," she says, which is ' +
      'true, and not an answer.',
    objectives: [
      { kind: 'deliver', npcId: 'mira', itemId: 'mirasLocket', count: 1,
        label: 'Give the locket to Mira' },
    ],
    rewards: {
      xp: 260,
      gold: 80,
      flags: ['mirasLocketReturned'],
    },
  },

  theWolfThatWaits: {
    id: 'theWolfThatWaits',
    name: 'The Wolf That Waits',
    kind: 'side',
    level: 4,
    giver: 'hollow',
    areaId: 'whisperingWoods',
    requires: { flag: 'metHollow' },
    summary: 'Kill the alpha that hunts the southern woods.',
    description:
      'The hermit describes it precisely: bigger, older, and patient in a way ' +
      'the others are not. "It has been letting you live," they add, ' +
      'conversationally.',
    completionText:
      '"Good," says the hermit, and goes back to whatever they were doing.',
    objectives: [
      { kind: 'kill', enemyId: 'shadowWolf', count: 1, label: 'Defeat the Elite Shadow Wolf' },
    ],
    rewards: {
      xp: 420,
      gold: 150,
      items: [{ itemId: 'huntersDagger', count: 1 }],
    },
  },
};

export function getQuest(id: string): QuestDef {
  const def = QUESTS[id];
  if (!def) throw new Error(`Unknown quest id: ${id}`);
  return def;
}

export function questList(): QuestDef[] {
  return Object.values(QUESTS);
}

/** Quests a given NPC can offer, in definition order. */
export function questsFrom(npcId: string): QuestDef[] {
  return questList().filter((q) => q.giver === npcId);
}
