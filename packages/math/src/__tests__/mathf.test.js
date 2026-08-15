import { describe, it, expect } from 'vitest';
import {
  clamp,
  clamp01,
  lerp,
  inverseLerp,
  remap,
  approximately,
  sign,
  wrap,
  wrapAngle,
  moveTowards,
  smoothDamp,
  isPowerOfTwo,
  nearestPowerOfTwo,
} from '../mathf.js';

describe('clamp', () => {
  it('passes values inside the range through', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps both ends', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('clamp01 is the [0,1] special case', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
  });
});

describe('lerp and friends', () => {
  it('lerps at the endpoints exactly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('extrapolates outside [0,1] rather than clamping', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });

  it('inverseLerp inverts lerp', () => {
    expect(inverseLerp(10, 20, 15)).toBeCloseTo(0.5);
  });

  it('inverseLerp returns 0 for a degenerate range instead of dividing by zero', () => {
    expect(inverseLerp(5, 5, 7)).toBe(0);
    expect(Number.isFinite(inverseLerp(5, 5, 7))).toBe(true);
  });

  it('remap moves a value between ranges', () => {
    expect(remap(5, 0, 10, 0, 100)).toBeCloseTo(50);
    expect(remap(0, -1, 1, 0, 200)).toBeCloseTo(100);
  });
});

describe('approximately and sign', () => {
  it('tolerates float drift', () => {
    expect(approximately(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('respects a custom tolerance', () => {
    expect(approximately(1, 1.05, 0.1)).toBe(true);
    expect(approximately(1, 1.05, 0.01)).toBe(false);
  });

  it('sign treats near-zero as zero and never returns -0', () => {
    expect(sign(1e-12)).toBe(0);
    expect(sign(-1e-12)).toBe(0);
    expect(Object.is(sign(0), -0)).toBe(false);
    expect(sign(-3)).toBe(-1);
    expect(sign(3)).toBe(1);
  });
});

describe('wrap', () => {
  it('wraps values above the range', () => {
    expect(wrap(11, 0, 10)).toBe(1);
  });

  it('wraps negative values correctly', () => {
    expect(wrap(-1, 0, 10)).toBe(9);
    expect(wrap(-11, 0, 10)).toBe(9);
  });

  it('returns min for a degenerate range', () => {
    expect(wrap(5, 3, 3)).toBe(3);
  });

  it('wrapAngle keeps angles in (-PI, PI]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it('wrapAngle makes 179deg to -179deg a short move', () => {
    const from = (179 * Math.PI) / 180;
    const to = (-179 * Math.PI) / 180;
    const delta = wrapAngle(to - from);
    expect(Math.abs(delta)).toBeLessThan(Math.PI / 45);
  });
});

describe('moveTowards', () => {
  it('snaps to the target when within maxDelta', () => {
    expect(moveTowards(0, 1, 5)).toBe(1);
  });

  it('steps by maxDelta when far away', () => {
    expect(moveTowards(0, 100, 5)).toBe(5);
  });

  it('works in the negative direction', () => {
    expect(moveTowards(0, -100, 5)).toBe(-5);
  });
});

describe('smoothDamp', () => {
  it('converges toward the target over repeated calls', () => {
    const state = { velocity: 0 };
    let current = 0;
    for (let i = 0; i < 120; i += 1) {
      current = smoothDamp(current, 100, state, 0.3, 1 / 60);
    }
    expect(current).toBeCloseTo(100, 1);
  });

  it('does not overshoot the target', () => {
    const state = { velocity: 0 };
    let current = 0;
    let maximum = 0;
    for (let i = 0; i < 200; i += 1) {
      current = smoothDamp(current, 10, state, 0.1, 1 / 60);
      maximum = Math.max(maximum, current);
    }
    expect(maximum).toBeLessThanOrEqual(10.0001);
  });
});

describe('powers of two', () => {
  it('identifies powers of two', () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(1024)).toBe(true);
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(1000)).toBe(false);
  });

  it('rounds up to the next power of two', () => {
    expect(nearestPowerOfTwo(1000)).toBe(1024);
    expect(nearestPowerOfTwo(1024)).toBe(1024);
    expect(nearestPowerOfTwo(0)).toBe(1);
  });
});
