/**
 * @typedef {import('@novaforge/math').Rect} Rect
 *
 * Referenced only in JSDoc, so it is a type alias rather than an import. In a project with no
 * build step a type-only `import` is a real module fetch at runtime for something erased at
 * type-check time.
 */

/**
 * A quadtree broadphase.
 *
 * Rebuilt from scratch every physics step rather than updated incrementally. That sounds
 * wasteful and is not: below roughly 5,000 bodies a full rebuild of a shallow tree costs less
 * than tracking which bodies crossed which cell boundary, and it is dramatically simpler to keep
 * correct. Incremental update is the kind of optimisation that pays off at a scale this engine
 * does not target, while quietly introducing stale-node bugs at every scale.
 *
 * **Straddling policy.** An item whose bounds do not fit entirely inside one child stays at the
 * current node. The alternative — inserting it into every child it overlaps — makes pair
 * generation produce duplicates that then have to be de-duplicated, which costs more than the
 * shallower tree does.
 *
 * @typedef {object} QuadtreeItem
 * @property {number} entity
 * @property {import('@novaforge/math').AABB} bounds
 * @property {number} layer
 * @property {number} mask
 */
export class Quadtree {
  /**
   * @param {Rect} bounds world region the tree covers
   * @param {object} [options]
   * @param {number} [options.maxItems] items in a node before it subdivides
   * @param {number} [options.maxDepth] deepest allowed subdivision
   * @param {number} [options.depth] internal
   */
  constructor(bounds, options = {}) {
    /** @type {Rect} */
    this.bounds = bounds;

    /** @type {number} */
    this.maxItems = options.maxItems ?? 8;

    /**
     * A depth cap is not an optimisation, it is a termination guarantee: a hundred bodies
     * stacked at the same point can never be separated by subdivision, and without the cap the
     * tree would recurse until the stack gives out.
     * @type {number}
     */
    this.maxDepth = options.maxDepth ?? 8;

    /** @type {number} */
    this.depth = options.depth ?? 0;

    /** @type {QuadtreeItem[]} items held at this node. */
    this.items = [];

    /** @type {Quadtree[]} four children once subdivided, empty before that. */
    this.children = [];
  }

  /** @returns {boolean} */
  get isLeaf() {
    return this.children.length === 0;
  }

  /** Empty the tree, keeping the root bounds. */
  clear() {
    this.items.length = 0;
    this.children.length = 0;
  }

  /**
   * Split into four quadrants, in NW, NE, SW, SE order.
   * @private
   */
  _subdivide() {
    const quads = this.bounds.subdivide();
    for (const quad of quads) {
      this.children.push(
        new Quadtree(quad, {
          maxItems: this.maxItems,
          maxDepth: this.maxDepth,
          depth: this.depth + 1,
        }),
      );
    }

    // Re-file existing items; anything straddling a boundary stays here.
    const staying = [];
    for (const item of this.items) {
      const child = this._childFor(item);
      if (child === null) staying.push(item);
      else child.insert(item);
    }
    this.items = staying;
  }

  /**
   * @param {QuadtreeItem} item
   * @returns {Quadtree | null} the single child fully containing `item`, or `null`.
   * @private
   */
  _childFor(item) {
    for (const child of this.children) {
      if (
        item.bounds.minX >= child.bounds.left &&
        item.bounds.maxX <= child.bounds.right &&
        item.bounds.minY >= child.bounds.top &&
        item.bounds.maxY <= child.bounds.bottom
      ) {
        return child;
      }
    }
    return null;
  }

  /**
   * @param {QuadtreeItem} item
   * @returns {void}
   */
  insert(item) {
    if (!this.isLeaf) {
      const child = this._childFor(item);
      if (child !== null) {
        child.insert(item);
        return;
      }
      this.items.push(item);
      return;
    }

    this.items.push(item);

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this._subdivide();
    }
  }

  /**
   * Every item whose bounds overlap `region`.
   * @param {import('@novaforge/math').AABB} region
   * @param {QuadtreeItem[]} [out] appended to, so callers can reuse a buffer
   * @returns {QuadtreeItem[]}
   */
  query(region, out = []) {
    if (!this._intersectsRegion(region)) return out;

    for (const item of this.items) {
      if (item.bounds.overlaps(region)) out.push(item);
    }
    for (const child of this.children) {
      child.query(region, out);
    }
    return out;
  }

  /**
   * @param {import('@novaforge/math').AABB} region
   * @returns {boolean}
   * @private
   */
  _intersectsRegion(region) {
    return (
      this.bounds.left <= region.maxX &&
      this.bounds.right >= region.minX &&
      this.bounds.top <= region.maxY &&
      this.bounds.bottom >= region.minY
    );
  }

  /**
   * Every pair of items that might be colliding.
   *
   * Each pair is produced exactly once. Two items can be paired in one of two ways: both held at
   * the same node, or one held at an ancestor of the other. Walking those two cases and nothing
   * else is what keeps the output duplicate-free without a de-duplication pass.
   *
   * @param {Array<[QuadtreeItem, QuadtreeItem]>} [out]
   * @param {QuadtreeItem[]} [ancestors] items held at ancestor nodes, internal
   * @returns {Array<[QuadtreeItem, QuadtreeItem]>}
   */
  pairs(out = [], ancestors = []) {
    // Pairs within this node.
    for (let i = 0; i < this.items.length; i += 1) {
      for (let j = i + 1; j < this.items.length; j += 1) {
        if (this.items[i].bounds.overlaps(this.items[j].bounds)) {
          out.push([this.items[i], this.items[j]]);
        }
      }
    }

    // Pairs against everything held higher up, which no descendant can be separated from.
    for (const item of this.items) {
      for (const ancestor of ancestors) {
        if (item.bounds.overlaps(ancestor.bounds)) {
          out.push([ancestor, item]);
        }
      }
    }

    if (!this.isLeaf) {
      const inherited = ancestors.concat(this.items);
      for (const child of this.children) {
        child.pairs(out, inherited);
      }
    }

    return out;
  }

  /** @returns {number} items in this subtree. */
  get size() {
    let total = this.items.length;
    for (const child of this.children) total += child.size;
    return total;
  }

  /**
   * @returns {{ items: number, nodes: number, depth: number, maxItemsInNode: number }}
   *   Shown in the debug overlay; a depth pinned at `maxDepth` with a high `maxItemsInNode`
   *   means bodies are piled up somewhere and the broadphase has stopped helping.
   */
  stats() {
    let nodes = 1;
    let deepest = this.depth;
    let maxInNode = this.items.length;

    for (const child of this.children) {
      const childStats = child.stats();
      nodes += childStats.nodes;
      deepest = Math.max(deepest, childStats.depth);
      maxInNode = Math.max(maxInNode, childStats.maxItemsInNode);
    }

    return { items: this.size, nodes, depth: deepest, maxItemsInNode: maxInNode };
  }
}
