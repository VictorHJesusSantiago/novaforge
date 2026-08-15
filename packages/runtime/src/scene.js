/**
 * A unit of game content: a level, a menu, a cutscene.
 *
 * Subclass and override the hooks you need. All of them are optional and all default to no-ops,
 * so a scene that only spawns entities is four lines.
 *
 * ```js
 * class MainMenu extends Scene {
 *   onEnter(world) { ... }
 *   onExit(world)  { ... }
 * }
 * ```
 *
 * Systems registered in `onEnter` are automatically unregistered on exit, provided they are
 * registered through {@link addSystem} rather than directly on the world. Leaked systems from a
 * previous scene are one of the more baffling bugs to debug — the game behaves as though two
 * levels are running at once, because they are.
 */
export class Scene {
  /**
   * @param {string} [name]
   */
  constructor(name) {
    /** @type {string} */
    this.name = name ?? this.constructor.name;

    /**
     * System handles registered through {@link addSystem}, torn down on exit.
     * @type {number[]}
     * @private
     */
    this._systemHandles = [];

    /**
     * Entities spawned through {@link spawn}, destroyed on exit.
     * @type {number[]}
     * @private
     */
    this._entities = [];

    /** @type {import('@novaforge/core').World | null} @private */
    this._world = null;
  }

  /**
   * Assets this scene needs, as an id-to-URL manifest. Loaded before {@link onEnter} runs.
   * @returns {{ textures?: Record<string, string>, sounds?: Record<string, string> }}
   */
  preload() {
    return {};
  }

  /**
   * Called once, after preloading, when the scene becomes active.
   * @param {import('@novaforge/core').World} _world
   * @param {import('./game.js').Game} _game
   * @returns {void | Promise<void>}
   */
  onEnter(_world, _game) {}

  /**
   * Called once when the scene stops being active, before teardown.
   * @param {import('@novaforge/core').World} _world
   * @param {import('./game.js').Game} _game
   * @returns {void | Promise<void>}
   */
  onExit(_world, _game) {}

  /**
   * Called when the scene is paused by another being pushed on top of it.
   * @param {import('@novaforge/core').World} _world
   * @returns {void}
   */
  onPause(_world) {}

  /**
   * Called when the scene above this one is popped.
   * @param {import('@novaforge/core').World} _world
   * @returns {void}
   */
  onResume(_world) {}


  /**
   * Bind the scene to a world. Called by the scene manager.
   * @param {import('@novaforge/core').World} world
   * @returns {void}
   */
  bind(world) {
    this._world = world;
  }

  /**
   * @returns {import('@novaforge/core').World} the world this scene is running in.
   * @throws {Error} before the scene is bound, which is the only time it could be null —
   *   returning null instead would push the check onto every factory function.
   */
  get world() {
    if (this._world === null) {
      throw new Error(`Scene "${this.name}": accessed world before the scene was bound`);
    }
    return this._world;
  }

  /**
   * Register a system that will be unregistered when this scene exits.
   * @param {import('@novaforge/core').Scheduler extends never ? never : string} stage
   * @param {(world: any, dt: number) => void} system
   * @param {{ order?: number, name?: string }} [options]
   * @returns {number}
   */
  addSystem(stage, system, options) {
    if (this._world === null) {
      throw new Error(`Scene "${this.name}": addSystem called before the scene was bound`);
    }
    const handle = this._world.addSystem(/** @type {any} */ (stage), system, options);
    this._systemHandles.push(handle);
    return handle;
  }

  /**
   * Create an entity that will be destroyed when this scene exits.
   * @param {...any} parts same form as `World.spawn`
   * @returns {number}
   */
  spawn(...parts) {
    if (this._world === null) {
      throw new Error(`Scene "${this.name}": spawn called before the scene was bound`);
    }
    const entity = this._world.spawn(...parts);
    this._entities.push(entity);
    return entity;
  }

  /**
   * Remove everything this scene registered. Called by the scene manager after `onExit`.
   * @returns {void}
   */
  teardown() {
    const world = this._world;
    if (world === null) return;

    for (const handle of this._systemHandles) world.removeSystem(handle);
    this._systemHandles.length = 0;

    for (const entity of this._entities) world.destroy(entity);
    world.flushDestroyed();
    this._entities.length = 0;

    this._world = null;
  }

  /** @returns {number} systems this scene currently owns. */
  get systemCount() {
    return this._systemHandles.length;
  }

  /** @returns {number} entities this scene currently owns. */
  get entityCount() {
    return this._entities.length;
  }
}
