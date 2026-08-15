import { Game } from '@novaforge/runtime';
import { INPUT_RESOURCE } from '@novaforge/input';
import { TextureAtlas, AtlasRegistry } from '@novaforge/renderer';
import { PlayScene } from './scenes/play-scene.js';
import { PauseScene } from './scenes/pause-scene.js';
import { VIEWPORT, TILE, GRAVITY, COLORS, TILE_ATLAS } from './config.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const debugPanel = /** @type {HTMLPreElement} */ (document.getElementById('debug'));

const game = new Game({
  canvas,
  gravity: GRAVITY,
  backgroundColor: COLORS.background,
  assetBaseUrl: 'assets',
});

game.resize(VIEWPORT.width, VIEWPORT.height);
game.scenes.register('play', PlayScene).register('pause', PauseScene);

/**
 * There are no image assets in this example, so the tilemap's texture is a small canvas drawn
 * procedurally instead of loaded from a URL — `TextureCache.set` accepts anything
 * `CanvasImageSource`-shaped, which a canvas already is. This has to happen before the play
 * scene's `onEnter` paints tiles that reference it, so it runs here rather than inside a scene.
 * @returns {void}
 */
function buildTileAtlas() {
  const size = TILE.size;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;

  const ctx = tile.getContext('2d');
  if (ctx !== null) {
    ctx.fillStyle = '#3a3a52';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#54547a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  game.textures.set(TILE_ATLAS, tile);

  const atlas = TextureAtlas.fromGrid(TILE_ATLAS, { frameWidth: size, frameHeight: size, columns: 1, rows: 1 });
  const registry = new AtlasRegistry();
  registry.register(TILE_ATLAS, atlas);
  game.world.setResource('atlasRegistry', registry);
}

buildTileAtlas();

/** A debug overlay, installed as a plugin — same shape as `examples/breakout`'s. */
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
