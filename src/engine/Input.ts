/**
 * Raw device input. Owns nothing game-specific: it records which keys are held,
 * which were pressed this frame, and where every active pointer is in *logical*
 * view coordinates. Controls.ts turns that into named game actions.
 */

export interface PointerState {
  id: number;
  /** Logical view coordinates (see Renderer). */
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** True only on the frame the pointer went down. */
  justDown: boolean;
  /** Set once a pointer is claimed by a control so nothing else reacts to it. */
  claimedBy: string | null;
}

export type ScreenToView = (clientX: number, clientY: number, out: { x: number; y: number }) => void;

export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  readonly pointers = new Map<number, PointerState>();

  /** Pointers that went down this frame and have not yet been claimed. */
  private readonly downQueue: number[] = [];
  private readonly scratch = { x: 0, y: 0 };
  private detach: Array<() => void> = [];

  /** True once any touch is seen; drives the on-screen control layout. */
  touchActive = false;
  /** Mouse position in logical view coordinates. */
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseJustDown = false;
  wheelDelta = 0;
  /** True once the mouse has actually moved; before that its position is a lie. */
  mouseEverMoved = false;
  /** performance.now() of the last mouse movement. */
  lastMouseMove = -Infinity;

  constructor(
    private readonly target: HTMLElement,
    private readonly toView: ScreenToView,
  ) {}

  attach(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const code = e.code;
      // Keep browser shortcuts (F5, devtools) but swallow scroll/space keys.
      if (SWALLOWED_KEYS.has(code)) e.preventDefault();
      this.held.add(code);
      this.pressed.add(code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.held.delete(e.code);
      this.released.add(e.code);
    };
    const onBlur = () => {
      this.held.clear();
      this.pointers.clear();
      this.mouseDown = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.touchActive = true;
      // Capture keeps a thumb that slides off a button still reporting to us.
      // It throws for synthetic events and on some embedded WebViews, and a
      // failure here must never abort the rest of the handler.
      try {
        this.target.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture unavailable; pointer still tracked below */
      }
      this.toView(e.clientX, e.clientY, this.scratch);
      this.pointers.set(e.pointerId, {
        id: e.pointerId,
        x: this.scratch.x,
        y: this.scratch.y,
        startX: this.scratch.x,
        startY: this.scratch.y,
        justDown: true,
        claimedBy: null,
      });
      this.downQueue.push(e.pointerId);
      if (e.pointerType === 'mouse') {
        this.mouseDown = true;
        this.mouseJustDown = true;
      }
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      this.toView(e.clientX, e.clientY, this.scratch);
      if (e.pointerType === 'mouse') {
        // Ignore sub-pixel jitter so a resting mouse does not read as aiming.
        if (Math.abs(this.scratch.x - this.mouseX) + Math.abs(this.scratch.y - this.mouseY) > 1.5) {
          this.mouseEverMoved = true;
          this.lastMouseMove = performance.now();
        }
        this.mouseX = this.scratch.x;
        this.mouseY = this.scratch.y;
      }
      const p = this.pointers.get(e.pointerId);
      if (p) {
        p.x = this.scratch.x;
        p.y = this.scratch.y;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      try {
        this.target.releasePointerCapture?.(e.pointerId);
      } catch {
        /* never captured */
      }
      if (e.pointerType === 'mouse') this.mouseDown = false;
    };
    const onWheel = (e: WheelEvent) => {
      this.wheelDelta += e.deltaY;
      e.preventDefault();
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.target.addEventListener('pointerdown', onPointerDown);
    this.target.addEventListener('pointermove', onPointerMove);
    this.target.addEventListener('pointerup', onPointerUp);
    this.target.addEventListener('pointercancel', onPointerUp);
    this.target.addEventListener('wheel', onWheel, { passive: false });
    this.target.addEventListener('contextmenu', onContextMenu);

    this.detach = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => this.target.removeEventListener('pointerdown', onPointerDown),
      () => this.target.removeEventListener('pointermove', onPointerMove),
      () => this.target.removeEventListener('pointerup', onPointerUp),
      () => this.target.removeEventListener('pointercancel', onPointerUp),
      () => this.target.removeEventListener('wheel', onWheel),
      () => this.target.removeEventListener('contextmenu', onContextMenu),
    ];
  }

  dispose(): void {
    for (const fn of this.detach) fn();
    this.detach = [];
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  isAnyDown(codes: readonly string[]): boolean {
    for (const c of codes) if (this.held.has(c)) return true;
    return false;
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasAnyPressed(codes: readonly string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  /** Returns and consumes an unclaimed pointer that went down this frame. */
  claimPointer(owner: string, test: (p: PointerState) => boolean): PointerState | null {
    for (let i = 0; i < this.downQueue.length; i++) {
      const p = this.pointers.get(this.downQueue[i]);
      if (!p || p.claimedBy) continue;
      if (!test(p)) continue;
      p.claimedBy = owner;
      return p;
    }
    return null;
  }

  pointerById(id: number): PointerState | undefined {
    return this.pointers.get(id);
  }

  /** Clears per-frame edge state. Call at the very end of a frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.downQueue.length = 0;
    this.mouseJustDown = false;
    this.wheelDelta = 0;
    for (const p of this.pointers.values()) p.justDown = false;
  }
}

const SWALLOWED_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
]);
