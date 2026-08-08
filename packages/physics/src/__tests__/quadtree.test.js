import { describe, it, expect } from 'vitest';
import { Rect, AABB } from '@novaforge/math';
import { Quadtree } from '../quadtree.js';
import { Layers } from '../layers.js';

/**
 * @param {number} entity
 * @param {number} x
 * @param {number} y
 * @param {number} [size]
 */
function item(entity, x, y, size = 10) {
  return {
    entity,
    bounds: new AABB(x, y, x + size, y + size),
    layer: Layers.DEFAULT,
    mask: Layers.ALL,
  };
}

/** @returns {Quadtree} a 1000x1000 tree rooted at the origin. */
function tree(options) {
  return new Quadtree(new Rect(0, 0, 1000, 1000), options);
}

describe('insertion and subdivision', () => {
  it('starts as an empty leaf', () => {
    const qt = tree();
    expect(qt.size).toBe(0);
    expect(qt.isLeaf).toBe(true);
  });

  it('holds items without subdividing under the threshold', () => {
    const qt = tree({ maxItems: 4 });
    for (let i = 0; i < 4; i += 1) qt.insert(item(i, i * 100, 0));
    expect(qt.isLeaf).toBe(true);
    expect(qt.size).toBe(4);
  });

  it('subdivides once the threshold is passed', () => {
    const qt = tree({ maxItems: 4 });
    for (let i = 0; i < 10; i += 1) qt.insert(item(i, i * 90, i * 90));
    expect(qt.isLeaf).toBe(false);
    expect(qt.size).toBe(10);
  });

  it('keeps every item reachable after subdividing', () => {
    const qt = tree({ maxItems: 2 });
    for (let i = 0; i < 50; i += 1) qt.insert(item(i, (i * 37) % 900, (i * 53) % 900));
    const found = qt.query(new AABB(-1, -1, 1001, 1001));
    expect(found).toHaveLength(50);
    expect(new Set(found.map((f) => f.entity)).size).toBe(50);
  });

  // Straddling items stay at the parent rather than being duplicated into every child they
  // overlap, which is what keeps pair generation duplicate-free.
  it('keeps a boundary-straddling item at the parent node', () => {
    const qt = tree({ maxItems: 1 });
    qt.insert(item(1, 100, 100));
    qt.insert(item(2, 600, 600));
    qt.insert(item(3, 480, 480, 40)); // spans the centre cross

    expect(qt.isLeaf).toBe(false);
    expect(qt.items.map((i) => i.entity)).toContain(3);
    expect(qt.size).toBe(3);
  });

  // Without a depth cap, a hundred bodies at the same point recurse until the stack gives out.
  it('stops subdividing at maxDepth', () => {
    const qt = tree({ maxItems: 1, maxDepth: 3 });
    for (let i = 0; i < 100; i += 1) qt.insert(item(i, 10, 10, 1));
    expect(qt.stats().depth).toBeLessThanOrEqual(3);
    expect(qt.size).toBe(100);
  });

  it('clear empties the tree and collapses the children', () => {
    const qt = tree({ maxItems: 1 });
    for (let i = 0; i < 20; i += 1) qt.insert(item(i, i * 40, i * 40));
    qt.clear();
    expect(qt.size).toBe(0);
    expect(qt.isLeaf).toBe(true);
  });
});

describe('region query', () => {
  it('finds items inside the region', () => {
    const qt = tree({ maxItems: 2 });
    qt.insert(item(1, 100, 100));
    qt.insert(item(2, 800, 800));

    const found = qt.query(new AABB(50, 50, 200, 200));
    expect(found.map((f) => f.entity)).toEqual([1]);
  });

  it('finds nothing in an empty region', () => {
    const qt = tree();
    qt.insert(item(1, 100, 100));
    expect(qt.query(new AABB(900, 900, 950, 950))).toHaveLength(0);
  });

  it('finds items straddling the region edge', () => {
    const qt = tree();
    qt.insert(item(1, 95, 95, 10));
    expect(qt.query(new AABB(100, 100, 200, 200))).toHaveLength(1);
  });

  it('appends into a caller-supplied buffer', () => {
    const qt = tree();
    qt.insert(item(1, 100, 100));
    const buffer = [item(99, 0, 0)];
    qt.query(new AABB(50, 50, 200, 200), buffer);
    expect(buffer).toHaveLength(2);
  });

  it('agrees with a brute-force scan', () => {
    const qt = tree({ maxItems: 3 });
    const all = [];
    for (let i = 0; i < 300; i += 1) {
      const it = item(i, (i * 137) % 960, (i * 211) % 960, 20);
      all.push(it);
      qt.insert(it);
    }

    const region = new AABB(200, 200, 600, 600);
    const fromTree = new Set(qt.query(region).map((f) => f.entity));
    const fromScan = new Set(all.filter((f) => f.bounds.overlaps(region)).map((f) => f.entity));
    expect(fromTree).toEqual(fromScan);
  });
});

describe('pair generation', () => {
  it('pairs two overlapping items', () => {
    const qt = tree();
    qt.insert(item(1, 100, 100, 50));
    qt.insert(item(2, 120, 120, 50));
    expect(qt.pairs()).toHaveLength(1);
  });

  it('does not pair separated items', () => {
    const qt = tree();
    qt.insert(item(1, 100, 100));
    qt.insert(item(2, 800, 800));
    expect(qt.pairs()).toHaveLength(0);
  });

  // The property that makes the straddling policy pay off: no de-duplication pass is needed.
  it('produces each pair exactly once', () => {
    const qt = tree({ maxItems: 2 });
    for (let i = 0; i < 40; i += 1) qt.insert(item(i, 400 + (i % 8) * 5, 400 + (i % 8) * 5, 30));

    const seen = new Set();
    for (const [a, b] of qt.pairs()) {
      const key = a.entity < b.entity ? `${a.entity}:${b.entity}` : `${b.entity}:${a.entity}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  // If the tree misses a pair, bodies pass through each other — the failure the broadphase
  // must never have. Checked against the exhaustive answer.
  it('finds every pair a brute-force check would', () => {
    const qt = tree({ maxItems: 3 });
    const all = [];
    for (let i = 0; i < 200; i += 1) {
      const it = item(i, (i * 97) % 950, (i * 61) % 950, 40);
      all.push(it);
      qt.insert(it);
    }

    const fromTree = new Set(
      qt.pairs().map(([a, b]) =>
        a.entity < b.entity ? `${a.entity}:${b.entity}` : `${b.entity}:${a.entity}`,
      ),
    );

    const fromScan = new Set();
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        if (all[i].bounds.overlaps(all[j].bounds)) {
          fromScan.add(`${all[i].entity}:${all[j].entity}`);
        }
      }
    }

    expect(fromTree).toEqual(fromScan);
  });

  it('pairs a parent-held item against a deeply nested child item', () => {
    const qt = tree({ maxItems: 1 });
    qt.insert(item(1, 490, 490, 40)); // straddles the centre, stays at the root
    qt.insert(item(2, 100, 100));
    qt.insert(item(3, 495, 495, 10)); // deep in a child, overlaps item 1

    const keys = qt.pairs().map(([a, b]) => `${Math.min(a.entity, b.entity)}:${Math.max(a.entity, b.entity)}`);
    expect(keys).toContain('1:3');
  });
});

describe('stats', () => {
  it('reports item count, node count and depth', () => {
    const qt = tree({ maxItems: 2 });
    for (let i = 0; i < 20; i += 1) qt.insert(item(i, i * 45, i * 45));
    const stats = qt.stats();
    expect(stats.items).toBe(20);
    expect(stats.nodes).toBeGreaterThan(1);
    expect(stats.depth).toBeGreaterThan(0);
  });

  it('reports a single node for an unsubdivided tree', () => {
    expect(tree().stats().nodes).toBe(1);
  });
});
