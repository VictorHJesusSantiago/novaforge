import { describe, it, expect } from 'vitest';
import { Rect } from '../rect.js';
import { Vec2 } from '../vec2.js';

describe('Rect edges', () => {
  const r = new Rect(10, 20, 30, 40);

  it('derives its edges from position and size', () => {
    expect(r.left).toBe(10);
    expect(r.top).toBe(20);
    expect(r.right).toBe(40);
    expect(r.bottom).toBe(60);
  });

  it('computes its centre and area', () => {
    expect(r.center.x).toBe(25);
    expect(r.center.y).toBe(40);
    expect(r.area).toBe(1200);
  });

  it('builds from bounds', () => {
    const b = Rect.fromBounds(0, 0, 10, 5);
    expect(b.width).toBe(10);
    expect(b.height).toBe(5);
  });

  it('builds from a centre', () => {
    const c = Rect.fromCenter(new Vec2(0, 0), 10, 10);
    expect(c.left).toBe(-5);
    expect(c.bottom).toBe(5);
  });
});

describe('Rect containment', () => {
  const r = new Rect(0, 0, 10, 10);

  it('contains interior points', () => {
    expect(r.containsPoint(new Vec2(5, 5))).toBe(true);
  });

  it('excludes exterior points', () => {
    expect(r.containsPoint(new Vec2(15, 5))).toBe(false);
  });

  it('includes the top-left edge and excludes the bottom-right', () => {
    expect(r.containsPoint(new Vec2(0, 0))).toBe(true);
    expect(r.containsPoint(new Vec2(10, 10))).toBe(false);
  });

  it('detects a fully contained rect', () => {
    expect(r.containsRect(new Rect(2, 2, 3, 3))).toBe(true);
    expect(r.containsRect(new Rect(2, 2, 30, 3))).toBe(false);
  });
});

describe('Rect intersection', () => {
  it('detects overlap', () => {
    expect(new Rect(0, 0, 10, 10).intersects(new Rect(5, 5, 10, 10))).toBe(true);
  });

  it('rejects separated rects', () => {
    expect(new Rect(0, 0, 10, 10).intersects(new Rect(50, 50, 10, 10))).toBe(false);
  });

  it('does not count merely touching rects as intersecting', () => {
    expect(new Rect(0, 0, 10, 10).intersects(new Rect(10, 0, 10, 10))).toBe(false);
  });

  it('computes the overlapping region', () => {
    const i = new Rect(0, 0, 10, 10).intersection(new Rect(5, 5, 10, 10));
    expect(i).not.toBeNull();
    expect(i?.x).toBe(5);
    expect(i?.width).toBe(5);
  });

  it('returns null when there is no overlap', () => {
    expect(new Rect(0, 0, 10, 10).intersection(new Rect(50, 50, 1, 1))).toBeNull();
  });

  it('unions into the smallest containing rect', () => {
    const u = new Rect(0, 0, 5, 5).union(new Rect(10, 10, 5, 5));
    expect(u.x).toBe(0);
    expect(u.right).toBe(15);
  });
});

describe('Rect subdivide', () => {
  const quads = new Rect(0, 0, 100, 100).subdivide();

  it('returns four quadrants in NW, NE, SW, SE order', () => {
    expect(quads).toHaveLength(4);
    expect(quads[0].x).toBe(0);
    expect(quads[0].y).toBe(0);
    expect(quads[1].x).toBe(50);
    expect(quads[1].y).toBe(0);
    expect(quads[2].x).toBe(0);
    expect(quads[2].y).toBe(50);
    expect(quads[3].x).toBe(50);
    expect(quads[3].y).toBe(50);
  });

  it('quadrants tile the parent exactly', () => {
    const total = quads.reduce((sum, q) => sum + q.area, 0);
    expect(total).toBe(10000);
  });

  it('quadrants do not overlap each other', () => {
    for (let i = 0; i < quads.length; i += 1) {
      for (let j = i + 1; j < quads.length; j += 1) {
        expect(quads[i].intersects(quads[j])).toBe(false);
      }
    }
  });
});

describe('Rect transforms', () => {
  it('inflates in every direction', () => {
    const r = new Rect(10, 10, 10, 10).inflate(5);
    expect(r.x).toBe(5);
    expect(r.width).toBe(20);
  });

  it('deflates with a negative amount', () => {
    const r = new Rect(10, 10, 10, 10).inflate(-2);
    expect(r.width).toBe(6);
  });

  it('translates without resizing', () => {
    const r = new Rect(0, 0, 10, 10).translate(5, -5);
    expect(r.x).toBe(5);
    expect(r.y).toBe(-5);
    expect(r.width).toBe(10);
  });
});
