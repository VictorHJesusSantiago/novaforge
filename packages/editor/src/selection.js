/**
 * The editor's current selection: at most one entity, for now.
 *
 * A minimal pub-sub rather than pulling in a state management library — every editor panel
 * (scene tree, inspector, viewport overlay) needs to know when the selection changes, and that
 * is the entire feature this class provides.
 */
export class Selection {
  constructor() {
    /** @type {number | null} @private */
    this._entity = null;

    /** @type {Set<(entity: number | null) => void>} @private */
    this._listeners = new Set();
  }

  /** @returns {number | null} */
  get entity() {
    return this._entity;
  }

  /**
   * @param {number | null} entity
   * @returns {void}
   */
  select(entity) {
    if (entity === this._entity) return;
    this._entity = entity;
    this._emit();
  }

  /** @returns {void} */
  clear() {
    this.select(null);
  }

  /** @returns {boolean} */
  get hasSelection() {
    return this._entity !== null;
  }

  /**
   * @param {(entity: number | null) => void} fn
   * @returns {() => void} an unsubscribe function
   */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** @private */
  _emit() {
    for (const fn of this._listeners) fn(this._entity);
  }
}
