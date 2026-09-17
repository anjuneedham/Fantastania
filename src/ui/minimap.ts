import { C, alpha, bodyFont } from '../art/palette';
import { TAU } from '../engine/math';
import type { Player } from '../game/entities/Player';
import { state } from '../game/GameState';
import type { LoadedArea } from '../game/systems/AreaManager';
import type { Renderer } from '../engine/Renderer';

const RADIUS = 52;
/** World units shown from centre to rim — a glance-range radar, not a map. */
const RANGE = 640;

/**
 * The always-on radar: current area only, centred on the player, north-up.
 * Gated on `settings.showMinimap` by the caller (WorldScene), the same way
 * every other settings toggle is read at its point of use rather than
 * threaded through as a prop.
 *
 * Deliberately reads the *live* `LoadedArea` — its `landmarks`/`secrets`
 * arrays shrink as WorldScene discovers them (see `checkDiscoveries`), which
 * is exactly right here: an undiscovered point of interest is worth a blip,
 * one you have already found is not. The full-area picture across every
 * region, discovered or not, is what the World Map pause-menu tab is for.
 */
export function renderMinimap(
  ctx: CanvasRenderingContext2D, r: Renderer, area: LoadedArea, player: Player,
): void {
  if (!state.settings.showMinimap) return;

  const cx = r.viewWidth / 2;
  const cy = r.safeTop + RADIUS + 12;
  const scale = RADIUS / RANGE;
  const project = (wx: number, wy: number) => ({
    x: cx + (wx - player.x) * scale,
    y: cy + (wy - player.y) * scale,
  });
  const inRange = (p: { x: number; y: number }) => Math.hypot(p.x - cx, p.y - cy) <= RADIUS;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, TAU);
  ctx.clip();

  ctx.fillStyle = alpha(C.void, 0.55);
  ctx.fillRect(cx - RADIUS, cy - RADIUS, RADIUS * 2, RADIUS * 2);

  for (const portal of area.portals) {
    const p = project(portal.x, portal.y);
    if (!inRange(p)) continue;
    ctx.fillStyle = portal.unlocked ? C.aether : alpha(C.blood, 0.85);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, TAU);
    ctx.fill();
  }

  for (const lm of area.landmarks) {
    const p = project(lm.x, lm.y);
    if (!inRange(p)) continue;
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, TAU);
    ctx.fill();
  }

  const boss = area.def.boss;
  if (boss && !state.hasFlag(boss.defeatFlag)) {
    const p = project(boss.x, boss.y);
    if (inRange(p)) {
      ctx.fillStyle = C.blood;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha(C.white, 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = alpha(C.mist, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, TAU);
  ctx.stroke();

  // The player is always the centre point; only their facing needs drawing.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.pose.facing + Math.PI / 2);
  ctx.fillStyle = C.aetherSoft;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = bodyFont(10, 700);
  ctx.fillStyle = alpha(C.bone, 0.85);
  ctx.fillText(area.def.name, cx, cy + RADIUS + 4);
}
