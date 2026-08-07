import { describe, it, expect } from 'vitest';
import * as easing from '../easing.js';

const CURVES = Object.entries(easing.byName);

describe('easing contract', () => {
  // Every curve must be an identity at the endpoints, otherwise an animation snaps on the
  // first and last frame.
  it.each(CURVES)('%s maps 0 to 0 and 1 to 1', (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 5);
    expect(fn(1)).toBeCloseTo(1, 5);
  });

  it.each(CURVES)('%s stays finite across the domain', (_name, fn) => {
    for (let t = 0; t <= 1; t += 0.01) {
      expect(Number.isFinite(fn(t))).toBe(true);
    }
  });
});

describe('easing shapes', () => {
  it('linear is the identity', () => {
    expect(easing.linear(0.37)).toBe(0.37);
  });

  it('an "in" curve starts slow', () => {
    expect(easing.quadIn(0.5)).toBeLessThan(0.5);
  });

  it('an "out" curve starts fast', () => {
    expect(easing.quadOut(0.5)).toBeGreaterThan(0.5);
  });

  it('an "inOut" curve passes through the midpoint', () => {
    expect(easing.quadInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easing.cubicInOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it('back curves deliberately leave the [0,1] range', () => {
    expect(easing.backIn(0.3)).toBeLessThan(0);
    expect(easing.backOut(0.7)).toBeGreaterThan(1);
  });

  it('elasticOut oscillates around the target', () => {
    let above = false;
    for (let t = 0.1; t < 1; t += 0.01) {
      if (easing.elasticOut(t) > 1.001) above = true;
    }
    expect(above).toBe(true);
  });

  it('bounceOut never exceeds 1', () => {
    for (let t = 0; t <= 1; t += 0.005) {
      expect(easing.bounceOut(t)).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('easing combinators', () => {
  it('mirror turns an in curve into its out counterpart', () => {
    const mirrored = easing.mirror(easing.quadIn);
    for (let t = 0; t <= 1; t += 0.05) {
      expect(mirrored(t)).toBeCloseTo(easing.quadOut(t), 6);
    }
  });

  it('combine produces a valid inOut curve', () => {
    const combined = easing.combine(easing.quadIn, easing.quadOut);
    expect(combined(0)).toBeCloseTo(0);
    expect(combined(0.5)).toBeCloseTo(0.5);
    expect(combined(1)).toBeCloseTo(1);
  });
});

describe('easing resolution by name', () => {
  it('resolves a known name', () => {
    expect(easing.resolve('cubicOut')).toBe(easing.cubicOut);
  });

  // A typo in a serialised animation should degrade, not crash the animation system.
  it('falls back to linear for an unknown name', () => {
    expect(easing.resolve('does-not-exist')).toBe(easing.linear);
  });
});
