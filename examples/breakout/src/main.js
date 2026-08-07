import { Game } from '@novaforge/runtime';
import { INPUT_RESOURCE } from '@novaforge/input';
import { PlayScene } from './scenes/play-scene.js';
import { PauseScene } from './scenes/pause-scene.js';
import { PLAYFIELD, COLORS } from './config.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const debugPanel = /** @type {HTMLPreElement} */ (document.getElementById('debug'));

const game = new Game({
  canvas,
  // Breakout has no gravity; the ball travels in straight lines between bounces.
  gravity: { x: 0, y: 0 },
  backgroundColor: COLORS.background,
  assetBaseUrl: 'assets',
});

game.resize(PLAYFIELD.width, PLAYFIELD.height);
game.scenes.register('play', PlayScene).register('pause', PauseScene);

/**
 * A debug overlay, installed as a plugin.
 *
 * Written this way to demonstrate the plugin hook: a function that registers systems and
 * returns its own teardown, so `game.destroy()` cleans it up without knowing what it did.
 */
game.use((instance) => {
  let visible = false;

  const handle = instance.world.addSystem(
    'postUpdate',
    (world) => {
      const input = world.getResource(INPUT_RESOURCE);
      if (input?.actions.pressed('debug')) {
        visible = !visible;
        debugPanel.hidden = !visible;
      }
      if (visible) {
        debugPanel.textContent = JSON.stringify(instance.debugInfo(), null, 2);
      }
    },
    { order: 1000, name: 'debugOverlay' },
  );

  return () => instance.world.removeSystem(handle);
});

// Browsers keep the audio context suspended until the user interacts with the page. Resuming
// on the first input is the standard workaround, and it must be a real user gesture.
const resumeAudio = () => {
  void game.audio.resume();
  window.removeEventListener('pointerdown', resumeAudio);
  window.removeEventListener('keydown', resumeAudio);
};
window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);

// Pause when the tab is hidden. Without this, returning to a backgrounded tab delivers one
// enormous frame delta; the clock clamps it (Invariant T1), but the game would still have been
// burning CPU on a page nobody is looking at.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  else game.resume();
});

// Wrapped rather than using top-level await: that would force the build target up to a very
// recent baseline for one statement, and this example's job is to load for everyone who clicks
// the link.
void game.start('play').catch((error) => {
  console.error('NovaForge: failed to start', error);
});

// Exposed for poking at from the console — genuinely the fastest debugging tool this project
// has until the editor exists.
/** @type {any} */ (window).game = game;
