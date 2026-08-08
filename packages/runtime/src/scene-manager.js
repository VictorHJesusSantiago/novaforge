/**
 * Owns which scene is running.
 *
 * Scenes form a **stack**, not a single slot. A pause menu pushed over a level needs the level
 * to still exist — its entities, its systems, its state — so that resuming is instant and free.
 * Modelling that as "replace the scene and rebuild the level from a save" is how a pause menu
 * turns into a save-system project.
 *
 * Only the top scene ticks. The ones beneath are paused: still resident, not updating.
 */
export class SceneManager {
  /**
   * @param {import('@novaforge/core').World} world
   * @param {import('./game.js').Game} game
   */
  constructor(world, game) {
    /** @type {import('@novaforge/core').World} @private */
    this._world = world;

    /** @type {import('./game.js').Game} @private */
    this._game = game;

    /** @type {Map<string, new (...args: any[]) => import('./scene.js').Scene>} @private */
    this._registry = new Map();

    /** @type {import('./scene.js').Scene[]} @private */
    this._stack = [];

    /**
     * True while a transition is in flight. Scene changes are async because of preloading, and
     * a second change starting mid-transition would interleave two teardowns.
     * @type {boolean}
     * @private
     */
    this._transitioning = false;
  }

  /**
   * @param {string} name
   * @param {new (...args: any[]) => import('./scene.js').Scene} SceneClass
   * @returns {this}
   */
  register(name, SceneClass) {
    this._registry.set(name, SceneClass);
    return this;
  }

  /** @returns {import('./scene.js').Scene | null} the scene currently ticking. */
  get active() {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
  }

  /** @returns {number} */
  get depth() {
    return this._stack.length;
  }

  /** @returns {boolean} */
  get isTransitioning() {
    return this._transitioning;
  }

  /**
   * Replace the entire stack with one scene. The normal way to change level.
   * @param {string} name
   * @returns {Promise<import('./scene.js').Scene>}
   */
  async change(name) {
    this._beginTransition(name);
    try {
      while (this._stack.length > 0) {
        await this._exitTop();
      }
      return await this._enter(name);
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * Push a scene on top, pausing the one below. For pause menus and modal dialogs.
   * @param {string} name
   * @returns {Promise<import('./scene.js').Scene>}
   */
  async push(name) {
    this._beginTransition(name);
    try {
      this.active?.onPause(this._world);
      return await this._enter(name);
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * Pop the top scene, resuming the one below.
   * @returns {Promise<import('./scene.js').Scene | null>} the scene now active.
   */
  async pop() {
    if (this._stack.length === 0) return null;

    this._transitioning = true;
    try {
      await this._exitTop();
      this.active?.onResume(this._world);
      return this.active;
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * @param {string} name
   * @private
   */
  _beginTransition(name) {
    if (this._transitioning) {
      throw new Error(
        `SceneManager: cannot start a transition to "${name}" while one is already running`,
      );
    }
    if (!this._registry.has(name)) {
      throw new Error(
        `SceneManager: no scene registered as "${name}". Known: ${[...this._registry.keys()].join(', ') || '(none)'}`,
      );
    }
    this._transitioning = true;
  }

  /**
   * @param {string} name
   * @returns {Promise<import('./scene.js').Scene>}
   * @private
   */
  async _enter(name) {
    const SceneClass = /** @type {any} */ (this._registry.get(name));
    const scene = new SceneClass(name);
    scene.bind(this._world);

    const manifest = scene.preload();
    if (manifest.textures !== undefined || manifest.sounds !== undefined) {
      await this._game.assets.loadManifest(manifest);
    }

    this._stack.push(scene);
    await scene.onEnter(this._world, this._game);
    return scene;
  }

  /**
   * @returns {Promise<void>}
   * @private
   */
  async _exitTop() {
    const scene = this._stack.pop();
    if (scene === undefined) return;
    await scene.onExit(this._world, this._game);
    scene.teardown();
  }

  /**
   * Tear down every scene. Called when the game stops.
   * @returns {Promise<void>}
   */
  async clear() {
    while (this._stack.length > 0) {
      await this._exitTop();
    }
  }

  /** @returns {string[]} the stack, bottom first. For the debug overlay. */
  stackNames() {
    return this._stack.map((scene) => scene.name);
  }
}
