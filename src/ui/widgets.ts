import { C, alpha, bodyFont, darken, displayFont, lighten } from '../art/palette';
import { roundRect } from '../art/sprites';
import { clamp01, pointInRect } from '../engine/math';
import type { Input } from '../engine/Input';
import type { Renderer } from '../engine/Renderer';

/**
 * A tiny immediate-mode-flavoured widget kit for canvas menus.
 *
 * Every menu screen in the game (main menu, character select, pause tabs,
 * settings) is built from these few primitives rather than bespoke drawing
 * code per screen, so they share one visual language and one input model:
 * a widget is a rectangle, it knows how to draw itself, and a `PointerTracker`
 * tells it whether it was just clicked this frame.
 *
 * This is deliberately not a retained scene graph — screens rebuild their
 * widget list each frame from live state (selected character, current tab,
 * slider values), the same way React-ish immediate-mode UIs do, which keeps a
 * menu's code as close as possible to "what does this look like right now"
 * with no separate synchronisation step.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tracks one pointer's press/release across a frame for hit-testing widgets. */
export class PointerTracker {
  hoverX = -1;
  hoverY = -1;
  /** True for the whole tick a click/tap completed inside some widget. */
  private justClicked = false;
  private clickX = -1;
  private clickY = -1;
  /** True while a pointer is held down, for press-visual feedback. */
  downX = -1;
  downY = -1;
  isDown = false;
  /** The touch pointer id currently claimed, if any. */
  private touchId: number | null = null;

  /**
   * Reads Input's own per-tick-latched primitives (`mouseJustUp`,
   * `wasJustReleased`) rather than detecting down->up edges itself. Those
   * flags stay true for an entire tick and are cleared once, in
   * `Input.endFrame()` — exactly like `justClicked` needs to behave. Deriving
   * it locally with a "reset to false at the top of this call" pattern is
   * NOT safe here: the fixed-timestep loop can call `Scene.update()` (and so
   * this) more than once per rendered frame, and a second call would wipe out
   * a click the first call had just detected, before `render()` ever saw it.
   * Mirroring Input's flags is idempotent — calling this five times in one
   * tick and calling it once produce the same end state.
   */
  update(input: Input): void {
    if (!input.touchActive) {
      this.hoverX = input.mouseX;
      this.hoverY = input.mouseY;
      this.isDown = input.mouseDown;
      if (input.mouseDown) {
        this.downX = input.mouseX;
        this.downY = input.mouseY;
      }
      this.justClicked = input.mouseJustUp;
      if (input.mouseJustUp) {
        this.clickX = input.mouseX;
        this.clickY = input.mouseY;
      }
      return;
    }

    // Touch: claim the first unclaimed pointer as "the UI pointer". Menus
    // never coexist with gameplay's own pointer claims (the pad is hidden
    // while a menu is open), so this never competes with them.
    if (this.touchId === null) {
      const claimed = input.claimPointer('menu', () => true);
      if (claimed) this.touchId = claimed.id;
    }

    if (this.touchId === null) {
      this.justClicked = false;
      return;
    }

    const p = input.pointerById(this.touchId);
    if (p) {
      this.isDown = true;
      this.downX = p.x;
      this.downY = p.y;
      this.hoverX = p.x;
      this.hoverY = p.y;
    }

    // Deleted from Input's pointer map the instant the real up event fires,
    // so `p` is already gone on this same release tick — `wasJustReleased`
    // (latched until `endFrame`) is what tells release-this-tick apart from
    // "gone because the tick already moved on", which is what lets this
    // report a click for every `update()` call in the release tick without
    // losing it, then free the claim on the tick after.
    const releasedThisTick = input.wasJustReleased(this.touchId);
    this.justClicked = releasedThisTick;
    if (releasedThisTick) {
      this.isDown = false;
      this.clickX = this.downX;
      this.clickY = this.downY;
    } else if (!p) {
      this.touchId = null;
      this.isDown = false;
    }
  }

  /** True exactly once, the frame the pointer released inside `rect`. */
  clicked(rect: Rect): boolean {
    return this.justClicked && pointInRect(this.clickX, this.clickY, rect);
  }

  hovering(rect: Rect): boolean {
    return pointInRect(this.hoverX, this.hoverY, rect);
  }

  pressing(rect: Rect): boolean {
    return this.isDown && pointInRect(this.downX, this.downY, rect);
  }

  /** Consumes the click so nothing underneath also reacts to it this frame. */
  consumeClick(): void {
    this.justClicked = false;
  }
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_COLORS: Record<ButtonVariant, { fill: string; border: string; text: string }> = {
  primary: { fill: C.aetherDim, border: C.aether, text: C.white },
  secondary: { fill: C.duskBlue, border: C.mist, text: C.bone },
  ghost: { fill: 'transparent', border: C.stoneDark, text: C.boneDim },
  danger: { fill: '#5a1c26', border: C.blood, text: C.white },
};

/** Draws a button and reports whether it was clicked. Also handles disabled state. */
export function button(
  ctx: CanvasRenderingContext2D,
  pointer: PointerTracker,
  rect: Rect,
  label: string,
  opts: { variant?: ButtonVariant; disabled?: boolean; icon?: string; fontSize?: number } = {},
): boolean {
  const variant = opts.variant ?? 'secondary';
  const colors = VARIANT_COLORS[variant];
  const disabled = opts.disabled ?? false;
  const hover = !disabled && pointer.hovering(rect);
  const pressed = !disabled && pointer.pressing(rect);
  const clicked = !disabled && pointer.clicked(rect);

  const scale = pressed ? 0.97 : 1;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = rect.w * scale;
  const h = rect.h * scale;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.save();
  if (disabled) ctx.globalAlpha = 0.42;

  if (colors.fill !== 'transparent') {
    ctx.fillStyle = hover && !disabled ? lighten(colors.fill, 0.08) : colors.fill;
    roundRect(ctx, x, y, w, h, Math.min(10, h / 2));
    ctx.fill();
  }
  ctx.strokeStyle = hover && !disabled ? lighten(colors.border, 0.15) : colors.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, Math.min(10, h / 2));
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = bodyFont(opts.fontSize ?? 15, 600);
  ctx.fillStyle = colors.text;
  const text = opts.icon ? `${opts.icon}  ${label}` : label;
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();

  return clicked;
}

/** A borderless clickable label/icon — used for tabs and small icon buttons. */
export function iconButton(
  ctx: CanvasRenderingContext2D,
  pointer: PointerTracker,
  rect: Rect,
  glyph: string,
  opts: { active?: boolean; color?: string } = {},
): boolean {
  const hover = pointer.hovering(rect);
  const active = opts.active ?? false;
  const color = opts.color ?? C.bone;

  if (active || hover) {
    ctx.fillStyle = alpha(active ? C.aether : C.mist, active ? 0.18 : 0.1);
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = displayFont(Math.round(rect.h * 0.5));
  ctx.fillStyle = active ? C.aetherSoft : color;
  ctx.fillText(glyph, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);

  return pointer.clicked(rect);
}

/** Tab strip. Returns the index that was clicked, or -1. */
export function tabBar(
  ctx: CanvasRenderingContext2D,
  pointer: PointerTracker,
  rect: Rect,
  labels: readonly string[],
  activeIndex: number,
): number {
  const tabW = rect.w / labels.length;
  let clicked = -1;

  for (let i = 0; i < labels.length; i++) {
    const tabRect: Rect = { x: rect.x + i * tabW, y: rect.y, w: tabW, h: rect.h };
    const active = i === activeIndex;
    const hover = pointer.hovering(tabRect);

    if (active) {
      ctx.fillStyle = alpha(C.slate, 0.9);
      roundRect(ctx, tabRect.x + 3, tabRect.y, tabW - 6, rect.h, 8);
      ctx.fill();
    } else if (hover) {
      ctx.fillStyle = alpha(C.mist, 0.12);
      roundRect(ctx, tabRect.x + 3, tabRect.y, tabW - 6, rect.h, 8);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = bodyFont(13, active ? 700 : 500);
    ctx.fillStyle = active ? C.aetherSoft : alpha(C.boneDim, 0.85);
    ctx.fillText(labels[i], tabRect.x + tabW / 2, tabRect.y + rect.h / 2 + 1);

    if (active) {
      ctx.strokeStyle = C.aether;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tabRect.x + 10, tabRect.y + rect.h - 2);
      ctx.lineTo(tabRect.x + tabW - 10, tabRect.y + rect.h - 2);
      ctx.stroke();
    }

    if (pointer.clicked(tabRect)) clicked = i;
  }
  return clicked;
}

/** A horizontal slider, 0..1. Returns the new value (same as input unless dragged). */
export function slider(
  ctx: CanvasRenderingContext2D,
  pointer: PointerTracker,
  rect: Rect,
  value: number,
  label: string,
): number {
  const trackY = rect.y + rect.h / 2;
  const knobX = rect.x + clamp01(value) * rect.w;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = bodyFont(13, 600);
  ctx.fillStyle = C.bone;
  ctx.fillText(label, rect.x, rect.y - 4);
  ctx.textAlign = 'right';
  ctx.fillStyle = alpha(C.boneDim, 0.8);
  ctx.fillText(`${Math.round(clamp01(value) * 100)}%`, rect.x + rect.w, rect.y - 4);

  ctx.strokeStyle = alpha(C.mist, 0.5);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rect.x, trackY);
  ctx.lineTo(rect.x + rect.w, trackY);
  ctx.stroke();

  ctx.strokeStyle = C.aether;
  ctx.beginPath();
  ctx.moveTo(rect.x, trackY);
  ctx.lineTo(knobX, trackY);
  ctx.stroke();

  const grabRect: Rect = { x: rect.x - 12, y: rect.y, w: rect.w + 24, h: rect.h };
  let next = value;
  if (pointer.pressing(grabRect) || pointer.clicked(grabRect)) {
    next = clamp01((pointer.downX - rect.x) / rect.w);
  }

  const knobHover = pointer.hovering({ x: knobX - 10, y: rect.y, w: 20, h: rect.h });
  ctx.fillStyle = knobHover || pointer.pressing(grabRect) ? C.aetherSoft : C.aether;
  ctx.beginPath();
  ctx.arc(rect.x + clamp01(next) * rect.w, trackY, 8, 0, Math.PI * 2);
  ctx.fill();

  return next;
}

/** An on/off pill toggle. Returns the new state. */
export function toggle(
  ctx: CanvasRenderingContext2D,
  pointer: PointerTracker,
  rect: Rect,
  value: boolean,
  label: string,
): boolean {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = bodyFont(14, 600);
  ctx.fillStyle = C.bone;
  ctx.fillText(label, rect.x, rect.y + rect.h / 2);

  const pillW = 44;
  const pillH = 22;
  const pillX = rect.x + rect.w - pillW;
  const pillY = rect.y + rect.h / 2 - pillH / 2;

  ctx.fillStyle = value ? C.aetherDim : darken(C.mist, 0.3);
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = value ? C.aether : alpha(C.mist, 0.6);
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();

  const knobX = value ? pillX + pillW - pillH / 2 - 2 : pillX + pillH / 2 + 2;
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.arc(knobX, pillY + pillH / 2, pillH / 2 - 4, 0, Math.PI * 2);
  ctx.fill();

  return pointer.clicked({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }) ? !value : value;
}

/** A translucent rounded panel used as the backing for every menu screen. */
export function panel(
  ctx: CanvasRenderingContext2D, rect: Rect, opts: { radius?: number; alpha?: number } = {},
): void {
  ctx.fillStyle = alpha(C.deepNight, opts.alpha ?? 0.92);
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, opts.radius ?? 16);
  ctx.fill();
  ctx.strokeStyle = alpha(C.mist, 0.5);
  ctx.lineWidth = 1.5;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, opts.radius ?? 16);
  ctx.stroke();
}

/** Standard section header text used across every menu. */
export function sectionTitle(
  ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color = C.aetherSoft,
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = displayFont(14);
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), x, y);
}

/** A labelled progress bar (health/mana/xp), reused by the HUD and menus. */
export function statBar(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  fraction: number,
  fillColor: string,
  opts: { bgColor?: string; label?: string; textColor?: string } = {},
): void {
  ctx.fillStyle = opts.bgColor ?? alpha(C.void, 0.6);
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fill();
  const w = Math.max(0, Math.min(rect.w, rect.w * clamp01(fraction)));
  if (w > 0.5) {
    ctx.fillStyle = fillColor;
    roundRect(ctx, rect.x, rect.y, w, rect.h, rect.h / 2);
    ctx.fill();
  }
  if (opts.label) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = bodyFont(Math.max(9, rect.h * 0.55), 700);
    ctx.fillStyle = opts.textColor ?? alpha(C.white, 0.92);
    ctx.fillText(opts.label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  }
}

export { clamp01, pointInRect };
export type { Renderer };
