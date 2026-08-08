import { describe, it, expect } from 'vitest';
import { circle, box, polygon, worldVertices, worldNormals } from '../shapes.js';
import { collide, collideCircles, collidePolygons } from '../sat.js';

/**
 * @param {any} shape
 * @param {number} x
 * @param {number} y
 * @param {number} [rotation]
 */
function at(shape, x, y, rotation = 0) {
  return { shape, position: { x, y }, rotation };
}

/** @param {ReturnType<typeof at>} a @param {ReturnType<typeof at>} b */
function hit(a, b) {
  return collide(a.shape, a.position, a.rotation, b.shape, b.position, b.rotation);
}

describe('circle vs circle', () => {
  it('detects overlap', () => {
    const manifold = collideCircles({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10);
    expect(manifold).not.toBeNull();
    expect(manifold?.penetration).toBeCloseTo(5);
  });

  it('reports no collision when separated', () => {
    expect(collideCircles({ x: 0, y: 0 }, 10, { x: 100, y: 0 }, 10)).toBeNull();
  });

  it('reports no collision when exactly touching', () => {
    expect(collideCircles({ x: 0, y: 0 }, 10, { x: 20, y: 0 }, 10)).toBeNull();
  });

  // The convention that everything else depends on. Backwards, and bodies attract.
  it('points the normal from A toward B', () => {
    const manifold = collideCircles({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10);
    expect(manifold?.normal.x).toBeCloseTo(1);
    expect(manifold?.normal.y).toBeCloseTo(0);
  });

  it('reverses the normal when the arguments are swapped', () => {
    const forward = collideCircles({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10);
    const backward = collideCircles({ x: 15, y: 0 }, 10, { x: 0, y: 0 }, 10);
    expect(backward?.normal.x).toBeCloseTo(-(forward?.normal.x ?? 0));
  });

  it('produces a unit normal', () => {
    const manifold = collideCircles({ x: 0, y: 0 }, 10, { x: 6, y: 8 }, 10);
    expect(manifold?.normal.length()).toBeCloseTo(1);
  });

  it('places the contact on the surface of A', () => {
    const manifold = collideCircles({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10);
    expect(manifold?.contacts[0].x).toBeCloseTo(10);
  });

  // Concentric circles have no meaningful normal; dividing by zero would poison the solver
  // with NaN for the rest of the session.
  it('picks an arbitrary but finite normal for concentric circles', () => {
    const manifold = collideCircles({ x: 5, y: 5 }, 10, { x: 5, y: 5 }, 10);
    expect(manifold).not.toBeNull();
    expect(manifold?.normal.isFinite()).toBe(true);
    expect(manifold?.normal.length()).toBeCloseTo(1);
  });
});

describe('box vs box', () => {
  it('detects overlap', () => {
    expect(hit(at(box(20, 20), 0, 0), at(box(20, 20), 10, 0))).not.toBeNull();
  });

  it('reports no collision when separated', () => {
    expect(hit(at(box(20, 20), 0, 0), at(box(20, 20), 100, 0))).toBeNull();
  });

  it('measures penetration along the shallow axis', () => {
    const manifold = hit(at(box(20, 20), 0, 0), at(box(20, 20), 15, 0));
    expect(manifold?.penetration).toBeCloseTo(5, 3);
  });

  it('picks the axis of least penetration', () => {
    // Overlapping 5 horizontally and 18 vertically: the separation should be horizontal.
    const manifold = hit(at(box(20, 20), 0, 0), at(box(20, 20), 15, 2));
    expect(Math.abs(manifold?.normal.x ?? 0)).toBeCloseTo(1, 2);
  });

  // A single contact point leaves a resting box free to rock about it forever; two are what
  // let a stack settle.
  it('produces two contact points for a flat resting contact', () => {
    const manifold = hit(at(box(40, 20), 0, 0), at(box(40, 20), 0, 19));
    expect(manifold?.contacts.length).toBe(2);
  });

  it('points the normal from A toward B', () => {
    const manifold = hit(at(box(20, 20), 0, 0), at(box(20, 20), 0, 15));
    expect(manifold?.normal.y).toBeGreaterThan(0);
  });

  it('reverses the normal when the arguments are swapped', () => {
    const forward = hit(at(box(20, 20), 0, 0), at(box(20, 20), 15, 0));
    const backward = hit(at(box(20, 20), 15, 0), at(box(20, 20), 0, 0));
    expect(forward?.normal.x).toBeCloseTo(-(backward?.normal.x ?? 0), 3);
  });

  it('handles a rotated box', () => {
    // A 45-degree box has a diagonal half-extent of ~14.1, so it reaches further than 10.
    expect(hit(at(box(20, 20), 0, 0, Math.PI / 4), at(box(20, 20), 23, 0))).not.toBeNull();
    expect(hit(at(box(20, 20), 0, 0), at(box(20, 20), 23, 0))).toBeNull();
  });

  it('detects a fully contained box', () => {
    const manifold = hit(at(box(100, 100), 0, 0), at(box(10, 10), 0, 0));
    expect(manifold).not.toBeNull();
    expect(manifold?.penetration).toBeGreaterThan(0);
  });
});

describe('circle vs polygon', () => {
  const square = box(40, 40);

  it('detects a circle overlapping a face', () => {
    const manifold = hit(at(circle(10), 25, 0), at(square, 0, 0));
    expect(manifold).not.toBeNull();
    expect(manifold?.penetration).toBeCloseTo(5, 3);
  });

  it('points the normal from the circle toward the box', () => {
    const manifold = hit(at(circle(10), 25, 0), at(square, 0, 0));
    expect(manifold?.normal.x).toBeCloseTo(-1, 3);
  });

  it('reports no collision when the circle is clear of the box', () => {
    expect(hit(at(circle(10), 100, 0), at(square, 0, 0))).toBeNull();
  });

  // The case a face-only implementation gets wrong, and the reason circles catch on the seam
  // between two adjacent boxes in most hand-rolled engines.
  it('handles the corner Voronoi region', () => {
    // Diagonally past the corner at (20, 20): distance to the corner is ~7.07.
    const manifold = hit(at(circle(10), 25, 25), at(square, 0, 0));
    expect(manifold).not.toBeNull();
    expect(manifold?.penetration).toBeCloseTo(10 - Math.hypot(5, 5), 3);
  });

  it('rejects a circle just clear of a corner', () => {
    // The corner is at (20, 20); this centre is ~14.1 away, further than the radius.
    expect(hit(at(circle(10), 30, 30), at(square, 0, 0))).toBeNull();
  });

  it('handles a circle whose centre is inside the box', () => {
    const manifold = hit(at(circle(5), 0, 0), at(square, 0, 0));
    expect(manifold).not.toBeNull();
    expect(manifold?.penetration).toBeGreaterThan(0);
    expect(manifold?.normal.length()).toBeCloseTo(1);
  });

  it('flips the normal for polygon-versus-circle', () => {
    const circleFirst = hit(at(circle(10), 25, 0), at(square, 0, 0));
    const boxFirst = hit(at(square, 0, 0), at(circle(10), 25, 0));
    expect(boxFirst?.normal.x).toBeCloseTo(-(circleFirst?.normal.x ?? 0), 3);
  });
});

describe('arbitrary convex polygons', () => {
  const triangle = polygon([
    { x: 0, y: -20 },
    { x: 20, y: 20 },
    { x: -20, y: 20 },
  ]);

  // Winding is normalised on construction so the narrowphase can derive outward normals the
  // same way every time. The observable consequence: every normal points *away* from the
  // centroid, whichever order the author listed the vertices in.
  it.each([
    ['counter-clockwise', [{ x: 0, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }]],
    ['clockwise', [{ x: -20, y: 20 }, { x: 20, y: 20 }, { x: 0, y: -20 }]],
  ])('normalises %s winding so every normal points outward', (_name, vertices) => {
    const shape = polygon(vertices);
    const centroid = shape.vertices.reduce(
      (sum, v) => ({ x: sum.x + v.x / shape.vertices.length, y: sum.y + v.y / shape.vertices.length }),
      { x: 0, y: 0 },
    );

    for (let i = 0; i < shape.normals.length; i += 1) {
      const a = shape.vertices[i];
      const b = shape.vertices[(i + 1) % shape.vertices.length];
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const outward = { x: midpoint.x - centroid.x, y: midpoint.y - centroid.y };
      const n = shape.normals[i];
      expect(n.x * outward.x + n.y * outward.y).toBeGreaterThan(0);
    }
  });

  it('detects a triangle overlapping a box', () => {
    expect(hit(at(triangle, 0, 0), at(box(20, 20), 0, 25))).not.toBeNull();
  });

  it('rejects a distant triangle', () => {
    expect(hit(at(triangle, 0, 0), at(box(20, 20), 0, 200))).toBeNull();
  });

  it('rejects fewer than three vertices', () => {
    expect(() => polygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(RangeError);
  });

  it('rejects duplicate adjacent vertices', () => {
    expect(() =>
      polygon([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toThrow(RangeError);
  });
});

describe('manifold invariants', () => {
  const cases = [
    ['box/box overlapping', at(box(20, 20), 0, 0), at(box(20, 20), 12, 3)],
    ['box/box rotated', at(box(20, 20), 0, 0, 0.6), at(box(30, 10), 14, 5, -0.3)],
    ['circle/box face', at(circle(12), 22, 0), at(box(40, 40), 0, 0)],
    ['circle/box corner', at(circle(12), 24, 24), at(box(40, 40), 0, 0)],
    ['circle/circle', at(circle(10), 0, 0), at(circle(10), 12, 4)],
  ];

  it.each(cases)('%s produces a unit normal', (_name, a, b) => {
    const manifold = hit(a, b);
    expect(manifold).not.toBeNull();
    expect(manifold?.normal.length()).toBeCloseTo(1, 5);
  });

  it.each(cases)('%s produces a positive penetration', (_name, a, b) => {
    expect(hit(a, b)?.penetration).toBeGreaterThan(0);
  });

  it.each(cases)('%s produces at least one finite contact point', (_name, a, b) => {
    const manifold = hit(a, b);
    expect(manifold?.contacts.length).toBeGreaterThanOrEqual(1);
    for (const contact of manifold?.contacts ?? []) {
      expect(contact.isFinite()).toBe(true);
    }
  });

  // Two shapes moved apart along the collision normal by the penetration depth must separate.
  // This is the property the resolver relies on, so it is worth asserting directly.
  it.each(cases)('%s reports a depth that actually separates them', (_name, a, b) => {
    const manifold = hit(a, b);
    expect(manifold).not.toBeNull();
    const normal = /** @type {import('@novaforge/math').Vec2} */ (manifold?.normal);
    const depth = /** @type {number} */ (manifold?.penetration);

    const moved = {
      shape: b.shape,
      position: { x: b.position.x + normal.x * (depth + 0.5), y: b.position.y + normal.y * (depth + 0.5) },
      rotation: b.rotation,
    };
    expect(hit(a, moved)).toBeNull();
  });
});

describe('direct polygon entry point', () => {
  it('accepts pre-transformed world vertices', () => {
    const a = box(20, 20);
    const b = box(20, 20);
    const manifold = collidePolygons(
      worldVertices(a, { x: 0, y: 0 }, 0),
      worldNormals(a, 0),
      worldVertices(b, { x: 15, y: 0 }, 0),
      worldNormals(b, 0),
    );
    expect(manifold?.penetration).toBeCloseTo(5, 3);
  });
});
