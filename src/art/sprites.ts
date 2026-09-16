import { C, alpha, darken, lighten, mix } from './palette';
import { TAU, clamp, clamp01 } from '../engine/math';

/**
 * Actors are drawn as parametric puppets rather than sprite sheets.
 *
 * Why: it removes the asset pipeline from the critical path entirely (no
 * missing PNG can ever block gameplay), it gives free smooth animation and
 * per-character recolouring, and every visual is a *data record* — so when real
 * art arrives, an ActorSprite grows an `atlas` field and `drawActor` branches
 * once. No gameplay code changes.
 */

export type ActorShape = 'humanoid' | 'beast' | 'blob' | 'skeleton' | 'wisp';

export interface WeaponVisual {
  kind: 'sword' | 'axe' | 'staff' | 'dagger' | 'claw' | 'bow' | 'none';
  length: number;
  color: string;
  glow?: string;
}

export interface ActorSprite {
  shape: ActorShape;
  /** Feet-to-crown height in world units. */
  height: number;
  /** Body width multiplier: 0.8 slim, 1.3 hulking. */
  build: number;
  skin: string;
  hair: string;
  primary: string;
  secondary: string;
  accent: string;
  /** Trousers/lower body. Falls back to a darkened `primary`. */
  legs?: string;
  cloak?: string;
  hood?: boolean;
  horns?: boolean;
  eyeColor?: string;
  eyeCount?: number;
  /** Eyes that emit light (spirits, corrupted things). Default false. */
  eyeGlow?: boolean;
  /** Ambient glow around the actor; the visual tell for magical beings. */
  aura?: { color: string; radius: number; intensity: number };
  weapon?: WeaponVisual;
}

export interface ActorPose {
  /** Facing angle in radians. */
  facing: number;
  /** 0 = still, 1 = full sprint. Drives the walk cycle. */
  moveSpeed01: number;
  /** Seconds, monotonically increasing; drives idle bob and cycles. */
  animTime: number;
  /** 0..1 through an attack, or -1 when not attacking. */
  attackProgress: number;
  attackKind: 'light' | 'heavy' | 'cast' | null;
  /** 0..1, fades after taking damage. */
  hitFlash: number;
  /** >0 while staggered. */
  stagger: number;
  /** 0..1 death collapse. */
  death: number;
  /** Extra vertical scale for squash/stretch (1 = neutral). */
  squash: number;
  /** 0..1 while blocking. */
  block: number;
}

export function createPose(): ActorPose {
  return {
    facing: Math.PI / 2,
    moveSpeed01: 0,
    animTime: 0,
    attackProgress: -1,
    attackKind: null,
    hitFlash: 0,
    stagger: 0,
    death: 0,
    squash: 1,
    block: 0,
  };
}

/**
 * Fills the current path and traces it with a darker contour.
 *
 * Small figures on textured ground lose their silhouette without one, and a
 * contour costs a single extra stroke per body part.
 */
function fillOutlined(
  ctx: CanvasRenderingContext2D,
  color: string,
  lineWidth: number,
  outlineStrength = 0.55,
): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = darken(color, outlineStrength);
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Which of the three view angles a facing direction reads as. */
function viewOf(facing: number): { flip: number; front: number } {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  return { flip: fx < 0 ? -1 : 1, front: fy };
}

/**
 * Draws an actor with its feet at (x, y). Everything is relative to
 * `sprite.height`, so the same code renders a knee-high slime and a boss.
 */
export function drawActor(
  ctx: CanvasRenderingContext2D,
  sprite: ActorSprite,
  pose: ActorPose,
  x: number,
  y: number,
  quality: 'high' | 'low' = 'high',
): void {
  const h = sprite.height;
  const dead = pose.death > 0;

  ctx.save();
  ctx.translate(x, y);

  // Ground shadow: sells contact with the floor more than any other single cue.
  const shadowScale = 1 - pose.death * 0.7;
  ctx.globalAlpha = 0.34 * shadowScale;
  ctx.fillStyle = C.void;
  ctx.beginPath();
  ctx.ellipse(0, 0, h * 0.30 * sprite.build * shadowScale, h * 0.12 * shadowScale, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (sprite.aura && quality === 'high') {
    drawAura(ctx, sprite.aura, h, pose.animTime, pose.death);
  }

  if (dead) {
    // Collapse: sink, flatten and rotate onto the ground.
    const d = pose.death;
    ctx.globalAlpha = 1 - d * 0.85;
    ctx.translate(0, h * 0.12 * d);
    ctx.rotate(d * 1.15 * (viewOf(pose.facing).flip));
    ctx.scale(1 + d * 0.15, 1 - d * 0.45);
  }

  ctx.scale(1, pose.squash);

  switch (sprite.shape) {
    case 'beast':
      drawBeast(ctx, sprite, pose);
      break;
    case 'blob':
      drawBlob(ctx, sprite, pose);
      break;
    case 'wisp':
      drawWisp(ctx, sprite, pose);
      break;
    case 'skeleton':
    case 'humanoid':
    default:
      drawHumanoid(ctx, sprite, pose);
      break;
  }

  // Damage flash is a white overlay clipped to the silhouette we just drew, so
  // it reads on every shape without per-shape code.
  if (pose.hitFlash > 0.01) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = alpha(C.white, clamp01(pose.hitFlash) * 0.8);
    ctx.fillRect(-h, -h * 1.4, h * 2, h * 1.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
}

function drawAura(
  ctx: CanvasRenderingContext2D,
  aura: { color: string; radius: number; intensity: number },
  h: number,
  t: number,
  death: number,
): void {
  const pulse = 0.85 + Math.sin(t * 2.1) * 0.15;
  const r = aura.radius * pulse * (1 - death);
  if (r <= 0.5) return;
  const cy = -h * 0.5;
  const grad = ctx.createRadialGradient(0, cy, 0, 0, cy, r);
  grad.addColorStop(0, alpha(aura.color, 0.32 * aura.intensity));
  grad.addColorStop(0.55, alpha(aura.color, 0.12 * aura.intensity));
  grad.addColorStop(1, alpha(aura.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, TAU);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Humanoid / skeleton                                                 */
/* ------------------------------------------------------------------ */

function drawHumanoid(ctx: CanvasRenderingContext2D, s: ActorSprite, p: ActorPose): void {
  const h = s.height;
  const w = h * 0.30 * s.build;
  const { flip, front } = viewOf(p.facing);
  const bone = s.shape === 'skeleton';

  // Walk cycle: legs counter-swing, body bobs on the double-frequency.
  const cycle = p.animTime * (6 + p.moveSpeed01 * 6);
  const stride = Math.sin(cycle) * p.moveSpeed01;
  const bob = Math.abs(Math.sin(cycle)) * p.moveSpeed01 * h * 0.035
    + Math.sin(p.animTime * 1.8) * h * 0.012;
  const lean = p.moveSpeed01 * 0.10 * flip + (p.stagger > 0 ? -0.18 * flip : 0);

  const hipY = -h * 0.40;
  const shoulderY = -h * 0.70;
  const headY = -h * 0.84;

  ctx.save();
  ctx.translate(0, -bob);
  ctx.rotate(lean * 0.35);

  // Cloak behind the body, swaying opposite to the stride.
  if (s.cloak) {
    const sway = stride * h * 0.10;
    ctx.fillStyle = darken(s.cloak, 0.25);
    ctx.beginPath();
    ctx.moveTo(-w * 0.75, shoulderY);
    ctx.quadraticCurveTo(-w * 1.25 + sway, hipY, -w * 0.85 + sway * 1.4, -h * 0.06);
    ctx.lineTo(w * 0.85 + sway * 1.4, -h * 0.06);
    ctx.quadraticCurveTo(w * 1.25 + sway, hipY, w * 0.75, shoulderY);
    ctx.closePath();
    ctx.fill();
  }

  // Back arm + weapon, drawn first so it sits behind the torso.
  drawArm(ctx, s, p, -w * 0.62 * flip, shoulderY, -stride, h, flip, false);

  // Legs.
  const legW = w * 0.36;
  const legColor = bone ? s.skin : (s.legs ?? darken(s.primary, 0.42));
  drawLimb(ctx, -legW * 0.78, hipY, stride * h * 0.16, h * 0.40, legW, legColor, bone);
  drawLimb(ctx, legW * 0.78, hipY, -stride * h * 0.16, h * 0.40, legW, legColor, bone);

  // Torso.
  ctx.beginPath();
  roundedTrapezoid(ctx, 0, shoulderY, hipY + h * 0.03, w * 0.92, w * 0.72, h * 0.06);
  fillOutlined(ctx, s.primary, h * 0.035);
  // Upper-left key light on the chest, matching the world's lighting.
  ctx.fillStyle = alpha(lighten(s.primary, 0.3), 0.5);
  ctx.beginPath();
  ctx.ellipse(-w * 0.2, shoulderY + h * 0.09, w * 0.22, h * 0.07, -0.4, 0, TAU);
  ctx.fill();

  // Belt: a narrow band at the waist. It exists to break the torso's vertical
  // mass, so it stays thin — a thick one reads as a stripe, not a garment.
  ctx.fillStyle = s.secondary;
  ctx.fillRect(-w * 0.40, hipY - h * 0.012, w * 0.80, h * 0.034);
  ctx.fillStyle = darken(s.secondary, 0.45);
  ctx.fillRect(-w * 0.09, hipY - h * 0.016, w * 0.18, h * 0.042);

  if (bone) drawRibs(ctx, w, shoulderY, hipY, s.skin);

  // Chest emblem in the accent colour; tiny, but it individualises characters.
  if (front > -0.3 && !bone) {
    ctx.fillStyle = alpha(s.accent, 0.9);
    ctx.beginPath();
    ctx.moveTo(0, shoulderY + h * 0.08);
    ctx.lineTo(w * 0.20, shoulderY + h * 0.16);
    ctx.lineTo(0, shoulderY + h * 0.26);
    ctx.lineTo(-w * 0.20, shoulderY + h * 0.16);
    ctx.closePath();
    ctx.fill();
  }

  // Head.
  drawHead(ctx, s, p, headY, w, h, flip, front);

  // Shield arm when blocking.
  if (p.block > 0.01) {
    ctx.save();
    ctx.globalAlpha = clamp01(p.block);
    const sx = w * 1.05 * flip;
    ctx.fillStyle = mix(s.secondary, C.stone, 0.4);
    ctx.beginPath();
    ctx.ellipse(sx, shoulderY + h * 0.12, w * 0.30, h * 0.20, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = h * 0.018;
    ctx.stroke();
    ctx.restore();
  }

  // Front arm + weapon.
  drawArm(ctx, s, p, w * 0.62 * flip, shoulderY, stride, h, flip, true);

  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  s: ActorSprite,
  p: ActorPose,
  headY: number,
  w: number,
  h: number,
  flip: number,
  front: number,
): void {
  const r = w * 0.60;
  const nod = Math.sin(p.animTime * 2.3) * h * 0.006;
  ctx.save();
  ctx.translate(0, headY + nod);

  if (s.hood) {
    // Hood: a pointed cowl that hides the face, leaving only glowing eyes.
    ctx.fillStyle = s.primary;
    ctx.beginPath();
    ctx.moveTo(-r * 1.15, r * 0.9);
    ctx.quadraticCurveTo(-r * 1.2, -r * 1.5, 0, -r * 1.75);
    ctx.quadraticCurveTo(r * 1.2, -r * 1.5, r * 1.15, r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = darken(s.primary, 0.65);
    ctx.beginPath();
    ctx.ellipse(flip * r * 0.1, r * 0.05, r * 0.72, r * 0.68, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    fillOutlined(ctx, s.skin, r * 0.16);

    if (s.shape === 'skeleton') {
      // Skull: eye sockets and a jaw line, no hair.
      ctx.fillStyle = C.void;
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.08, r * 0.24, r * 0.28, 0, 0, TAU);
      ctx.ellipse(r * 0.34, -r * 0.08, r * 0.24, r * 0.28, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = darken(s.skin, 0.35);
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, r * 0.5);
      ctx.lineTo(r * 0.45, r * 0.5);
      ctx.stroke();
    } else {
      // Hair. From behind it covers the whole head; from the front it is a cap
      // cut off well above the eye line plus two short side locks. Expressed as
      // an explicit arc sweep rather than a clipped shape, because "how much of
      // the face is covered" is the single number that decides whether this
      // reads as a character or as a brown blob.
      if (front < -0.3) {
        ctx.beginPath();
        ctx.arc(0, -r * 0.06, r * 1.02, 0, TAU);
        fillOutlined(ctx, s.hair, r * 0.1);
      } else {
        // 1.13π → 1.87π leaves the cap's lower edge at about 0.4r above centre.
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.03, Math.PI * 1.13, Math.PI * 1.87);
        ctx.closePath();
        fillOutlined(ctx, s.hair, r * 0.1);
        ctx.fillStyle = s.hair;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(side * r * 0.84, -r * 0.16, r * 0.22, r * 0.4, side * 0.18, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  if (s.horns) {
    ctx.fillStyle = mix(s.skin, C.void, 0.45);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.72, -r * 0.55);
      ctx.quadraticCurveTo(side * r * 1.5, -r * 1.5, side * r * 0.85, -r * 1.65);
      ctx.quadraticCurveTo(side * r * 0.8, -r * 1.0, side * r * 0.45, -r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Eyes: only drawn facing towards camera. At this sprite size they are the
  // single clearest signal that a shape is a character, so they get real
  // contrast — dark on skin for people, emissive for anything that glows.
  if (front > -0.35 && s.eyeColor) {
    const n = s.eyeCount ?? 2;
    const eyeY = s.hood ? 0 : -r * 0.06;

    if (!s.hood) {
      // Brow shadow gives the eyes something to sit against.
      ctx.fillStyle = alpha(C.void, 0.14);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.3, r * 0.74, r * 0.2, 0, 0, Math.PI);
      ctx.fill();
    }

    if (s.eyeGlow) {
      const glow = 0.6 + Math.sin(p.animTime * 3.1) * 0.15;
      ctx.shadowColor = s.eyeColor;
      ctx.shadowBlur = r * 0.9 * glow;
    }
    ctx.fillStyle = s.eyeColor;
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * r * 0.86;
      ctx.beginPath();
      ctx.ellipse(spread + flip * r * 0.06, eyeY, r * 0.16, r * 0.22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Catchlight: one bright pixel per eye. Costs nothing, reads as alive.
    if (!s.eyeGlow) {
      ctx.fillStyle = alpha(C.white, 0.75);
      for (let i = 0; i < n; i++) {
        const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * r * 0.86;
        ctx.beginPath();
        ctx.arc(spread + flip * r * 0.06 - r * 0.05, eyeY - r * 0.07, r * 0.055, 0, TAU);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  s: ActorSprite,
  p: ActorPose,
  x: number,
  shoulderY: number,
  swing: number,
  h: number,
  flip: number,
  isWeaponHand: boolean,
): void {
  const armW = h * 0.075 * s.build;
  const armLen = h * 0.28;
  // A small resting splay stops the arms disappearing into the torso outline.
  let angle = swing * 0.5 + (isWeaponHand ? 0.12 : -0.1) * flip;

  // Attack animation: wind up behind, then sweep forward with an ease-out.
  if (isWeaponHand && p.attackProgress >= 0) {
    const t = p.attackProgress;
    if (p.attackKind === 'cast') {
      angle = -1.1 - Math.sin(t * Math.PI) * 0.55;
    } else {
      const wind = p.attackKind === 'heavy' ? 0.32 : 0.22;
      angle = t < wind
        ? -1.1 * (t / wind)
        : -1.1 + 2.6 * easeOutBack((t - wind) / (1 - wind));
    }
  } else if (p.block > 0.01 && isWeaponHand) {
    angle = -0.5;
  }

  ctx.save();
  ctx.translate(x, shoulderY + h * 0.03);
  ctx.rotate(angle * flip);

  capsule(ctx, 0, 0, 0, armLen, armW);
  fillOutlined(ctx, s.shape === 'skeleton' ? s.skin : mix(s.primary, s.skin, 0.3), armW * 0.22);
  // Hand, so the weapon has something to be held by.
  ctx.fillStyle = s.skin;
  ctx.beginPath();
  ctx.arc(0, armLen, armW * 0.56, 0, TAU);
  ctx.fill();

  if (isWeaponHand && s.weapon && s.weapon.kind !== 'none') {
    drawWeapon(ctx, s.weapon, 0, armLen, h, p);
  }
  ctx.restore();
}

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  swing: number,
  len: number,
  width: number,
  color: string,
  bone: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing * 0.04);
  capsule(ctx, 0, 0, swing * 0.3, len, width);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.5);
  ctx.lineWidth = width * 0.3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!bone) {
    // Boot: a darker block at the foot grounds the figure.
    ctx.fillStyle = darken(color, 0.55);
    ctx.beginPath();
    ctx.ellipse(swing * 0.3, len, width * 0.72, width * 0.42, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawRibs(
  ctx: CanvasRenderingContext2D,
  w: number,
  shoulderY: number,
  hipY: number,
  color: string,
): void {
  ctx.strokeStyle = darken(color, 0.3);
  ctx.lineWidth = w * 0.10;
  const span = hipY - shoulderY;
  for (let i = 1; i <= 3; i++) {
    const yy = shoulderY + (span * i) / 4.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, yy);
    ctx.quadraticCurveTo(0, yy + w * 0.16, w * 0.55, yy);
    ctx.stroke();
  }
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponVisual,
  x: number,
  y: number,
  h: number,
  p: ActorPose,
): void {
  const len = h * weapon.length;
  ctx.save();
  ctx.translate(x, y);

  if (weapon.glow) {
    ctx.shadowColor = weapon.glow;
    ctx.shadowBlur = h * 0.22;
  }
  ctx.fillStyle = weapon.color;

  switch (weapon.kind) {
    case 'sword': {
      ctx.fillStyle = C.stoneDark;
      ctx.fillRect(-h * 0.02, -h * 0.02, h * 0.04, h * 0.10);
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.moveTo(-h * 0.035, 0);
      ctx.lineTo(h * 0.035, 0);
      ctx.lineTo(h * 0.018, len);
      ctx.lineTo(0, len + h * 0.05);
      ctx.lineTo(-h * 0.018, len);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.goldDeep;
      ctx.fillRect(-h * 0.09, -h * 0.012, h * 0.18, h * 0.028);
      break;
    }
    case 'axe': {
      ctx.fillStyle = C.emberDeep;
      ctx.fillRect(-h * 0.022, 0, h * 0.044, len);
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.moveTo(0, len * 0.68);
      ctx.quadraticCurveTo(h * 0.20, len * 0.72, h * 0.14, len * 1.02);
      ctx.quadraticCurveTo(h * 0.04, len * 0.94, 0, len * 0.96);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'staff': {
      ctx.fillStyle = weapon.color;
      ctx.fillRect(-h * 0.02, -h * 0.04, h * 0.04, len);
      const orbPulse = 1 + Math.sin(p.animTime * 3) * 0.08;
      ctx.fillStyle = weapon.glow ?? C.aether;
      ctx.beginPath();
      ctx.arc(0, len + h * 0.03, h * 0.07 * orbPulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = alpha(C.white, 0.7);
      ctx.beginPath();
      ctx.arc(-h * 0.02, len + h * 0.01, h * 0.025, 0, TAU);
      ctx.fill();
      break;
    }
    case 'dagger': {
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.moveTo(-h * 0.026, 0);
      ctx.lineTo(h * 0.026, 0);
      ctx.lineTo(0, len);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bow': {
      ctx.strokeStyle = weapon.color;
      ctx.lineWidth = h * 0.028;
      ctx.beginPath();
      ctx.arc(0, len * 0.5, len * 0.55, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = alpha(C.bone, 0.6);
      ctx.lineWidth = h * 0.01;
      ctx.beginPath();
      ctx.moveTo(len * 0.25, len * 0.5 - len * 0.49);
      ctx.lineTo(len * 0.25, len * 0.5 + len * 0.49);
      ctx.stroke();
      break;
    }
    case 'claw': {
      ctx.fillStyle = weapon.color;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * h * 0.03, 0);
        ctx.quadraticCurveTo(i * h * 0.07, len * 0.6, i * h * 0.05, len);
        ctx.quadraticCurveTo(i * h * 0.02, len * 0.6, i * h * 0.01, 0);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Beast (wolves, quadrupeds)                                          */
/* ------------------------------------------------------------------ */

function drawBeast(ctx: CanvasRenderingContext2D, s: ActorSprite, p: ActorPose): void {
  const h = s.height;
  const len = h * 1.5 * s.build;
  const { flip } = viewOf(p.facing);
  const cycle = p.animTime * (7 + p.moveSpeed01 * 8);
  const stride = Math.sin(cycle) * p.moveSpeed01;
  const lunge = p.attackProgress >= 0 ? Math.sin(p.attackProgress * Math.PI) * h * 0.25 : 0;

  ctx.save();
  ctx.scale(flip, 1);
  ctx.translate(lunge, -Math.abs(stride) * h * 0.04);

  // Legs, front pair out of phase with the back pair.
  const legColor = darken(s.primary, 0.35);
  ctx.strokeStyle = legColor;
  ctx.lineWidth = h * 0.10;
  ctx.lineCap = 'round';
  const legPairs: Array<[number, number]> = [
    [len * 0.30, stride],
    [len * 0.24, -stride],
    [-len * 0.26, -stride],
    [-len * 0.32, stride],
  ];
  for (const [lx, sw] of legPairs) {
    ctx.beginPath();
    ctx.moveTo(lx, -h * 0.42);
    ctx.lineTo(lx + sw * h * 0.20, -h * 0.03);
    ctx.stroke();
  }

  // Tail.
  ctx.strokeStyle = s.primary;
  ctx.lineWidth = h * 0.11;
  ctx.beginPath();
  ctx.moveTo(-len * 0.42, -h * 0.60);
  ctx.quadraticCurveTo(
    -len * 0.68, -h * 0.72 + Math.sin(p.animTime * 3.4) * h * 0.08,
    -len * 0.74, -h * 0.44,
  );
  ctx.stroke();

  // Body.
  ctx.fillStyle = s.primary;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.56, len * 0.46, h * 0.24, 0, 0, TAU);
  ctx.fill();
  // Back ridge in the accent colour: the "corrupted" tell on shadow beasts.
  ctx.fillStyle = alpha(s.accent, 0.75);
  ctx.beginPath();
  ctx.moveTo(-len * 0.30, -h * 0.74);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    ctx.lineTo(-len * 0.30 + t * len * 0.58, -h * (0.78 + (i % 2) * 0.06));
  }
  ctx.lineTo(len * 0.26, -h * 0.66);
  ctx.closePath();
  ctx.fill();

  // Head + snout.
  const headX = len * 0.46;
  const headY = -h * 0.70;
  ctx.fillStyle = mix(s.primary, s.secondary, 0.4);
  ctx.beginPath();
  ctx.ellipse(headX, headY, h * 0.22, h * 0.18, -0.15, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX + h * 0.10, headY - h * 0.02);
  ctx.lineTo(headX + h * 0.34, headY + h * 0.06);
  ctx.lineTo(headX + h * 0.10, headY + h * 0.12);
  ctx.closePath();
  ctx.fill();
  // Ears.
  ctx.fillStyle = darken(s.primary, 0.2);
  for (const off of [-0.06, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(headX + off * h, headY - h * 0.14);
    ctx.lineTo(headX + off * h + h * 0.04, headY - h * 0.32);
    ctx.lineTo(headX + off * h + h * 0.10, headY - h * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  // Eye.
  if (s.eyeColor) {
    ctx.fillStyle = s.eyeColor;
    ctx.shadowColor = s.eyeColor;
    ctx.shadowBlur = h * 0.2;
    ctx.beginPath();
    ctx.ellipse(headX + h * 0.08, headY - h * 0.02, h * 0.045, h * 0.032, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Teeth flash during a lunge.
  if (p.attackProgress >= 0) {
    ctx.fillStyle = C.bone;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(headX + h * (0.16 + i * 0.06), headY + h * 0.04);
      ctx.lineTo(headX + h * (0.19 + i * 0.06), headY + h * 0.12);
      ctx.lineTo(headX + h * (0.22 + i * 0.06), headY + h * 0.04);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Blob (slimes)                                                       */
/* ------------------------------------------------------------------ */

function drawBlob(ctx: CanvasRenderingContext2D, s: ActorSprite, p: ActorPose): void {
  const h = s.height;
  const r = h * 0.55 * s.build;
  const t = p.animTime;
  // Wobble: two out-of-phase sines make the body read as liquid, not a ball.
  const sx = 1 + Math.sin(t * 3.4) * 0.09 + p.moveSpeed01 * 0.08;
  const sy = 1 - Math.sin(t * 3.4) * 0.09 + Math.abs(Math.sin(t * 6.8)) * p.moveSpeed01 * 0.16;
  const hop = Math.abs(Math.sin(t * 3.4)) * p.moveSpeed01 * h * 0.18;

  ctx.save();
  ctx.translate(0, -hop);

  ctx.fillStyle = alpha(s.primary, 0.82);
  ctx.beginPath();
  ctx.ellipse(0, -r * sy, r * sx, r * sy, 0, 0, TAU);
  ctx.fill();

  // Inner core: the part that actually looks alive.
  ctx.fillStyle = alpha(s.accent, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, -r * sy * 0.95, r * 0.38 * sx, r * 0.34 * sy, 0, 0, TAU);
  ctx.fill();

  // Specular highlight.
  ctx.fillStyle = alpha(C.white, 0.35);
  ctx.beginPath();
  ctx.ellipse(-r * 0.36, -r * sy * 1.35, r * 0.22, r * 0.14, -0.5, 0, TAU);
  ctx.fill();

  // Suspended motes; this is a magical slime, not a puddle of goo.
  ctx.fillStyle = alpha(s.secondary, 0.8);
  for (let i = 0; i < 4; i++) {
    const a = t * 1.3 + (i * TAU) / 4;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.5, -r * sy + Math.sin(a) * r * 0.42, r * 0.07, 0, TAU);
    ctx.fill();
  }

  if (s.eyeColor) {
    ctx.fillStyle = s.eyeColor;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.24, -r * sy * 1.05, r * 0.09, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Wisp (floating casters, spirits)                                    */
/* ------------------------------------------------------------------ */

function drawWisp(ctx: CanvasRenderingContext2D, s: ActorSprite, p: ActorPose): void {
  const h = s.height;
  const w = h * 0.34 * s.build;
  const { flip, front } = viewOf(p.facing);
  const float = Math.sin(p.animTime * 1.7) * h * 0.05;

  ctx.save();
  ctx.translate(0, -h * 0.10 + float);

  // Tattered robe with a ragged hem — no legs, it hovers.
  const sway = Math.sin(p.animTime * 2.2) * w * 0.12;
  ctx.fillStyle = s.primary;
  ctx.beginPath();
  ctx.moveTo(-w * 0.85, -h * 0.68);
  ctx.quadraticCurveTo(-w * 1.15 + sway, -h * 0.3, -w * 0.95 + sway, 0);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const x = -w * 0.95 + sway + t * w * 1.9;
    ctx.lineTo(x, (i % 2 === 0 ? 0 : h * 0.06) - h * 0.02);
  }
  ctx.quadraticCurveTo(w * 1.15 + sway, -h * 0.3, w * 0.85, -h * 0.68);
  ctx.closePath();
  ctx.fill();

  // Robe trim.
  ctx.strokeStyle = alpha(s.accent, 0.8);
  ctx.lineWidth = h * 0.016;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.45);
  ctx.lineTo(0, -h * 0.30);
  ctx.lineTo(w * 0.5, -h * 0.45);
  ctx.stroke();

  drawArm(ctx, s, p, w * 0.7 * flip, -h * 0.66, 0, h, flip, true);
  drawHead(ctx, { ...s, hood: s.hood ?? true }, p, -h * 0.82, w, h, flip, front);

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                       */
/* ------------------------------------------------------------------ */

function capsule(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number, width: number,
): void {
  const r = width / 2;
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.arc(x0, y0, r, angle + Math.PI / 2, angle - Math.PI / 2);
  ctx.arc(x1, y1, r, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.closePath();
}

function roundedTrapezoid(
  ctx: CanvasRenderingContext2D,
  cx: number, topY: number, bottomY: number,
  topW: number, bottomW: number, radius: number,
): void {
  const r = Math.min(radius, Math.abs(bottomY - topY) / 2);
  ctx.moveTo(cx - topW / 2 + r, topY);
  ctx.lineTo(cx + topW / 2 - r, topY);
  ctx.quadraticCurveTo(cx + topW / 2, topY, cx + topW / 2, topY + r);
  ctx.lineTo(cx + bottomW / 2, bottomY - r);
  ctx.quadraticCurveTo(cx + bottomW / 2, bottomY, cx + bottomW / 2 - r, bottomY);
  ctx.lineTo(cx - bottomW / 2 + r, bottomY);
  ctx.quadraticCurveTo(cx - bottomW / 2, bottomY, cx - bottomW / 2, bottomY - r);
  ctx.lineTo(cx - topW / 2, topY + r);
  ctx.quadraticCurveTo(cx - topW / 2, topY, cx - topW / 2 + r, topY);
  ctx.closePath();
}

function easeOutBack(t: number): number {
  const c = clamp01(t);
  const s = 1.7;
  const u = c - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/** Rounded rectangle path; used constantly by the UI layer. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Star / sparkle polygon, used for loot beams and level-up bursts. */
export function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, outer: number, inner: number, points = 4, rotation = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export { clamp, lighten };
