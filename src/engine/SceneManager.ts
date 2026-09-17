import type { Game } from './Game';
import type { Renderer } from './Renderer';
import type { Scene } from './Scene';

/**
 * Scene stack with a simple cross-fade. Transitions are queued rather than
 * applied mid-frame so a scene can safely request a change from inside its own
 * update without the stack mutating underneath it.
 */
type PendingOp =
  | { kind: 'replace'; scene: Scene; params?: unknown }
  | { kind: 'push'; scene: Scene; params?: unknown }
  | { kind: 'pop' };

export class SceneManager {
  private stack: Scene[] = [];
  private pending: PendingOp[] = [];
  private busy = false;

  /** 0 = fully visible, 1 = fully black. Drives the fade overlay. */
  fade = 1;
  private fadeTarget = 0;
  private fadeSpeed = 3.2;

  constructor(private readonly game: Game) {}

  get active(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  /** Is a scene of this class anywhere in the stack? */
  has(ctor: new (...args: never[]) => Scene): boolean {
    return this.stack.some((s) => s instanceof ctor);
  }

  replace(scene: Scene, params?: unknown): void {
    this.pending.push({ kind: 'replace', scene, params });
  }

  push(scene: Scene, params?: unknown): void {
    this.pending.push({ kind: 'push', scene, params });
  }

  pop(): void {
    this.pending.push({ kind: 'pop' });
  }

  /** Applies queued transitions. Called once per frame before updates. */
  async flush(): Promise<void> {
    if (this.busy || this.pending.length === 0) return;
    this.busy = true;
    try {
      while (this.pending.length > 0) {
        const op = this.pending.shift() as PendingOp;
        if (op.kind === 'replace') {
          for (const s of this.stack) s.exit();
          this.stack.length = 0;
          op.scene.game = this.game;
          this.stack.push(op.scene);
          await op.scene.enter(op.params);
          this.fade = 1;
          this.fadeTarget = 0;
        } else if (op.kind === 'push') {
          this.active?.suspend();
          op.scene.game = this.game;
          this.stack.push(op.scene);
          await op.scene.enter(op.params);
        } else {
          const top = this.stack.pop();
          top?.exit();
          this.active?.resume();
        }
      }
    } finally {
      this.busy = false;
    }
  }

  update(dt: number): void {
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, this.fadeSpeed * dt);
    if (Math.abs(this.fade - this.fadeTarget) < 0.005) this.fade = this.fadeTarget;

    // Walk down from the top until a scene that blocks updates.
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start].updateBelow) start--;
    for (let i = start; i < this.stack.length; i++) this.stack[i].update(dt);
  }

  /**
   * Per-rendered-frame tick for the active scene only. Deliberately not
   * walked down the stack like `update`/`render`: a covered scene must not
   * keep sampling input it cannot act on (its widgets are not reachable),
   * which is exactly what let a covered menu misread a click meant for the
   * scene above it.
   */
  frameUpdate(dt: number): void {
    this.active?.frameUpdate(dt);
  }

  render(r: Renderer): void {
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start].transparent) start--;
    for (let i = start; i < this.stack.length; i++) this.stack[i].render(r);

    if (this.fade > 0.004) {
      const ctx = r.ctx;
      ctx.save();
      ctx.setTransform(r.scale, 0, 0, r.scale, r.offsetX * r.dpr, r.offsetY * r.dpr);
      ctx.globalAlpha = this.fade;
      ctx.fillStyle = '#05060c';
      ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);
      ctx.restore();
    }
  }

  /** Fades to black; resolve happens after roughly `seconds`. */
  fadeOut(seconds = 0.35): Promise<void> {
    this.fadeTarget = 1;
    this.fadeSpeed = 1 / Math.max(0.05, seconds);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  fadeIn(seconds = 0.35): void {
    this.fadeTarget = 0;
    this.fadeSpeed = 1 / Math.max(0.05, seconds);
  }

  onResize(): void {
    for (const s of this.stack) s.onResize();
  }

  handleBack(): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].onBack()) return true;
    }
    return false;
  }
}
