import { describe, it, expect } from 'vitest';
import { Vec2 } from '../vec2.js';

describe('Vec2 construction', () => {
  it('defaults to the origin', () => {
    const v = new Vec2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('builds a unit vector from an angle', () => {
    const v = Vec2.fromAngle(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    expect(v.length()).toBeCloseTo(1);
  });

  it('scales the vector built from an angle', () => {
    const v = Vec2.fromAngle(0, 5);
    expect(v.x).toBeCloseTo(5);
    expect(v.length()).toBeCloseTo(5);
  });
});

describe('Vec2 arithmetic', () => {
  it('does not mutate the receiver in allocating operations', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);
    a.add(b);
    expect(a.x).toBe(1);
    expect(a.y).toBe(2);
  });

  it('does mutate the receiver in *Self operations', () => {
    const a = new Vec2(1, 2);
    a.addSelf(new Vec2(3, 4));
    expect(a.x).toBe(4);
    expect(a.y).toBe(6);
  });

  it('addScaledSelf matches add(other.scale(k))', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, -4);
    const expected = a.add(b.scale(2.5));
    a.addScaledSelf(b, 2.5);
    expect(a.equals(expected)).toBe(true);
  });
});

describe('Vec2 measurements', () => {
  it('computes length via the 3-4-5 triangle', () => {
    expect(new Vec2(3, 4).length()).toBe(5);
    expect(new Vec2(3, 4).lengthSquared()).toBe(25);
  });

  it('dot product is zero for perpendicular vectors', () => {
    expect(new Vec2(1, 0).dot(new Vec2(0, 1))).toBe(0);
  });

  it('cross product sign identifies which side a vector is on', () => {
    expect(new Vec2(1, 0).cross(new Vec2(0, 1))).toBeGreaterThan(0);
    expect(new Vec2(1, 0).cross(new Vec2(0, -1))).toBeLessThan(0);
  });

  it('angleTo is signed', () => {
    const a = new Vec2(1, 0);
    expect(a.angleTo(new Vec2(0, 1))).toBeCloseTo(Math.PI / 2);
    expect(a.angleTo(new Vec2(0, -1))).toBeCloseTo(-Math.PI / 2);
  });
});

describe('Vec2 normalisation', () => {
  it('produces a unit vector', () => {
    expect(new Vec2(10, 0).normalized().length()).toBeCloseTo(1);
  });

  // A zero vector has no direction. Returning NaN here would silently poison every
  // downstream physics calculation, so it must clamp to zero instead.
  it('returns zero rather than NaN for a zero vector', () => {
    const n = new Vec2(0, 0).normalized();
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
    expect(n.isFinite()).toBe(true);
  });

  it('normalizeSelf handles the zero vector too', () => {
    const v = new Vec2(0, 0).normalizeSelf();
    expect(v.isFinite()).toBe(true);
  });

  it('clampLength leaves short vectors untouched', () => {
    const v = new Vec2(1, 0);
    expect(v.clampLength(5).length()).toBeCloseTo(1);
  });

  it('clampLength shortens long vectors', () => {
    const v = new Vec2(10, 0);
    expect(v.clampLength(3).length()).toBeCloseTo(3);
  });
});

describe('Vec2 rotation', () => {
  it('rotates 90 degrees counter-clockwise', () => {
    const v = new Vec2(1, 0).rotate(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it('preserves length under rotation', () => {
    const v = new Vec2(3, 4).rotate(1.2345);
    expect(v.length()).toBeCloseTo(5);
  });

  it('rotates around an arbitrary pivot', () => {
    const pivot = new Vec2(5, 5);
    const v = new Vec2(6, 5).rotateAround(Math.PI, pivot);
    expect(v.x).toBeCloseTo(4);
    expect(v.y).toBeCloseTo(5);
  });

  it('perpendicular is orthogonal to the original', () => {
    const v = new Vec2(3, 4);
    expect(v.dot(v.perpendicular())).toBeCloseTo(0);
  });
});

describe('Vec2 reflection and projection', () => {
  it('reflects across a surface normal', () => {
    const incoming = new Vec2(1, -1);
    const normal = new Vec2(0, 1);
    const r = incoming.reflect(normal);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(1);
  });

  it('projects onto an axis', () => {
    const p = new Vec2(3, 4).projectOnto(new Vec2(1, 0));
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(0);
  });

  it('projecting onto a zero vector yields zero, not NaN', () => {
    const p = new Vec2(3, 4).projectOnto(new Vec2(0, 0));
    expect(p.isFinite()).toBe(true);
    expect(p.isZero()).toBe(true);
  });
});

describe('Vec2 interpolation', () => {
  it('lerps between two points', () => {
    const m = new Vec2(0, 0).lerp(new Vec2(10, 20), 0.5);
    expect(m.x).toBe(5);
    expect(m.y).toBe(10);
  });

  it('moveTowards never overshoots', () => {
    const target = new Vec2(3, 4);
    const result = new Vec2(0, 0).moveTowards(target, 100);
    expect(result.equals(target)).toBe(true);
  });

  it('moveTowards advances by exactly maxDelta when far away', () => {
    const result = new Vec2(0, 0).moveTowards(new Vec2(10, 0), 2);
    expect(result.x).toBeCloseTo(2);
  });
});

describe('Vec2 serialisation', () => {
  it('round-trips through JSON', () => {
    const v = new Vec2(1.5, -2.25);
    const restored = Vec2.from(JSON.parse(JSON.stringify(v)));
    expect(restored.equals(v)).toBe(true);
  });
});
