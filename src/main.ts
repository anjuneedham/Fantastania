import { MUSIC, SOUNDS } from './data/sounds';
import { Game } from './engine/Game';
import { state } from './game/GameState';
import { bootComplete, bootError, bootProgress } from './platform/boot';
import {
  hideNativeChrome, installBackHandler, lockLandscape, onAppStateChange, watchOrientation,
} from './platform/device';
import { WorldScene } from './scenes/WorldScene';

/**
 * Entry point. Keeps startup explicit and ordered so a failure anywhere lands
 * on the loading screen with a real message instead of a blank canvas.
 */
async function main(): Promise<void> {
  bootProgress(0.08, 'Waking the aether…');

  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas element #game-canvas is missing from the page.');
  }

  watchOrientation();
  const game = new Game(canvas);

  bootProgress(0.25, 'Tuning the strings…');
  game.audio.register(SOUNDS);
  game.audio.registerMusic(MUSIC);

  bootProgress(0.45, 'Opening the gates…');
  await game.init();

  game.audio.setVolume('master', state.settings.masterVolume);
  game.audio.setVolume('music', state.settings.musicVolume);
  game.audio.setVolume('sfx', state.settings.sfxVolume);
  game.audio.setMuted(state.settings.muted);

  bootProgress(0.7, 'Charting Aetheria…');
  await installBackHandler(() => game.scenes.handleBack());
  void lockLandscape();
  void hideNativeChrome();
  void onAppStateChange((active) => {
    game.paused = !active;
    if (!active) game.audio.suspend();
    else game.audio.resume();
  });

  bootProgress(0.9, 'Entering the Realm…');
  game.scenes.replace(new WorldScene());
  game.start();

  await bootComplete();

  // Exposed for debugging in the browser console; harmless in production.
  (window as unknown as { fantastania?: unknown }).fantastania = { game, state };
}

main().catch(bootError);
