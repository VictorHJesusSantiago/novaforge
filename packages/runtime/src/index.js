/**
 * @novaforge/runtime — the layer that composes every other package into a running game.
 *
 * This is the only package allowed to know about all the others (SPEC §2). Everything below it
 * stays independently testable precisely because the wiring lives here and nowhere else.
 */

export { Game } from './game.js';
export { Scene } from './scene.js';
export { SceneManager } from './scene-manager.js';
export { AssetManager, ASSETS_RESOURCE } from './asset-manager.js';
export { Loop } from './loop.js';
export { ReplayRecorder, ReplayPlayer, parseRecording, REPLAY_FORMAT_VERSION } from './replay.js';
