import type { ActorSprite } from '../art/sprites';
import { C } from '../art/palette';
import type { DialogueTree } from '../game/questTypes';

/**
 * NPCs and their conversations.
 *
 * Every line of dialogue in the game lives in this file as structured data.
 * Gameplay code never contains a string of dialogue, and a conversation branches
 * through `requires` on entries and choices — so "Mira before you take her
 * quest" and "Mira after" are two entry points, not two code paths.
 */

export interface ShopDef {
  /** Items always in stock. */
  stock: string[];
  /** Multiplier on the item's base value when buying from this merchant. */
  markup: number;
  /** Fraction of value paid when selling to them. */
  buyback: number;
  greeting: string;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  sprite: ActorSprite;
  dialogue: DialogueTree;
  shop?: ShopDef;
  /** Radius the NPC wanders around their post. 0 = stands still. */
  wanderRadius?: number;
  /** Shown above their head when the player is close. */
  interactRadius?: number;
}

export const NPCS: Record<string, NpcDef> = {
  mira: {
    id: 'mira',
    name: 'Mira',
    title: 'Hearthwarden',
    wanderRadius: 0,
    sprite: {
      shape: 'humanoid',
      height: 44,
      build: 1,
      skin: '#c98f6b',
      hair: '#6b6575',
      primary: '#7a4a58',
      secondary: '#c9a227',
      legs: '#4a3a3e',
      accent: C.gold,
      cloak: '#5e3641',
      eyeColor: '#241a12',
    },
    dialogue: {
      id: 'mira',
      entries: [
        { node: 'wardenDone', requires: { flag: 'wardenDefeated' } },
        { node: 'plinthKnown', requires: { flag: 'readJournal' } },
        { node: 'woodsDone', requires: { questReady: 'troubleInTheWoods' } },
        { node: 'woodsActive', requires: { questActive: 'troubleInTheWoods' } },
        { node: 'locketReady', requires: { questReady: 'mirasLocket' } },
        { node: 'firstMeeting', requires: { questNotStarted: 'troubleInTheWoods' } },
        { node: 'idle' },
      ],
      nodes: {
        firstMeeting: {
          text: [
            'Mira looks up from the brazier she has no reason to be tending at this hour.',
            '"You are up. Good. I was going to wake you, and I hate doing that."',
            '"The wolves came down again. Third night. They did not take anything, which is what worries me — they came down to look at us."',
          ],
          choices: [
            {
              text: 'What do you want me to do?',
              next: 'offerWoods',
              tone: 'quest',
            },
            { text: 'Look at us? Wolves do not do that.', next: 'wolvesExplain', tone: 'lore' },
            { text: 'It is late, Mira.', tone: 'leave' },
          ],
        },
        wolvesExplain: {
          text: [
            '"No," she agrees. "They do not."',
            '"They sat at the treeline in a row and watched the lamps until dawn. Then they left. Nothing was hunted. Nothing was hungry."',
          ],
          choices: [
            { text: 'Then I will go and ask them about it.', next: 'offerWoods', tone: 'quest' },
            { text: 'I will think about it.', tone: 'leave' },
          ],
        },
        offerWoods: {
          text: [
            '"Five of them. That is all I am asking. Not because five fixes it — because five will tell me whether anything can."',
            '"Then come back. Do not be clever about this."',
          ],
          choices: [
            {
              text: 'Five wolves. Done.',
              next: 'accepted',
              effects: [{ kind: 'startQuest', questId: 'troubleInTheWoods' }],
              tone: 'quest',
            },
            { text: 'Not tonight.', tone: 'leave' },
          ],
        },
        accepted: {
          text: '"Take the road east. And take a draught — you will forget, and then you will need one."',
          effects: [{ kind: 'giveItem', itemId: 'potionMinorHealth', count: 1 }],
        },
        woodsActive: {
          text: '"Still five. The number has not moved on its own while you were standing here."',
          choices: [
            { text: 'I am going.', tone: 'leave' },
            { text: 'Can you patch me up?', next: 'healed', tone: 'shop' },
          ],
        },
        healed: {
          text: '"Sit. Do not argue." She works quickly and without sympathy.',
          effects: [{ kind: 'heal' }],
        },
        woodsDone: {
          text: [
            '"Five." She does not ask how. "And?"',
            'You tell her. She listens to all of it, including the part you were going to leave out.',
          ],
          choices: [
            {
              text: 'Something out there is not a wolf.',
              next: 'woodsTurnIn',
              effects: [{ kind: 'turnInQuest', questId: 'troubleInTheWoods' }],
              tone: 'quest',
            },
          ],
        },
        woodsTurnIn: {
          text: [
            '"There is somebody living in those woods who was not living there last year."',
            '"Find them. See how much of them is left."',
          ],
          choices: [
            {
              text: 'I will find them.',
              effects: [{ kind: 'startQuest', questId: 'whatTheWoodsTook' }],
              tone: 'quest',
            },
          ],
        },
        locketReady: {
          text: 'She sees it in your hand before you say anything, and goes very still.',
          choices: [
            {
              text: 'Tobin found it in the road.',
              next: 'locketTurnIn',
              effects: [{ kind: 'turnInQuest', questId: 'mirasLocket' }],
              tone: 'quest',
            },
          ],
        },
        locketTurnIn: {
          text: [
            '"It was always empty," she says.',
            'It is a good lie. She has clearly had years to practise it.',
          ],
        },
        plinthKnown: {
          text: [
            '"The fifth plinth." She says it like a word she has been avoiding.',
            '"Whatever you find up there — it was ours once. That is not the same as it being ours now."',
          ],
          choices: [
            { text: 'You knew about the Shrine.', next: 'plinthPress', tone: 'lore' },
            { text: 'I will be careful.', tone: 'leave' },
          ],
        },
        plinthPress: {
          text: '"Everyone my age knew about the Shrine. That is why nobody my age talks about it."',
        },
        wardenDone: {
          text: [
            '"It is quiet," Mira says, and means the Woods.',
            '"First time in two years. I keep going to the door to check."',
            '"Whatever is next, it can wait until morning. Sit down."',
          ],
          choices: [
            { text: 'Sit down.', next: 'healed', tone: 'shop' },
            { text: 'Not yet.', tone: 'leave' },
          ],
        },
        idle: {
          text: '"Go on, then. The lamps will keep."',
        },
      },
    },
  },

  garrick: {
    id: 'garrick',
    name: 'Garrick',
    title: 'Smith and Opportunist',
    wanderRadius: 0,
    sprite: {
      shape: 'humanoid',
      height: 46,
      build: 1.25,
      skin: '#a86b4a',
      hair: '#2a1d12',
      primary: '#5c4630',
      secondary: '#ff9a4d',
      legs: '#3b2a1c',
      accent: C.ember,
      eyeColor: '#241a12',
      weapon: { kind: 'axe', length: 0.5, color: '#b9bdc8' },
    },
    shop: {
      stock: [
        'potionMinorHealth', 'potionMinorMana', 'potionGreaterHealth', 'breadRation',
        'huntersDagger', 'woodcuttersAxe', 'hearthguardVest', 'wanderersWrap',
        'mossweaveCoat', 'copperBand',
      ],
      markup: 1,
      buyback: 0.4,
      greeting: '"Coin first. Then we are friends."',
    },
    dialogue: {
      id: 'garrick',
      entries: [
        { node: 'peltsReady', requires: { questReady: 'peltsForGarrick' } },
        { node: 'peltsActive', requires: { questActive: 'peltsForGarrick' } },
        { node: 'offerPelts', requires: { questNotStarted: 'peltsForGarrick' } },
        { node: 'idle' },
      ],
      nodes: {
        offerPelts: {
          text: [
            '"You are the one going into the Woods." It is not a question. "Bring me pelts."',
            '"Shadow pelt lines a coat and the coat sells for four times what a coat is worth. I am telling you this so you understand I am being honest about being dishonest."',
          ],
          choices: [
            {
              text: 'Four pelts. Fine.',
              next: 'peltsAccepted',
              effects: [{ kind: 'startQuest', questId: 'peltsForGarrick' }],
              tone: 'quest',
            },
            { text: 'Show me what you have.', next: 'shop', tone: 'shop' },
            { text: 'No.', tone: 'leave' },
          ],
        },
        peltsAccepted: { text: '"Four. Not three. I will know."' },
        peltsActive: {
          text: '"Pelts," he says, without looking up. "Four of them."',
          choices: [
            { text: 'Show me what you have.', next: 'shop', tone: 'shop' },
            { text: 'Working on it.', tone: 'leave' },
          ],
        },
        peltsReady: {
          text: 'He counts them by feel, one-handed, still hammering with the other.',
          choices: [
            {
              text: 'Four, as agreed.',
              next: 'peltsDone',
              effects: [{ kind: 'turnInQuest', questId: 'peltsForGarrick' }],
              tone: 'quest',
            },
          ],
        },
        peltsDone: {
          text: '"Good. Do not tell Mira what I paid you."',
          choices: [
            { text: 'Show me what you have.', next: 'shop', tone: 'shop' },
            { text: 'Later.', tone: 'leave' },
          ],
        },
        idle: {
          text: '"Still alive. Still buying."',
          choices: [
            { text: 'Show me what you have.', next: 'shop', tone: 'shop' },
            { text: 'Just passing.', tone: 'leave' },
          ],
        },
        shop: {
          text: '"Coin first. Then we are friends."',
          effects: [{ kind: 'openShop' }],
        },
      },
    },
  },

  tobin: {
    id: 'tobin',
    name: 'Tobin',
    title: 'Nine, and Correct',
    wanderRadius: 60,
    sprite: {
      shape: 'humanoid',
      height: 32,
      build: 0.85,
      skin: '#d9a884',
      hair: '#8a5a2e',
      primary: '#4b7a52',
      secondary: '#e8e3d3',
      legs: '#3f5c44',
      accent: C.verdant,
      eyeColor: '#241a12',
    },
    dialogue: {
      id: 'tobin',
      entries: [
        { node: 'gladeDone', requires: { questReady: 'tobinsDare' } },
        { node: 'gladeActive', requires: { questActive: 'tobinsDare' } },
        { node: 'offerLocket', requires: { questCompleted: 'troubleInTheWoods', questNotStarted: 'mirasLocket' } },
        { node: 'offerGlade', requires: { questNotStarted: 'tobinsDare' } },
        { node: 'idle' },
      ],
      nodes: {
        offerGlade: {
          text: [
            '"You are going into the Woods." Tobin has clearly been waiting all morning to say this.',
            '"There is a place in there where the whispering stops. I have BEEN. Nobody believes me."',
            'He produces a small cloth bag and shakes it. It sounds like about nine coins.',
          ],
          choices: [
            {
              text: 'I will look for it.',
              next: 'gladeAccepted',
              effects: [{ kind: 'startQuest', questId: 'tobinsDare' }],
              tone: 'quest',
            },
            { text: 'Where exactly?', next: 'gladeHint', tone: 'lore' },
            { text: 'Maybe later, Tobin.', tone: 'leave' },
          ],
        },
        gladeHint: {
          text: [
            '"Past the arch. Then LEFT, but there is a wall of thorns so you have to go round."',
            '"There is a standing stone and mushrooms that go blue. That is how you know."',
          ],
          choices: [
            {
              text: 'Alright. I will look.',
              effects: [{ kind: 'startQuest', questId: 'tobinsDare' }],
              tone: 'quest',
            },
          ],
        },
        gladeAccepted: { text: '"Do not tell my mother where I said."' },
        gladeActive: { text: '"Past the arch. LEFT. Round the thorns. I already said."' },
        gladeDone: {
          text: 'He sees your face and is already bouncing.',
          choices: [
            {
              text: 'The glade is real.',
              next: 'gladePaid',
              effects: [{ kind: 'turnInQuest', questId: 'tobinsDare' }],
              tone: 'quest',
            },
          ],
        },
        gladePaid: {
          text: '"I KNEW it." The coins are still warm from his pocket.',
        },
        offerLocket: {
          text: [
            'Tobin is holding something behind his back and doing a poor job of it.',
            '"I found it in the road. It is Mira’s. I have had it a week."',
            '"I cannot give it back. She will do the FACE."',
          ],
          choices: [
            {
              text: 'I will give it to her.',
              next: 'locketTaken',
              effects: [
                { kind: 'giveItem', itemId: 'mirasLocket', count: 1 },
                { kind: 'startQuest', questId: 'mirasLocket' },
              ],
              tone: 'quest',
            },
            { text: 'Give it back yourself.', tone: 'leave' },
          ],
        },
        locketTaken: { text: '"Do not say it was me. Say you found it."' },
        idle: { text: '"Did you know the well goes down further than the rope?"' },
      },
    },
  },

  hollow: {
    id: 'hollow',
    name: 'The Hermit',
    title: 'Formerly of the Ruins',
    wanderRadius: 0,
    sprite: {
      shape: 'wisp',
      height: 44,
      build: 0.95,
      skin: '#b3ae9c',
      hair: '#3b4576',
      primary: '#2f4a3a',
      secondary: '#4bbf7a',
      accent: C.verdant,
      hood: true,
      eyeColor: C.aether,
      eyeGlow: true,
      aura: { color: C.verdant, radius: 50, intensity: 0.35 },
    },
    dialogue: {
      id: 'hollow',
      entries: [
        { node: 'ruinsActive', requires: { questActive: 'ashesAndAnswers' } },
        { node: 'offerWolf', requires: { flag: 'metHollow', questNotStarted: 'theWolfThatWaits' } },
        { node: 'wolfReady', requires: { questReady: 'theWolfThatWaits' } },
        { node: 'firstMeeting', requires: { questActive: 'whatTheWoodsTook' } },
        { node: 'idle' },
      ],
      nodes: {
        firstMeeting: {
          text: [
            'They do not turn around. "You are from the Homestead. You walk like somebody who has floors."',
            '"Mira sent you. She wants to know how much of me is left."',
          ],
          choices: [
            { text: 'She does, actually.', next: 'answer', tone: 'quest' },
            { text: 'She is worried about you.', next: 'answer', tone: 'lore' },
          ],
        },
        answer: {
          text: [
            '"Enough to answer. Not enough to go back."',
            'Now they turn around. The eyes are the wrong colour and have been for some time.',
            '"The Shrine is awake. It has been awake since the night the Ruins burned. It is only now getting round to us."',
          ],
          choices: [
            {
              text: 'What is at the Ruins?',
              next: 'offerRuins',
              effects: [{ kind: 'turnInQuest', questId: 'whatTheWoodsTook' }],
              tone: 'quest',
            },
          ],
        },
        offerRuins: {
          text: [
            '"A plaza with a statue facing the wrong way. Somebody turned it. That took effort, and it took hands."',
            '"There is a journal in a camp east of the cistern. Bring it to the scavenger — she reads better than I do now."',
          ],
          choices: [
            {
              text: 'I will go.',
              effects: [{ kind: 'startQuest', questId: 'ashesAndAnswers' }],
              tone: 'quest',
            },
          ],
        },
        offerWolf: {
          text: [
            '"There is one wolf out there that is not like the others. Older. Patient."',
            '"It has been letting you live," they add, conversationally.',
          ],
          choices: [
            {
              text: 'Not any more.',
              effects: [{ kind: 'startQuest', questId: 'theWolfThatWaits' }],
              tone: 'quest',
            },
            { text: 'That is a horrible thing to mention.', tone: 'leave' },
          ],
        },
        wolfReady: {
          text: 'They look at you for a while. "Ah. Good."',
          choices: [
            {
              text: 'It is done.',
              effects: [{ kind: 'turnInQuest', questId: 'theWolfThatWaits' }],
              tone: 'quest',
            },
          ],
        },
        ruinsActive: {
          text: '"East of the cistern. The camp with the cold fire. I will not say it a third time."',
        },
        idle: {
          text: '"The Woods are listening. They are not, on balance, on anybody’s side."',
        },
      },
    },
  },

  wren: {
    id: 'wren',
    name: 'Wren',
    title: 'Scavenger',
    wanderRadius: 40,
    sprite: {
      shape: 'humanoid',
      height: 43,
      build: 0.95,
      skin: '#8a6a4a',
      hair: '#1f1b2e',
      primary: '#4a4658',
      secondary: '#ff9a4d',
      legs: '#332f3e',
      accent: C.ember,
      cloak: '#3a3746',
      eyeColor: '#241a12',
      weapon: { kind: 'dagger', length: 0.4, color: '#b9bdc8' },
    },
    shop: {
      stock: [
        'potionGreaterHealth', 'potionMinorMana', 'emberTonic', 'focusTonic',
        'ashplateHarness', 'aetherlightBlade', 'wolfToothCharm',
      ],
      markup: 1.15,
      buyback: 0.45,
      greeting: '"Everything here belonged to someone. Most of them are past minding."',
    },
    dialogue: {
      id: 'wren',
      entries: [
        { node: 'stonesActive', requires: { questActive: 'theResonantStones' } },
        { node: 'stonesReady', requires: { questReady: 'theResonantStones' } },
        { node: 'journalReady', requires: { questReady: 'ashesAndAnswers' } },
        { node: 'ruinsActive', requires: { questActive: 'ashesAndAnswers' } },
        { node: 'idle' },
      ],
      nodes: {
        ruinsActive: {
          text: [
            '"You are the one the hermit sent." She does not stop sorting. "East of the cistern. Cold fire, wet journal."',
            '"Do not read it on the way. You will stop walking."',
          ],
          choices: [
            { text: 'What do you have for sale?', next: 'shop', tone: 'shop' },
            { text: 'On my way.', tone: 'leave' },
          ],
        },
        journalReady: {
          text: 'She takes the journal, reads one page twice, and looks at you differently.',
          choices: [
            {
              text: '"It answers to both names."',
              next: 'journalRead',
              effects: [{ kind: 'turnInQuest', questId: 'ashesAndAnswers' }],
              tone: 'quest',
            },
          ],
        },
        journalRead: {
          text: [
            '"Both names." She says it like it explains something she wishes it did not."',
            '"There are caves east of the Woods. Three stones in a triangle. The way through only opens when all three are sounding."',
            'She holds out a sigil. "This gets you in. I am not coming."',
          ],
          choices: [
            {
              text: 'Why not?',
              next: 'whyNot',
              effects: [{ kind: 'startQuest', questId: 'theResonantStones' }],
              tone: 'lore',
            },
            {
              text: 'Understood.',
              effects: [{ kind: 'startQuest', questId: 'theResonantStones' }],
              tone: 'quest',
            },
          ],
        },
        whyNot: {
          text: '"Because I have been inside once." She goes back to sorting. "Good luck."',
        },
        stonesActive: {
          text: '"Three stones. Strike one and the other two answer. That is the whole trick."',
          choices: [
            { text: 'What do you have for sale?', next: 'shop', tone: 'shop' },
            { text: 'Right.', tone: 'leave' },
          ],
        },
        stonesReady: {
          text: 'She sees the light still on you and sits down slowly.',
          choices: [
            {
              text: 'The way is open.',
              next: 'stonesDone',
              effects: [{ kind: 'turnInQuest', questId: 'theResonantStones' }],
              tone: 'quest',
            },
          ],
        },
        stonesDone: {
          text: [
            '"Then go north from the Ruins. The gate will decide about you."',
            '"Take this. It is not worth what it cost me."',
          ],
          choices: [
            {
              text: 'Thank you.',
              effects: [{ kind: 'startQuest', questId: 'theFifthPlinth' }],
              tone: 'quest',
            },
          ],
        },
        idle: {
          text: '"Everything here belonged to someone. Most of them are past minding."',
          choices: [
            { text: 'What do you have for sale?', next: 'shop', tone: 'shop' },
            { text: 'Nothing.', tone: 'leave' },
          ],
        },
        shop: {
          text: '"Coin, barter, or nothing. I am flexible about two of those."',
          effects: [{ kind: 'openShop' }],
        },
      },
    },
  },

  keeper: {
    id: 'keeper',
    name: 'The Keeper',
    title: 'Of the Forgotten Shrine',
    wanderRadius: 0,
    sprite: {
      shape: 'wisp',
      height: 52,
      build: 1.05,
      skin: '#cfd8e8',
      hair: '#e8e3d3',
      primary: '#cfd8e8',
      secondary: '#5fe6d0',
      accent: C.aether,
      hood: true,
      eyeColor: C.aetherSoft,
      eyeGlow: true,
      eyeCount: 1,
      aura: { color: C.aetherSoft, radius: 90, intensity: 0.7 },
    },
    dialogue: {
      id: 'keeper',
      entries: [
        { node: 'afterWarden', requires: { flag: 'wardenDefeated' } },
        { node: 'vigilActive', requires: { questActive: 'theWardensVigil' } },
        { node: 'firstMeeting', requires: { questActive: 'theFifthPlinth' } },
        { node: 'idle' },
      ],
      nodes: {
        firstMeeting: {
          text: [
            'The Keeper is already facing you, and was already facing you before you arrived.',
            '"Four statues," it says. "You have counted. Everyone counts."',
          ],
          choices: [
            { text: 'There are five plinths.', next: 'fifth', tone: 'quest' },
            { text: 'Who are you?', next: 'who', tone: 'lore' },
          ],
        },
        who: {
          text: '"The one who stayed." A pause. "That is not modesty. It is the whole of it."',
          choices: [
            { text: 'There are five plinths.', next: 'fifth', tone: 'quest' },
          ],
        },
        fifth: {
          text: [
            '"Yes."',
            'It does not deny anything. That is somehow worse than a denial would have been.',
            '"It was mine to watch. It is still mine to watch. It has simply stopped agreeing."',
          ],
          choices: [
            {
              text: 'Where is it now?',
              next: 'offerVigil',
              effects: [{ kind: 'turnInQuest', questId: 'theFifthPlinth' }],
              tone: 'quest',
            },
          ],
        },
        offerVigil: {
          text: [
            '"Above us. Walking a circle it wore into the stone before your Homestead had a name."',
            '"It cannot be reasoned with." A pause that lasts slightly too long. "I have tried."',
            'The light north of the terrace thins, and becomes a way through.',
          ],
          choices: [
            {
              text: 'Then I will end it.',
              effects: [{ kind: 'startQuest', questId: 'theWardensVigil' }],
              tone: 'quest',
            },
          ],
        },
        vigilActive: {
          text: '"It is still up there. It will be up there when you are ready and when you are not."',
          choices: [
            { text: 'Mend me first.', next: 'blessing', tone: 'shop' },
            { text: 'I am going up.', tone: 'leave' },
          ],
        },
        blessing: {
          text: 'The Keeper touches the air near your shoulder. Everything that hurt stops hurting.',
          effects: [{ kind: 'heal' }],
        },
        afterWarden: {
          text: [
            '"Empty," the Keeper says. "You found it empty."',
            '"It was empty when it was set on the plinth, too. That is what the Ruins burned over."',
            '"Go home. There is more of this. There is always more of this. But not tonight."',
          ],
          choices: [
            { text: 'Mend me.', next: 'blessing', tone: 'shop' },
            { text: 'Not tonight, then.', tone: 'leave' },
          ],
        },
        idle: {
          text: '"You are early. Or the shrine is late. It is difficult, from here, to tell."',
        },
      },
    },
  },
};

export function getNpc(id: string): NpcDef {
  const def = NPCS[id];
  if (!def) throw new Error(`Unknown npc id: ${id}`);
  return def;
}
