import type { Input, PointerState } from './Input';
import type { Renderer } from './Renderer';
import { clamp, dist2 } from './math';

/**
 * On-screen touch controls: a dynamic left-thumb joystick and a right-thumb
 * button fan.
 *
 * Layout notes, because these numbers are the difference between a game that
 * feels good on a phone and one that does not:
 *  - The joystick spawns wherever the thumb lands in the left zone rather than
 *    living at a fixed spot, so the player never has to look down to find it.
 *  - Buttons are laid out as an arc around the natural pivot of a right thumb
 *    resting at the bottom-right corner, not as a grid.
 *  - Every radius is >= 34 logical units, which stays above a 44px physical
 *    touch target even on a small phone in landscape.
 */

export type PadButtonId =
  | 'attack' | 'heavy' | 'dodge' | 'block'
  | 'ability1' | 'ability2' | 'ultimate'
  | 'interact' | 'bag' | 'pause';

export interface PadButton {
  id: PadButtonId;
  /** Offset from the anchor corner, in logical units. */
  dx: number;
  dy: number;
  r: number;
  label: string;
  /** Buttons anchored to the top-right instead of the bottom-right. */
  anchor?: 'bottom-right' | 'top-right';
  /** Hidden unless the game says the action is currently meaningful. */
  conditional?: boolean;
}

export const PAD_LAYOUT: readonly PadButton[] = [
  { id: 'attack', dx: -84, dy: -74, r: 48, label: 'Atk' },
  { id: 'heavy', dx: -186, dy: -92, r: 38, label: 'Hvy' },
  { id: 'dodge', dx: -74, dy: -180, r: 38, label: 'Dsh' },
  { id: 'ability1', dx: -172, dy: -192, r: 34, label: '1' },
  { id: 'ability2', dx: -252, dy: -152, r: 34, label: '2' },
  { id: 'ultimate', dx: -268, dy: -68, r: 36, label: 'Ult' },
  { id: 'block', dx: -90, dy: -278, r: 34, label: 'Blk', conditional: true },
  { id: 'interact', dx: -196, dy: -284, r: 36, label: 'Use', conditional: true },
  { id: 'bag', dx: -88, dy: 36, r: 24, label: 'Bag', anchor: 'top-right' },
  { id: 'pause', dx: -34, dy: 36, r: 24, label: 'II', anchor: 'top-right' },
];

export interface PadButtonRuntime {
  def: PadButton;
  x: number;
  y: number;
  visible: boolean;
  enabled: boolean;
  /** 0..1 cooldown sweep, drawn as a radial wipe. */
  cooldown: number;
  /** Glyph drawn in the centre; set by the HUD from ability data. */
  glyph: string;
  tint: string;
  pointerId: number | null;
  down: boolean;
  justPressed: boolean;
  pressFlash: number;
}

export class VirtualPad {
  readonly buttons = new Map<PadButtonId, PadButtonRuntime>();

  /** Joystick state, in logical view units. */
  stickActive = false;
  stickPointer: number | null = null;
  stickBaseX = 0;
  stickBaseY = 0;
  stickKnobX = 0;
  stickKnobY = 0;
  axisX = 0;
  axisY = 0;

  /** How far the knob travels before reading as full deflection. */
  readonly stickTravel = 56;
  readonly stickBaseRadius = 64;
  /** Below this fraction of travel the stick reads as centred (dead zone). */
  readonly deadZone = 0.18;

  /** Set false on desktop until a touch is seen. */
  visible = false;

  constructor() {
    for (const def of PAD_LAYOUT) {
      this.buttons.set(def.id, {
        def,
        x: 0,
        y: 0,
        visible: !def.conditional,
        enabled: true,
        cooldown: 0,
        glyph: def.label,
        tint: '#cfd8ff',
        pointerId: null,
        down: false,
        justPressed: false,
        pressFlash: 0,
      });
    }
  }

  /** Recomputes absolute button positions for the current view + safe areas. */
  layout(r: Renderer): void {
    const rightX = r.viewWidth - r.safeRight;
    const bottomY = r.viewHeight - r.safeBottom;
    const topY = r.safeTop;
    for (const btn of this.buttons.values()) {
      if (btn.def.anchor === 'top-right') {
        btn.x = rightX + btn.def.dx;
        btn.y = topY + btn.def.dy;
      } else {
        btn.x = rightX + btn.def.dx;
        btn.y = bottomY + btn.def.dy;
      }
    }
  }

  setVisible(id: PadButtonId, visible: boolean): void {
    const btn = this.buttons.get(id);
    if (btn) btn.visible = visible;
  }

  update(input: Input, r: Renderer, dt: number): void {
    this.layout(r);
    if (input.touchActive) this.visible = true;

    for (const btn of this.buttons.values()) {
      btn.justPressed = false;
      btn.pressFlash = Math.max(0, btn.pressFlash - dt * 4);
    }

    // Release any pointer that lifted.
    for (const btn of this.buttons.values()) {
      if (btn.pointerId !== null && !input.pointerById(btn.pointerId)) {
        btn.pointerId = null;
        btn.down = false;
      }
    }
    if (this.stickPointer !== null && !input.pointerById(this.stickPointer)) {
      this.releaseStick();
    }

    if (!this.visible) {
      this.axisX = 0;
      this.axisY = 0;
      return;
    }

    // Buttons claim pointers first: they sit on top of the joystick's zone edge.
    for (const btn of this.buttons.values()) {
      if (!btn.visible || !btn.enabled || btn.pointerId !== null) continue;
      const claimed = input.claimPointer(`pad:${btn.def.id}`, (p) =>
        dist2(p.x, p.y, btn.x, btn.y) <= btn.def.r * btn.def.r * TOUCH_FORGIVENESS,
      );
      if (claimed) {
        btn.pointerId = claimed.id;
        btn.down = true;
        btn.justPressed = true;
        btn.pressFlash = 1;
      }
    }

    // Joystick: anywhere in the left portion of the screen that is not a button.
    if (this.stickPointer === null) {
      const zoneWidth = r.viewWidth * 0.46;
      const claimed = input.claimPointer('pad:stick', (p) => p.x < zoneWidth);
      if (claimed) {
        this.stickPointer = claimed.id;
        this.stickActive = true;
        this.stickBaseX = claimed.x;
        this.stickBaseY = claimed.y;
        this.stickKnobX = claimed.x;
        this.stickKnobY = claimed.y;
      }
    }

    if (this.stickPointer !== null) {
      const p = input.pointerById(this.stickPointer) as PointerState;
      let dx = p.x - this.stickBaseX;
      let dy = p.y - this.stickBaseY;
      const len = Math.hypot(dx, dy);
      if (len > this.stickTravel) {
        // Drag the base along so the stick never feels "stuck" at the rim.
        const excess = len - this.stickTravel;
        this.stickBaseX += (dx / len) * excess;
        this.stickBaseY += (dy / len) * excess;
        dx = (dx / len) * this.stickTravel;
        dy = (dy / len) * this.stickTravel;
      }
      this.stickKnobX = this.stickBaseX + dx;
      this.stickKnobY = this.stickBaseY + dy;

      const mag = Math.hypot(dx, dy) / this.stickTravel;
      if (mag < this.deadZone) {
        this.axisX = 0;
        this.axisY = 0;
      } else {
        // Rescale past the dead zone so the first responsive pixel is full slow
        // walk speed rather than an abrupt jump.
        const scaled = clamp((mag - this.deadZone) / (1 - this.deadZone), 0, 1);
        const inv = 1 / Math.max(Math.hypot(dx, dy), 0.0001);
        this.axisX = dx * inv * scaled;
        this.axisY = dy * inv * scaled;
      }
    }
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.stickActive = false;
    this.axisX = 0;
    this.axisY = 0;
  }

  isDown(id: PadButtonId): boolean {
    const b = this.buttons.get(id);
    return !!b && b.visible && b.down;
  }

  wasPressed(id: PadButtonId): boolean {
    const b = this.buttons.get(id);
    return !!b && b.visible && b.justPressed;
  }

  /** Clears held state, e.g. when a menu opens over the pad. */
  releaseAll(): void {
    for (const btn of this.buttons.values()) {
      btn.pointerId = null;
      btn.down = false;
      btn.justPressed = false;
    }
    this.releaseStick();
  }
}

/** Touch targets read a little larger than they draw; fingers are imprecise. */
const TOUCH_FORGIVENESS = 1.45;
