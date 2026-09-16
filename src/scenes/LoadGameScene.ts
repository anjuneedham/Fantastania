import { C, alpha, bodyFont, displayFont } from '../art/palette';
import type { Renderer } from '../engine/Renderer';
import { Scene } from '../engine/Scene';
import { trySaves } from '../game/saves';
import { SAVE_SLOTS, formatPlaytime, type SlotInfo } from '../game/systems/SaveSystem';
import { button, panel, PointerTracker, sectionTitle, type Rect } from '../ui/widgets';
import { WorldScene } from './WorldScene';

/**
 * A picker over the fixed save slots. Every slot is always shown, empty or
 * not — the player should never wonder whether a slot exists, and a fixed
 * count keeps the storage footprint predictable on a phone.
 */
export class LoadGameScene extends Scene {
  private pointer = new PointerTracker();
  private slots: SlotInfo[] = [];
  private pendingDelete: number | null = null;

  override async enter(): Promise<void> {
    this.game.controls.gameplayEnabled = false;
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const save = trySaves();
    this.slots = save ? await save.listSlots() : [];
  }

  override update(): void {
    this.pointer.update(this.game.controls.input);
  }

  override render(r: Renderer): void {
    const ctx = r.ctx;
    ctx.save();
    r.clipToView();
    ctx.fillStyle = alpha(C.void, 0.72);
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    const panelW = Math.min(560, r.viewWidth - 60);
    const panelH = Math.min(420, r.viewHeight - 60);
    const rect: Rect = { x: r.viewWidth / 2 - panelW / 2, y: r.viewHeight / 2 - panelH / 2, w: panelW, h: panelH };
    panel(ctx, rect, { alpha: 0.97 });

    sectionTitle(ctx, rect.x + 22, rect.y + 34, 'Load Game');

    const rowH = 78;
    let y = rect.y + 54;
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const slot = this.slots.find((s) => s.slot === i) ?? { slot: i, empty: true };
      this.renderSlot(ctx, { x: rect.x + 18, y, w: rect.w - 36, h: rowH - 8 }, slot);
      y += rowH;
    }

    const closeRect: Rect = { x: rect.x + rect.w - 96, y: rect.y + rect.h - 46, w: 78, h: 34 };
    if (button(ctx, this.pointer, closeRect, 'Back')) this.game.scenes.pop();

    ctx.restore();
  }

  private renderSlot(ctx: CanvasRenderingContext2D, rect: Rect, slot: SlotInfo): void {
    ctx.fillStyle = alpha(C.duskBlue, 0.6);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = alpha(C.mist, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();

    if (slot.empty) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = bodyFont(14, 500);
      ctx.fillStyle = alpha(C.boneDim, 0.6);
      ctx.fillText(`Slot ${slot.slot + 1} — Empty`, rect.x + 18, rect.y + rect.h / 2);
      return;
    }

    if (slot.corrupt) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = bodyFont(14, 500);
      ctx.fillStyle = C.blood;
      ctx.fillText(`Slot ${slot.slot + 1} — Unreadable`, rect.x + 18, rect.y + rect.h / 2);
      const delRect: Rect = { x: rect.x + rect.w - 76, y: rect.y + rect.h / 2 - 14, w: 60, h: 28 };
      if (button(ctx, this.pointer, delRect, 'Clear', { variant: 'danger', fontSize: 11 })) {
        void this.deleteSlot(slot.slot);
      }
      return;
    }

    const s = slot.summary!;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = displayFont(15);
    ctx.fillStyle = C.bone;
    ctx.fillText(`${s.characterName} — Level ${s.level}`, rect.x + 18, rect.y + 24);
    ctx.font = bodyFont(11, 500);
    ctx.fillStyle = alpha(C.boneDim, 0.85);
    ctx.fillText(
      `${s.areaName} · ${formatPlaytime(s.playtime)} · ${s.gold}g${s.questName ? ` · ${s.questName}` : ''}`,
      rect.x + 18, rect.y + 42,
    );

    const loadRect: Rect = { x: rect.x + rect.w - 156, y: rect.y + rect.h / 2 - 15, w: 76, h: 30 };
    const delRect: Rect = { x: rect.x + rect.w - 72, y: rect.y + rect.h / 2 - 15, w: 56, h: 30 };
    if (button(ctx, this.pointer, loadRect, 'Load', { variant: 'primary', fontSize: 12 })) {
      void this.loadSlot(slot.slot);
    }
    // Delete needs a second tap: the first arms a "Sure?" state that only
    // that slot's button shows, so a mis-tap never loses progress.
    const armed = this.pendingDelete === slot.slot;
    if (button(ctx, this.pointer, delRect, armed ? 'Sure?' : 'Delete',
      { variant: 'danger', fontSize: 11 })) {
      if (armed) void this.deleteSlot(slot.slot);
      else this.pendingDelete = slot.slot;
    }
  }

  private async loadSlot(slot: number): Promise<void> {
    const save = trySaves();
    if (!save) return;
    await this.game.scenes.fadeOut(0.4);
    const ok = await save.load(slot);
    if (ok) {
      this.game.controls.gameplayEnabled = true;
      this.game.scenes.replace(new WorldScene());
    } else {
      this.game.scenes.fadeIn(0.3);
    }
  }

  private async deleteSlot(slot: number): Promise<void> {
    const save = trySaves();
    if (!save) return;
    await save.deleteSlot(slot);
    this.pendingDelete = null;
    await this.refresh();
  }

  override onBack(): boolean {
    this.game.scenes.pop();
    return true;
  }
}
