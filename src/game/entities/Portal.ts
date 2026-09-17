import { C, alpha, displayFont } from '../../art/palette';
import { TAU, clamp01, dist2 } from '../../engine/math';
import { fx } from '../../engine/Rng';
import type { PortalDef } from '../areaTypes';
import { Entity, type WorldLike } from './Entity';

/**
 * An area transition. Portals render their own gateway, detect the player
 * standing in them, and report whether they are currently passable — the scene
 * decides what to do about it.
 */
export class Portal extends Entity {
  override solid = false;
  readonly def: PortalDef;

  /** 0..1 how close the player is; drives the glow and the label fade. */
  proximity = 0;
  /** Set by the scene each frame from the requirement check. */
  unlocked = true;

  private t = 0;

  constructor(def: PortalDef) {
    super();
    this.def = def;
    this.x = def.x;
    this.y = def.y;
    this.radius = def.radius;
  }

  /** Portals draw beneath actors. */
  override get depth(): number {
    return -Infinity;
  }

  update(dt: number, world: WorldLike): void {
    this.t += dt;
    const player = world.nearestActor(this.x, this.y, 'player', 600);
    if (!player) {
      this.proximity = 0;
      return;
    }
    const d = Math.sqrt(dist2(this.x, this.y, player.x, player.y));
    this.proximity = clamp01(1 - (d - this.radius) / 180);

    // Motes drifting into an active gateway; a cheap "this is a door" signal.
    if (this.proximity > 0.2 && fx.chance(dt * 12 * this.proximity)) {
      const a = fx.angle();
      const r = this.radius * fx.range(0.9, 1.5);
      world.emitParticles(
        'spark',
        this.x + Math.cos(a) * r,
        this.y + Math.sin(a) * r * 0.55,
        1,
        this.unlocked ? STYLE_COLORS[this.def.style ?? 'path'] : C.stone,
        { speed: 30, size: 2.4, life: 0.9, rise: 18 },
      );
    }
  }

  /** True when the player entity is inside the trigger. */
  contains(x: number, y: number): boolean {
    const r = this.radius;
    return dist2(this.x, this.y, x, y) <= r * r;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const color = this.unlocked ? STYLE_COLORS[this.def.style ?? 'path'] : C.stone;
    const pulse = 0.72 + Math.sin(this.t * 2.2) * 0.12;
    const glow = 0.3 + this.proximity * 0.7;
    const r = this.radius;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Ground pool.
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
    grad.addColorStop(0, alpha(color, 0.3 * glow * pulse));
    grad.addColorStop(0.6, alpha(color, 0.1 * glow));
    grad.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.5, r * 0.85, 0, 0, TAU);
    ctx.fill();

    // Threshold ring.
    ctx.strokeStyle = alpha(color, 0.5 + glow * 0.4);
    ctx.lineWidth = 2.5;
    ctx.setLineDash(this.unlocked ? [] : [7, 7]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * pulse, r * 0.55 * pulse, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rift portals get a vertical tear as well as the ground pool.
    if (this.def.style === 'rift') {
      const h = r * 2.1;
      const tear = ctx.createLinearGradient(0, -h, 0, 0);
      tear.addColorStop(0, alpha(color, 0));
      tear.addColorStop(0.45, alpha(color, 0.38 * glow));
      tear.addColorStop(1, alpha(color, 0.06));
      ctx.fillStyle = tear;
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.5, r * 0.42 * pulse, h * 0.5, 0, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Label floats above the portal once the player is close. */
  override renderOverlay(ctx: CanvasRenderingContext2D): void {
    if (this.proximity < 0.08) return;
    const a = clamp01(this.proximity * 1.4);
    const y = this.y - this.radius * 0.9 - 26;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = displayFont(15);
    const text = this.def.label;
    const w = ctx.measureText(text).width + 26;

    ctx.fillStyle = alpha(C.void, 0.62 * a);
    ctx.beginPath();
    ctx.roundRect(this.x - w / 2, y - 14, w, 27, 13);
    ctx.fill();
    ctx.strokeStyle = alpha(this.unlocked ? C.aether : C.blood, 0.5 * a);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = alpha(this.unlocked ? C.bone : C.boneDim, a);
    ctx.fillText(text, this.x, y);

    if (!this.unlocked) {
      ctx.font = displayFont(13);
      ctx.fillStyle = alpha(C.blood, a);
      ctx.fillText('🔒', this.x, y - 24);
    }
  }
}

const STYLE_COLORS: Record<NonNullable<PortalDef['style']>, string> = {
  path: C.gold,
  archway: C.emberHot,
  cave: C.violet,
  rift: C.aether,
  door: C.ember,
};
