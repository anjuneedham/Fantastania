/**
 * Sprite-sheet animation.
 *
 * A second, optional rendering path alongside the procedural actor renderer in
 * `art/sprites.ts`. Any actor can carry a `spriteSheetId` pointing at a
 * definition here instead of an `ActorSprite` record; the two are not mutually
 * exclusive at the engine level; RenderActor picks whichever the entity has.
 *
 * Design goals, in order:
 *  - Never block gameplay: a sheet that has not finished loading (or fails to
 *    load) draws nothing for that actor rather than throwing, and the caller
 *    can fall back to the procedural renderer if it wants a guaranteed visual.
 *  - Fully data-driven: a new character's sheet is a row/column grid plus a
 *    list of named clips, exactly the same shape as every other data file in
 *    this game.
 *  - One Image and one decoded bitmap per sheet id, shared across every actor
 *    using it, loaded once and cached.
 */

export interface AnimClip {
  /** Row index into the grid, 0-based. */
  row: number;
  /** First column of the clip. */
  startCol: number;
  frameCount: number;
  /** Frames per second. */
  fps: number;
  loop: boolean;
}

export interface SpriteSheetDef {
  id: string;
  /** Path under the app's public root, e.g. "sprites/corrupted_mage.png". */
  src: string;
  frameWidth: number;
  frameHeight: number;
  /** Pixel offset from the frame's top-left to its ground contact point. */
  anchorX: number;
  anchorY: number;
  clips: Record<string, AnimClip>;
}

type LoadState = 'pending' | 'loaded' | 'error';

interface LoadedSheet {
  state: LoadState;
  image: HTMLImageElement;
}

const cache = new Map<string, LoadedSheet>();

/** Kicks off (or reuses) the load for a sheet. Safe to call repeatedly. */
function ensureLoaded(def: SpriteSheetDef): LoadedSheet {
  let entry = cache.get(def.id);
  if (entry) return entry;

  const image = new Image();
  entry = { state: 'pending', image };
  cache.set(def.id, entry);

  image.onload = () => {
    entry!.state = 'loaded';
  };
  image.onerror = () => {
    entry!.state = 'error';
    console.warn(`[sprites] failed to load "${def.src}"; falling back where available`);
  };
  // Vite serves /public at the app root regardless of base path in dev; the
  // production build copies public/ verbatim, so a root-relative path works
  // in both. import.meta.env.BASE_URL covers a non-root deployment.
  image.src = `${import.meta.env.BASE_URL}${def.src}`.replace(/\/{2,}/g, '/');
  return entry;
}

/** True once the sheet's image has decoded and is safe to draw. */
export function isSheetReady(def: SpriteSheetDef): boolean {
  return ensureLoaded(def).state === 'loaded';
}

/**
 * Per-instance playback state. Cheap enough that every animated actor owns
 * one; holds no reference to the sheet definition so it stays serialisation-
 * safe if an entity is ever snapshotted.
 */
export class SpriteAnimator {
  clipName = '';
  frame = 0;
  private elapsed = 0;
  /** True once a non-looping clip has reached its final frame. */
  finished = false;

  /** Switches clips. Restarts from frame 0 unless already playing this clip. */
  play(name: string): void {
    if (this.clipName === name) return;
    this.clipName = name;
    this.frame = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  update(dt: number, def: SpriteSheetDef): void {
    const clip = def.clips[this.clipName];
    if (!clip || clip.frameCount <= 1) return;
    if (this.finished) return;

    this.elapsed += dt;
    const frameDur = 1 / Math.max(1, clip.fps);
    while (this.elapsed >= frameDur) {
      this.elapsed -= frameDur;
      this.frame++;
      if (this.frame >= clip.frameCount) {
        if (clip.loop) {
          this.frame = 0;
        } else {
          this.frame = clip.frameCount - 1;
          this.finished = true;
          break;
        }
      }
    }
  }

  /**
   * Draws the current frame with its feet at (x, y). `flip` mirrors
   * horizontally, matching the procedural renderer's left/right facing.
   */
  render(
    ctx: CanvasRenderingContext2D,
    def: SpriteSheetDef,
    x: number,
    y: number,
    scale: number,
    flip: boolean,
  ): boolean {
    const sheet = ensureLoaded(def);
    if (sheet.state !== 'loaded') return false;

    const clip = def.clips[this.clipName];
    if (!clip) return false;
    const col = clip.startCol + this.frame;
    const sx = col * def.frameWidth;
    const sy = clip.row * def.frameHeight;

    const dw = def.frameWidth * scale;
    const dh = def.frameHeight * scale;

    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(
      sheet.image,
      sx, sy, def.frameWidth, def.frameHeight,
      -def.anchorX * scale, -def.anchorY * scale, dw, dh,
    );
    ctx.restore();
    return true;
  }
}

/** Preloads a sheet ahead of first use, e.g. while an area is loading. */
export function preloadSheet(def: SpriteSheetDef): void {
  ensureLoaded(def);
}
