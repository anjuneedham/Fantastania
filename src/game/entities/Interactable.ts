import { C, alpha, bodyFont, displayFont } from '../../art/palette';
import { roundRect } from '../../art/sprites';
import { TAU, clamp01, dist2 } from '../../engine/math';
import { Entity, type WorldLike } from './Entity';
import type { Player } from './Player';

/**
 * Anything the player can walk up to and use: chests, NPCs, shrines, levers.
 *
 * The scene picks the single nearest available interactable each frame and
 * routes the interact button to it, so there is never ambiguity about what the
 * button will do — and the touch layout only ever needs one Use button.
 */
export abstract class Interactable extends Entity {
  /** Distance at which the prompt appears. */
  interactRadius = 46;
  /** Short verb-phrase shown in the prompt, e.g. "Open" or "Talk". */
  abstract get prompt(): string;
  /** Name shown above the prompt. */
  abstract get title(): string;

  /** 0..1 how close the player is; drives the prompt fade. */
  proximity = 0;
  /** Set by the scene: this is the interactable the button would trigger. */
  focused = false;

  /** False hides the prompt entirely (already looted, requirement unmet). */
  get available(): boolean {
    return true;
  }

  /** Runs the interaction. Return false to indicate nothing happened. */
  abstract interact(world: WorldLike, player: Player): boolean;

  /** Updates proximity. Subclasses call this from their own update. */
  protected trackProximity(world: WorldLike): void {
    const player = world.nearestActor(this.x, this.y, 'player', 400);
    if (!player) {
      this.proximity = 0;
      return;
    }
    const d = Math.sqrt(dist2(this.x, this.y, player.x, player.y));
    this.proximity = clamp01(1 - (d - this.interactRadius) / 70);
  }

  /** Draws the floating prompt. Shared by every interactable. */
  protected renderPrompt(ctx: CanvasRenderingContext2D, offsetY: number): void {
    if (this.proximity < 0.05 || !this.available) return;
    const a = clamp01(this.proximity);
    const y = this.y - offsetY;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = displayFont(13);
    const title = this.title;
    const action = this.prompt;
    const titleW = ctx.measureText(title).width;
    ctx.font = bodyFont(11, 600);
    const actionW = ctx.measureText(action).width + 34;
    const w = Math.max(titleW + 26, actionW);

    ctx.globalAlpha = a;
    ctx.fillStyle = alpha(C.deepNight, 0.86);
    roundRect(ctx, this.x - w / 2, y - 26, w, 44, 10);
    ctx.fill();
    ctx.strokeStyle = alpha(this.focused ? C.aether : C.mist, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = displayFont(13);
    ctx.fillStyle = C.bone;
    ctx.fillText(title, this.x, y - 12);

    // The key hint only makes sense on a keyboard; touch has the Use button.
    ctx.font = bodyFont(11, 600);
    ctx.fillStyle = this.focused ? C.aether : alpha(C.boneDim, 0.85);
    ctx.fillText(action, this.x, y + 8);

    if (this.focused) {
      // A pulsing ring on the ground marks the active target unambiguously.
      ctx.strokeStyle = alpha(C.aether, 0.4 + Math.sin(performance.now() / 260) * 0.2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.interactRadius * 0.7, this.interactRadius * 0.34, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
