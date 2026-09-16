import { C, alpha, bodyFont, displayFont } from '../art/palette';
import { createPose, drawActor } from '../art/sprites';
import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import type { Renderer } from '../engine/Renderer';
import { Scene } from '../engine/Scene';
import { STAT_LABELS, type StatKey } from '../game/types';
import { statsAtLevel } from '../game/progression';
import { startNewGame } from '../game/newGame';
import { button, PointerTracker, statBar, type Rect } from '../ui/widgets';
import { WorldScene } from './WorldScene';

const STAT_ORDER: StatKey[] = ['strength', 'defense', 'magic', 'agility', 'vitality', 'spirit'];

/**
 * Character selection: two cards, a live-rendered portrait for each (the same
 * `drawActor` the game itself uses, so the preview never drifts from what you
 * actually play), a stat comparison and a confirm step. Architecture-wise this
 * is the only place that enumerates `CHARACTER_IDS` by hand — everywhere else
 * reads whichever character the save says, so a third character slots in here
 * as one more card with zero other changes.
 */
export class CharacterSelectScene extends Scene {
  private pointer = new PointerTracker();
  private selected: string = CHARACTER_IDS[0];
  private t = 0;
  private readonly poses = new Map<string, ReturnType<typeof createPose>>();

  override async enter(): Promise<void> {
    this.game.controls.gameplayEnabled = false;
    for (const id of CHARACTER_IDS) this.poses.set(id, createPose());
  }

  override update(dt: number): void {
    this.t += dt;
    this.pointer.update(this.game.controls.input);
    for (const [id, pose] of this.poses) {
      pose.animTime += dt;
      pose.moveSpeed01 = id === this.selected ? 0.55 : 0;
      pose.facing = -Math.PI / 2;
    }
  }

  override render(r: Renderer): void {
    const ctx = r.ctx;
    ctx.save();
    r.clipToView();

    ctx.fillStyle = '#0a0d1f';
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    ctx.textAlign = 'center';
    ctx.font = displayFont(24);
    ctx.fillStyle = C.bone;
    ctx.fillText('CHOOSE YOUR PATH', r.viewWidth / 2, 46);

    const cardW = Math.min(380, r.viewWidth * 0.44);
    const cardH = r.viewHeight - 150;
    const gap = 24;
    const totalW = cardW * 2 + gap;
    const startX = r.viewWidth / 2 - totalW / 2;
    const cardY = 66;

    CHARACTER_IDS.forEach((id, i) => {
      const rect: Rect = { x: startX + i * (cardW + gap), y: cardY, w: cardW, h: cardH };
      this.renderCard(ctx, rect, id);
    });

    this.renderConfirm(ctx, r);
    ctx.restore();
  }

  private renderCard(ctx: CanvasRenderingContext2D, rect: Rect, id: string): void {
    const def = CHARACTERS[id];
    const selected = id === this.selected;
    const hover = this.pointer.hovering(rect);

    ctx.save();
    ctx.fillStyle = selected ? alpha(def.themeColor, 0.1) : alpha(C.deepNight, 0.85);
    ctx.strokeStyle = selected ? def.themeColor : hover ? alpha(C.mist, 0.8) : alpha(C.stoneDark, 0.7);
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 16);
    ctx.fill();
    ctx.stroke();

    // Portrait stage.
    const stageH = rect.h * 0.4;
    const stageCx = rect.x + rect.w / 2;
    const stageCy = rect.y + stageH * 0.62;

    const glow = ctx.createRadialGradient(stageCx, stageCy, 4, stageCx, stageCy, stageH * 0.5);
    glow.addColorStop(0, alpha(def.themeColor, selected ? 0.28 : 0.12));
    glow.addColorStop(1, alpha(def.themeColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(stageCx, stageCy, stageH * 0.5, 0, Math.PI * 2);
    ctx.fill();

    const pose = this.poses.get(id)!;
    ctx.save();
    ctx.translate(0, 0);
    // Portraits render larger than in-world for readability on the select screen.
    const scaleUp = 2.1;
    ctx.translate(stageCx, stageCy + def.sprite.height * scaleUp * 0.4);
    ctx.scale(scaleUp, scaleUp);
    drawActor(ctx, def.sprite, pose, 0, 0, 'high');
    ctx.restore();

    // Name plate.
    ctx.textAlign = 'center';
    ctx.font = displayFont(22);
    ctx.fillStyle = selected ? def.themeColor : C.bone;
    ctx.fillText(def.name, stageCx, rect.y + stageH + 22);
    ctx.font = bodyFont(12, 600);
    ctx.fillStyle = alpha(C.boneDim, 0.9);
    ctx.fillText(def.title, stageCx, rect.y + stageH + 40);

    // Tagline.
    ctx.font = bodyFont(12, 500);
    ctx.fillStyle = alpha(C.haze, 0.95);
    ctx.fillText(`"${def.tagline}"`, stageCx, rect.y + stageH + 62);

    // Complexity pips.
    const pipsY = rect.y + stageH + 84;
    const pipCount = 3;
    const pipSpacing = 14;
    const pipStartX = stageCx - ((pipCount - 1) * pipSpacing) / 2;
    ctx.font = bodyFont(10, 600);
    ctx.fillStyle = alpha(C.boneDim, 0.8);
    ctx.textAlign = 'right';
    ctx.fillText('COMPLEXITY', pipStartX - 12, pipsY + 4);
    for (let p = 0; p < pipCount; p++) {
      ctx.beginPath();
      ctx.arc(pipStartX + p * pipSpacing, pipsY, 4, 0, Math.PI * 2);
      ctx.fillStyle = p < def.complexity ? def.themeColor : alpha(C.stoneDark, 0.8);
      ctx.fill();
    }

    // Stat bars.
    const stats = statsAtLevel(def.baseStats, def.growth, 1);
    let statY = pipsY + 22;
    const barW = rect.w - 48;
    const barX = rect.x + 24;
    for (const key of STAT_ORDER) {
      const value = stats[key];
      const frac = Math.min(1, value / 20);
      ctx.textAlign = 'left';
      ctx.font = bodyFont(10, 600);
      ctx.fillStyle = alpha(C.boneDim, 0.85);
      ctx.fillText(STAT_LABELS[key], barX, statY - 3);
      statBar(ctx, { x: barX, y: statY, w: barW, h: 6 }, frac, def.themeColor,
        { bgColor: alpha(C.void, 0.5) });
      statY += 18;
    }

    ctx.restore();

    if (this.pointer.clicked(rect)) this.selected = id;
  }

  private renderConfirm(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const def = CHARACTERS[this.selected];
    const w = 220;
    const h = 50;
    const rect: Rect = { x: r.viewWidth / 2 - w / 2, y: r.viewHeight - 60, w, h };

    if (button(ctx, this.pointer, rect, `Play as ${def.name}`, { variant: 'primary' })) {
      void this.begin();
    }
  }

  private async begin(): Promise<void> {
    const id = this.selected;
    await this.game.scenes.fadeOut(0.45);
    startNewGame(id);
    this.game.controls.gameplayEnabled = true;
    this.game.scenes.replace(new WorldScene());
  }

  override onBack(): boolean {
    this.game.scenes.pop();
    return true;
  }
}
