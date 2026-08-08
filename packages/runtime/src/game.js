import { World, Clock, STAGES } from '@novaforge/core';
import { Rect } from '@novaforge/math';
import {
  DrawList,
  Camera2D,
  Canvas2DRenderer,
  TextureCache,
  installRenderSystems,
  DRAW_LIST_RESOURCE,
} from '@novaforge/renderer';
/** @typedef {import('@novaforge/renderer').Renderer} Renderer */
import { installPhysicsSystems } from '@novaforge/physics';
import { installInputSystems } from '@novaforge/input';
import { AudioMixer, AUDIO_RESOURCE } from '@novaforge/audio';
import { SceneManager } from './scene-manager.js';
import { AssetManager, ASSETS_RESOURCE } from './asset-manager.js';
import { Loop } from './loop.js';

/**
 * A running game: one world, one renderer, one clock, one scene stack.
 *
 * This class is the only place in the engine where every package meets. Everything it wires
 * together is independently constructible, so a game that wants a different composition — no
 * physics, a custom renderer, two worlds — can skip `Game` entirely and assemble the pieces
 * itself. That is the point of the wiring living in exactly one file.
 */
export class Game {
  /**
   * @param {object} [options]
   * @param {HTMLCanvasElement} [options.canvas] omit for a headless game
   * @param {{ x: number, y: number }} [options.gravity]
   * @param {number} [options.fixedDelta] seconds per simulation step
   * @param {number} [options.backgroundColor] packed 0xRRGGBB
   * @param {Rect} [options.worldBounds] the physics broadphase region
   * @param {string} [options.assetBaseUrl]
   * @param {boolean} [options.physics] set false to skip installing physics
   */
  constructor(options = {}) {
    /** The entity world. */
    this.world = new World();

    /** The fixed-timestep clock. */
    this.clock = new Clock({ fixedDelta: options.fixedDelta ?? 1 / 60 });

    /** The frame's draw commands. */
    this.drawList = new DrawList();

    /** The active camera. */
    this.camera = new Camera2D({
      viewportWidth: options.canvas?.clientWidth || options.canvas?.width || 800,
      viewportHeight: options.canvas?.clientHeight || options.canvas?.height || 600,
    });

    /** Texture storage. */
    this.textures = new TextureCache();

    /** Sound playback. */
    this.audio = new AudioMixer();

    /**
     * The rendering backend, or `null` when running headless.
     *
     * Headless is not a special mode with its own code path — it is simply a game with no
     * renderer. Every stage still runs, including `render`, which still fills the draw list.
     * That is what lets a test assert on exactly what would have been drawn.
     *
     * Typed as the abstract `Renderer`, not `Canvas2DRenderer` specifically — `frame()`,
     * `resize()` and `destroy()` only ever call the interface's own methods, and a host page is
     * free to reassign this to a `WebGL2Renderer` at runtime (proving Invariant R1 live; see
     * `examples/editor`'s backend-switch toolbar). `Game` reads `this.renderer` fresh on every
     * call rather than capturing it in a closure anywhere, which is what makes that swap safe.
     * @type {Renderer | null}
     */
    this.renderer =
      options.canvas === undefined
        ? null
        : new Canvas2DRenderer(options.canvas, {
            textures: this.textures,
            backgroundColor: options.backgroundColor,
          });

    /** Reference-counted assets. */
    this.assets = new AssetManager({
      textures: this.textures,
      audio: this.audio,
      baseUrl: options.assetBaseUrl,
    });

    /** The scene stack. */
    this.scenes = new SceneManager(this.world, this);

    /** Registered plugin teardown functions. @private */
    this._pluginTeardowns = /** @type {Array<() => void>} */ ([]);

    this.world.setResource(DRAW_LIST_RESOURCE, this.drawList);
    this.world.setResource(ASSETS_RESOURCE, this.assets);
    this.world.setResource(AUDIO_RESOURCE, this.audio);
    this.world.setResource('camera', this.camera);
    this.world.setResource('textures', this.textures);

    const { input } = installInputSystems(this.world, { camera: this.camera });
    /** Device state and action maps. */
    this.input = input;

    installRenderSystems(this.world);

    if (options.physics !== false) {
      const { physics } = installPhysicsSystems(this.world, {
        gravity: options.gravity,
        bounds: options.worldBounds ?? new Rect(-10000, -10000, 20000, 20000),
      });
      /** @type {import('@novaforge/physics').PhysicsWorld | null} */
      this.physics = physics;
    } else {
      this.physics = null;
    }

    /** The frame loop. */
    this.loop = new Loop({
      clock: this.clock,
      onFrame: (now) => this.frame(now),
    });

    if (options.canvas !== undefined) {
      this.input.attach(options.canvas);
    }

    /** Per-frame counters for the debug overlay. */
    this.stats = { fixedSteps: 0, alpha: 0, drawCalls: 0 };
  }

  /**
   * Run one frame: advance the clock, run every stage, present.
   *
   * The order here is the frame contract from ARCHITECTURE.md, and it is load-bearing:
   * events swap before anything reads them, `fixedUpdate` runs zero or more times, deferred
   * destroys are flushed only after every system has had its turn, and the draw list is
   * rebuilt from scratch each frame.
   *
   * @param {number} now milliseconds, monotonic
   * @returns {void}
   */
  frame(now) {
    const world = this.world;
    const { steps, alpha, delta } = this.clock.advance(now);

    // Promote last frame's emitted events into this frame's readable ones, before any system
    // runs. Doing it later would make whether a system sees an event depend on its order.
    world.events.swap();

    world.runStage('preUpdate', delta);

    for (let i = 0; i < steps; i += 1) {
      world.runStage('fixedUpdate', this.clock.fixedDelta);
    }

    world.runStage('update', delta);
    world.runStage('postUpdate', delta);

    // Deferred destruction lands here, after every system has run — see ARCHITECTURE.md.
    world.flushDestroyed();

    this.drawList.clear();
    // The render stage receives `alpha`, not a time delta.
    world.runStage('render', alpha);

    this.drawList.cull(this.camera.visibleBounds());
    this.drawList.sort();

    if (this.renderer !== null) {
      this.renderer.beginFrame();
      this.renderer.submit(this.drawList, this.camera);
      this.renderer.endFrame();
      this.stats.drawCalls = this.renderer.drawCalls;
    }

    this.stats.fixedSteps = steps;
    this.stats.alpha = alpha;
  }

  /**
   * Install a plugin: a function that registers systems and resources on the world.
   *
   * ```js
   * game.use((game) => {
   *   const handle = game.world.addSystem('update', debugOverlay);
   *   return () => game.world.removeSystem(handle);
   * });
   * ```
   *
   * @param {(game: Game) => (void | (() => void))} plugin returns an optional teardown
   * @returns {this}
   */
  use(plugin) {
    const teardown = plugin(this);
    if (typeof teardown === 'function') this._pluginTeardowns.push(teardown);
    return this;
  }

  /**
   * Start the game on a scene.
   * @param {string} sceneName
   * @returns {Promise<void>}
   */
  async start(sceneName) {
    await this.scenes.change(sceneName);
    this.loop.start();
  }

  /** Pause the loop without tearing anything down. @returns {void} */
  pause() {
    this.loop.stop();
  }

  /** Resume after {@link pause}. @returns {void} */
  resume() {
    this.loop.start();
  }

  /**
   * Resize the canvas and camera together.
   *
   * These have to move as one. A camera whose viewport disagrees with the canvas projects the
   * mouse to the wrong world position, which shows up as clicks landing near but not on things.
   *
   * @param {number} width CSS pixels
   * @param {number} height CSS pixels
   * @returns {void}
   */
  resize(width, height) {
    this.camera.resize(width, height);
    this.renderer?.resize(width, height);
  }

  /**
   * Stop everything and release resources.
   * @returns {Promise<void>}
   */
  async destroy() {
    this.loop.stop();
    for (const teardown of this._pluginTeardowns) teardown();
    this._pluginTeardowns.length = 0;

    await this.scenes.clear();
    this.input.detach();
    this.audio.dispose();
    this.renderer?.dispose();
    this.world.reset();
  }

  /**
   * A snapshot of everything the debug overlay shows.
   * @returns {{
   *   fps: number,
   *   frame: number,
   *   fixedSteps: number,
   *   alpha: number,
   *   entities: number,
   *   drawCommands: number,
   *   culled: number,
   *   drawCalls: number,
   *   voices: number,
   *   scenes: string[],
   *   systems: Record<string, number>,
   *   physics: import('@novaforge/physics').PhysicsWorld['stats'] | null,
   * }}
   */
  debugInfo() {
    return {
      fps: Math.round(this.clock.fps),
      frame: this.clock.frame,
      fixedSteps: this.stats.fixedSteps,
      alpha: Number(this.stats.alpha.toFixed(3)),
      entities: this.world.entityCount,
      drawCommands: this.drawList.length,
      culled: this.drawList.culled,
      drawCalls: this.stats.drawCalls,
      voices: this.audio.voiceCount,
      scenes: this.scenes.stackNames(),
      systems: Object.fromEntries(
        STAGES.map((stage) => [stage, this.world.scheduler.systemsIn(stage).length]),
      ),
      physics: this.physics?.stats ?? null,
    };
  }
}
