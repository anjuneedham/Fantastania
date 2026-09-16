/**
 * Fantastania's art direction in one file.
 *
 * The premise: in Aetheria, magic is a visible mineral called aether that
 * glows a cold mint-cyan. Everything magical in the game — spells, crystals,
 * shrine-light, enemy corruption — carries that one hue, and nothing else
 * does. Mundane light is warm amber (fire, lanterns, hearths). The world sits
 * in deep indigo-violet shadow between those two light sources.
 *
 * That gives the game a readable rule a player absorbs in a minute: cyan means
 * magic, amber means safety, violet means the unknown. It is also why the game
 * does not look like generic brown-and-green medieval fantasy.
 */
export const C = {
  void: '#070912',
  deepNight: '#0d1024',
  duskBlue: '#161b3a',
  slate: '#232a52',
  mist: '#3b4576',
  haze: '#5a6699',

  /** Signature magic hue. Use sparingly so it keeps its meaning. */
  aether: '#5fe6d0',
  aetherSoft: '#9df5e6',
  aetherDim: '#2a8f86',
  aetherDeep: '#14524f',

  ember: '#ff9a4d',
  emberHot: '#ffd68a',
  emberDeep: '#a8421c',

  blood: '#e0455e',
  bloodDeep: '#7a1f31',

  verdant: '#4bbf7a',
  verdantDeep: '#1f6b4a',
  verdantDark: '#123d2c',
  moss: '#2f7d55',

  bone: '#e8e3d3',
  boneDim: '#b3ae9c',
  stone: '#6f6a7d',
  stoneDark: '#433f52',

  gold: '#f2c14e',
  goldDeep: '#a87c1c',

  shadow: '#1a0f2e',
  violet: '#8b5cf6',
  violetDeep: '#4c2a8f',
  rot: '#7ad14f',

  white: '#f6f7ff',
} as const;

export type ColorName = keyof typeof C;

/** Item rarity colours, shared by loot beams, tooltips and inventory frames. */
export const RARITY_COLORS = {
  common: '#b9bdd0',
  uncommon: '#4bbf7a',
  rare: '#4aa3f0',
  epic: '#a86bf0',
  legendary: '#f2a03d',
} as const;

const hexCache = new Map<string, [number, number, number]>();

function parseHex(hex: string): [number, number, number] {
  const cached = hexCache.get(hex);
  if (cached) return cached;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const rgb: [number, number, number] = [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
  hexCache.set(hex, rgb);
  return rgb;
}

const rgbaCache = new Map<string, string>();

/** `rgba()` string from a hex colour. Cached: this runs inside render loops. */
export function alpha(hex: string, a: number): string {
  const key = hex + '|' + a.toFixed(3);
  let out = rgbaCache.get(key);
  if (out) return out;
  const [r, g, b] = parseHex(hex);
  out = `rgba(${r},${g},${b},${a})`;
  if (rgbaCache.size < 4096) rgbaCache.set(key, out);
  return out;
}

/** Mixes two hex colours. `t`=0 returns `a`, `t`=1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const key = a + '>' + b + '|' + t.toFixed(3);
  let out = rgbaCache.get(key);
  if (out) return out;
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  out = `rgb(${r},${g},${bl})`;
  if (rgbaCache.size < 4096) rgbaCache.set(key, out);
  return out;
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, C.white, amount);
}

export function darken(hex: string, amount: number): string {
  return mix(hex, C.void, amount);
}

/** Shared typography. One display face, one body face, both system stacks. */
export const FONT_DISPLAY = '"Trebuchet MS", "Gill Sans", "Avenir Next", system-ui, sans-serif';
export const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function displayFont(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT_DISPLAY}`;
}

export function bodyFont(size: number, weight = 500): string {
  return `${weight} ${size}px ${FONT_BODY}`;
}
