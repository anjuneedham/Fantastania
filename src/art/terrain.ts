import { TAU } from '../engine/math';
import { C, alpha, lighten } from './palette';

/**
 * Ground terrain: water, bog, ash, flagstone and aether-touched earth.
 *
 * Before this, an area was one flat biome colour plus props — a pond, a burnt
 * street or a stone terrace could be written in an area's description but
 * never actually appeared underfoot. Terrain is the layer that makes the
 * ground itself say where you are.
 *
 * A patch is a list of overlapping circles rather than a polygon or a tile
 * grid, for one reason: the collision system already understands circles, so a
 * blocking patch registers as ordinary circle obstacles and needs no new
 * collision code. The circles are drawn as one unioned, wobbled path, so what
 * the player sees is an organic shoreline rather than a string of beads — but
 * what the player *collides with* is exactly the shape that was drawn.
 *
 * Nothing here is foreshortened. The ground plane in this game renders 1:1
 * (the biome pattern and the worn-path ellipses both do), so a round pool is
 * round in world space and its collision matches it precisely.
 */

export type TerrainKind =
  | 'water' | 'shallowWater' | 'bog' | 'ash' | 'stone' | 'arcane';

export interface TerrainSpec {
  /** Main fill. */
  base: string;
  /** Mottling drawn inside the body, for depth. */
  mottle: string;
  /** The transition ring outside the body: bank, scorch edge, worn margin. */
  edge: string;
  /** Blocks movement. Only deep water does. */
  solid?: boolean;
  /** Suppresses scatter — nothing grows in a pool, a bog or a burn. */
  clearsScatter?: boolean;
  /** Drifting highlights drawn live, for anything wet or lit. */
  shimmer?: { color: string; strength: number };
  /** Additive light cast onto the surrounding ground. */
  glow?: { color: string; strength: number };
}

/**
 * Terrain palettes obey `palette.ts`'s rule: aether-cyan means magic and
 * nothing else, so water is cold indigo rather than tropical blue — it is a
 * dark northern world, not a postcard. Only `arcane` earns the cyan.
 */
export const TERRAIN: Record<TerrainKind, TerrainSpec> = {
  water: {
    base: '#16244d',
    mottle: '#0d1730',
    edge: '#4a4433',
    solid: true,
    clearsScatter: true,
    shimmer: { color: '#6f8ad0', strength: 0.5 },
  },
  shallowWater: {
    base: '#27407a',
    mottle: '#1b2f5c',
    edge: '#4a4433',
    clearsScatter: true,
    shimmer: { color: '#8fa6dd', strength: 0.34 },
  },
  bog: {
    // Deliberately brown rather than green: the forest floor is already dark
    // green, so a green bog disappears into it. Hue does the separating work
    // here, not value — and the muddy bank is what sells "stagnant" over
    // "puddle". The rot sheen is the only green left, sitting on the surface.
    base: '#332e15',
    mottle: '#1c1808',
    edge: '#4a3c26',
    clearsScatter: true,
    shimmer: { color: C.rot, strength: 0.3 },
  },
  ash: {
    base: '#241f22',
    mottle: '#151216',
    edge: '#4a3b31',
    clearsScatter: true,
  },
  stone: {
    base: '#4c5871',
    mottle: '#3c465d',
    edge: '#333a4d',
  },
  arcane: {
    base: '#1d3f4a',
    mottle: '#16303a',
    edge: '#24505c',
    shimmer: { color: C.aether, strength: 0.4 },
    glow: { color: C.aether, strength: 0.22 },
  },
};

export interface TerrainBlob {
  x: number;
  y: number;
  r: number;
}

export interface TerrainPatch {
  kind: TerrainKind;
  blobs: TerrainBlob[];
}

/**
 * Collision radius as a fraction of the drawn radius.
 *
 * The wobble pushes the visible edge to roughly ±12% of `r`, so colliding at
 * exactly `r` would sometimes stop the player where the ground still looks
 * walkable. Erring inward instead means the worst case is standing in the
 * shallows at the very rim, which reads as intentional; being blocked by
 * nothing never does.
 */
export const TERRAIN_COLLIDE_SCALE = 0.9;

/** Deterministic phase per blob, so a shoreline never shimmers between frames. */
function seedOf(b: TerrainBlob): number {
  const h = Math.sin(b.x * 12.9898 + b.y * 78.233 + b.r * 3.717) * 43758.5453;
  return (h - Math.floor(h)) * TAU;
}

/**
 * Traces one blob as a wobbled circle. Three harmonics: the low one gives the
 * overall lopsidedness, the higher two keep the edge from reading as a
 * geometric shape at close zoom.
 */
function blobPath(
  ctx: CanvasRenderingContext2D, b: TerrainBlob, seed: number, scale: number,
): void {
  const steps = 30;
  const r = b.r * scale;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const wob = 1
      + Math.sin(a * 2 + seed) * 0.07
      + Math.sin(a * 3 - seed * 1.7) * 0.05
      + Math.sin(a * 5 + seed * 0.6) * 0.03;
    const x = b.x + Math.cos(a) * r * wob;
    const y = b.y + Math.sin(a) * r * wob;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Every blob of a patch as a single path, so overlaps union instead of seaming. */
function patchPath(ctx: CanvasRenderingContext2D, patch: TerrainPatch, scale: number): void {
  ctx.beginPath();
  for (const b of patch.blobs) blobPath(ctx, b, seedOf(b), scale);
}

/** Bounding box of a patch at full wobble reach; used to size its gradient. */
function patchBounds(patch: TerrainPatch): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of patch.blobs) {
    const r = b.r * 1.15;
    if (b.x - r < minX) minX = b.x - r;
    if (b.y - r < minY) minY = b.y - r;
    if (b.x + r > maxX) maxX = b.x + r;
    if (b.y + r > maxY) maxY = b.y + r;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function patchVisible(
  patch: TerrainPatch, view: { x: number; y: number; w: number; h: number },
): boolean {
  for (const b of patch.blobs) {
    const pad = b.r * 1.3;
    if (b.x + pad < view.x || b.x - pad > view.x + view.w) continue;
    if (b.y + pad < view.y || b.y - pad > view.y + view.h) continue;
    return true;
  }
  return false;
}

/**
 * Draws one patch: transition ring, body, mottling, then any live shimmer.
 *
 * The ring is the whole reason terrain does not look like a decal pasted on
 * grass — it is the "grass meets water" band the eye expects, and it is
 * generated from the patch rather than authored per placement.
 */
export function drawTerrainPatch(
  ctx: CanvasRenderingContext2D,
  patch: TerrainPatch,
  view: { x: number; y: number; w: number; h: number },
  time: number,
): void {
  if (!patchVisible(patch, view)) return;
  const spec = TERRAIN[patch.kind];

  // Transition band, drawn wider than the body and soft enough to blend.
  ctx.fillStyle = alpha(spec.edge, 0.5);
  patchPath(ctx, patch, 1.14);
  ctx.fill();
  ctx.fillStyle = alpha(spec.edge, 0.55);
  patchPath(ctx, patch, 1.06);
  ctx.fill();

  // Body.
  ctx.fillStyle = spec.base;
  patchPath(ctx, patch, 1);
  ctx.fill();

  // Mottling: soft depth variation so a large patch is not a flat shape.
  // Deliberately drawn as gradients that fade to nothing rather than discs —
  // a hard-edged disc inside a pond reads as a *circle*, which immediately
  // gives away that the patch is built from circles. Offsets derive from the
  // blob, so the same pond looks identical on every device and every reload.
  ctx.save();
  patchPath(ctx, patch, 1);
  ctx.clip();
  for (const b of patch.blobs) {
    const s = seedOf(b);
    for (let i = 0; i < 2; i++) {
      const a = s + i * 2.4;
      const d = b.r * (0.16 + i * 0.2);
      const cx = b.x + Math.cos(a) * d;
      const cy = b.y + Math.sin(a) * d;
      const rr = b.r * 0.62;
      const mg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      mg.addColorStop(0, alpha(spec.mottle, 0.34));
      mg.addColorStop(1, alpha(spec.mottle, 0));
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  // Depth, as a single wash across the whole patch rather than a rim on each
  // blob. Stroking the path would outline every blob's *hidden* edges too,
  // turning a pond into a pile of visible circles; clipping to the union and
  // laying one gradient over it keeps the patch reading as one body of water,
  // lit from the upper left like everything else in the world.
  const b = patchBounds(patch);
  ctx.save();
  patchPath(ctx, patch, 1);
  ctx.clip();
  const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  grad.addColorStop(0, alpha(lighten(spec.base, 0.34), 0.34));
  grad.addColorStop(0.45, alpha(spec.base, 0));
  grad.addColorStop(1, alpha(spec.mottle, 0.4));
  ctx.fillStyle = grad;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();

  if (spec.shimmer) drawShimmer(ctx, patch, spec, time);
}

/**
 * Drifting surface highlights. Short horizontal strokes rather than a moving
 * gradient: at this camera distance the eye reads a few broken lines as
 * "reflective surface" far more cheaply than any real reflection would cost.
 */
function drawShimmer(
  ctx: CanvasRenderingContext2D, patch: TerrainPatch, spec: TerrainSpec, time: number,
): void {
  const sh = spec.shimmer;
  if (!sh) return;
  ctx.save();
  // Clipped to the patch so a highlight can never sit on the bank, and kept
  // faint on purpose: at gameplay distance a few broken glints read as a
  // reflective surface, while anything bolder reads as dashes lying on top of
  // the water rather than light moving across it.
  patchPath(ctx, patch, 0.94);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of patch.blobs) {
    const s = seedOf(b);
    const lines = Math.max(2, Math.round(b.r / 40));
    for (let i = 0; i < lines; i++) {
      const phase = s + i * 2.3;
      const oy = Math.sin(phase * 2.3) * b.r * 0.5;
      const drift = Math.sin(time * 0.5 + phase) * b.r * 0.22;
      const halfW = b.r * 0.26 * (0.45 + Math.abs(Math.cos(phase)) * 0.55);
      const fade = 0.5 + Math.sin(time * 1.1 + phase) * 0.5;
      ctx.strokeStyle = alpha(sh.color, sh.strength * (0.06 + fade * 0.14));
      ctx.lineWidth = Math.max(1.2, b.r * 0.022);
      ctx.beginPath();
      ctx.moveTo(b.x + drift - halfW, b.y + oy);
      ctx.lineTo(b.x + drift + halfW, b.y + oy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Additive wash cast by glowing terrain; drawn with the other glow passes. */
export function drawTerrainGlow(
  ctx: CanvasRenderingContext2D,
  patch: TerrainPatch,
  view: { x: number; y: number; w: number; h: number },
  time: number,
): void {
  const spec = TERRAIN[patch.kind];
  if (!spec.glow || !patchVisible(patch, view)) return;
  const pulse = 0.85 + Math.sin(time * 1.4) * 0.15;
  for (const b of patch.blobs) {
    const r = b.r * 1.9 * pulse;
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    grad.addColorStop(0, alpha(spec.glow.color, 0.22 * spec.glow.strength));
    grad.addColorStop(0.55, alpha(spec.glow.color, 0.09 * spec.glow.strength));
    grad.addColorStop(1, alpha(spec.glow.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
  }
}

/** True when (x, y) sits inside any patch of this kind-set. Used by placement. */
export function inTerrain(
  x: number, y: number, patches: TerrainPatch[] | undefined, pad = 0,
): boolean {
  if (!patches) return false;
  for (const patch of patches) {
    if (!TERRAIN[patch.kind].clearsScatter) continue;
    for (const b of patch.blobs) {
      const rr = b.r + pad;
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
  }
  return false;
}
