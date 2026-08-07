/**
 * System scheduling.
 *
 * Systems run in named stages, in a fixed order per frame (SPEC §6). There is no inferred
 * dependency graph: a game has tens of systems, not thousands, and an explicit `order` number is
 * both easier to reason about and easier to debug than a topological sort that silently
 * reorders work when a dependency is added.
 *
 * @typedef {'preUpdate'|'fixedUpdate'|'update'|'postUpdate'|'render'} Stage
 * @typedef {(world: import('./world.js').World, dt: number) => void} SystemFn
 *
 * @typedef {object} SystemEntry
 * @property {number} handle
 * @property {string} name
 * @property {SystemFn} fn
 * @property {number} order
 * @property {number} seq registration sequence, used to break `order` ties
 * @property {boolean} enabled
 * @property {number} lastDurationMs
 */

/**
 * The stages, in execution order. Exported so the editor can render a profiler row per stage.
 * @type {readonly Stage[]}
 */
export const STAGES = /** @type {const} */ ([
  'preUpdate',
  'fixedUpdate',
  'update',
  'postUpdate',
  'render',
]);

export class Scheduler {
  constructor() {
    /**
     * @type {Map<Stage, SystemEntry[]>}
     * @private
     */
    this._stages = new Map();
    for (const stage of STAGES) this._stages.set(stage, []);

    /** @type {number} @private */
    this._nextHandle = 1;

    /** @type {number} @private */
    this._seq = 0;

    /**
     * When true, each system is timed and the duration recorded on its entry. Off by default —
     * `performance.now()` twice per system per frame is not free, and the numbers are only
     * wanted when the profiler panel is open.
     * @type {boolean}
     */
    this.profiling = false;
  }

  /**
   * @param {Stage} stage
   * @param {SystemFn} fn
   * @param {{ order?: number, name?: string }} [options]
   * @returns {number} a handle for {@link remove}.
   * @throws {Error} on an unknown stage — a typo would otherwise register a system that simply
   *   never runs, which is a miserable bug to track down.
   */
  add(stage, fn, options = {}) {
    const systems = this._stages.get(stage);
    if (systems === undefined) {
      throw new Error(`Scheduler.add: unknown stage "${stage}". Valid stages: ${STAGES.join(', ')}`);
    }
    if (typeof fn !== 'function') {
      throw new TypeError('Scheduler.add: system must be a function');
    }

    const entry = {
      handle: this._nextHandle,
      // Anonymous systems are the norm; falling back to the stage keeps the profiler readable.
      // `||` rather than `??`: an arrow function passed inline has `name === ''`, not
      // `undefined`, so nullish coalescing would let the empty string through.
      name: options.name || fn.name || `anonymous@${stage}`,
      fn,
      order: options.order ?? 0,
      seq: this._seq,
      enabled: true,
      lastDurationMs: 0,
    };
    this._nextHandle += 1;
    this._seq += 1;

    systems.push(entry);
    // Sort on insert rather than on run: registration happens tens of times, running happens
    // sixty times a second.
    systems.sort((a, b) => (a.order === b.order ? a.seq - b.seq : a.order - b.order));
    return entry.handle;
  }

  /**
   * @param {number} handle
   * @returns {boolean}
   */
  remove(handle) {
    for (const systems of this._stages.values()) {
      const at = systems.findIndex((s) => s.handle === handle);
      if (at !== -1) {
        systems.splice(at, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Turn a system off without unregistering it — how the editor pauses a single system.
   * @param {number} handle
   * @param {boolean} enabled
   * @returns {boolean}
   */
  setEnabled(handle, enabled) {
    for (const systems of this._stages.values()) {
      const entry = systems.find((s) => s.handle === handle);
      if (entry) {
        entry.enabled = enabled;
        return true;
      }
    }
    return false;
  }

  /**
   * Run every enabled system in a stage.
   *
   * The list is copied first so that a system may register or remove systems while the stage is
   * running — plugins installed at runtime do exactly that.
   *
   * @param {Stage} stage
   * @param {import('./world.js').World} world
   * @param {number} dt seconds
   * @returns {void}
   */
  run(stage, world, dt) {
    const systems = this._stages.get(stage);
    if (systems === undefined || systems.length === 0) return;

    const snapshot = systems.slice();
    if (this.profiling) {
      for (let i = 0; i < snapshot.length; i += 1) {
        const entry = snapshot[i];
        if (!entry.enabled) continue;
        const started = performance.now();
        entry.fn(world, dt);
        entry.lastDurationMs = performance.now() - started;
      }
    } else {
      for (let i = 0; i < snapshot.length; i += 1) {
        const entry = snapshot[i];
        if (entry.enabled) entry.fn(world, dt);
      }
    }
  }

  /**
   * @param {Stage} stage
   * @returns {readonly SystemEntry[]}
   */
  systemsIn(stage) {
    return this._stages.get(stage) ?? [];
  }

  /** @returns {number} total registered systems across all stages. */
  get size() {
    let total = 0;
    for (const systems of this._stages.values()) total += systems.length;
    return total;
  }

  /**
   * Per-stage timings from the last frame. Empty unless {@link profiling} is on.
   * @returns {Array<{ stage: Stage, name: string, ms: number }>}
   */
  profile() {
    /** @type {Array<{ stage: Stage, name: string, ms: number }>} */
    const rows = [];
    for (const stage of STAGES) {
      for (const entry of this._stages.get(stage) ?? []) {
        rows.push({ stage, name: entry.name, ms: entry.lastDurationMs });
      }
    }
    return rows;
  }

  /** Remove every system. */
  clear() {
    for (const stage of STAGES) this._stages.set(stage, []);
  }
}
