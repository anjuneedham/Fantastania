import type { SpriteSheetDef } from '../engine/SpriteSheet';

/**
 * Registered sprite sheets.
 *
 * This is the pattern every future hand-drawn or generated character sheet
 * follows: measure the frame grid once, describe each row as a named clip,
 * register it here, then reference the id from a character/enemy/NPC record.
 * The renderer never hard-codes a sheet — it reads whichever clip name the
 * actor's current pose maps to.
 */
export const SPRITE_SHEETS: Record<string, SpriteSheetDef> = {
  corruptedMage: {
    id: 'corruptedMage',
    src: 'sprites/corrupted_mage.png',
    frameWidth: 160,
    frameHeight: 128,
    // Feet sit a little above the cell's bottom edge and centred horizontally.
    anchorX: 80,
    anchorY: 118,
    clips: {
      idle: { row: 0, startCol: 0, frameCount: 8, fps: 8, loop: true },
      walk: { row: 1, startCol: 0, frameCount: 8, fps: 10, loop: true },
      cast: { row: 2, startCol: 0, frameCount: 8, fps: 14, loop: false },
      attack: { row: 3, startCol: 0, frameCount: 8, fps: 14, loop: false },
      ultimate: { row: 4, startCol: 0, frameCount: 17, fps: 16, loop: false },
      hurt: { row: 5, startCol: 0, frameCount: 5, fps: 12, loop: false },
      death: { row: 6, startCol: 0, frameCount: 8, fps: 10, loop: false },
    },
  },
};

export function trySpriteSheet(id: string | undefined): SpriteSheetDef | undefined {
  return id ? SPRITE_SHEETS[id] : undefined;
}
