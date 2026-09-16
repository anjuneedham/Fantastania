import type { Game } from './Game';
import type { Renderer } from './Renderer';

/**
 * A screen or mode. Scenes are pushed onto a stack, so a pause or dialogue
 * scene can sit on top of the world without the world losing its state.
 */
export abstract class Scene {
  /** Injected by SceneManager before `enter`. */
  game!: Game;

  /** When true, scenes below this one still render (used for overlays). */
  readonly transparent: boolean = false;
  /** When true, scenes below this one still update (rare; overlays freeze). */
  readonly updateBelow: boolean = false;

  /** Called once when the scene becomes active. May load asynchronously. */
  async enter(_params?: unknown): Promise<void> {}
  /** Called when the scene is popped or replaced. Release listeners here. */
  exit(): void {}
  /** Called when the scene is covered by another (but not destroyed). */
  suspend(): void {}
  /** Called when a covering scene is popped. */
  resume(): void {}

  update(_dt: number): void {}
  render(_r: Renderer): void {}
  onResize(): void {}

  /**
   * Android hardware back / browser back. Return true when handled; returning
   * false lets the platform layer decide (usually: exit the app).
   */
  onBack(): boolean {
    return false;
  }
}
