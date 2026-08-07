import { makeEntity } from './entity.js';

/**
 * A view over every entity holding a set of components.
 *
 * Two properties matter (SPEC §5):
 *
 * 1. **Smallest-store driving.** Iteration walks the smallest participating store and probes the
 *    others, so a query costs `O(rarest component)` rather than `O(world size)`. A query for
 *    `[Transform, Boss]` in a world with 10,000 transforms and 1 boss visits one entity.
 *
 * 2. **Mutation safety (Invariant Q1).** The driving entity list is snapshotted before iteration
 *    begins, and every candidate is re-checked against the live world as it is yielded. A system
 *    may therefore spawn, destroy, add and remove freely while iterating without skipping a
 *    surviving entity or touching a destroyed one — which systems do constantly, and which is a
 *    classic source of "every other enemy survives" bugs in hand-rolled ECS code.
 *
 * @template {readonly import('./component.js').ComponentType[]} C
 */
export class Query {
  /**
   * @param {import('./world.js').World} world
   * @param {C} required
   * @param {{ without?: readonly import('./component.js').ComponentType[] }} [options]
   */
  constructor(world, required, options = {}) {
    if (required.length === 0) {
      throw new Error('Query: at least one required component is needed');
    }

    /** @type {import('./world.js').World} */
    this.world = world;
    /** @type {C} */
    this.required = required;
    /** @type {readonly import('./component.js').ComponentType[]} */
    this.without = options.without ?? [];
  }

  /**
   * Pick the store with the fewest entries among the required components.
   * @returns {import('./sparse-set.js').SparseSet<any>}
   * @private
   */
  _drivingStore() {
    let smallest = this.world.store(this.required[0]);
    for (let i = 1; i < this.required.length; i += 1) {
      const candidate = this.world.store(this.required[i]);
      if (candidate.size < smallest.size) smallest = candidate;
    }
    return smallest;
  }

  /**
   * @param {number} index entity index
   * @returns {boolean}
   * @private
   */
  _matches(index) {
    for (let i = 0; i < this.required.length; i += 1) {
      if (!this.world.store(this.required[i]).has(index)) return false;
    }
    for (let i = 0; i < this.without.length; i += 1) {
      if (this.world.store(this.without[i]).has(index)) return false;
    }
    return true;
  }

  /**
   * Iterate `[entity, ...componentValues]` tuples.
   *
   * Allocates one tuple array per entity. For hot loops prefer {@link each}, which passes the
   * values as arguments and allocates nothing per entity.
   *
   * @returns {IterableIterator<[number, ...any[]]>}
   */
  *[Symbol.iterator]() {
    const world = this.world;
    // Snapshot: this array is what makes mid-iteration mutation safe.
    const candidates = this._drivingStore().entityIndices();
    const stores = this.required.map((c) => world.store(c));

    for (let i = 0; i < candidates.length; i += 1) {
      const index = candidates[i];
      // Re-check against the live world — the entity may have been destroyed, or lost one of
      // the required components, since the snapshot was taken.
      if (!world.isAliveIndex(index)) continue;
      if (!this._matches(index)) continue;

      /** @type {[number, ...any[]]} */
      const tuple = [makeEntity(index, world.generationOf(index))];
      for (let s = 0; s < stores.length; s += 1) {
        tuple.push(stores[s].get(index));
      }
      yield tuple;
    }
  }

  /**
   * Allocation-free iteration. The callback receives `(entity, ...componentValues)`.
   *
   * ```js
   * query.each((entity, transform, velocity) => {
   *   transform.position.addScaledSelf(velocity.linear, dt);
   * });
   * ```
   *
   * @param {(entity: number, ...values: any[]) => void} callback
   * @returns {number} how many entities were visited.
   */
  each(callback) {
    const world = this.world;
    const candidates = this._drivingStore().entityIndices();
    const stores = this.required.map((c) => world.store(c));
    const arity = stores.length;
    let visited = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      const index = candidates[i];
      if (!world.isAliveIndex(index)) continue;
      if (!this._matches(index)) continue;

      const entity = makeEntity(index, world.generationOf(index));
      // Unrolled for the common arities; the general path allocates, the others do not.
      switch (arity) {
        case 1:
          callback(entity, stores[0].get(index));
          break;
        case 2:
          callback(entity, stores[0].get(index), stores[1].get(index));
          break;
        case 3:
          callback(entity, stores[0].get(index), stores[1].get(index), stores[2].get(index));
          break;
        default: {
          const values = new Array(arity);
          for (let s = 0; s < arity; s += 1) values[s] = stores[s].get(index);
          callback(entity, ...values);
        }
      }
      visited += 1;
    }
    return visited;
  }

  /**
   * @returns {number} how many entities currently match.
   *   Walks the query, so it is O(smallest store) — cache it rather than calling it in a loop.
   */
  count() {
    let total = 0;
    const candidates = this._drivingStore().entityIndices();
    for (let i = 0; i < candidates.length; i += 1) {
      const index = candidates[i];
      if (this.world.isAliveIndex(index) && this._matches(index)) total += 1;
    }
    return total;
  }

  /** @returns {boolean} true if nothing matches. Cheaper than `count() === 0` on large sets. */
  isEmpty() {
    for (const _ of this) return false;
    return true;
  }

  /**
   * @returns {[number, ...any[]] | null} the first match, or `null`.
   *   "First" is not meaningful ordering — sparse sets reorder on delete (SPEC §4). Use this
   *   only for singletons, where exactly one entity is expected to match.
   */
  first() {
    for (const tuple of this) return tuple;
    return null;
  }

  /** @returns {number[]} the matching entity handles, materialised into an array. */
  entities() {
    /** @type {number[]} */
    const result = [];
    for (const tuple of this) result.push(tuple[0]);
    return result;
  }
}
