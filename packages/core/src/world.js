import {
  NULL_ENTITY,
  MAX_ENTITIES,
  MAX_GENERATION,
  makeEntity,
  entityIndex,
  entityGeneration,
  describeEntity,
} from './entity.js';
import { SparseSet } from './sparse-set.js';
import { Query } from './query.js';
import { Scheduler } from './scheduler.js';
import { EventBus } from './events.js';

/**
 * The container for everything: entities, their components, the systems that run over them, and
 * the shared resources they read.
 *
 * A world has no dependency on a renderer, a canvas, or a browser. `new World()` works in Node,
 * which is what makes headless simulation and the entire test suite possible (SPEC §2).
 */
export class World {
  constructor() {
    /**
     * Generation per entity index. Starts at 1 so that no live handle is ever `0`
     * (see `NULL_ENTITY`).
     * @type {number[]}
     * @private
     */
    this._generations = [];

    /**
     * Liveness per entity index. Set false the instant `destroy` is called, even though the
     * storage cleanup is deferred — so a destroyed entity disappears from queries immediately.
     * @type {boolean[]}
     * @private
     */
    this._alive = [];

    /**
     * Recycled indices, used LIFO to keep the dense arrays compact (Invariant E3).
     * @type {number[]}
     * @private
     */
    this._freeIndices = [];

    /** @type {number} @private */
    this._nextIndex = 0;

    /** @type {number} @private */
    this._liveCount = 0;

    /**
     * componentId -> storage.
     * @type {Map<number, SparseSet<any>>}
     * @private
     */
    this._stores = new Map();

    /**
     * componentId -> definition, so the editor and the serialiser can walk a world without
     * having been handed the component types.
     * @type {Map<number, import('./component.js').ComponentType>}
     * @private
     */
    this._componentTypes = new Map();

    /**
     * Entity indices awaiting storage cleanup. Flushed in `postUpdate`.
     * @type {number[]}
     * @private
     */
    this._pendingDestroy = [];

    /**
     * Query cache, keyed by component-set signature. Queries are created inside systems every
     * frame; without this, each one would re-derive its stores.
     * @type {Map<string, Query<any>>}
     * @private
     */
    this._queryCache = new Map();

    /** Systems, grouped by stage. */
    this.scheduler = new Scheduler();

    /** Double-buffered event channels. */
    this.events = new EventBus();

    /**
     * Shared singletons that are not per-entity: the input snapshot, the asset manager, the
     * active camera. Keyed by string to keep the world decoupled from the packages that own
     * them (SPEC §2 forbids `core` importing downward).
     * @type {Map<string, any>}
     */
    this.resources = new Map();
  }

  // ------------------------------------------------------------- entity lifecycle

  /**
   * @returns {number} a fresh entity handle.
   * @throws {RangeError} when the index space is exhausted.
   */
  createEntity() {
    let index;
    if (this._freeIndices.length > 0) {
      index = /** @type {number} */ (this._freeIndices.pop());
    } else {
      if (this._nextIndex >= MAX_ENTITIES) {
        throw new RangeError(`World: entity limit of ${MAX_ENTITIES} reached`);
      }
      index = this._nextIndex;
      this._nextIndex += 1;
      this._generations[index] = 1;
    }
    this._alive[index] = true;
    this._liveCount += 1;
    return makeEntity(index, this._generations[index]);
  }

  /**
   * Create an entity and add components in one call.
   *
   * ```js
   * const bullet = world.spawn([Transform, { position: new Vec2(0, 0) }], [Bullet]);
   * ```
   *
   * @param {...([import('./component.js').ComponentType] | [import('./component.js').ComponentType, object])} parts
   * @returns {number}
   */
  spawn(...parts) {
    const entity = this.createEntity();
    for (const [type, values] of parts) {
      this.add(entity, type, values);
    }
    return entity;
  }

  /**
   * Mark an entity for destruction.
   *
   * The handle dies immediately — `isAlive` returns false and queries stop yielding it on the
   * very next check — but the component storage is not touched until {@link flushDestroyed}
   * runs in `postUpdate`. Removing storage mid-frame would pull data out from under systems
   * that are still iterating (see ARCHITECTURE.md, "Deferred destruction").
   *
   * Destroying an already-dead entity is a no-op, not an error: two systems reacting to the
   * same event will both try, and that is normal.
   *
   * @param {number} entity
   * @returns {boolean} true if this call was the one that killed it.
   */
  destroy(entity) {
    if (!this.isAlive(entity)) return false;
    const index = entityIndex(entity);
    this._alive[index] = false;
    this._liveCount -= 1;
    this._pendingDestroy.push(index);
    return true;
  }

  /**
   * Destroy an entity and reclaim its storage now.
   *
   * Only safe outside of system iteration — scene teardown, tests, the editor. Systems should
   * use {@link destroy}.
   *
   * @param {number} entity
   * @returns {boolean}
   */
  destroyImmediate(entity) {
    if (!this.destroy(entity)) return false;
    const index = entityIndex(entity);
    this._pendingDestroy = this._pendingDestroy.filter((i) => i !== index);
    this._reclaim(index);
    return true;
  }

  /**
   * Reclaim every entity destroyed this frame. Called by the runtime at the end of `postUpdate`.
   * @returns {number} how many entities were reclaimed.
   */
  flushDestroyed() {
    const count = this._pendingDestroy.length;
    for (let i = 0; i < count; i += 1) {
      this._reclaim(this._pendingDestroy[i]);
    }
    this._pendingDestroy.length = 0;
    return count;
  }

  /**
   * @param {number} index
   * @private
   */
  _reclaim(index) {
    for (const store of this._stores.values()) {
      store.delete(index);
    }
    // Bump the generation so every handle minted for the old occupant now fails `isAlive`.
    // Wrapping skips 0 to keep NULL_ENTITY unambiguous (Invariant E2).
    const next = this._generations[index] + 1;
    this._generations[index] = next > MAX_GENERATION ? 1 : next;
    this._freeIndices.push(index);
  }

  /**
   * Every live entity handle, in index order.
   *
   * Deliberately not a `Query` — a query requires at least one component (SPEC's query
   * contract), and "every entity regardless of what it holds" is a different, rarer need: the
   * editor's scene tree and scene serialiser, which must see entities with no components at
   * all (freshly created, not yet configured). Walks the full index range, so it is O(capacity)
   * rather than O(live count); fine for the editor and for scene saves, wrong for a hot path.
   *
   * @returns {number[]}
   */
  entities() {
    /** @type {number[]} */
    const result = [];
    for (let index = 0; index < this._nextIndex; index += 1) {
      if (this._alive[index] === true) {
        result.push(makeEntity(index, this._generations[index]));
      }
    }
    return result;
  }

  /**
   * @param {number} entity
   * @returns {boolean} true if the handle refers to a living entity.
   */
  isAlive(entity) {
    if (entity === NULL_ENTITY) return false;
    const index = entityIndex(entity);
    return this._alive[index] === true && this._generations[index] === entityGeneration(entity);
  }

  /**
   * Liveness by raw index, skipping the generation check. Internal to query iteration, which
   * already sourced the index from a live store.
   * @param {number} index
   * @returns {boolean}
   */
  isAliveIndex(index) {
    return this._alive[index] === true;
  }

  /**
   * @param {number} index
   * @returns {number} the current generation at an index.
   */
  generationOf(index) {
    return this._generations[index] ?? 1;
  }

  /** @returns {number} living entities, excluding those awaiting cleanup. */
  get entityCount() {
    return this._liveCount;
  }

  /** @returns {number} entities destroyed this frame but not yet reclaimed. */
  get pendingDestroyCount() {
    return this._pendingDestroy.length;
  }

  // ------------------------------------------------------------------- components

  /**
   * Storage for a component type, created on first use.
   * @param {import('./component.js').ComponentType} type
   * @returns {SparseSet<any>}
   */
  store(type) {
    let store = this._stores.get(type.id);
    if (store === undefined) {
      store = new SparseSet();
      this._stores.set(type.id, store);
      this._componentTypes.set(type.id, type);
    }
    return store;
  }

  /**
   * Attach a component, starting from the type's defaults and overlaying `values`.
   *
   * Adding a component that is already present overwrites it. That is deliberate — the
   * alternative (throwing) would force every caller to check first, and re-adding to reset
   * to defaults is a genuinely useful idiom.
   *
   * @template T
   * @param {number} entity
   * @param {import('./component.js').ComponentType & { factory: () => T }} type
   * @param {Partial<T>} [values]
   * @returns {T} the stored instance.
   * @throws {Error} if the entity is not alive — a silent no-op here produces entities that
   *   mysteriously lack components, which is far harder to debug than a throw.
   */
  add(entity, type, values) {
    if (!this.isAlive(entity)) {
      throw new Error(`World.add: ${describeEntity(entity)} is not alive (component "${type.name}")`);
    }
    const instance = type.factory();
    if (values !== undefined && !type.isTag) {
      Object.assign(/** @type {object} */ (instance), values);
    }
    return this.store(type).set(entityIndex(entity), instance);
  }

  /**
   * @param {number} entity
   * @param {import('./component.js').ComponentType} type
   * @returns {boolean} true if the component was present and removed.
   */
  remove(entity, type) {
    if (!this.isAlive(entity)) return false;
    return this.store(type).delete(entityIndex(entity));
  }

  /**
   * @template T
   * @param {number} entity
   * @param {import('./component.js').ComponentType & { factory: () => T }} type
   * @returns {T | undefined} the component, or `undefined` if absent or the entity is dead.
   */
  get(entity, type) {
    if (!this.isAlive(entity)) return undefined;
    return this.store(type).get(entityIndex(entity));
  }

  /**
   * Read a component that is required to exist.
   * @template T
   * @param {number} entity
   * @param {import('./component.js').ComponentType & { factory: () => T }} type
   * @returns {T}
   * @throws {Error} if the component is absent.
   */
  getOrThrow(entity, type) {
    const value = this.get(entity, type);
    if (value === undefined) {
      throw new Error(`World.getOrThrow: ${describeEntity(entity)} has no "${type.name}"`);
    }
    return value;
  }

  /**
   * Read a component, attaching a default-constructed one if it is missing.
   * @template T
   * @param {number} entity
   * @param {import('./component.js').ComponentType & { factory: () => T }} type
   * @returns {T}
   */
  getOrAdd(entity, type) {
    const existing = this.get(entity, type);
    if (existing !== undefined) return existing;
    return this.add(entity, type);
  }

  /**
   * @param {number} entity
   * @param {import('./component.js').ComponentType} type
   * @returns {boolean}
   */
  has(entity, type) {
    if (!this.isAlive(entity)) return false;
    return this.store(type).has(entityIndex(entity));
  }

  /**
   * Every component attached to an entity. Used by the editor inspector and the serialiser;
   * it walks all stores, so it is not for per-frame use.
   * @param {number} entity
   * @returns {Array<{ type: import('./component.js').ComponentType, value: any }>}
   */
  componentsOf(entity) {
    if (!this.isAlive(entity)) return [];
    const index = entityIndex(entity);
    /** @type {Array<{ type: import('./component.js').ComponentType, value: any }>} */
    const result = [];
    for (const [id, store] of this._stores) {
      if (store.has(index)) {
        const type = this._componentTypes.get(id);
        if (type) result.push({ type, value: store.get(index) });
      }
    }
    return result;
  }

  // ----------------------------------------------------------------------- queries

  /**
   * Build (or reuse) a query.
   *
   * ```js
   * for (const [entity, transform, velocity] of world.query([Transform, Velocity])) { ... }
   * world.query([Enemy], { without: [Dead] }).each((e) => { ... });
   * ```
   *
   * @template {readonly import('./component.js').ComponentType[]} C
   * @param {C} required
   * @param {{ without?: readonly import('./component.js').ComponentType[] }} [options]
   * @returns {Query<C>}
   */
  query(required, options) {
    const without = options?.without ?? [];
    const key = `${required.map((c) => c.id).join(',')}|${without.map((c) => c.id).join(',')}`;
    let cached = this._queryCache.get(key);
    if (cached === undefined) {
      cached = new Query(this, required, options);
      this._queryCache.set(key, cached);
    }
    return /** @type {Query<C>} */ (cached);
  }

  // --------------------------------------------------------------------- resources

  /**
   * @template T
   * @param {string} key
   * @param {T} value
   * @returns {T}
   */
  setResource(key, value) {
    this.resources.set(key, value);
    return value;
  }

  /**
   * @template T
   * @param {string} key
   * @returns {T | undefined}
   */
  getResource(key) {
    return this.resources.get(key);
  }

  /**
   * @template T
   * @param {string} key
   * @returns {T}
   * @throws {Error} if the resource was never registered — the usual cause is a plugin that
   *   did not install, and failing loudly points straight at it.
   */
  requireResource(key) {
    if (!this.resources.has(key)) {
      throw new Error(`World.requireResource: no resource registered under "${key}"`);
    }
    return this.resources.get(key);
  }

  // ----------------------------------------------------------------------- systems

  /**
   * Register a system.
   * @param {import('./scheduler.js').Stage} stage
   * @param {import('./scheduler.js').SystemFn} system
   * @param {{ order?: number, name?: string }} [options]
   * @returns {number} a handle for {@link removeSystem}.
   */
  addSystem(stage, system, options) {
    return this.scheduler.add(stage, system, options);
  }

  /**
   * @param {number} handle
   * @returns {boolean}
   */
  removeSystem(handle) {
    return this.scheduler.remove(handle);
  }

  /**
   * Run one stage. The runtime calls this; games rarely need to.
   * @param {import('./scheduler.js').Stage} stage
   * @param {number} dt seconds
   * @returns {void}
   */
  runStage(stage, dt) {
    this.scheduler.run(stage, this, dt);
  }

  // ---------------------------------------------------------------------- teardown

  /**
   * Remove every entity and component, keeping systems and resources.
   * Used when a scene ends.
   */
  clearEntities() {
    for (const store of this._stores.values()) store.clear();
    this._generations.length = 0;
    this._alive.length = 0;
    this._freeIndices.length = 0;
    this._pendingDestroy.length = 0;
    this._nextIndex = 0;
    this._liveCount = 0;
  }

  /** Reset the world completely: entities, systems, events, resources. */
  reset() {
    this.clearEntities();
    this._stores.clear();
    this._componentTypes.clear();
    this._queryCache.clear();
    this.scheduler.clear();
    this.events.clear();
    this.resources.clear();
  }

  /**
   * Counters for the debug overlay and the editor's statistics panel.
   * @returns {{ entities: number, pendingDestroy: number, componentTypes: number, storedComponents: number, cachedQueries: number }}
   */
  stats() {
    let stored = 0;
    for (const store of this._stores.values()) stored += store.size;
    return {
      entities: this._liveCount,
      pendingDestroy: this._pendingDestroy.length,
      componentTypes: this._stores.size,
      storedComponents: stored,
      cachedQueries: this._queryCache.size,
    };
  }
}
