import { TAU, clamp01 } from '../engine/math';
import { fx as rng } from '../engine/Rng';
import { C, alpha } from './palette';
import { starPath } from './sprites';

/**
 * Particles and floating combat text.
 *
 * Both are fixed-capacity arrays of plain objects reused in place: no
 * allocation happens during combat, which is what keeps frame times flat on a
 * mid-range phone when six enemies die at once.
 */

export type ParticleKind =
  | 'spark' | 'smoke' | 'ember' | 'shard' | 'ring' | 'slash' | 'dust' | 'leaf' | 'rune';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Vertical offset used to fake height above the ground. */
  z: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  gravity: number;
  drag: number;
}

const MAX_PARTICLES = 420;

export class ParticleSystem {
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0,
        life: 0, maxLife: 1, size: 3, rotation: 0, spin: 0, color: C.white,
        gravity: 0, drag: 2,
      });
    }
  }

  /** Oldest-first reuse: when the pool is full, new effects win. */
  private next(): Particle {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return p;
  }

  emit(
    kind: ParticleKind,
    x: number,
    y: number,
    count: number,
    color: string,
    opts: {
      speed?: number; spread?: number; angle?: number; size?: number;
      life?: number; gravity?: number; drag?: number; rise?: number;
    } = {},
  ): void {
    const speed = opts.speed ?? 90;
    const spread = opts.spread ?? TAU;
    const baseAngle = opts.angle ?? 0;
    const size = opts.size ?? 3;
    const life = opts.life ?? 0.5;

    for (let i = 0; i < count; i++) {
      const p = this.next();
      const a = baseAngle + (rng.next() - 0.5) * spread;
      const s = speed * (0.55 + rng.next() * 0.75);
      p.active = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s * 0.55; // Flatten: the world is viewed at an angle.
      p.z = 0;
      p.vz = opts.rise ?? (kind === 'ember' || kind === 'smoke' ? 40 + rng.next() * 40 : 0);
      p.maxLife = life * (0.7 + rng.next() * 0.6);
      p.life = p.maxLife;
      p.size = size * (0.6 + rng.next() * 0.8);
      p.rotation = rng.angle();
      p.spin = (rng.next() - 0.5) * 12;
      p.color = color;
      p.gravity = opts.gravity ?? (kind === 'shard' || kind === 'dust' ? 260 : 0);
      p.drag = opts.drag ?? 2.4;
    }
  }

  /** A single expanding ring; used for novas, impacts and level-ups. */
  ring(x: number, y: number, radius: number, color: string, life = 0.4): void {
    const p = this.next();
    p.active = true;
    p.kind = 'ring';
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.z = 0;
    p.vz = 0;
    p.maxLife = life;
    p.life = life;
    p.size = radius;
    p.rotation = 0;
    p.spin = 0;
    p.color = color;
    p.gravity = 0;
    p.drag = 0;
  }

  slash(x: number, y: number, angle: number, radius: number, color: string): void {
    const p = this.next();
    p.active = true;
    p.kind = 'slash';
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.z = 0;
    p.vz = 0;
    p.maxLife = 0.22;
    p.life = 0.22;
    p.size = radius;
    p.rotation = angle;
    p.spin = 0;
    p.color = color;
    p.gravity = 0;
    p.drag = 0;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
      }
      p.rotation += p.spin * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    const skip = quality === 'low' ? 2 : 1;
    let index = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      index++;
      if (skip > 1 && index % skip === 0 && p.kind !== 'ring' && p.kind !== 'slash') continue;

      const t = clamp01(p.life / p.maxLife);
      const y = p.y - p.z;

      switch (p.kind) {
        case 'ring': {
          const grow = 1 - t;
          ctx.strokeStyle = alpha(p.color, t * 0.85);
          ctx.lineWidth = 2 + t * 3;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * grow, p.size * grow * 0.5, 0, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'slash': {
          const sweep = 1 - t;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.strokeStyle = alpha(p.color, t);
          ctx.lineWidth = 5 * t + 1;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.7 + sweep * 0.3), -0.9, -0.9 + 1.8 * sweep);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'shard': {
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = alpha(p.color, t);
          ctx.fillRect(-p.size * 0.5, -p.size * 0.2, p.size, p.size * 0.4);
          ctx.restore();
          break;
        }
        case 'rune': {
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = alpha(p.color, t * 0.9);
          starPath(ctx, 0, 0, p.size, p.size * 0.38, 4, 0);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'smoke': {
          ctx.fillStyle = alpha(p.color, t * 0.28);
          ctx.beginPath();
          ctx.arc(p.x, y, p.size * (1.6 - t), 0, TAU);
          ctx.fill();
          break;
        }
        case 'leaf': {
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = alpha(p.color, t);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        default: {
          // spark / ember / dust: a glowing dot that shrinks as it dies.
          ctx.fillStyle = alpha(p.color, t);
          ctx.beginPath();
          ctx.arc(p.x, y, p.size * t, 0, TAU);
          ctx.fill();
          break;
        }
      }
    }
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }
}

/* ------------------------------------------------------------------ */
/* Floating combat text                                                */
/* ------------------------------------------------------------------ */

interface FloatingText {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  crit: boolean;
}

const MAX_TEXTS = 48;

export class FloatingTextSystem {
  private readonly pool: FloatingText[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_TEXTS; i++) {
      this.pool.push({
        active: false, text: '', x: 0, y: 0, vy: -40, life: 0, maxLife: 1,
        color: C.white, size: 14, crit: false,
      });
    }
  }

  push(text: string, x: number, y: number, color: string, crit = false): void {
    const t = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_TEXTS;
    t.active = true;
    t.text = text;
    // Jitter so simultaneous hits do not stack into an unreadable pile.
    t.x = x + (rng.next() - 0.5) * 16;
    t.y = y;
    t.vy = crit ? -66 : -48;
    t.maxLife = crit ? 1.1 : 0.85;
    t.life = t.maxLife;
    t.color = color;
    t.size = crit ? 20 : 14;
    t.crit = crit;
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy += 66 * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.pool) {
      if (!t.active) continue;
      const k = clamp01(t.life / t.maxLife);
      // Pop in: overshoot the size briefly so crits read as impactful.
      const pop = t.crit ? 1 + Math.max(0, (k - 0.82) * 4) : 1;
      ctx.font = `${t.crit ? 800 : 700} ${t.size * pop}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = alpha(C.void, k * 0.85);
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = alpha(t.color, k);
      ctx.fillText(t.text, t.x, t.y);
    }
  }

  clear(): void {
    for (const t of this.pool) t.active = false;
  }
}
