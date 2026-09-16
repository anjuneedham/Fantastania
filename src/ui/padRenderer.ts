import { C, alpha, displayFont } from '../art/palette';
import { TAU, clamp01 } from '../engine/math';
import type { Renderer } from '../engine/Renderer';
import type { VirtualPad } from '../engine/VirtualPad';

/**
 * Draws the touch controls on the canvas rather than as DOM elements.
 *
 * Canvas keeps the 60fps path free of layout and style recalculation, and lets
 * the cooldown sweeps animate per-frame without touching the DOM at all.
 */
export function renderPad(ctx: CanvasRenderingContext2D, pad: VirtualPad, r: Renderer): void {
  if (!pad.visible) return;

  ctx.save();
  ctx.setTransform(r.scale, 0, 0, r.scale, r.offsetX * r.dpr, r.offsetY * r.dpr);

  if (pad.stickActive) {
    drawStick(ctx, pad);
  } else {
    drawStickGhost(ctx, r);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const btn of pad.buttons.values()) {
    if (!btn.visible) continue;
    drawButton(ctx, btn);
  }

  ctx.restore();
}

function drawStick(ctx: CanvasRenderingContext2D, pad: VirtualPad): void {
  const { stickBaseX: bx, stickBaseY: by, stickKnobX: kx, stickKnobY: ky } = pad;

  ctx.fillStyle = alpha(C.deepNight, 0.42);
  ctx.beginPath();
  ctx.arc(bx, by, pad.stickBaseRadius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = alpha(C.haze, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Direction wedge: shows which way the stick is reading, which matters when
  // a thumb is covering the knob itself.
  const mag = Math.hypot(pad.axisX, pad.axisY);
  if (mag > 0.05) {
    const a = Math.atan2(pad.axisY, pad.axisX);
    ctx.fillStyle = alpha(C.aether, 0.22 * mag);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, pad.stickBaseRadius, a - 0.5, a + 0.5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = alpha(C.aetherSoft, 0.82);
  ctx.beginPath();
  ctx.arc(kx, ky, 26, 0, TAU);
  ctx.fill();
  ctx.fillStyle = alpha(C.deepNight, 0.55);
  ctx.beginPath();
  ctx.arc(kx, ky, 15, 0, TAU);
  ctx.fill();
}

/** A faint resting hint so a new player knows the left side is the stick. */
function drawStickGhost(ctx: CanvasRenderingContext2D, r: Renderer): void {
  const x = r.safeLeft + 118;
  const y = r.viewHeight - r.safeBottom - 108;
  ctx.strokeStyle = alpha(C.haze, 0.22);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 58, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = alpha(C.haze, 0.14);
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, TAU);
  ctx.fill();
}

interface DrawableButton {
  x: number;
  y: number;
  def: { r: number };
  enabled: boolean;
  down: boolean;
  cooldown: number;
  glyph: string;
  tint: string;
  pressFlash: number;
}

function drawButton(ctx: CanvasRenderingContext2D, btn: DrawableButton): void {
  const r = btn.def.r;
  const pressed = btn.down ? 0.92 : 1;
  const radius = r * pressed;

  ctx.save();
  ctx.translate(btn.x, btn.y);

  // Body.
  ctx.fillStyle = alpha(btn.enabled ? C.duskBlue : C.void, btn.enabled ? 0.72 : 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();

  // Rim, tinted by the ability's school.
  ctx.strokeStyle = alpha(btn.enabled ? btn.tint : C.stoneDark, btn.enabled ? 0.85 : 0.35);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 1.5, 0, TAU);
  ctx.stroke();

  // Cooldown: an unfilled wedge that sweeps away as the ability comes back.
  if (btn.cooldown > 0.001) {
    const sweep = clamp01(btn.cooldown);
    ctx.fillStyle = alpha(C.void, 0.62);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius - 2, -Math.PI / 2, -Math.PI / 2 + TAU * sweep);
    ctx.closePath();
    ctx.fill();
  }

  // Press flash.
  if (btn.pressFlash > 0.01) {
    ctx.strokeStyle = alpha(C.white, btn.pressFlash * 0.7);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4 * (1 - btn.pressFlash), 0, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = btn.enabled ? C.white : alpha(C.boneDim, 0.5);
  ctx.font = displayFont(Math.round(r * 0.72));
  ctx.fillText(btn.glyph, 0, 1);

  ctx.restore();
}
