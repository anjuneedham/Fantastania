import type { StorageAdapter } from '../engine/Storage';
import { SaveSystem } from './systems/SaveSystem';

/**
 * The live SaveSystem instance.
 *
 * A module singleton for the same reason GameState is one: the engine must not
 * know that saving exists, and threading a save handle through every scene
 * constructor buys nothing. Created during boot, once storage has resolved.
 */
let instance: SaveSystem | null = null;

export function initSaves(storage: StorageAdapter): SaveSystem {
  instance = new SaveSystem(storage);
  return instance;
}

/** The save system, or null before boot has finished wiring storage. */
export function trySaves(): SaveSystem | null {
  return instance;
}

export function saves(): SaveSystem {
  if (!instance) throw new Error('Save system used before boot completed.');
  return instance;
}
