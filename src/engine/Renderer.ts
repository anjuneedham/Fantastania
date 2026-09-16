import { clamp } from './math';

/**
 * Canvas2D renderer with a fixed logical design space.
 *
 * The game is authored against a constant logical *height* (VIEW_HEIGHT) while
 * the logical width flexes with the device aspect ratio, clamped to a sane
 * range. That means a 20:9 phone genuinely sees more of the world horizontally
 * instead of being letterboxed, while a square-ish tablet is letterboxed only
 * at the extremes. Everything in the game — world units, UI, touch controls —
 * is expressed in these logical units, so nothing needs per-device tuning.
 */
export const VIEW_HEIGHT = 540;
export const MIN_VIEW_WIDTH = 780;
export const MAX_VIEW_WIDTH = 1280;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  /** Logical view size in design units. */
  viewWidth = 960;
  readonly viewHeight = VIEW_HEIGHT;

  /** Device pixels per logical unit, including devicePixelRatio. */
  scale = 1;
  /** Letterbox offset in CSS pixels. */
  offsetX = 0;
  offsetY = 0;
  dpr = 1;

  /** Safe-area insets in logical units (notches, gesture bars). */
  safeTop = 0;
  safeRight = 0;
  safeBottom = 0;
  safeLeft = 0;

  /** Rendering budget hint; UI can drop effects when the device struggles. */
  quality: 'high' | 'low' = 'high';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas2D is not available in this browser.');
    this.ctx = ctx;
  }

  /**
   * Recomputes backing-store size for the current element size. Cheap enough to
   * call on every resize event, but it early-outs when nothing changed so the
   * canvas is not needlessly reallocated (which would clear it).
   */
  resize(cssWidth: number, cssHeight: number): boolean {
    // Cap DPR: a 3x backing store on a mid-range phone costs more than it looks
    // like it's worth, and this art style does not benefit past 2x.
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const aspect = cssWidth / Math.max(1, cssHeight);
    const viewWidth = clamp(Math.round(VIEW_HEIGHT * aspect), MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);

    const scale = Math.min(cssWidth / viewWidth, cssHeight / VIEW_HEIGHT);
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);

    const changed =
      this.canvas.width !== targetW ||
      this.canvas.height !== targetH ||
      this.viewWidth !== viewWidth;

    if (this.canvas.width !== targetW) this.canvas.width = targetW;
    if (this.canvas.height !== targetH) this.canvas.height = targetH;

    this.dpr = dpr;
    this.viewWidth = viewWidth;
    this.scale = scale * dpr;
    this.offsetX = (cssWidth - viewWidth * scale) * 0.5;
    this.offsetY = (cssHeight - VIEW_HEIGHT * scale) * 0.5;
    this.readSafeAreas(scale);
    return changed;
  }

  /**
   * Reads the CSS env(safe-area-inset-*) values that a host page exposes as
   * custom properties and converts them into logical units.
   */
  private readSafeAreas(cssScale: number): void {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string): number => {
      const raw = styles.getPropertyValue(name);
      const value = parseFloat(raw);
      return Number.isFinite(value) ? value / Math.max(cssScale, 0.0001) : 0;
    };
    this.safeTop = read('--safe-top');
    this.safeRight = read('--safe-right');
    this.safeBottom = read('--safe-bottom');
    this.safeLeft = read('--safe-left');
  }

  /** Converts a client (CSS pixel) coordinate into logical view space. */
  toView(clientX: number, clientY: number, out: { x: number; y: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssScale = this.scale / this.dpr;
    out.x = (clientX - rect.left - this.offsetX) / cssScale;
    out.y = (clientY - rect.top - this.offsetY) / cssScale;
  }

  /** Begins a frame: resets the transform to logical view space. */
  begin(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Letterbox bars.
    if (this.offsetX > 0.5 || this.offsetY > 0.5) {
      ctx.fillStyle = '#05060c';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(
      this.scale, 0, 0, this.scale,
      this.offsetX * this.dpr, this.offsetY * this.dpr,
    );
    ctx.imageSmoothingEnabled = true;
  }

  /** Clips subsequent drawing to the logical view rect. */
  clipToView(): void {
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.viewWidth, this.viewHeight);
    this.ctx.clip();
  }
}
