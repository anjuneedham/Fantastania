import { C, alpha, bodyFont, displayFont } from '../art/palette';
import { clamp01, easeOutCubic } from '../engine/math';
import { roundRect } from '../art/sprites';
import type { Renderer } from '../engine/Renderer';
import { bus } from '../game/events';

/**
 * Transient notifications (loot, quest updates, locked doors) and area title
 * cards. Canvas-rendered so they cost nothing when the queue is empty, and
 * driven entirely off the event bus — systems announce things without knowing
 * a UI exists.
 */

interface Toast {
  text: string;
  color: string;
  icon?: string;
  life: number;
  maxLife: number;
}

interface TitleCard {
  title: string;
  subtitle?: string;
  life: number;
  maxLife: number;
}

const MAX_VISIBLE = 4;

export class ToastLayer {
  private toasts: Toast[] = [];
  private card: TitleCard | null = null;
  private unsubscribe: (() => void) | null = null;

  attach(): void {
    this.unsubscribe = bus.on('toast', ({ text, color, icon }) => {
      this.push(text, color ?? C.bone, icon);
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  push(text: string, color: string = C.bone, icon?: string): void {
    // Collapse an immediate repeat instead of stacking two identical lines.
    const last = this.toasts[this.toasts.length - 1];
    if (last && last.text === text && last.life > last.maxLife - 0.4) {
      last.life = last.maxLife;
      return;
    }
    this.toasts.push({ text, color, icon, life: 3.2, maxLife: 3.2 });
    if (this.toasts.length > MAX_VISIBLE + 2) this.toasts.shift();
  }

  showTitle(title: string, subtitle?: string, duration = 3.6): void {
    this.card = { title, subtitle, life: duration, maxLife: duration };
  }

  clear(): void {
    this.toasts.length = 0;
    this.card = null;
  }

  update(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
    if (this.card) {
      this.card.life -= dt;
      if (this.card.life <= 0) this.card = null;
    }
  }

  render(ctx: CanvasRenderingContext2D, r: Renderer): void {
    this.renderTitleCard(ctx, r);
    this.renderToasts(ctx, r);
  }

  private renderToasts(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.toasts.length === 0) return;
    const visible = this.toasts.slice(-MAX_VISIBLE);
    // Anchored top-centre-left, clear of the HUD bars and the pause button.
    const baseX = r.viewWidth * 0.5;
    let y = r.safeTop + 96;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const toast of visible) {
      const t = toast.life / toast.maxLife;
      // Slide in over the first 15%, fade out over the last 25%.
      const appear = easeOutCubic(clamp01((1 - t) / 0.15));
      const fade = clamp01(t / 0.25);
      const a = Math.min(appear, fade);
      if (a <= 0.01) {
        y += 34;
        continue;
      }

      ctx.font = bodyFont(14, 600);
      const label = toast.icon ? `${toast.icon}  ${toast.text}` : toast.text;
      const w = ctx.measureText(label).width + 30;
      const x = baseX - w / 2 + (1 - appear) * 20;

      ctx.globalAlpha = a;
      ctx.fillStyle = alpha(C.deepNight, 0.86);
      roundRect(ctx, x, y - 15, w, 30, 9);
      ctx.fill();
      ctx.strokeStyle = alpha(toast.color, 0.65);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Accent bar keeps the category readable at a glance.
      ctx.fillStyle = toast.color;
      roundRect(ctx, x, y - 15, 3.5, 30, 2);
      ctx.fill();

      ctx.fillStyle = C.bone;
      ctx.fillText(label, x + 14, y + 1);
      ctx.globalAlpha = 1;

      y += 36;
    }
  }

  private renderTitleCard(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const card = this.card;
    if (!card) return;
    const t = card.life / card.maxLife;
    const appear = easeOutCubic(clamp01((1 - t) / 0.22));
    const fade = clamp01(t / 0.3);
    const a = Math.min(appear, fade);

    const cx = r.viewWidth / 2;
    const cy = r.viewHeight * 0.3;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = displayFont(34);
    ctx.fillStyle = alpha(C.void, 0.6);
    ctx.fillText(card.title, cx + 2, cy + 2);
    ctx.fillStyle = C.bone;
    ctx.fillText(card.title, cx, cy);

    // Rules either side of the title, growing as the card appears.
    const width = ctx.measureText(card.title).width;
    const rule = (width / 2 + 26) * appear;
    ctx.strokeStyle = alpha(C.aether, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - rule, cy + 24);
    ctx.lineTo(cx + rule, cy + 24);
    ctx.stroke();

    if (card.subtitle) {
      ctx.font = bodyFont(14, 500);
      ctx.fillStyle = alpha(C.haze, 0.95);
      ctx.fillText(card.subtitle, cx, cy + 44);
    }
    ctx.restore();
  }
}

/** Shared instance; scenes attach and detach it. */
export const toasts = new ToastLayer();
