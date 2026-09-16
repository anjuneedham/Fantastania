import { Rng } from '../engine/Rng';
import { TAU } from '../engine/math';
import { C, alpha, darken, lighten, mix } from './palette';

/**
 * Environment art: ground textures and props.
 *
 * Both are generated once into offscreen canvases and then blitted, which is
 * the whole performance story for the world layer — a forest of 200 trees costs
 * 200 drawImage calls, not 200 procedural draws. Props that need to animate
 * (braziers, crystals) blit their static body and draw only the moving glow
 * live.
 */

export type BiomeId = 'homestead' | 'forest' | 'ruins' | 'caves' | 'shrine' | 'arena';

export interface BiomePalette {
  /** Base ground colour. */
  ground: string;
  /** Secondary ground colour, used for patches and speckle. */
  groundAlt: string;
  /** Path / clearing colour. */
  path: string;
  /** Colour of the darkness at the screen edges. */
  fog: string;
  /** How strongly the world is vignetted, 0..1. */
  fogStrength: number;
  /** Tint of the ambient light wash. */
  ambient: string;
  ambientStrength: number;
  /** The colour magic reads as in this biome. */
  accent: string;
  /** Barrier body colour (cliff face, thicket, masonry). */
  wall: string;
  /** Lit top surface of a barrier; the value break is what sells the height. */
  wallTop: string;
}

export const BIOMES: Record<BiomeId, BiomePalette> = {
  homestead: {
    ground: '#2b4a35',
    groundAlt: '#37603f',
    path: '#5a4a34',
    fog: '#0d1024',
    fogStrength: 0.34,
    ambient: '#ffb877',
    ambientStrength: 0.1,
    wall: '#26402c',
    wallTop: '#3c6b43',
    accent: C.gold,
  },
  forest: {
    ground: '#18351f',
    groundAlt: '#1f4a2c',
    path: '#3d3626',
    fog: '#060d12',
    fogStrength: 0.52,
    ambient: '#5fe6d0',
    ambientStrength: 0.08,
    wall: '#0f2415',
    wallTop: '#1d4527',
    accent: C.verdant,
  },
  ruins: {
    ground: '#38302f',
    groundAlt: '#4a413c',
    path: '#5c5148',
    fog: '#120c14',
    fogStrength: 0.46,
    ambient: '#ff9a4d',
    ambientStrength: 0.07,
    wall: '#4a423d',
    wallTop: '#6e635a',
    accent: C.ember,
  },
  caves: {
    ground: '#1a1930',
    groundAlt: '#242244',
    path: '#2e2b52',
    fog: '#05050f',
    fogStrength: 0.66,
    ambient: '#8b5cf6',
    ambientStrength: 0.14,
    wall: '#12122a',
    wallTop: '#2a2750',
    accent: C.violet,
  },
  shrine: {
    ground: '#1b2b3d',
    groundAlt: '#24415a',
    path: '#cfd8e8',
    fog: '#050a14',
    fogStrength: 0.44,
    ambient: '#5fe6d0',
    ambientStrength: 0.2,
    wall: '#26384d',
    wallTop: '#5d7ea3',
    accent: C.aether,
  },
  arena: {
    ground: '#2a1520',
    groundAlt: '#3b1c28',
    path: '#4d2632',
    fog: '#0a030a',
    fogStrength: 0.58,
    ambient: '#e0455e',
    ambientStrength: 0.12,
    wall: '#1c0d14',
    wallTop: '#40202c',
    accent: C.blood,
  },
};

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

const GROUND_TILE = 256;
const groundCache = new Map<string, CanvasPattern>();

/**
 * Builds a seamless ground pattern for a biome. The speckle is generated from a
 * fixed seed per biome, so the texture is identical on every device and across
 * reloads — important, because the world is otherwise deterministic.
 */
export function groundPattern(ctx: CanvasRenderingContext2D, biome: BiomeId): CanvasPattern | null {
  const cached = groundCache.get(biome);
  if (cached) return cached;

  const p = BIOMES[biome];
  const cv = document.createElement('canvas');
  cv.width = GROUND_TILE;
  cv.height = GROUND_TILE;
  const g = cv.getContext('2d');
  if (!g) return null;

  g.fillStyle = p.ground;
  g.fillRect(0, 0, GROUND_TILE, GROUND_TILE);

  const rng = new Rng(hash(biome));

  // Soft blotches of the alternate colour give large areas some variation
  // without any repeating structure the eye can latch onto. Each blotch is
  // drawn at all nine wrapped positions so the tile has no seam — and the
  // gradient is rebuilt per position, because a gradient is anchored in tile
  // space and would otherwise be sampled from the wrong place in the copies.
  for (let i = 0; i < 22; i++) {
    const x = rng.next() * GROUND_TILE;
    const y = rng.next() * GROUND_TILE;
    const r = rng.range(24, 70);
    const strength = rng.range(0.1, 0.22);
    for (const [ox, oy] of WRAP_OFFSETS) {
      const gx = x + ox * GROUND_TILE;
      const gy = y + oy * GROUND_TILE;
      // Skip copies that cannot touch the tile at all.
      if (gx + r < 0 || gx - r > GROUND_TILE || gy + r < 0 || gy - r > GROUND_TILE) continue;
      const grad = g.createRadialGradient(gx, gy, 0, gx, gy, r);
      grad.addColorStop(0, alpha(p.groundAlt, strength));
      grad.addColorStop(1, alpha(p.groundAlt, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(gx, gy, r, 0, TAU);
      g.fill();
    }
  }

  // Fine speckle: grit, pebbles, leaf litter depending on biome.
  const speckleColor = biome === 'caves' || biome === 'shrine'
    ? lighten(p.ground, 0.22)
    : darken(p.ground, 0.3);
  for (let i = 0; i < 620; i++) {
    const x = rng.next() * GROUND_TILE;
    const y = rng.next() * GROUND_TILE;
    const s = rng.range(0.7, 2.4);
    g.fillStyle = alpha(speckleColor, rng.range(0.12, 0.44));
    // Wrap so a speck straddling the edge appears on both sides.
    g.fillRect(x, y, s, s);
    if (x + s > GROUND_TILE) g.fillRect(x - GROUND_TILE, y, s, s);
    if (y + s > GROUND_TILE) g.fillRect(x, y - GROUND_TILE, s, s);
  }

  const pattern = ctx.createPattern(cv, 'repeat');
  if (pattern) groundCache.set(biome, pattern);
  return pattern;
}

const WRAP_OFFSETS: Array<[number, number]> = [
  [0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1], [1, 1], [1, -1], [-1, 1],
];

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export type PropType =
  | 'pineTree' | 'broadTree' | 'deadTree' | 'bush' | 'fern'
  | 'rock' | 'boulder' | 'stump' | 'mushroom'
  | 'crystal' | 'stalagmite' | 'runeStone'
  | 'pillar' | 'brokenPillar' | 'rubble' | 'archway'
  | 'cottage' | 'well' | 'fence' | 'brazier' | 'banner' | 'cart'
  | 'grave' | 'statue' | 'shrineStone' | 'obelisk'
  | 'bones' | 'bloodStain';

export interface PropSpec {
  /** Drawn size in world units. */
  w: number;
  h: number;
  /** Collision radius; 0 means walk-through decoration. */
  collide: number;
  /** Feet offset: how far below the sprite's bottom the collision sits. */
  footY?: number;
  /** Emits light; drawn with a live glow pass on top of the cached bitmap. */
  glow?: { color: string; radius: number; intensity: number };
  /** Draws underneath actors regardless of Y (stains, decals). */
  flat?: boolean;
}

export const PROPS: Record<PropType, PropSpec> = {
  pineTree: { w: 88, h: 150, collide: 15 },
  broadTree: { w: 120, h: 132, collide: 17 },
  deadTree: { w: 96, h: 128, collide: 12 },
  bush: { w: 54, h: 40, collide: 0 },
  fern: { w: 44, h: 34, collide: 0 },
  rock: { w: 40, h: 30, collide: 13 },
  boulder: { w: 84, h: 64, collide: 30 },
  stump: { w: 44, h: 32, collide: 15 },
  mushroom: { w: 34, h: 38, collide: 0, glow: { color: C.aether, radius: 40, intensity: 0.5 } },
  crystal: { w: 54, h: 86, collide: 16, glow: { color: C.aether, radius: 90, intensity: 0.85 } },
  stalagmite: { w: 46, h: 78, collide: 15 },
  runeStone: { w: 48, h: 62, collide: 17, glow: { color: C.violet, radius: 60, intensity: 0.6 } },
  pillar: { w: 56, h: 150, collide: 21 },
  brokenPillar: { w: 58, h: 70, collide: 21 },
  rubble: { w: 72, h: 34, collide: 0 },
  archway: { w: 160, h: 150, collide: 0 },
  cottage: { w: 220, h: 186, collide: 0 },
  well: { w: 76, h: 80, collide: 26 },
  fence: { w: 88, h: 46, collide: 0 },
  brazier: { w: 42, h: 74, collide: 14, glow: { color: C.ember, radius: 130, intensity: 1 } },
  banner: { w: 44, h: 116, collide: 8 },
  cart: { w: 108, h: 74, collide: 28 },
  grave: { w: 40, h: 50, collide: 12 },
  statue: { w: 74, h: 140, collide: 24 },
  shrineStone: { w: 96, h: 120, collide: 32, glow: { color: C.aetherSoft, radius: 140, intensity: 0.9 } },
  obelisk: { w: 60, h: 180, collide: 22, glow: { color: C.violet, radius: 110, intensity: 0.7 } },
  bones: { w: 52, h: 26, collide: 0, flat: true },
  bloodStain: { w: 64, h: 34, collide: 0, flat: true },
};

interface CachedProp {
  canvas: HTMLCanvasElement;
  /** Where the prop's ground contact point sits inside the bitmap. */
  anchorX: number;
  anchorY: number;
}

const propCache = new Map<string, CachedProp>();

/**
 * Renders (and caches) one prop variant. Variants are seeded, so `rock:3` looks
 * the same everywhere in the game and across sessions.
 */
function buildProp(type: PropType, variant: number): CachedProp {
  const spec = PROPS[type];
  const pad = 8;
  const w = Math.ceil(spec.w) + pad * 2;
  const h = Math.ceil(spec.h) + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;

  const rng = new Rng(hash(type) ^ (variant * 2654435761));
  g.save();
  // Draw with the origin at the prop's ground contact point.
  g.translate(w / 2, h - pad);
  PROP_PAINTERS[type](g, spec, rng);
  g.restore();

  return { canvas: cv, anchorX: w / 2, anchorY: h - pad };
}

export function getProp(type: PropType, variant: number): CachedProp {
  const key = `${type}:${variant}`;
  let cached = propCache.get(key);
  if (!cached) {
    cached = buildProp(type, variant);
    propCache.set(key, cached);
  }
  return cached;
}

/** Blits a prop with its base at (x, y). */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  type: PropType,
  variant: number,
  x: number,
  y: number,
  scale = 1,
): void {
  const p = getProp(type, variant);
  const w = p.canvas.width * scale;
  const h = p.canvas.height * scale;
  ctx.drawImage(p.canvas, x - p.anchorX * scale, y - p.anchorY * scale, w, h);
}

/** Props whose emissive detail must draw over the bitmap, not under it. */
const FLAME_PROPS = new Set<PropType>(['brazier']);
const SHIMMER_PROPS = new Set<PropType>(['crystal', 'shrineStone', 'obelisk', 'runeStone']);

export function hasEmissiveOverlay(type: PropType): boolean {
  return FLAME_PROPS.has(type) || SHIMMER_PROPS.has(type);
}

/**
 * Emissive detail drawn after the prop bitmap: actual fire in the braziers and
 * a travelling highlight on aether-bearing stone. This is the pass that stops
 * lit props from reading as unlit props with a coloured halo.
 */
export function drawPropEmissive(
  ctx: CanvasRenderingContext2D,
  type: PropType,
  x: number,
  y: number,
  time: number,
  scale = 1,
): void {
  const spec = PROPS[type];
  const phase = (x * 0.013 + y * 0.017) % TAU;

  if (FLAME_PROPS.has(type)) {
    const baseY = y - spec.h * 0.8 * scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Three overlapping tongues at different speeds. Wide and low rather than
    // tall and pointed — a tall triangle reads as a traffic cone, not fire.
    for (let i = 0; i < 3; i++) {
      const t = time * (4.2 + i * 2.3) + phase + i * 2.1;
      const flicker = 0.7 + Math.abs(Math.sin(t)) * 0.3;
      const sway = Math.sin(t * 0.7) * spec.w * 0.09 * scale;
      const h = spec.h * scale * (0.2 + flicker * 0.14) * (1 - i * 0.26);
      const w = spec.w * scale * (0.34 - i * 0.09);
      ctx.fillStyle = alpha(i === 0 ? C.emberDeep : i === 1 ? C.ember : C.emberHot, 0.5);
      ctx.beginPath();
      ctx.moveTo(x - w, baseY);
      // Bulge outward at a third of the height, then taper: the classic flame
      // profile rather than a straight-sided wedge.
      ctx.bezierCurveTo(
        x - w * 1.25 + sway, baseY - h * 0.45,
        x - w * 0.25 + sway, baseY - h * 0.7,
        x + sway * 1.2, baseY - h,
      );
      ctx.bezierCurveTo(
        x + w * 0.25 + sway, baseY - h * 0.7,
        x + w * 1.25 + sway, baseY - h * 0.45,
        x + w, baseY,
      );
      ctx.closePath();
      ctx.fill();
    }
    // A couple of rising sparks sells the heat.
    for (let i = 0; i < 2; i++) {
      const t = (time * 0.9 + phase + i * 0.5) % 1;
      ctx.fillStyle = alpha(C.emberHot, (1 - t) * 0.7);
      ctx.beginPath();
      ctx.arc(
        x + Math.sin(phase + i * 3 + t * 6) * spec.w * 0.2 * scale,
        baseY - t * spec.h * 0.5 * scale,
        1.8 * scale, 0, TAU,
      );
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (SHIMMER_PROPS.has(type)) {
    const pulse = 0.5 + Math.sin(time * 1.9 + phase) * 0.5;
    const cy = y - spec.h * 0.6 * scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = alpha(spec.glow?.color ?? C.aether, 0.16 + pulse * 0.2);
    ctx.beginPath();
    ctx.ellipse(x, cy, spec.w * 0.3 * scale, spec.h * 0.3 * scale, 0, 0, TAU);
    ctx.fill();
    // A mote orbiting the stone: cheap, and it draws the eye to interactables.
    const orbit = time * 0.9 + phase;
    ctx.fillStyle = alpha(C.white, 0.5 + pulse * 0.4);
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(orbit) * spec.w * 0.45 * scale,
      cy + Math.sin(orbit) * spec.h * 0.2 * scale,
      2.2 * scale, 0, TAU,
    );
    ctx.fill();
    ctx.restore();
  }
}

/** Live glow pass for emissive props, drawn before the prop bitmaps. */
export function drawPropGlow(
  ctx: CanvasRenderingContext2D,
  type: PropType,
  x: number,
  y: number,
  time: number,
  scale = 1,
): void {
  const glow = PROPS[type].glow;
  if (!glow) return;
  // Each prop flickers on its own phase, derived from its position, so a row of
  // braziers never pulses in lockstep.
  const phase = (x * 0.013 + y * 0.017) % TAU;
  const flicker = 0.82 + Math.sin(time * 3.1 + phase) * 0.1 + Math.sin(time * 7.7 + phase) * 0.06;
  const r = glow.radius * scale * flicker;
  const cy = y - PROPS[type].h * 0.55 * scale;
  const grad = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  grad.addColorStop(0, alpha(glow.color, 0.3 * glow.intensity));
  grad.addColorStop(0.5, alpha(glow.color, 0.1 * glow.intensity));
  grad.addColorStop(1, alpha(glow.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, TAU);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Prop painters                                                       */
/* ------------------------------------------------------------------ */

type Painter = (g: CanvasRenderingContext2D, spec: PropSpec, rng: Rng) => void;

function shadowBlob(g: CanvasRenderingContext2D, rx: number, ry: number): void {
  g.fillStyle = alpha(C.void, 0.32);
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.fill();
}

const PROP_PAINTERS: Record<PropType, Painter> = {
  pineTree: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.26, spec.h * 0.05);
    const trunkH = spec.h * 0.26;
    g.fillStyle = '#2a1d12';
    g.fillRect(-spec.w * 0.05, -trunkH, spec.w * 0.1, trunkH);
    // Three stacked skirts, each narrower and lighter than the one below.
    const base = rng.pick(['#2b6b3f', '#357a49', '#245c34']);
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const yTop = -trunkH - spec.h * (0.24 + t * 0.24);
      const yBot = -trunkH - spec.h * (0.02 + t * 0.24);
      const halfW = (spec.w * 0.5) * (1 - t * 0.34);
      g.fillStyle = mix(base, C.white, i * 0.08);
      g.beginPath();
      g.moveTo(0, yTop);
      g.lineTo(halfW, yBot);
      g.quadraticCurveTo(0, yBot + spec.h * 0.035, -halfW, yBot);
      g.closePath();
      g.fill();
    }
    // Rim light on the left: the world's key light comes from the upper left.
    g.fillStyle = alpha(C.aetherSoft, 0.1);
    g.beginPath();
    g.moveTo(0, -spec.h);
    g.lineTo(-spec.w * 0.16, -spec.h * 0.72);
    g.lineTo(0, -spec.h * 0.76);
    g.closePath();
    g.fill();
  },

  broadTree: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.3, spec.h * 0.06);
    g.strokeStyle = '#4a3422';
    g.lineWidth = spec.w * 0.09;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(rng.range(-6, 6), -spec.h * 0.42);
    g.stroke();
    const canopy = rng.pick(['#3a8a52', '#2f7a46', '#44995e']);
    // Overlapping lobes read as foliage without any leaf detail.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + rng.range(-0.3, 0.3);
      const d = spec.w * rng.range(0.16, 0.28);
      const r = spec.w * rng.range(0.22, 0.32);
      g.fillStyle = mix(canopy, i < 2 ? C.white : C.void, 0.08);
      g.beginPath();
      g.ellipse(Math.cos(a) * d, -spec.h * 0.62 + Math.sin(a) * d * 0.55, r, r * 0.82, 0, 0, TAU);
      g.fill();
    }
  },

  deadTree: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.2, spec.h * 0.045);
    g.strokeStyle = '#4b4238';
    g.lineCap = 'round';
    g.lineWidth = spec.w * 0.1;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -spec.h * 0.55);
    g.stroke();
    // Bare branches, forked twice.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const y = -spec.h * (0.5 + i * 0.11);
      g.lineWidth = spec.w * (0.06 - i * 0.008);
      g.beginPath();
      g.moveTo(0, y);
      const mx = side * spec.w * rng.range(0.2, 0.36);
      const my = y - spec.h * rng.range(0.1, 0.2);
      g.quadraticCurveTo(side * spec.w * 0.14, y - spec.h * 0.04, mx, my);
      g.stroke();
    }
  },

  bush: (g, spec, rng) => {
    const col = rng.pick(['#2e7546', '#265f39', '#37874f']);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = mix(col, i === 0 ? C.white : C.void, 0.07);
      const x = rng.range(-spec.w * 0.24, spec.w * 0.24);
      g.beginPath();
      g.ellipse(x, -spec.h * rng.range(0.32, 0.52), spec.w * 0.27, spec.h * 0.42, 0, 0, TAU);
      g.fill();
    }
  },

  fern: (g, spec, rng) => {
    g.strokeStyle = '#46a06c';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 5 - 0.5) * 1.9 + rng.range(-0.1, 0.1);
      const len = spec.h * rng.range(0.6, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(Math.cos(a) * len * 0.4, Math.sin(a) * len * 0.7,
        Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
    }
  },

  rock: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.4, spec.h * 0.16);
    const col = rng.pick(['#5b5668', '#4a4658', '#6a6478']);
    g.fillStyle = col;
    g.beginPath();
    // Irregular polygon: rocks should never read as circles.
    const pts = 7;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU;
      const r = spec.w * 0.42 * rng.range(0.7, 1.05);
      const x = Math.cos(a) * r;
      const y = -spec.h * 0.42 + Math.sin(a) * r * 0.66;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.fillStyle = alpha(C.white, 0.12);
    g.beginPath();
    g.ellipse(-spec.w * 0.1, -spec.h * 0.58, spec.w * 0.16, spec.h * 0.13, -0.5, 0, TAU);
    g.fill();
  },

  boulder: (g, spec, rng) => {
    PROP_PAINTERS.rock(g, spec, rng);
    g.strokeStyle = alpha(C.void, 0.35);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-spec.w * 0.22, -spec.h * 0.3);
    g.lineTo(spec.w * 0.1, -spec.h * 0.62);
    g.stroke();
  },

  stump: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.38, spec.h * 0.16);
    g.fillStyle = '#4a3422';
    g.beginPath();
    g.ellipse(0, -spec.h * 0.55, spec.w * 0.38, spec.h * 0.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#6b4e33';
    g.beginPath();
    g.ellipse(0, -spec.h * 0.8, spec.w * 0.36, spec.h * 0.22, 0, 0, TAU);
    g.fill();
    // Growth rings.
    g.strokeStyle = alpha('#3b2a1c', 0.6);
    g.lineWidth = 1.2;
    for (let i = 1; i <= 3; i++) {
      g.beginPath();
      g.ellipse(0, -spec.h * 0.8, spec.w * 0.36 * (i / 4), spec.h * 0.22 * (i / 4), 0, 0, TAU);
      g.stroke();
    }
    void rng;
  },

  mushroom: (g, spec, rng) => {
    const cap = rng.pick([C.aether, C.aetherSoft, C.violet]);
    g.fillStyle = '#d8d2c0';
    g.fillRect(-spec.w * 0.09, -spec.h * 0.55, spec.w * 0.18, spec.h * 0.55);
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(0, -spec.h * 0.55, spec.w * 0.42, spec.h * 0.3, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = alpha(C.white, 0.5);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(rng.range(-spec.w * 0.2, spec.w * 0.2), -spec.h * rng.range(0.6, 0.72),
        spec.w * 0.05, 0, TAU);
      g.fill();
    }
  },

  crystal: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.36, spec.h * 0.07);
    const shards = 3;
    for (let i = 0; i < shards; i++) {
      const x = (i - 1) * spec.w * 0.24;
      const h = spec.h * rng.range(0.55, 1);
      const w = spec.w * rng.range(0.16, 0.26);
      const grad = g.createLinearGradient(0, -h, 0, 0);
      grad.addColorStop(0, C.aetherSoft);
      grad.addColorStop(0.55, C.aether);
      grad.addColorStop(1, C.aetherDeep);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x, -h);
      g.lineTo(x + w, -h * 0.42);
      g.lineTo(x + w * 0.6, 0);
      g.lineTo(x - w * 0.6, 0);
      g.lineTo(x - w, -h * 0.42);
      g.closePath();
      g.fill();
      g.fillStyle = alpha(C.white, 0.35);
      g.beginPath();
      g.moveTo(x, -h);
      g.lineTo(x + w * 0.35, -h * 0.45);
      g.lineTo(x, -h * 0.35);
      g.closePath();
      g.fill();
    }
  },

  stalagmite: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.35, spec.h * 0.06);
    g.fillStyle = rng.pick(['#3a3757', '#2f2c4a', '#464269']);
    g.beginPath();
    g.moveTo(-spec.w * 0.4, 0);
    g.quadraticCurveTo(-spec.w * 0.16, -spec.h * 0.6, 0, -spec.h);
    g.quadraticCurveTo(spec.w * 0.16, -spec.h * 0.6, spec.w * 0.4, 0);
    g.closePath();
    g.fill();
    g.fillStyle = alpha(C.violet, 0.16);
    g.beginPath();
    g.moveTo(-spec.w * 0.12, 0);
    g.quadraticCurveTo(-spec.w * 0.06, -spec.h * 0.6, 0, -spec.h);
    g.lineTo(spec.w * 0.06, -spec.h * 0.55);
    g.closePath();
    g.fill();
  },

  runeStone: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.4, spec.h * 0.1);
    g.fillStyle = '#4a4658';
    g.beginPath();
    g.moveTo(-spec.w * 0.36, 0);
    g.lineTo(-spec.w * 0.3, -spec.h * 0.86);
    g.lineTo(spec.w * 0.3, -spec.h);
    g.lineTo(spec.w * 0.38, 0);
    g.closePath();
    g.fill();
    // Carved runes; the glyph shapes are arbitrary but consistent per variant.
    g.strokeStyle = C.violet;
    g.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const y = -spec.h * (0.24 + i * 0.22);
      g.beginPath();
      g.moveTo(-spec.w * 0.16, y);
      g.lineTo(spec.w * rng.range(0, 0.18), y - spec.h * 0.08);
      g.lineTo(spec.w * 0.16, y);
      g.stroke();
    }
  },

  pillar: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.42, spec.h * 0.05);
    const stone = rng.pick(['#7a7383', '#6b6575', '#87808f']);
    g.fillStyle = darken(stone, 0.2);
    g.fillRect(-spec.w * 0.48, -spec.h * 0.08, spec.w * 0.96, spec.h * 0.08);
    g.fillStyle = stone;
    g.fillRect(-spec.w * 0.34, -spec.h * 0.94, spec.w * 0.68, spec.h * 0.86);
    // Fluting.
    g.strokeStyle = alpha(C.void, 0.22);
    g.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(i * spec.w * 0.17, -spec.h * 0.92);
      g.lineTo(i * spec.w * 0.17, -spec.h * 0.1);
      g.stroke();
    }
    g.fillStyle = lighten(stone, 0.12);
    g.fillRect(-spec.w * 0.48, -spec.h, spec.w * 0.96, spec.h * 0.08);
  },

  brokenPillar: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.42, spec.h * 0.1);
    const stone = rng.pick(['#7a7383', '#6b6575']);
    g.fillStyle = darken(stone, 0.2);
    g.fillRect(-spec.w * 0.48, -spec.h * 0.16, spec.w * 0.96, spec.h * 0.16);
    g.fillStyle = stone;
    g.beginPath();
    g.moveTo(-spec.w * 0.34, -spec.h * 0.16);
    g.lineTo(-spec.w * 0.3, -spec.h * 0.92);
    g.lineTo(spec.w * 0.06, -spec.h * 0.7);
    g.lineTo(spec.w * 0.34, -spec.h * 0.84);
    g.lineTo(spec.w * 0.34, -spec.h * 0.16);
    g.closePath();
    g.fill();
  },

  rubble: (g, spec, rng) => {
    for (let i = 0; i < 7; i++) {
      g.fillStyle = alpha(rng.pick(['#6b6575', '#57525f', '#7a7383']), 0.92);
      const x = rng.range(-spec.w * 0.45, spec.w * 0.45);
      const y = -rng.range(0, spec.h * 0.55);
      const s = rng.range(5, 13);
      g.save();
      g.translate(x, y);
      g.rotate(rng.angle());
      g.fillRect(-s / 2, -s / 3, s, s * 0.66);
      g.restore();
    }
  },

  archway: (g, spec, rng) => {
    const stone = rng.pick(['#7a7383', '#6b6575']);
    g.fillStyle = stone;
    const legW = spec.w * 0.16;
    g.fillRect(-spec.w * 0.5, -spec.h * 0.82, legW, spec.h * 0.82);
    g.fillRect(spec.w * 0.5 - legW, -spec.h * 0.82, legW, spec.h * 0.82);
    g.strokeStyle = stone;
    g.lineWidth = legW;
    g.beginPath();
    g.arc(0, -spec.h * 0.8, spec.w * 0.42, Math.PI, TAU);
    g.stroke();
    g.fillStyle = alpha(C.void, 0.18);
    g.fillRect(-spec.w * 0.34, -spec.h * 0.8, spec.w * 0.68, spec.h * 0.8);
  },

  cottage: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.42, spec.h * 0.06);
    const wall = rng.pick(['#8a7458', '#7b6650', '#94805f']);
    const roof = rng.pick(['#5c3b2e', '#4a3026']);
    // Walls.
    g.fillStyle = wall;
    g.fillRect(-spec.w * 0.4, -spec.h * 0.56, spec.w * 0.8, spec.h * 0.56);
    // Timber framing: the detail that makes it read as a home, not a box.
    g.strokeStyle = alpha('#3b2a1c', 0.55);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-spec.w * 0.4, -spec.h * 0.3);
    g.lineTo(spec.w * 0.4, -spec.h * 0.3);
    g.moveTo(-spec.w * 0.12, -spec.h * 0.56);
    g.lineTo(-spec.w * 0.12, 0);
    g.stroke();
    // Roof.
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(-spec.w * 0.5, -spec.h * 0.54);
    g.lineTo(0, -spec.h);
    g.lineTo(spec.w * 0.5, -spec.h * 0.54);
    g.closePath();
    g.fill();
    g.fillStyle = alpha(C.white, 0.06);
    g.beginPath();
    g.moveTo(-spec.w * 0.5, -spec.h * 0.54);
    g.lineTo(0, -spec.h);
    g.lineTo(0, -spec.h * 0.54);
    g.closePath();
    g.fill();
    // Door and lit window — warm amber, the safety colour.
    g.fillStyle = '#3b2a1c';
    g.fillRect(-spec.w * 0.08, -spec.h * 0.34, spec.w * 0.16, spec.h * 0.34);
    g.fillStyle = C.emberHot;
    g.fillRect(spec.w * 0.14, -spec.h * 0.44, spec.w * 0.14, spec.h * 0.14);
    g.strokeStyle = '#3b2a1c';
    g.lineWidth = 2;
    g.strokeRect(spec.w * 0.14, -spec.h * 0.44, spec.w * 0.14, spec.h * 0.14);
  },

  well: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.42, spec.h * 0.1);
    g.fillStyle = '#6b6575';
    g.beginPath();
    g.ellipse(0, -spec.h * 0.26, spec.w * 0.42, spec.h * 0.18, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#121a26';
    g.beginPath();
    g.ellipse(0, -spec.h * 0.3, spec.w * 0.3, spec.h * 0.12, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#4a3422';
    g.fillRect(-spec.w * 0.36, -spec.h * 0.86, spec.w * 0.07, spec.h * 0.6);
    g.fillRect(spec.w * 0.29, -spec.h * 0.86, spec.w * 0.07, spec.h * 0.6);
    g.fillStyle = '#5c3b2e';
    g.beginPath();
    g.moveTo(-spec.w * 0.48, -spec.h * 0.84);
    g.lineTo(0, -spec.h);
    g.lineTo(spec.w * 0.48, -spec.h * 0.84);
    g.closePath();
    g.fill();
    void rng;
  },

  fence: (g, spec, rng) => {
    g.strokeStyle = '#5c4630';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * spec.w * 0.34;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + rng.range(-2, 2), -spec.h * 0.8);
      g.stroke();
    }
    g.lineWidth = 4;
    for (const y of [-spec.h * 0.3, -spec.h * 0.62]) {
      g.beginPath();
      g.moveTo(-spec.w * 0.42, y);
      g.lineTo(spec.w * 0.42, y - 2);
      g.stroke();
    }
  },

  brazier: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.42, spec.h * 0.08);
    // Tripod legs splay outward from under the bowl.
    g.strokeStyle = '#3a3746';
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    for (const dir of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(dir * spec.w * 0.26, -2);
      g.lineTo(dir * spec.w * 0.1, -spec.h * 0.58);
      g.stroke();
    }
    // Bowl: a cup, wider at the top, with a lit inner rim.
    const bowlY = -spec.h * 0.62;
    const bowlH = spec.h * 0.2;
    g.fillStyle = '#57525f';
    g.beginPath();
    g.moveTo(-spec.w * 0.3, bowlY);
    g.lineTo(spec.w * 0.3, bowlY);
    g.lineTo(spec.w * 0.46, bowlY - bowlH);
    g.lineTo(-spec.w * 0.46, bowlY - bowlH);
    g.closePath();
    g.fill();
    g.fillStyle = '#6e6878';
    g.beginPath();
    g.ellipse(0, bowlY - bowlH, spec.w * 0.46, spec.h * 0.05, 0, 0, TAU);
    g.fill();
    // Coals inside the bowl; the flame itself is the live emissive pass.
    g.fillStyle = C.emberDeep;
    g.beginPath();
    g.ellipse(0, bowlY - bowlH, spec.w * 0.36, spec.h * 0.038, 0, 0, TAU);
    g.fill();
    g.fillStyle = C.ember;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(rng.range(-spec.w * 0.26, spec.w * 0.26), bowlY - bowlH + rng.range(-2, 2),
        rng.range(2, 4), 0, TAU);
      g.fill();
    }
  },

  banner: (g, spec, rng) => {
    g.fillStyle = '#4a4658';
    g.fillRect(-2.5, -spec.h, 5, spec.h);
    const cloth = rng.pick(['#2f5d8a', '#6b2f4a', '#3a2f6b']);
    g.fillStyle = cloth;
    g.beginPath();
    g.moveTo(-spec.w * 0.4, -spec.h * 0.94);
    g.lineTo(spec.w * 0.4, -spec.h * 0.94);
    g.lineTo(spec.w * 0.4, -spec.h * 0.34);
    g.lineTo(0, -spec.h * 0.22);
    g.lineTo(-spec.w * 0.4, -spec.h * 0.34);
    g.closePath();
    g.fill();
    g.fillStyle = alpha(C.gold, 0.8);
    g.beginPath();
    g.moveTo(0, -spec.h * 0.76);
    g.lineTo(spec.w * 0.16, -spec.h * 0.6);
    g.lineTo(0, -spec.h * 0.44);
    g.lineTo(-spec.w * 0.16, -spec.h * 0.6);
    g.closePath();
    g.fill();
  },

  cart: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.44, spec.h * 0.1);
    // Wheels first, so the bed overlaps their tops.
    for (const wx of [-spec.w * 0.26, spec.w * 0.26]) {
      g.fillStyle = '#2a1d12';
      g.beginPath();
      g.arc(wx, -spec.h * 0.2, spec.h * 0.2, 0, TAU);
      g.fill();
      g.fillStyle = '#5c4630';
      g.beginPath();
      g.arc(wx, -spec.h * 0.2, spec.h * 0.14, 0, TAU);
      g.fill();
      g.strokeStyle = '#2a1d12';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        g.beginPath();
        g.moveTo(wx + Math.cos(a) * spec.h * 0.18, -spec.h * 0.2 + Math.sin(a) * spec.h * 0.18);
        g.lineTo(wx - Math.cos(a) * spec.h * 0.18, -spec.h * 0.2 - Math.sin(a) * spec.h * 0.18);
        g.stroke();
      }
    }
    // Bed and side rail.
    g.fillStyle = '#6b5136';
    g.fillRect(-spec.w * 0.44, -spec.h * 0.46, spec.w * 0.88, spec.h * 0.16);
    g.fillStyle = '#5c4630';
    g.fillRect(-spec.w * 0.44, -spec.h * 0.66, spec.w * 0.06, spec.h * 0.22);
    g.fillRect(spec.w * 0.38, -spec.h * 0.66, spec.w * 0.06, spec.h * 0.22);
    g.fillRect(-spec.w * 0.44, -spec.h * 0.66, spec.w * 0.88, spec.h * 0.05);
    // Handles, tipped toward the ground.
    g.strokeStyle = '#5c4630';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(spec.w * 0.42, -spec.h * 0.42);
    g.lineTo(spec.w * 0.62, -spec.h * 0.12);
    g.stroke();
    void rng;
  },

  grave: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.4, spec.h * 0.1);
    g.fillStyle = rng.pick(['#6b6575', '#57525f']);
    g.beginPath();
    g.moveTo(-spec.w * 0.34, 0);
    g.lineTo(-spec.w * 0.34, -spec.h * 0.64);
    g.arc(0, -spec.h * 0.64, spec.w * 0.34, Math.PI, TAU);
    g.lineTo(spec.w * 0.34, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = alpha(C.void, 0.4);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-spec.w * 0.14, -spec.h * 0.5);
    g.lineTo(spec.w * 0.14, -spec.h * 0.5);
    g.moveTo(0, -spec.h * 0.66);
    g.lineTo(0, -spec.h * 0.3);
    g.stroke();
  },

  statue: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.42, spec.h * 0.06);
    const stone = rng.pick(['#7a7383', '#6b6575']);
    g.fillStyle = darken(stone, 0.25);
    g.fillRect(-spec.w * 0.46, -spec.h * 0.16, spec.w * 0.92, spec.h * 0.16);
    g.fillStyle = stone;
    // A hooded figure: reads at a glance and fits the Shrine's iconography.
    g.beginPath();
    g.moveTo(-spec.w * 0.3, -spec.h * 0.16);
    g.quadraticCurveTo(-spec.w * 0.26, -spec.h * 0.7, 0, -spec.h * 0.86);
    g.quadraticCurveTo(spec.w * 0.26, -spec.h * 0.7, spec.w * 0.3, -spec.h * 0.16);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(0, -spec.h * 0.88, spec.w * 0.17, 0, TAU);
    g.fill();
    g.fillStyle = darken(stone, 0.45);
    g.beginPath();
    g.ellipse(0, -spec.h * 0.87, spec.w * 0.11, spec.h * 0.05, 0, 0, TAU);
    g.fill();
  },

  shrineStone: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.4, spec.h * 0.08);
    g.fillStyle = '#cfd8e8';
    g.beginPath();
    g.moveTo(-spec.w * 0.34, 0);
    g.lineTo(-spec.w * 0.26, -spec.h * 0.8);
    g.lineTo(0, -spec.h);
    g.lineTo(spec.w * 0.26, -spec.h * 0.8);
    g.lineTo(spec.w * 0.34, 0);
    g.closePath();
    g.fill();
    // Inlaid aether channels.
    g.strokeStyle = C.aether;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -spec.h * 0.12);
    g.lineTo(0, -spec.h * 0.56);
    g.moveTo(-spec.w * 0.16, -spec.h * 0.4);
    g.lineTo(0, -spec.h * 0.56);
    g.lineTo(spec.w * 0.16, -spec.h * 0.4);
    g.stroke();
    g.fillStyle = C.aetherSoft;
    g.beginPath();
    g.arc(0, -spec.h * 0.66, spec.w * 0.1, 0, TAU);
    g.fill();
    void rng;
  },

  obelisk: (g, spec, rng) => {
    shadowBlob(g, spec.w * 0.36, spec.h * 0.045);
    const grad = g.createLinearGradient(0, -spec.h, 0, 0);
    grad.addColorStop(0, '#2f2c4a');
    grad.addColorStop(1, '#14122a');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-spec.w * 0.3, 0);
    g.lineTo(-spec.w * 0.18, -spec.h * 0.9);
    g.lineTo(0, -spec.h);
    g.lineTo(spec.w * 0.18, -spec.h * 0.9);
    g.lineTo(spec.w * 0.3, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = alpha(C.violet, 0.9);
    g.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const y = -spec.h * (0.2 + i * 0.18);
      g.beginPath();
      g.moveTo(-spec.w * 0.1, y);
      g.lineTo(spec.w * 0.1, y - spec.h * 0.04);
      g.stroke();
    }
    void rng;
  },

  bones: (g, spec, rng) => {
    g.strokeStyle = alpha('#d8d2c0', 0.7);
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = rng.angle();
      const len = rng.range(10, 20);
      const x = rng.range(-spec.w * 0.3, spec.w * 0.3);
      const y = rng.range(-spec.h * 0.3, 0);
      g.beginPath();
      g.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len * 0.5);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5);
      g.stroke();
    }
  },

  bloodStain: (g, spec, rng) => {
    g.fillStyle = alpha('#4a0f1c', 0.5);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(
        rng.range(-spec.w * 0.3, spec.w * 0.3),
        rng.range(-spec.h * 0.25, 0),
        rng.range(6, 18), rng.range(3, 9), rng.angle(), 0, TAU,
      );
      g.fill();
    }
  },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Clears the caches; used when the renderer's context is recreated. */
export function clearEnvironmentCaches(): void {
  propCache.clear();
  groundCache.clear();
}
