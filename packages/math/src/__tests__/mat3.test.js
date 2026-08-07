import { describe, it, expect } from 'vitest';
import { Mat3 } from '../mat3.js';
import { Vec2 } from '../vec2.js';

describe('Mat3 basics', () => {
  it('starts as the identity', () => {
    const p = Mat3.identity().transformPoint(new Vec2(3, 4));
    expect(p.x).toBe(3);
    expect(p.y).toBe(4);
  });

  it('translates a point', () => {
    const p = Mat3.translation(10, 20).transformPoint(new Vec2(1, 2));
    expect(p.x).toBe(11);
    expect(p.y).toBe(22);
  });

  // The distinction that causes bugs when it is missed: normals must not be translated.
  it('ignores translation when transforming a direction', () => {
    const v = Mat3.translation(10, 20).transformVector(new Vec2(1, 0));
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it('rotates a point', () => {
    const p = Mat3.rotation(Math.PI / 2).transformPoint(new Vec2(1, 0));
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('scales a point', () => {
    const p = Mat3.scaling(2, 3).transformPoint(new Vec2(1, 1));
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(3);
  });
});

describe('Mat3 composition', () => {
  it('compose equals translation * rotation * scaling', () => {
    const composed = Mat3.compose(10, 20, 0.7, 2, 3);
    const manual = Mat3.translation(10, 20)
      .multiply(Mat3.rotation(0.7))
      .multiply(Mat3.scaling(2, 3));
    expect(composed.equals(manual, 1e-5)).toBe(true);
  });

  it('multiply applies the right-hand matrix first', () => {
    // Scale then translate: the translation must not be scaled.
    const m = Mat3.translation(100, 0).multiply(Mat3.scaling(2, 2));
    const p = m.transformPoint(new Vec2(1, 0));
    expect(p.x).toBeCloseTo(102);
  });
});

describe('Mat3 inverse', () => {
  it('round-trips a point through a transform and its inverse', () => {
    const m = Mat3.compose(15, -30, 0.9, 2, 0.5);
    const inv = m.inverse();
    expect(inv).not.toBeNull();
    const original = new Vec2(7, -3);
    const there = m.transformPoint(original);
    const back = /** @type {Mat3} */ (inv).transformPoint(there);
    expect(back.x).toBeCloseTo(original.x, 4);
    expect(back.y).toBeCloseTo(original.y, 4);
  });

  // Returning identity here would place editor click-to-world at the wrong position with no
  // visible error, so the null must be explicit.
  it('returns null for a singular matrix instead of a wrong answer', () => {
    expect(Mat3.scaling(0, 0).inverse()).toBeNull();
    expect(Mat3.scaling(1, 0).inverse()).toBeNull();
  });
});

describe('Mat3 decompose', () => {
  it('recovers the values used to compose it', () => {
    const d = Mat3.compose(12, -8, 0.6, 3, 4).decompose();
    expect(d.x).toBeCloseTo(12, 4);
    expect(d.y).toBeCloseTo(-8, 4);
    expect(d.rotation).toBeCloseTo(0.6, 4);
    expect(d.scaleX).toBeCloseTo(3, 4);
    expect(d.scaleY).toBeCloseTo(4, 4);
  });

  it('detects a mirrored axis', () => {
    const d = Mat3.compose(0, 0, 0, 1, -1).decompose();
    expect(d.scaleY).toBeLessThan(0);
  });
});

describe('Mat3 storage layout', () => {
  // Column-major with the bottom row present is what lets the WebGL2 backend upload `m`
  // straight to uniformMatrix3fv with no repacking. Locking it down with a test.
  it('is a 9-element Float32Array in column-major order', () => {
    const m = Mat3.translation(5, 6);
    expect(m.m).toBeInstanceOf(Float32Array);
    expect(m.m.length).toBe(9);
    expect(m.m[6]).toBe(5);
    expect(m.m[7]).toBe(6);
    expect(m.m[8]).toBe(1);
  });

  it('clone is a deep copy', () => {
    const a = Mat3.translation(1, 2);
    const b = a.clone();
    b.m[6] = 99;
    expect(a.m[6]).toBe(1);
  });
});
