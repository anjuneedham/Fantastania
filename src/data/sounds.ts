import type { MusicTrackDef, SoundDef } from '../engine/AudioBus';

/**
 * Placeholder audio, defined as synthesis parameters.
 *
 * Nothing here is a recorded asset, which means the game ships with a complete
 * soundscape and zero audio files. To replace any sound with real audio, add a
 * `src` to its record — the `layers` become dead data and the call sites do not
 * change.
 */
export const SOUNDS: SoundDef[] = [
  /* --- UI --- */
  { id: 'ui_click', volume: 0.5, throttleMs: 40, layers: [
    { wave: 'triangle', freq: 660, freqEnd: 880, gain: 0.3, attack: 0.005, decay: 0.07 },
  ] },
  { id: 'ui_back', volume: 0.5, throttleMs: 40, layers: [
    { wave: 'triangle', freq: 520, freqEnd: 330, gain: 0.3, attack: 0.005, decay: 0.09 },
  ] },
  { id: 'ui_hover', volume: 0.25, throttleMs: 60, layers: [
    { wave: 'sine', freq: 900, gain: 0.16, attack: 0.004, decay: 0.05 },
  ] },
  { id: 'ui_confirm', volume: 0.6, layers: [
    { wave: 'triangle', freq: 523, gain: 0.3, attack: 0.01, decay: 0.12 },
    { wave: 'triangle', freq: 784, gain: 0.26, attack: 0.01, decay: 0.16, delay: 0.07 },
  ] },
  { id: 'ui_error', volume: 0.5, layers: [
    { wave: 'square', freq: 180, freqEnd: 120, gain: 0.22, attack: 0.005, decay: 0.16, cutoff: 900 },
  ] },
  { id: 'ui_open', volume: 0.45, layers: [
    { wave: 'sine', freq: 420, freqEnd: 620, gain: 0.24, attack: 0.01, decay: 0.14 },
  ] },

  /* --- Melee --- */
  { id: 'swing_light', volume: 0.5, pitchJitter: 0.12, throttleMs: 60, layers: [
    { wave: 'noise', freq: 0, gain: 0.3, attack: 0.008, decay: 0.13, cutoff: 2400 },
  ] },
  { id: 'swing_heavy', volume: 0.65, pitchJitter: 0.1, throttleMs: 80, layers: [
    { wave: 'noise', freq: 0, gain: 0.42, attack: 0.02, decay: 0.24, cutoff: 1400 },
    { wave: 'sine', freq: 130, freqEnd: 70, gain: 0.3, attack: 0.01, decay: 0.2 },
  ] },
  { id: 'impact_flesh', volume: 0.6, pitchJitter: 0.16, throttleMs: 45, layers: [
    { wave: 'noise', freq: 0, gain: 0.34, attack: 0.004, decay: 0.09, cutoff: 1100 },
    { wave: 'sine', freq: 160, freqEnd: 80, gain: 0.3, attack: 0.004, decay: 0.12 },
  ] },
  { id: 'impact_blunt', volume: 0.7, pitchJitter: 0.1, throttleMs: 45, layers: [
    { wave: 'sine', freq: 96, freqEnd: 48, gain: 0.45, attack: 0.004, decay: 0.22 },
    { wave: 'noise', freq: 0, gain: 0.26, attack: 0.003, decay: 0.08, cutoff: 800 },
  ] },
  { id: 'block', volume: 0.6, pitchJitter: 0.1, throttleMs: 60, layers: [
    { wave: 'square', freq: 320, freqEnd: 210, gain: 0.2, attack: 0.003, decay: 0.12, cutoff: 2600 },
    { wave: 'noise', freq: 0, gain: 0.2, attack: 0.002, decay: 0.06, cutoff: 3600 },
  ] },
  { id: 'parry', volume: 0.75, layers: [
    { wave: 'triangle', freq: 1180, freqEnd: 1760, gain: 0.3, attack: 0.003, decay: 0.2 },
    { wave: 'noise', freq: 0, gain: 0.2, attack: 0.002, decay: 0.07, cutoff: 5200 },
  ] },
  { id: 'dodge', volume: 0.4, pitchJitter: 0.14, throttleMs: 90, layers: [
    { wave: 'noise', freq: 0, gain: 0.22, attack: 0.02, decay: 0.16, cutoff: 1700 },
  ] },

  /* --- Magic --- */
  { id: 'cast_fire', volume: 0.55, pitchJitter: 0.1, layers: [
    { wave: 'sawtooth', freq: 200, freqEnd: 520, gain: 0.24, attack: 0.02, decay: 0.2, cutoff: 1800 },
    { wave: 'noise', freq: 0, gain: 0.18, attack: 0.02, decay: 0.26, cutoff: 1200 },
  ] },
  { id: 'cast_fire_big', volume: 0.7, layers: [
    { wave: 'sawtooth', freq: 140, freqEnd: 60, gain: 0.34, attack: 0.03, decay: 0.5, cutoff: 1100 },
    { wave: 'noise', freq: 0, gain: 0.3, attack: 0.02, decay: 0.55, cutoff: 900 },
  ] },
  { id: 'impact_fire', volume: 0.55, pitchJitter: 0.14, throttleMs: 45, layers: [
    { wave: 'noise', freq: 0, gain: 0.3, attack: 0.004, decay: 0.2, cutoff: 1500 },
  ] },
  { id: 'cast_arcane', volume: 0.5, pitchJitter: 0.08, layers: [
    { wave: 'sine', freq: 880, freqEnd: 1320, gain: 0.22, attack: 0.01, decay: 0.17 },
    { wave: 'triangle', freq: 1760, gain: 0.1, attack: 0.01, decay: 0.12, delay: 0.03 },
  ] },
  { id: 'impact_arcane', volume: 0.5, pitchJitter: 0.14, throttleMs: 45, layers: [
    { wave: 'triangle', freq: 1320, freqEnd: 660, gain: 0.22, attack: 0.003, decay: 0.16 },
  ] },
  { id: 'cast_nature', volume: 0.5, layers: [
    { wave: 'sine', freq: 330, freqEnd: 495, gain: 0.24, attack: 0.04, decay: 0.3 },
    { wave: 'triangle', freq: 660, gain: 0.12, attack: 0.05, decay: 0.34, delay: 0.06 },
  ] },
  { id: 'impact_nature', volume: 0.45, pitchJitter: 0.14, throttleMs: 45, layers: [
    { wave: 'noise', freq: 0, gain: 0.2, attack: 0.006, decay: 0.14, cutoff: 900 },
  ] },
  { id: 'cast_shadow', volume: 0.55, pitchJitter: 0.1, layers: [
    { wave: 'sawtooth', freq: 300, freqEnd: 90, gain: 0.22, attack: 0.01, decay: 0.26, cutoff: 900 },
    { wave: 'noise', freq: 0, gain: 0.16, attack: 0.01, decay: 0.2, cutoff: 700 },
  ] },
  { id: 'impact_shadow', volume: 0.5, pitchJitter: 0.14, throttleMs: 45, layers: [
    { wave: 'sawtooth', freq: 180, freqEnd: 70, gain: 0.24, attack: 0.004, decay: 0.2, cutoff: 800 },
  ] },
  { id: 'cast_shield', volume: 0.55, layers: [
    { wave: 'sine', freq: 440, freqEnd: 660, gain: 0.26, attack: 0.05, decay: 0.4 },
    { wave: 'sine', freq: 880, gain: 0.14, attack: 0.06, decay: 0.45, delay: 0.05 },
  ] },
  { id: 'cast_buff', volume: 0.55, layers: [
    { wave: 'triangle', freq: 262, gain: 0.24, attack: 0.03, decay: 0.3 },
    { wave: 'triangle', freq: 392, gain: 0.2, attack: 0.03, decay: 0.34, delay: 0.08 },
    { wave: 'triangle', freq: 523, gain: 0.16, attack: 0.03, decay: 0.4, delay: 0.16 },
  ] },
  { id: 'cast_ultimate', volume: 0.8, layers: [
    { wave: 'sawtooth', freq: 110, freqEnd: 440, gain: 0.3, attack: 0.15, decay: 0.55, cutoff: 2200 },
    { wave: 'sine', freq: 55, gain: 0.34, attack: 0.1, decay: 0.7 },
    { wave: 'noise', freq: 0, gain: 0.2, attack: 0.12, decay: 0.6, cutoff: 2600 },
  ] },

  /* --- Creatures --- */
  { id: 'enemy_alert', volume: 0.5, pitchJitter: 0.2, throttleMs: 250, layers: [
    { wave: 'sawtooth', freq: 240, freqEnd: 420, gain: 0.2, attack: 0.02, decay: 0.2, cutoff: 1600 },
  ] },
  { id: 'enemy_die', volume: 0.6, pitchJitter: 0.18, throttleMs: 60, layers: [
    { wave: 'sawtooth', freq: 300, freqEnd: 70, gain: 0.26, attack: 0.01, decay: 0.42, cutoff: 1200 },
    { wave: 'noise', freq: 0, gain: 0.18, attack: 0.01, decay: 0.3, cutoff: 800 },
  ] },
  { id: 'wolf_howl', volume: 0.55, pitchJitter: 0.1, layers: [
    { wave: 'sawtooth', freq: 320, freqEnd: 180, gain: 0.24, attack: 0.18, decay: 0.8, cutoff: 1100 },
  ] },
  { id: 'slime_move', volume: 0.35, pitchJitter: 0.2, throttleMs: 400, layers: [
    { wave: 'sine', freq: 140, freqEnd: 90, gain: 0.2, attack: 0.02, decay: 0.14 },
  ] },
  { id: 'boss_roar', volume: 0.9, layers: [
    { wave: 'sawtooth', freq: 90, freqEnd: 45, gain: 0.4, attack: 0.15, decay: 1.1, cutoff: 700 },
    { wave: 'noise', freq: 0, gain: 0.3, attack: 0.2, decay: 1.0, cutoff: 600 },
  ] },

  /* --- Player --- */
  { id: 'player_hurt', volume: 0.6, pitchJitter: 0.1, throttleMs: 200, layers: [
    { wave: 'sawtooth', freq: 260, freqEnd: 150, gain: 0.22, attack: 0.005, decay: 0.2, cutoff: 1400 },
  ] },
  { id: 'player_die', volume: 0.8, layers: [
    { wave: 'sawtooth', freq: 220, freqEnd: 55, gain: 0.34, attack: 0.02, decay: 1.2, cutoff: 900 },
  ] },
  { id: 'level_up', volume: 0.8, layers: [
    { wave: 'triangle', freq: 523, gain: 0.3, attack: 0.01, decay: 0.2 },
    { wave: 'triangle', freq: 659, gain: 0.3, attack: 0.01, decay: 0.24, delay: 0.1 },
    { wave: 'triangle', freq: 784, gain: 0.3, attack: 0.01, decay: 0.3, delay: 0.2 },
    { wave: 'triangle', freq: 1047, gain: 0.32, attack: 0.02, decay: 0.55, delay: 0.3 },
  ] },

  /* --- World --- */
  { id: 'pickup_item', volume: 0.5, pitchJitter: 0.08, throttleMs: 50, layers: [
    { wave: 'triangle', freq: 784, freqEnd: 1047, gain: 0.22, attack: 0.005, decay: 0.14 },
  ] },
  { id: 'pickup_gold', volume: 0.45, pitchJitter: 0.14, throttleMs: 50, layers: [
    { wave: 'square', freq: 1320, gain: 0.12, attack: 0.003, decay: 0.08, cutoff: 5000 },
    { wave: 'square', freq: 1760, gain: 0.1, attack: 0.003, decay: 0.1, cutoff: 6000, delay: 0.04 },
  ] },
  { id: 'chest_open', volume: 0.6, layers: [
    { wave: 'noise', freq: 0, gain: 0.24, attack: 0.02, decay: 0.28, cutoff: 1600 },
    { wave: 'triangle', freq: 392, freqEnd: 587, gain: 0.22, attack: 0.05, decay: 0.4 },
  ] },
  { id: 'quest_accept', volume: 0.6, layers: [
    { wave: 'triangle', freq: 440, gain: 0.24, attack: 0.02, decay: 0.2 },
    { wave: 'triangle', freq: 587, gain: 0.24, attack: 0.02, decay: 0.3, delay: 0.12 },
  ] },
  { id: 'quest_complete', volume: 0.75, layers: [
    { wave: 'triangle', freq: 523, gain: 0.26, attack: 0.02, decay: 0.24 },
    { wave: 'triangle', freq: 784, gain: 0.26, attack: 0.02, decay: 0.28, delay: 0.14 },
    { wave: 'triangle', freq: 1047, gain: 0.3, attack: 0.02, decay: 0.5, delay: 0.28 },
  ] },
  { id: 'door', volume: 0.55, layers: [
    { wave: 'noise', freq: 0, gain: 0.26, attack: 0.05, decay: 0.45, cutoff: 700 },
  ] },
  { id: 'secret_found', volume: 0.7, layers: [
    { wave: 'sine', freq: 1318, gain: 0.22, attack: 0.02, decay: 0.3 },
    { wave: 'sine', freq: 1760, gain: 0.2, attack: 0.03, decay: 0.45, delay: 0.1 },
  ] },
  { id: 'dialogue_blip', volume: 0.22, pitchJitter: 0.25, throttleMs: 28, layers: [
    { wave: 'square', freq: 520, gain: 0.08, attack: 0.002, decay: 0.035, cutoff: 3200 },
  ] },
];

/**
 * Music beds. Each area picks a track; the generator plays a slow drone plus a
 * sparse arpeggio in the given scale, so the mood shifts between regions
 * without any streamed audio.
 */
export const MUSIC: MusicTrackDef[] = [
  {
    id: 'theme_menu', root: 220, scale: [0, 3, 7, 10, 12, 7, 3, 0],
    noteInterval: 1.35, padGain: 0.07, leadGain: 0.05, wave: 'triangle', cutoff: 1400,
  },
  {
    id: 'theme_homestead', root: 261.63, scale: [0, 4, 7, 9, 12, 9, 7, 4],
    noteInterval: 1.6, padGain: 0.055, leadGain: 0.038, wave: 'sine', cutoff: 1800,
  },
  {
    id: 'theme_woods', root: 196, scale: [0, 2, 3, 7, 9, 10, 7, 3],
    noteInterval: 1.2, padGain: 0.06, leadGain: 0.042, wave: 'triangle', cutoff: 1300,
  },
  {
    id: 'theme_ruins', root: 174.61, scale: [0, 1, 5, 7, 8, 12, 8, 5],
    noteInterval: 1.85, padGain: 0.07, leadGain: 0.034, wave: 'sine', cutoff: 900,
  },
  {
    id: 'theme_caves', root: 146.83, scale: [0, 3, 6, 7, 10, 13, 10, 6],
    noteInterval: 1.05, padGain: 0.065, leadGain: 0.04, wave: 'triangle', cutoff: 1600,
  },
  {
    id: 'theme_shrine', root: 293.66, scale: [0, 5, 7, 12, 14, 12, 7, 5],
    noteInterval: 2.2, padGain: 0.08, leadGain: 0.045, wave: 'sine', cutoff: 2200,
  },
  {
    id: 'theme_boss', root: 130.81, scale: [0, 1, 3, 6, 7, 6, 3, 1],
    noteInterval: 0.62, padGain: 0.085, leadGain: 0.05, wave: 'sawtooth', cutoff: 1100,
  },
];
