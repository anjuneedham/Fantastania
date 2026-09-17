import {
  BIOMES, drawPropEmissive, drawPropGlow, groundPattern, hasEmissiveOverlay,
} from '../art/environment';
import { drawTerrainGlow, drawTerrainPatch } from '../art/terrain';
import { C, alpha } from '../art/palette';
import { TAU } from '../engine/math';
import { fx } from '../engine/Rng';
import type { Camera } from '../engine/Camera';
import type { Renderer } from '../engine/Renderer';
import type { AreaDef } from './areaTypes';
import { state } from './GameState';
import type { World } from './World';

/**
 * Draws everything that is not an entity: ground, worn paths, emissive glows,
 * ambient motes and the lighting grade that gives each region its mood.
 *
 * Split from World on purpose — World simulates, this presents. A future
 * WebGL renderer would replace this file and nothing else.
 */
export class WorldRenderer {
  private area: AreaDef | null = null;
  private pattern: CanvasPattern | null = null;
  private ambientAccumulator = 0;

  setArea(area: AreaDef): void {
    this.area = area;
    // The pattern is created against a specific context; rebuild it on change.
    this.pattern = null;
  }

  /** Spawns drifting ambient particles across the visible area. */
  update(dt: number, world: World, camera: Camera, r: Renderer): void {
    const ambient = this.area?.ambient;
    if (!ambient || state.settings.performanceMode) return;

    this.ambientAccumulator += ambient.rate * dt;
    while (this.ambientAccumulator >= 1) {
      this.ambientAccumulator -= 1;
      const view = camera.visibleRect(r, 60);
      world.particles.emit(
        ambient.kind,
        view.x + fx.next() * view.w,
        view.y + fx.next() * view.h,
        1,
        ambient.color,
        { speed: 12, size: 2.6, life: 3.4, drag: 0.4, rise: ambient.rise ?? 12 },
      );
    }
  }

  /** Ground pass. Call with the camera transform applied. */
  renderGround(ctx: CanvasRenderingContext2D, camera: Camera, r: Renderer, time: number): void {
    if (!this.area) return;
    const biome = BIOMES[this.area.biome];
    const view = camera.visibleRect(r, 96);

    if (!this.pattern) this.pattern = groundPattern(ctx, this.area.biome);

    ctx.fillStyle = biome.ground;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    if (this.pattern) {
      ctx.fillStyle = this.pattern;
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }

    // Worn paths: each clearing becomes a soft-edged ellipse of path colour.
    // Cheaper than a tilemap and it reads as "people walk here".
    for (const clearing of this.area.clearings ?? []) {
      const cx = clearing.x + clearing.w / 2;
      const cy = clearing.y + clearing.h / 2;
      if (cx + clearing.w < view.x || cx - clearing.w > view.x + view.w) continue;
      if (cy + clearing.h < view.y || cy - clearing.h > view.y + view.h) continue;

      const rx = clearing.w / 2;
      const ry = clearing.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const grad = ctx.createRadialGradient(0, 0, rx * 0.25, 0, 0, rx);
      grad.addColorStop(0, alpha(biome.path, 0.34));
      grad.addColorStop(0.68, alpha(biome.path, 0.18));
      grad.addColorStop(1, alpha(biome.path, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Terrain sits over the worn-path wash (a road may run down to a ford, but
    // a road never runs over a pond) and under the walls, which are raised.
    if (this.area.terrain) {
      for (const patch of this.area.terrain) drawTerrainPatch(ctx, patch, view, time);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const patch of this.area.terrain) drawTerrainGlow(ctx, patch, view, time);
      ctx.restore();
    }

    this.renderWalls(ctx, view);
  }

  /**
   * Barriers, drawn as raised masses rather than flat dark rectangles: a cast
   * shadow on the ground, a body, and a lit top band. The value break across
   * those three is what makes a wall read as something you cannot walk through,
   * which matters more in a top-down view than any amount of texture.
   */
  private renderWalls(
    ctx: CanvasRenderingContext2D,
    view: { x: number; y: number; w: number; h: number },
  ): void {
    const def = this.area;
    if (!def?.walls) return;
    const biome = BIOMES[def.biome];
    const right = view.x + view.w;
    const bottom = view.y + view.h;
    /** Apparent height of a barrier, in world units. */
    const lift = 26;

    for (const wall of def.walls) {
      if (wall.x > right || wall.x + wall.w < view.x) continue;
      if (wall.y > bottom || wall.y + wall.h < view.y - lift) continue;

      // Cast shadow, offset down-right from the world's upper-left key light.
      ctx.fillStyle = alpha(C.void, 0.45);
      ctx.fillRect(wall.x + 8, wall.y + 10, wall.w, wall.h);

      // Body.
      ctx.fillStyle = biome.wall;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

      // Lit top band: the face you would see looking slightly down at it.
      ctx.fillStyle = biome.wallTop;
      ctx.fillRect(wall.x, wall.y, wall.w, Math.min(lift, wall.h));

      // A hard edge between the two keeps the silhouette crisp at any zoom.
      ctx.fillStyle = alpha(C.void, 0.4);
      ctx.fillRect(wall.x, wall.y + Math.min(lift, wall.h) - 2, wall.w, 2);

      // Broken highlight along the top lip, so long walls are not dead flat.
      ctx.fillStyle = alpha(C.white, 0.07);
      const step = 46;
      for (let x = wall.x + 6; x < wall.x + wall.w - 10; x += step) {
        ctx.fillRect(x, wall.y + 3, Math.min(step * 0.55, wall.x + wall.w - x - 6), 3);
      }
    }
  }

  /**
   * Emissive detail drawn after the props: brazier flame, crystal shimmer.
   * Separate from `renderGlows` because this has to land on top of the prop
   * bitmaps, and that one has to land underneath them.
   */
  renderEmissive(
    ctx: CanvasRenderingContext2D, world: World, camera: Camera, r: Renderer, time: number,
  ): void {
    if (world.glowProps.length === 0) return;
    const view = camera.visibleRect(r, 120);
    for (const p of world.glowProps) {
      if (!hasEmissiveOverlay(p.type)) continue;
      if (p.x < view.x || p.x > view.x + view.w || p.y < view.y || p.y > view.y + view.h) continue;
      drawPropEmissive(ctx, p.type, p.x, p.y, time, p.scale);
    }
  }


  /** Emissive glow pass, drawn additively under the props themselves. */
  renderGlows(
    ctx: CanvasRenderingContext2D, world: World, camera: Camera, r: Renderer, time: number,
  ): void {
    if (world.glowProps.length === 0) return;
    const view = camera.visibleRect(r, 160);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of world.glowProps) {
      if (p.x < view.x || p.x > view.x + view.w || p.y < view.y || p.y > view.y + view.h) continue;
      drawPropGlow(ctx, p.type, p.x, p.y, time, p.scale);
    }
    ctx.restore();
  }

  /**
   * Lighting grade, drawn in view space over the finished world: an ambient
   * colour wash plus a vignette. This is what makes the Caves feel like caves
   * and the Homestead feel like evening.
   */
  renderLighting(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (!this.area) return;
    const biome = BIOMES[this.area.biome];
    const w = r.viewWidth;
    const h = r.viewHeight;

    // A gentle additive wash, not an `overlay` composite: overlay crushed the
    // midtones and made every area read as one flat hue.
    if (!state.settings.performanceMode && biome.ambientStrength > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wash = ctx.createRadialGradient(
        w * 0.5, h * 0.42, 0,
        w * 0.5, h * 0.42, Math.max(w, h) * 0.6,
      );
      wash.addColorStop(0, alpha(biome.ambient, biome.ambientStrength * 0.5));
      wash.addColorStop(1, alpha(biome.ambient, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const grad = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.32,
      w / 2, h / 2, Math.max(w, h) * 0.72,
    );
    grad.addColorStop(0, alpha(biome.fog, 0));
    grad.addColorStop(1, alpha(biome.fog, biome.fogStrength));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}
