import { describe, it, expect } from 'vitest';
import { AABB } from '../aabb.js';
import { Vec2 } from '../vec2.js';

describe('AABB construction', () => {
  it('builds from a centre and half extents', () => {
    const box = AABB.fromCenter(new Vec2(10, 10), 5, 5);
    expect(box.minX).toBe(5);
    expect(box.maxY).toBe(15);
    expect(box.width).toBe(10);
  });

  it('builds from a point cloud', () => {
    const box = AABB.fromPoints([
      { x: -3, y: 2 },
      { x: 7, y: -1 },
      { x: 0, y: 5 },
    ]);
    expect(box.minX).toBe(-3);
    expect(box.minY).toBe(-1);
    expect(box.maxX).toBe(7);
    expect(box.maxY).toBe(5);
  });

  it('returns an empty box for an empty point cloud rather than infinities', () => {
    const box = AABB.fromPoints([]);
    expect(Number.isFinite(box.minX)).toBe(true);
    expect(box.area).toBe(0);
  });

  it('builds from a circle', () => {
    const box = AABB.fromCircle(new Vec2(0, 0), 3);
    expect(box.width).toBe(6);
    expect(box.height).toBe(6);
  });
});

describe('AABB overlap', () => {
  it('detects overlapping boxes', () => {
    const a = new AABB(0, 0, 10, 10);
    const b = new AABB(5, 5, 15, 15);
    expect(a.overlaps(b)).toBe(true);
    expect(b.overlaps(a)).toBe(true);
  });

  it('rejects separated boxes', () => {
    const a = new AABB(0, 0, 10, 10);
    const b = new AABB(20, 20, 30, 30);
    expect(a.overlaps(b)).toBe(false);
  });

  // The broadphase must be conservative: a false positive costs one narrowphase call,
  // a false negative costs a missed collision.
  it('treats touching boxes as overlapping', () => {
    const a = new AABB(0, 0, 10, 10);
    const b = new AABB(10, 0, 20, 10);
    expect(a.overlaps(b)).toBe(true);
  });

  it('detects containment', () => {
    const outer = new AABB(0, 0, 100, 100);
    const inner = new AABB(10, 10, 20, 20);
    expect(outer.contains(inner)).toBe(true);
    expect(inner.contains(outer)).toBe(false);
  });
});

describe('AABB operations', () => {
  it('merges two boxes into their bound', () => {
    const merged = new AABB(0, 0, 5, 5).merge(new AABB(10, 10, 20, 20));
    expect(merged.minX).toBe(0);
    expect(merged.maxX).toBe(20);
  });

  it('expands in every direction', () => {
    const box = new AABB(0, 0, 10, 10).expand(2);
    expect(box.minX).toBe(-2);
    expect(box.maxX).toBe(12);
  });

  it('sweeps along a motion vector', () => {
    const swept = new AABB(0, 0, 10, 10).sweep({ x: 20, y: -5 });
    expect(swept.maxX).toBe(30);
    expect(swept.minY).toBe(-5);
    expect(swept.minX).toBe(0);
  });

  it('clamps a point to the box', () => {
    const box = new AABB(0, 0, 10, 10);
    expect(box.closestPoint(new Vec2(50, 5)).x).toBe(10);
    expect(box.closestPoint(new Vec2(5, 5)).x).toBe(5);
  });
});

describe('AABB raycast', () => {
  const box = new AABB(10, 10, 20, 20);

  it('hits a box straight ahead and reports the entry distance', () => {
    const t = box.raycast({ x: 0, y: 15 }, { x: 1, y: 0 });
    expect(t).toBeCloseTo(10);
  });

  it('misses a box that is off to the side', () => {
    expect(box.raycast({ x: 0, y: 100 }, { x: 1, y: 0 })).toBeNull();
  });

  it('misses when the box is beyond maxDistance', () => {
    expect(box.raycast({ x: 0, y: 15 }, { x: 1, y: 0 }, 5)).toBeNull();
  });

  it('reports distance 0 for a ray starting inside', () => {
    expect(box.raycast({ x: 15, y: 15 }, { x: 1, y: 0 })).toBe(0);
  });

  // A zero component means the ray is parallel to that slab. Dividing would give
  // Infinity/NaN, so the parallel case has to be handled explicitly.
  it('handles an axis-aligned ray parallel to a slab', () => {
    expect(box.raycast({ x: 15, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(10);
    expect(box.raycast({ x: 100, y: 0 }, { x: 0, y: 1 })).toBeNull();
  });

  it('hits on the diagonal', () => {
    const t = box.raycast({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(t).toBeCloseTo(10);
  });
});
