import { AudioBus } from './AudioBus';
import { Camera } from './Camera';
import { Controls } from './Controls';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { SceneManager } from './SceneManager';
import { createStorage, type StorageAdapter } from './Storage';
import { clamp } from './math';
import { fx } from './Rng';

/**
 * Root engine container: owns the canvas, the services every scene needs, and
 * the frame loop. Deliberately knows nothing about Aetheria — game state lives
 * in `src/game/GameState.ts` and scenes wire the two together.
 */

/** Simulation runs at a fixed step so combat timing is frame-rate independent. */
export const FIXED_STEP = 1 / 60;
/** Never simulate more than this many steps in one frame (tab-restore spikes). */
const MAX_STEPS = 5;

export interface GameStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  entities: number;
}

export class Game {
  readonly renderer: Renderer;
  readonly input: Input;
  readonly controls: Controls;
  readonly camera = new Camera();
  readonly audio = new AudioBus();
  readonly scenes: SceneManager;
  storage!: StorageAdapter;

  readonly stats: GameStats = { fps: 60, frameMs: 0, drawCalls: 0, entities: 0 };

  /** Seconds since boot, advanced by the simulation (pauses when paused). */
  time = 0;
  /** Wall-clock seconds since boot; keeps animating while paused. */
  realTime = 0;
  paused = false;

  private rafId = 0;
  private lastTs = 0;
  private accumulator = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private running = false;
  private detach: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas, (cx, cy, out) => this.renderer.toView(cx, cy, out));
    this.controls = new Controls(this.input);
    this.scenes = new SceneManager(this);
  }

  async init(): Promise<void> {
    this.storage = await createStorage();
    this.input.attach();
    this.handleResize();

    const onResize = () => this.handleResize();
    const onVisibility = () => {
      if (document.hidden) {
        this.audio.suspend();
      } else {
        this.audio.resume();
        // Drop accumulated time so returning to the tab does not fast-forward.
        this.lastTs = performance.now();
        this.accumulator = 0;
      }
    };
    // The first gesture of any kind unlocks WebAudio.
    const onFirstGesture = () => {
      void this.audio.unlock();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    this.detach = [
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('orientationchange', onResize),
      () => document.removeEventListener('visibilitychange', onVisibility),
    ];

    if (window.visualViewport) {
      const vv = window.visualViewport;
      const onVv = () => this.handleResize();
      vv.addEventListener('resize', onVv);
      this.detach.push(() => vv.removeEventListener('resize', onVv));
    }
  }

  handleResize(): void {
    const parent = this.renderer.canvas.parentElement ?? document.body;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    if (this.renderer.resize(w, h)) this.scenes.onResize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    const frame = (ts: number) => {
      this.rafId = requestAnimationFrame(frame);
      this.tick(ts);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    for (const fn of this.detach) fn();
    this.detach = [];
    this.input.dispose();
    this.audio.stopMusic();
  }

  private tick(ts: number): void {
    const frameStart = ts;
    // Clamp so a long stall (GC, tab switch) never produces a huge dt.
    let dt = clamp((ts - this.lastTs) / 1000, 0, 0.25);
    this.lastTs = ts;
    this.realTime += dt;

    void this.scenes.flush();

    this.controls.update(this.renderer, this.camera, dt);

    if (this.paused) dt = 0;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      this.time += FIXED_STEP;
      this.scenes.update(FIXED_STEP);
      this.camera.update(FIXED_STEP, () => fx.next());
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    // Overlay scenes still need a heartbeat while the sim is paused.
    if (this.paused) this.scenes.update(0);

    this.stats.drawCalls = 0;
    this.renderer.begin();
    this.scenes.render(this.renderer);

    this.input.endFrame();

    this.fpsAccum += performance.now() - frameStart;
    this.fpsFrames++;
    if (this.fpsFrames >= 30) {
      this.stats.frameMs = this.fpsAccum / this.fpsFrames;
      this.stats.fps = Math.round(1000 / Math.max(0.1, this.stats.frameMs));
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      // Auto-drop effects if the device cannot keep a comfortable budget.
      this.renderer.quality = this.stats.frameMs > 24 ? 'low' : 'high';
    }
  }
}
