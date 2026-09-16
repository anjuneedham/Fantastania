import { clamp, damp } from './math';
import type { Renderer } from './Renderer';

/**
 * A follow camera with world bounds, smoothing and screen shake. World bounds
 * come from the active area so the camera never reveals the void past an area's
 * edge; when an area is smaller than the view it centres instead.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  /** World rectangle the camera may show. */
  bounds = { x: 0, y: 0, w: 4000, h: 4000 };

  private shakeAmount = 0;
  private shakeDecay = 4;
  private shakeX = 0;
  private shakeY = 0;

  /** Follow smoothing rate; higher snaps faster. */
  followRate = 9;

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  follow(targetX: number, targetY: number, dt: number): void {
    this.x = damp(this.x, targetX, this.followRate, dt);
    this.y = damp(this.y, targetY, this.followRate, dt);
  }

  /** Adds trauma; repeated hits stack up to a cap instead of overriding. */
  shake(amount: number): void {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 18);
  }

  update(dt: number, rng: () => number): void {
    if (this.shakeAmount > 0.01) {
      this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeDecay * dt * this.shakeAmount);
      const a = rng() * Math.PI * 2;
      this.shakeX = Math.cos(a) * this.shakeAmount;
      this.shakeY = Math.sin(a) * this.shakeAmount;
    } else {
      this.shakeAmount = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  /** Clamps the camera centre so the view stays inside world bounds. */
  clampToBounds(viewWidth: number, viewHeight: number): void {
    const halfW = viewWidth / (2 * this.zoom);
    const halfH = viewHeight / (2 * this.zoom);
    const b = this.bounds;
    this.x = b.w <= halfW * 2 ? b.x + b.w / 2 : clamp(this.x, b.x + halfW, b.x + b.w - halfW);
    this.y = b.h <= halfH * 2 ? b.y + b.h / 2 : clamp(this.y, b.y + halfH, b.y + b.h - halfH);
  }

  /** Applies the world transform. Caller is responsible for save()/restore(). */
  apply(r: Renderer): void {
    const ctx = r.ctx;
    ctx.translate(r.viewWidth / 2, r.viewHeight / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-Math.round(this.x + this.shakeX), -Math.round(this.y + this.shakeY));
  }

  worldToView(wx: number, wy: number, r: Renderer, out: { x: number; y: number }): void {
    out.x = (wx - this.x - this.shakeX) * this.zoom + r.viewWidth / 2;
    out.y = (wy - this.y - this.shakeY) * this.zoom + r.viewHeight / 2;
  }

  viewToWorld(vx: number, vy: number, r: Renderer, out: { x: number; y: number }): void {
    out.x = (vx - r.viewWidth / 2) / this.zoom + this.x + this.shakeX;
    out.y = (vy - r.viewHeight / 2) / this.zoom + this.y + this.shakeY;
  }

  /** Visible world rect, padded, for culling. */
  visibleRect(r: Renderer, pad = 64): { x: number; y: number; w: number; h: number } {
    const w = r.viewWidth / this.zoom + pad * 2;
    const h = r.viewHeight / this.zoom + pad * 2;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }
}
