import { Game } from '@novaforge/runtime';
import { INPUT_RESOURCE } from '@novaforge/input';
import { PlayScene } from './scenes/play-scene.js';
import { PauseScene } from './scenes/pause-scene.js';
import { PLAYFIELD, COLORS } from './config.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const debugPanel = /** @type {HTMLPreElement} */ (document.getElementById('debug'));

const game = new Game({
  canvas,
  gravity: { x: 0, y: 0 },
  backgroundColor: COLORS.background,
  assetBaseUrl: 'assets',
});

game.resize(PLAYFIELD.width, PLAYFIELD.height);
game.scenes.register('play', PlayScene).register('pause', PauseScene);

/**
 * A debug overlay, installed as a plugin — identical to breakout's, since the pattern (and the
 * F3 toggle) is the same for every example.
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

const resumeAudio = () => {
  void game.audio.resume();
  window.removeEventListener('pointerdown', resumeAudio);
  window.removeEventListener('keydown', resumeAudio);
};
window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  else game.resume();
});

void game.start('play').catch((error) => {
  console.error('NovaForge: failed to start', error);
});

/** @type {any} */ (window).game = game;
