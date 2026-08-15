/**
 * A sparse set: the storage backing every component type (ADR-0002, SPEC §4).
 *
 * Three parallel arrays:
 *
 * ```
 *  sparse : entityIndex -> denseIndex      (holes allowed, indexed by entity)
 *  dense  : denseIndex  -> entityIndex     (contiguous, no holes)
 *  data   : denseIndex  -> value           (contiguous, parallel to dense)
 * ```
 *
 * `has`, `get`, `set` and `delete` are all O(1), and iteration walks `dense`, which is
 * contiguous and therefore cache-friendly. The cost is one sparse array per component type
 * sized to the highest live entity index.
 *
 * @template T
 */
export class SparseSet {
  constructor() {
    /**
     * Maps entity index to dense index. `undefined` means absent — a plain array with holes
     * rather than a Map, because the integer-keyed lookup is measurably faster and this is on
     * the hot path of every query.
     * @type {number[]}
     */
    this.sparse = [];

    /** @type {number[]} dense index -> entity index */
    this.dense = [];

    /** @type {T[]} dense index -> component value */
    this.data = [];
  }

  /** @returns {number} number of entities holding this component. */
  get size() {
    return this.dense.length;
  }

  /**
   * @param {number} index entity index (not a full handle)
   * @returns {boolean}
   */
  has(index) {
    const dense = this.sparse[index];
    return dense !== undefined && dense < this.dense.length && this.dense[dense] === index;
  }

  /**
   * @param {number} index entity index
   * @returns {T | undefined}
   */
  get(index) {
    if (!this.has(index)) return undefined;
    return this.data[this.sparse[index]];
  }

  /**
   * Insert or overwrite the value for an entity index.
   * @param {number} index entity index
   * @param {T} value
   * @returns {T} the stored value
   */
  set(index, value) {
    if (this.has(index)) {
      this.data[this.sparse[index]] = value;
      return value;
    }
    const dense = this.dense.length;
    this.sparse[index] = dense;
    this.dense.push(index);
    this.data.push(value);
    return value;
  }

  /**
   * Remove an entity's value with a swap-remove: the last element is moved into the vacated
   * slot so `dense` and `data` stay hole-free.
   *
   * This is why SPEC §4 forbids depending on iteration order — a delete reorders the set.
   *
   * @param {number} index entity index
   * @returns {boolean} true if something was removed.
   */
  delete(index) {
    if (!this.has(index)) return false;

    const denseIndex = this.sparse[index];
    const lastDense = this.dense.length - 1;

    if (denseIndex !== lastDense) {
      const movedEntity = this.dense[lastDense];
      this.dense[denseIndex] = movedEntity;
      this.data[denseIndex] = this.data[lastDense];
      this.sparse[movedEntity] = denseIndex;
    }

    this.dense.pop();
    this.data.pop();
    delete this.sparse[index];
    return true;
  }

  /** Remove everything, keeping the allocated arrays for reuse. */
  clear() {
    this.sparse.length = 0;
    this.dense.length = 0;
    this.data.length = 0;
  }

  /**
   * @returns {number[]} a copy of the entity indices currently in the set.
   *   A copy, not a view: queries snapshot this so that mutation during iteration is safe
   *   (SPEC Invariant Q1).
   */
  entityIndices() {
    return this.dense.slice();
  }

  /**
   * Iterate `[entityIndex, value]` pairs in dense order.
   *
   * Do not add or remove entries while consuming this directly — use `Query`, which snapshots.
   * @returns {IterableIterator<[number, T]>}
   */
  *[Symbol.iterator]() {
    for (let i = 0; i < this.dense.length; i += 1) {
      yield [this.dense[i], this.data[i]];
    }
  }

  /**
   * Structural self-check for Invariant C1: the three arrays stay in lockstep.
   * Called only from tests and the editor's debug panel; it is O(n).
   * @returns {boolean}
   */
  validate() {
    if (this.dense.length !== this.data.length) return false;
    for (let i = 0; i < this.dense.length; i += 1) {
      if (this.sparse[this.dense[i]] !== i) return false;
    }
    return true;
  }
}
