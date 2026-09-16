import { getAbility } from '../data/abilities';
import { getQuest } from '../data/quests';
import { C, alpha, bodyFont, displayFont } from '../art/palette';
import { clamp01 } from '../engine/math';
import type { Renderer } from '../engine/Renderer';
import type { PadButtonId, VirtualPad } from '../engine/VirtualPad';
import type { Player } from '../game/entities/Player';
import { state } from '../game/GameState';
import { objectiveProgress } from '../game/systems/QuestSystem';
import { statBar, type Rect } from './widgets';

/**
 * The always-on gameplay overlay: resource bars, level/gold, and the tracked
 * quest. Kept separate from WorldScene's own rendering (ground, entities,
 * lighting) the same way WorldRenderer is — this only ever draws 2D screen-
 * space chrome and never touches the camera transform.
 */
export function renderHud(ctx: CanvasRenderingContext2D, r: Renderer, player: Player): void {
  renderResourceBars(ctx, r, player);
  renderGold(ctx, r);
  renderQuestTracker(ctx, r);
}

function renderResourceBars(ctx: CanvasRenderingContext2D, r: Renderer, player: Player): void {
  const x = r.safeLeft + 14;
  const w = 210;
  let y = r.safeTop + 12;

  statBar(ctx, { x, y, w, h: 17 }, player.healthPct, C.blood, {
    bgColor: alpha(C.void, 0.65),
    label: `${Math.ceil(player.health)} / ${player.maxHealth}`,
  });
  y += 21;

  if (player.maxMana > 0) {
    statBar(ctx, { x, y, w, h: 12 }, player.manaPct, C.aether, {
      bgColor: alpha(C.void, 0.65),
      label: `${Math.ceil(player.mana)} / ${player.maxMana}`,
      textColor: alpha(C.deepNight, 0.85),
    });
    y += 16;
  }

  // Level badge to the left of a slim XP sliver, rather than a label baked
  // into the bar itself — there is not enough height left to read text at
  // this bar's size.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = bodyFont(11, 700);
  ctx.fillStyle = C.boneDim;
  const lvlText = `Lv${state.level}`;
  ctx.fillText(lvlText, x, y + 5);
  const lvlW = ctx.measureText(lvlText).width + 8;
  statBar(ctx, { x: x + lvlW, y, w: w - lvlW, h: 8 }, state.xpProgress, C.gold, {
    bgColor: alpha(C.void, 0.55),
  });
}

function renderGold(ctx: CanvasRenderingContext2D, r: Renderer): void {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.font = displayFont(16);
  ctx.fillStyle = C.gold;
  ctx.fillText(`${state.gold}g`, r.viewWidth - r.safeRight - 14, r.safeTop + 10);
}

/**
 * Shows the first active quest — same choice `autosave()` makes for the save
 * summary, so the tracker always agrees with "what quest is this a save of".
 */
function renderQuestTracker(ctx: CanvasRenderingContext2D, r: Renderer): void {
  const progress = state.activeQuests[0];
  if (!progress) return;
  const def = getQuest(progress.questId);

  const w = 240;
  const rect: Rect = { x: r.viewWidth - r.safeRight - w - 14, y: r.safeTop + 34, w, h: 0 };
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  ctx.font = bodyFont(10, 700);
  ctx.fillStyle = alpha(C.aetherSoft, 0.85);
  ctx.fillText(def.kind === 'main' ? 'MAIN QUEST' : 'QUEST', rect.x + rect.w, rect.y);

  ctx.font = displayFont(13);
  ctx.fillStyle = C.bone;
  ctx.fillText(def.name, rect.x + rect.w, rect.y + 13);

  ctx.font = bodyFont(11, 500);
  if (progress.readyToTurnIn) {
    const turnInTo = def.turnInTo ?? def.giver;
    ctx.fillStyle = C.gold;
    ctx.fillText(`Ready — return to ${turnInTo}`, rect.x + rect.w, rect.y + 32);
    return;
  }

  const index = def.objectives.findIndex((_, i) => !objectiveProgress(def.id, i).done);
  if (index < 0) return;
  const objective = def.objectives[index];
  const p = objectiveProgress(def.id, index);
  ctx.fillStyle = alpha(C.boneDim, 0.9);
  ctx.fillText(`${objective.label} (${p.current}/${p.required})`, rect.x + rect.w, rect.y + 32);
}

/**
 * Drives the ability-slot pad buttons from live ability and cooldown data.
 * The pad exists purely as an input device; nothing about a spell's icon,
 * colour or cooldown belongs in it, so this is the one place that reads
 * `state.loadout` and writes the result onto the buttons it drives.
 */
export function updateActionPad(pad: VirtualPad, player: Player): void {
  const slots: ReadonlyArray<[PadButtonId, string | null]> = [
    ['ability1', state.loadout.ability1],
    ['ability2', state.loadout.ability2],
    ['ultimate', state.loadout.ultimate],
  ];

  for (const [padId, abilityId] of slots) {
    const btn = pad.buttons.get(padId);
    if (!btn) continue;
    if (!abilityId) {
      btn.glyph = '—';
      btn.tint = C.haze;
      btn.cooldown = 0;
      btn.enabled = false;
      continue;
    }
    const def = getAbility(abilityId);
    btn.glyph = def.glyph;
    btn.tint = def.vfx.color;

    const cdLeft = player.cooldowns[abilityId] ?? 0;
    const cdTotal = player.modifyAbility(abilityId, 'cooldown', def.cooldown);
    btn.cooldown = cdTotal > 0 ? clamp01(cdLeft / cdTotal) : 0;

    const manaCost = player.modifyAbility(abilityId, 'manaCost', def.manaCost);
    btn.enabled = cdLeft <= 0 && player.mana >= manaCost;
  }

  const dodgeBtn = pad.buttons.get('dodge');
  if (dodgeBtn) {
    const total = player.def.dodge.cooldown;
    dodgeBtn.cooldown = total > 0 ? clamp01(player.dodgeCooldown / total) : 0;
    dodgeBtn.enabled = player.dodgeCooldown <= 0;
  }
}
