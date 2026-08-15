import { ASSETS_RESOURCE } from '@novaforge/runtime';
import { ATLAS_REGISTRY_RESOURCE, AtlasRegistry } from '@novaforge/renderer';
import { CommandStack } from './command-stack.js';
import { Selection } from './selection.js';
import { Inspector } from './inspector.js';
import { SceneTree } from './scene-tree.js';
import { ViewportOverlay } from './viewport-overlay.js';
import { AssetPanel } from './asset-panel.js';
import { TimelinePanel } from './timeline-panel.js';
import { saveSceneToText, loadSceneFromText } from './serializer.js';

/**
 * The editor, assembled (SPEC §12).
 *
 * `Editor` does not replace `Game` — it wraps one. The game world it edits is the exact world
 * the game would run with; play mode does not switch to a different simulation, it just resumes
 * the frame loop `Editor` otherwise keeps paused. That is what makes "what you see in the
 * editor" and "what ships" the same thing by construction rather than by two code paths kept in
 * sync by hand.
 *
 * **Play mode.** Entering it snapshots the scene via the serialiser and resumes the game's loop;
 * leaving it pauses the loop again and reloads that snapshot, discarding whatever gameplay did.
 * This is a real, if shallow, version of SPEC §12's "structured-clone the world" plan — built on
 * JSON rather than `structuredClone` because the serialiser already has to exist for scene
 * saving, and reusing it here means play mode's correctness is covered by the same round-trip
 * tests as save/load, not a second snapshot mechanism.
 *
 * **Who drives the frame loop.** `Editor` is the sole external driver — it never calls
 * `game.loop.start()`, `game.pause()`, or `game.resume()`, all of which would start `Game`'s own
 * self-scheduling `requestAnimationFrame` loop running *independently* of whatever loop the host
 * page has. Two loops advancing the same clock is exactly the kind of bug that is invisible in a
 * quick look and produces double-speed simulation the moment play mode is entered. Instead,
 * `Editor.frame()` calls `game.frame(now)` directly — the same function `Game.loop` would have
 * called — and decides afterward whether to let simulated time accumulate (play mode) or to
 * `resync()` the clock away immediately (edit mode, where entities must still render live edits
 * without stepping physics).
 *
 * Layout is the caller's responsibility. `Editor` takes the DOM elements it needs — it does not
 * build a page — so it can be dropped into any container, which is what `examples/editor` does.
 */
export class Editor {
  /**
   * @param {import('@novaforge/runtime').Game} game
   * @param {object} elements
   * @param {HTMLElement} elements.sceneTree
   * @param {HTMLElement} elements.inspector
   * @param {HTMLElement} elements.assetPanel
   * @param {HTMLCanvasElement} elements.overlayCanvas CSS-stacked over the game's own canvas
   * @param {HTMLElement} [elements.timelinePanel] omit if the host page has nowhere to put it —
   *   a game with no keyframe timelines has no use for the panel either
   */
  constructor(game, elements) {
    /** @type {import('@novaforge/runtime').Game} */
    this.game = game;

    /** @type {import('./command-stack.js').CommandStack} */
    this.commandStack = new CommandStack();

    /** @type {import('./selection.js').Selection} */
    this.selection = new Selection();

    /** @type {'edit' | 'play'} */
    this.mode = 'edit';

    /** @type {string | null} @private */
    this._playSnapshot = null;

    if (game.world.getResource(ATLAS_REGISTRY_RESOURCE) === undefined) {
      game.world.setResource(ATLAS_REGISTRY_RESOURCE, new AtlasRegistry());
    }

    /** @type {import('./scene-tree.js').SceneTree} */
    this.sceneTree = new SceneTree(elements.sceneTree, game.world, this.selection, this.commandStack);

    /** @type {import('./inspector.js').Inspector} */
    this.inspector = new Inspector(elements.inspector, game.world, this.commandStack, this.selection);

    /** @type {import('./asset-panel.js').AssetPanel} */
    this.assetPanel = new AssetPanel(elements.assetPanel, game.textures, game.audio);

    /** @type {import('./timeline-panel.js').TimelinePanel | null} */
    this.timelinePanel =
      elements.timelinePanel !== undefined
        ? new TimelinePanel(elements.timelinePanel, game.world, this.selection, this.commandStack)
        : null;

    /** @type {import('./viewport-overlay.js').ViewportOverlay} */
    this.viewportOverlay = new ViewportOverlay(
      elements.overlayCanvas,
      game.world,
      game.camera,
      this.selection,
      this.commandStack,
    );

    /** @private */
    this._unsubscribeSelection = this.selection.onChange(() => this.inspector.show(this.selection.entity));
    /** @private */
    this._unsubscribeCommands = this.commandStack.onChange(() => {
      this.sceneTree.refresh();
      this.inspector.refresh();
      this.timelinePanel?.refresh();
    });

    this.sceneTree.refresh();
    this.assetPanel.refresh();
  }

  /**
   * One editor frame: advances the game (see the class doc on who drives the loop) and draws
   * the selection overlay on top. Call this from your own `requestAnimationFrame` loop —
   * `Editor` does not run one itself.
   * @param {number} now milliseconds
   * @returns {void}
   */
  frame(now) {
    this.game.frame(now);
    if (this.mode === 'edit') {
      this.game.clock.resync();
    }
    this.viewportOverlay.render();
  }

  /**
   * Enter play mode: snapshot the current scene and let simulated time start accumulating.
   * @returns {void}
   */
  play() {
    if (this.mode === 'play') return;
    this._playSnapshot = saveSceneToText(this.game.world);
    this.mode = 'play';
  }

  /**
   * Leave play mode: restore the scene exactly as it was before Play was pressed, discarding
   * everything that happened during the run, and stop advancing simulated time.
   * @returns {void}
   */
  stop() {
    if (this.mode === 'edit') return;
    this.mode = 'edit';

    if (this._playSnapshot !== null) {
      this.game.world.clearEntities();
      loadSceneFromText(this.game.world, this._playSnapshot);
      this._playSnapshot = null;
    }

    this.game.clock.resync();

    this.selection.clear();
    this.commandStack.clear();
    this.sceneTree.refresh();
  }

  /**
   * Advance exactly one fixed step while paused — for a frame-by-frame step button. A no-op in
   * play mode, where real time already owns the step count.
   *
   * This cannot delegate to `game.frame(now)`, because `frame()`'s step count is *derived* from
   * real elapsed time — there is no `now` that reliably produces exactly one step without either
   * running the surrounding stages (`preUpdate`/`update`/`postUpdate`/`render`) an extra,
   * redundant time first, or reaching into the clock's private accumulator. Running the stage
   * sequence directly, once, with a hardcoded single `fixedUpdate` pass, is what keeps this a
   * true single step rather than an approximation of one.
   * @returns {void}
   */
  step() {
    if (this.mode === 'play') return;
    const dt = this.game.clock.fixedDelta;
    this.game.world.events.swap();
    this.game.world.runStage('preUpdate', dt);
    this.game.world.runStage('fixedUpdate', dt);
    this.game.world.runStage('update', dt);
    this.game.world.runStage('postUpdate', dt);
    this.game.world.flushDestroyed();
    this.game.drawList.clear();
    this.game.world.runStage('render', 1);
    this.game.drawList.cull(this.game.camera.visibleBounds());
    this.game.drawList.sort();
    if (this.game.renderer !== null) {
      this.game.renderer.beginFrame();
      this.game.renderer.submit(this.game.drawList, this.game.camera);
      this.game.renderer.endFrame();
    }
    this.viewportOverlay.render();
  }

  /** @returns {string} the current scene as JSON text. */
  save() {
    return saveSceneToText(this.game.world);
  }

  /**
   * Replace the scene with one loaded from JSON text.
   * @param {string} text
   * @returns {void}
   */
  load(text) {
    this.selection.clear();
    this.commandStack.clear();
    this.game.world.clearEntities();
    loadSceneFromText(this.game.world, text);
    this.sceneTree.refresh();
  }

  /**
   * @returns {import('@novaforge/runtime').AssetManager} the game's asset manager, for a host
   *   page that wants to preload a manifest before handing control to the editor.
   */
  get assets() {
    return this.game.world.requireResource(ASSETS_RESOURCE);
  }

  /** Tear down every panel's listeners. Does not touch the game. @returns {void} */
  dispose() {
    this._unsubscribeSelection();
    this._unsubscribeCommands();
    this.sceneTree.dispose();
    this.viewportOverlay.dispose();
    this.assetPanel.dispose();
    this.timelinePanel?.dispose();
  }
}
