import { Input } from './Input';
import { VirtualPad, type PadButtonId } from './VirtualPad';
import type { Renderer } from './Renderer';
import type { Camera } from './Camera';

/**
 * Merges keyboard/mouse and touch into one set of named game actions, so every
 * gameplay system reads `controls.pressed('dodge')` and never asks which device
 * the player is holding. Rebinding later means editing KEY_BINDINGS only.
 */

export type ActionId =
  | 'attack' | 'heavy' | 'dodge' | 'block'
  | 'ability1' | 'ability2' | 'ultimate'
  | 'interact' | 'pause' | 'bag'
  | 'character' | 'skills' | 'quests' | 'map' | 'confirm' | 'cancel';

export const KEY_BINDINGS: Record<ActionId, readonly string[]> = {
  attack: ['Space', 'KeyJ', 'Mouse0'],
  heavy: ['KeyK', 'ShiftLeft', 'Mouse2'],
  dodge: ['ShiftRight', 'KeyL', 'ControlLeft'],
  block: ['KeyF'],
  ability1: ['Digit1', 'KeyQ'],
  ability2: ['Digit2', 'KeyE'],
  ultimate: ['Digit3', 'KeyR'],
  interact: ['KeyE', 'Enter'],
  pause: ['Escape'],
  bag: ['KeyI', 'Tab'],
  character: ['KeyC'],
  skills: ['KeyP'],
  quests: ['KeyO'],
  map: ['KeyM'],
  confirm: ['Enter', 'Space'],
  cancel: ['Escape', 'Backspace'],
};

const MOVE_LEFT = ['KeyA', 'ArrowLeft'];
const MOVE_RIGHT = ['KeyD', 'ArrowRight'];
const MOVE_UP = ['KeyW', 'ArrowUp'];
const MOVE_DOWN = ['KeyS', 'ArrowDown'];

/** Actions that also exist as a touch button. */
const PAD_ACTIONS: Partial<Record<ActionId, PadButtonId>> = {
  attack: 'attack',
  heavy: 'heavy',
  dodge: 'dodge',
  block: 'block',
  ability1: 'ability1',
  ability2: 'ability2',
  ultimate: 'ultimate',
  interact: 'interact',
  bag: 'bag',
  pause: 'pause',
};

/** How long after the last mouse movement the cursor still steers facing. */
const MOUSE_AIM_TIMEOUT_MS = 1600;

export class Controls {
  readonly input: Input;
  readonly pad = new VirtualPad();

  /** Movement vector, magnitude 0..1. */
  moveX = 0;
  moveY = 0;
  /** Aim direction, unit length. Zero when the player has not aimed. */
  aimX = 0;
  aimY = 0;
  /** True while the player is aiming explicitly (mouse on desktop). */
  aiming = false;

  /** Set by scenes so gameplay controls go dead while a menu is open. */
  gameplayEnabled = true;

  private readonly scratch = { x: 0, y: 0 };

  constructor(input: Input) {
    this.input = input;
  }

  update(r: Renderer, camera: Camera, dt: number): void {
    this.pad.update(this.input, r, dt);

    if (!this.gameplayEnabled) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    let mx = 0;
    let my = 0;
    if (this.input.isAnyDown(MOVE_LEFT)) mx -= 1;
    if (this.input.isAnyDown(MOVE_RIGHT)) mx += 1;
    if (this.input.isAnyDown(MOVE_UP)) my -= 1;
    if (this.input.isAnyDown(MOVE_DOWN)) my += 1;
    if (mx !== 0 || my !== 0) {
      // Normalise so diagonal movement is not faster than cardinal.
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    } else if (this.pad.axisX !== 0 || this.pad.axisY !== 0) {
      mx = this.pad.axisX;
      my = this.pad.axisY;
    }
    this.moveX = mx;
    this.moveY = my;

    // Desktop aims with the mouse, but only while the mouse is actually being
    // used: a resting cursor must not pin the character's facing to wherever it
    // happens to sit (including the top-left corner it starts at). Otherwise
    // facing follows movement, which is what a keyboard-only player expects.
    const mouseFresh =
      this.input.mouseEverMoved &&
      (this.input.mouseDown ||
        performance.now() - this.input.lastMouseMove < MOUSE_AIM_TIMEOUT_MS);
    if (!this.input.touchActive && mouseFresh) {
      camera.viewToWorld(this.input.mouseX, this.input.mouseY, r, this.scratch);
      this.aimWorldX = this.scratch.x;
      this.aimWorldY = this.scratch.y;
      this.aiming = true;
    } else {
      this.aiming = false;
    }
  }

  /** World-space point the player is aiming at (desktop only). */
  aimWorldX = 0;
  aimWorldY = 0;

  down(action: ActionId): boolean {
    if (!this.gameplayEnabled && action !== 'pause' && action !== 'cancel') return false;
    const padId = PAD_ACTIONS[action];
    if (padId && this.pad.isDown(padId)) return true;
    const keys = KEY_BINDINGS[action];
    for (const key of keys) {
      if (key === 'Mouse0') {
        if (this.input.mouseDown) return true;
      } else if (this.input.isDown(key)) {
        return true;
      }
    }
    return false;
  }

  pressed(action: ActionId): boolean {
    const padId = PAD_ACTIONS[action];
    if (padId && this.pad.wasPressed(padId)) return true;
    const keys = KEY_BINDINGS[action];
    for (const key of keys) {
      if (key === 'Mouse0') {
        if (this.input.mouseJustDown) return true;
      } else if (key.startsWith('Mouse')) {
        continue;
      } else if (this.input.wasPressed(key)) {
        return true;
      }
    }
    return false;
  }

  /** Press check that ignores the gameplay-disabled gate (menu navigation). */
  pressedRaw(action: ActionId): boolean {
    for (const key of KEY_BINDINGS[action]) {
      if (!key.startsWith('Mouse') && this.input.wasPressed(key)) return true;
    }
    return false;
  }
}
