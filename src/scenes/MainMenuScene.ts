import { C, alpha, bodyFont } from '../art/palette';
import type { Renderer } from '../engine/Renderer';
import { Scene } from '../engine/Scene';
import { TAU } from '../engine/math';
import { fx } from '../engine/Rng';
import { trySaves, saves as savesOrThrow } from '../game/saves';
import { formatPlaytime, type SlotInfo } from '../game/systems/SaveSystem';
import { button, PointerTracker, type Rect } from '../ui/widgets';
import { CharacterSelectScene } from './CharacterSelectScene';
import { LoadGameScene } from './LoadGameScene';
import { SettingsScene } from './SettingsScene';
import { WorldScene } from './WorldScene';

/**
 * The title screen: PLAY / CHARACTERS / SETTINGS, with a CONTINUE button that
 * only appears once a save exists. This is the game's front door on both web
 * and Android, so it owns its own drifting-mote backdrop rather than reusing
 * any in-game area — nothing here should imply a specific place in Aetheria.
 */
export class MainMenuScene extends Scene {
  private pointer = new PointerTracker();
  private slots: SlotInfo[] = [];
  private continueSlot: SlotInfo | null = null;
  private t = 0;
  private motes: Array<{ x: number; y: number; speed: number; size: number; phase: number }> = [];

  override async enter(): Promise<void> {
    this.game.controls.pad.releaseAll();
    this.game.controls.gameplayEnabled = false;
    this.game.audio.playMusic('theme_menu');

    const rng = fx;
    for (let i = 0; i < 40; i++) {
      this.motes.push({
        x: rng.next(), y: rng.next(), speed: rng.range(6, 18),
        size: rng.range(1, 3), phase: rng.angle(),
      });
    }

    await this.refreshSlots();
  }

  private async refreshSlots(): Promise<void> {
    const save = trySaves();
    if (!save) return;
    this.slots = await save.listSlots();
    const usable = this.slots.filter((s) => !s.empty && !s.corrupt);
    usable.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    this.continueSlot = usable[0] ?? null;
  }

  override resume(): void {
    void this.refreshSlots();
    this.game.controls.gameplayEnabled = false;
    this.game.audio.playMusic('theme_menu');
  }

  override update(dt: number): void {
    this.t += dt;
    this.pointer.update(this.game.controls.input);
  }

  override render(r: Renderer): void {
    const ctx = r.ctx;
    ctx.save();
    r.clipToView();
    this.renderBackdrop(ctx, r);
    this.renderTitle(ctx, r);
    this.renderButtons(ctx, r);
    this.renderFooter(ctx, r);
    ctx.restore();
  }

  private renderBackdrop(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const grad = ctx.createRadialGradient(
      r.viewWidth * 0.5, r.viewHeight * 0.32, 40,
      r.viewWidth * 0.5, r.viewHeight * 0.32, r.viewWidth * 0.7,
    );
    grad.addColorStop(0, '#1b2150');
    grad.addColorStop(0.55, '#0b0e22');
    grad.addColorStop(1, '#05060c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    for (const m of this.motes) {
      const x = m.x * r.viewWidth;
      const y = ((m.y * r.viewHeight - this.t * m.speed) % r.viewHeight + r.viewHeight) % r.viewHeight;
      const tw = 0.4 + Math.sin(this.t * 1.5 + m.phase) * 0.3;
      ctx.fillStyle = alpha(C.aether, 0.35 * tw);
      ctx.beginPath();
      ctx.arc(x, y, m.size, 0, TAU);
      ctx.fill();
    }

    // Ground silhouette, so the title screen reads as "a place" without being
    // any specific one.
    ctx.fillStyle = '#05060c';
    ctx.beginPath();
    ctx.moveTo(0, r.viewHeight);
    ctx.lineTo(0, r.viewHeight * 0.82);
    for (let x = 0; x <= r.viewWidth; x += 40) {
      const y = r.viewHeight * 0.82 + Math.sin(x * 0.008 + 1.4) * 14 + Math.sin(x * 0.021) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(r.viewWidth, r.viewHeight);
    ctx.closePath();
    ctx.fill();
  }

  private renderTitle(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const cx = r.viewWidth / 2;
    const cy = r.viewHeight * 0.26;
    const pulse = 1 + Math.sin(this.t * 1.4) * 0.015;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(52 * pulse)}px "Trebuchet MS", "Gill Sans", system-ui, sans-serif`;
    ctx.shadowColor = alpha(C.aether, 0.5);
    ctx.shadowBlur = 26;
    ctx.fillStyle = C.bone;
    ctx.fillText('FANTASTANIA', cx, cy);
    ctx.shadowBlur = 0;

    ctx.font = bodyFont(15, 500);
    ctx.fillStyle = alpha(C.haze, 0.9);
    const subW = ctx.measureText('REALM OF AETHERIA').width;
    ctx.save();
    ctx.letterSpacing = '6px';
    ctx.fillText('REALM OF AETHERIA', cx + 3, cy + 40);
    ctx.restore();
    void subW;
    ctx.restore();
  }

  private renderButtons(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const w = Math.min(340, r.viewWidth * 0.42);
    const h = 50;
    const gap = 14;
    const hasContinue = this.continueSlot !== null;
    const count = hasContinue ? 4 : 3;
    const totalH = count * h + (count - 1) * gap;
    let y = r.viewHeight * 0.52 - totalH / 2 + (hasContinue ? 20 : 0);
    const x = r.viewWidth / 2 - w / 2;

    if (hasContinue) {
      const rect: Rect = { x, y, w, h };
      const slot = this.continueSlot!;
      if (button(ctx, this.pointer, rect, `Continue — ${slot.summary!.characterName} Lv.${slot.summary!.level}`,
        { variant: 'primary' })) {
        this.playSelectedSlot(slot.slot);
      }
      ctx.textAlign = 'center';
      ctx.font = bodyFont(11, 500);
      ctx.fillStyle = alpha(C.boneDim, 0.8);
      ctx.fillText(
        `${slot.summary!.areaName} · ${formatPlaytime(slot.summary!.playtime)} played`,
        r.viewWidth / 2, y + h + 13,
      );
      y += h + gap + 10;
    }

    if (button(ctx, this.pointer, { x, y, w, h }, 'Play', { variant: hasContinue ? 'secondary' : 'primary' })) {
      this.game.scenes.push(new CharacterSelectScene());
    }
    y += h + gap;

    if (button(ctx, this.pointer, { x, y, w, h }, 'Load Game', { disabled: this.slots.every((s) => s.empty) })) {
      this.game.scenes.push(new LoadGameScene());
    }
    y += h + gap;

    if (button(ctx, this.pointer, { x, y, w, h }, 'Settings')) {
      this.game.scenes.push(new SettingsScene());
    }
  }

  private renderFooter(ctx: CanvasRenderingContext2D, r: Renderer): void {
    ctx.textAlign = 'center';
    ctx.font = bodyFont(11, 500);
    ctx.fillStyle = alpha(C.stone, 0.7);
    ctx.fillText('v0.1 — Chapter One: The Warden’s Vigil', r.viewWidth / 2, r.viewHeight - 18);
  }

  private async playSelectedSlot(slot: number): Promise<void> {
    const save = savesOrThrow();
    this.game.controls.gameplayEnabled = true;
    await this.game.scenes.fadeOut(0.4);
    const ok = await save.load(slot);
    if (ok) {
      this.game.scenes.replace(new WorldScene());
    } else {
      this.game.scenes.fadeIn(0.3);
      this.game.controls.gameplayEnabled = false;
    }
  }

  override onBack(): boolean {
    return true; // The title screen is the root; swallow back so the app doesn't exit here.
  }
}
