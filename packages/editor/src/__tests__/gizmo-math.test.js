import { describe, it, expect } from 'vitest';
import {
  rotateHandlePosition,
  scaleHandlePosition,
  angleFromCenter,
  scaleFromDrag,
  snapValue,
  snapPoint,
  snapAngle,
  ROTATE_HANDLE_DISTANCE,
} from '../gizmo-math.js';

describe('rotateHandlePosition', () => {
  it('sits at a fixed distance to the right at rotation 0', () => {
    const handle = rotateHandlePosition({ x: 0, y: 0 }, 0);
    expect(handle.x).toBeCloseTo(ROTATE_HANDLE_DISTANCE);
    expect(handle.y).toBeCloseTo(0);
  });

  it('tracks the entity as it rotates', () => {
    const handle = rotateHandlePosition({ x: 0, y: 0 }, Math.PI / 2);
    expect(handle.x).toBeCloseTo(0, 4);
    expect(handle.y).toBeCloseTo(ROTATE_HANDLE_DISTANCE, 4);
  });

  it('is offset from the entity position, not from the origin', () => {
    const handle = rotateHandlePosition({ x: 100, y: 200 }, 0);
    expect(handle.x).toBeCloseTo(100 + ROTATE_HANDLE_DISTANCE);
    expect(handle.y).toBeCloseTo(200);
  });

  it('respects a custom distance', () => {
    const handle = rotateHandlePosition({ x: 0, y: 0 }, 0, 10);
    expect(handle.x).toBeCloseTo(10);
  });
});

describe('scaleHandlePosition', () => {
  it('grows with the entity scale', () => {
    const small = scaleHandlePosition({ x: 0, y: 0 }, 0, { x: 1, y: 1 });
    const big = scaleHandlePosition({ x: 0, y: 0 }, 0, { x: 3, y: 3 });
    expect(Math.hypot(big.x, big.y)).toBeGreaterThan(Math.hypot(small.x, small.y));
  });

  it('rotates with the entity', () => {
    const at0 = scaleHandlePosition({ x: 0, y: 0 }, 0, { x: 1, y: 1 });
    const at90 = scaleHandlePosition({ x: 0, y: 0 }, Math.PI / 2, { x: 1, y: 1 });
    expect(at0.x).not.toBeCloseTo(at90.x, 1);
  });

  it('never collapses to zero distance even at zero scale', () => {
    const handle = scaleHandlePosition({ x: 5, y: 5 }, 0, { x: 0, y: 0 });
    expect(Math.hypot(handle.x - 5, handle.y - 5)).toBeGreaterThan(0);
  });
});

describe('angleFromCenter', () => {
  it('is 0 for a point directly to the right', () => {
    expect(angleFromCenter({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('is PI/2 for a point directly below (screen space, y-down)', () => {
    expect(angleFromCenter({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
  });

  it('is independent of distance', () => {
    const near = angleFromCenter({ x: 0, y: 0 }, { x: 1, y: 1 });
    const far = angleFromCenter({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(near).toBeCloseTo(far);
  });
});

describe('scaleFromDrag', () => {
  it('doubles the scale when dragged to twice the starting distance', () => {
    const scale = scaleFromDrag({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, { x: 1, y: 1 });
    expect(scale.x).toBeCloseTo(2);
    expect(scale.y).toBeCloseTo(2);
  });

  it('halves the scale when dragged toward the centre', () => {
    const scale = scaleFromDrag({ x: 0, y: 0 }, { x: 5, y: 0 }, 10, { x: 1, y: 1 });
    expect(scale.x).toBeCloseTo(0.5);
  });

  it('preserves a non-uniform starting scale proportionally', () => {
    const scale = scaleFromDrag({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, { x: 2, y: 4 });
    expect(scale.x).toBeCloseTo(4);
    expect(scale.y).toBeCloseTo(8);
  });

  // Dragging through the centre and out the other side must not invert or zero the scale.
  it('floors at minScale instead of going to zero or negative', () => {
    const scale = scaleFromDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, { x: 1, y: 1 });
    expect(scale.x).toBeGreaterThan(0);
    expect(scale.y).toBeGreaterThan(0);
  });

  it('does not divide by zero when the starting distance was zero', () => {
    const scale = scaleFromDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, { x: 1, y: 1 });
    expect(Number.isFinite(scale.x)).toBe(true);
  });
});

describe('snapValue', () => {
  it('rounds to the nearest step', () => {
    expect(snapValue(17, 10)).toBe(20);
    expect(snapValue(14, 10)).toBe(10);
  });

  it('leaves values unchanged when snapping is disabled (step <= 0)', () => {
    expect(snapValue(17.3, 0)).toBe(17.3);
    expect(snapValue(17.3, -1)).toBe(17.3);
  });

  it('snaps negative values correctly', () => {
    expect(snapValue(-17, 10)).toBe(-20);
  });
});

describe('snapPoint', () => {
  it('snaps both components', () => {
    const p = snapPoint({ x: 17, y: 23 }, 10);
    expect(p.x).toBe(20);
    expect(p.y).toBe(20);
  });
});

describe('snapAngle', () => {
  it('snaps to the nearest step in radians', () => {
    const step = Math.PI / 12; // 15 degrees
    const snapped = snapAngle((17 * Math.PI) / 180, step);
    expect(snapped).toBeCloseTo(Math.PI / 12); // rounds to 15deg
  });

  it('leaves the angle unchanged when disabled', () => {
    expect(snapAngle(1.2345, 0)).toBe(1.2345);
  });

  // Without wrapping, 179deg and -179deg — the same direction — would snap toward opposite
  // extremes instead of agreeing.
  it('wraps the result into (-PI, PI]', () => {
    const step = Math.PI / 12;
    const snapped = snapAngle(Math.PI * 3, step);
    expect(snapped).toBeGreaterThan(-Math.PI);
    expect(snapped).toBeLessThanOrEqual(Math.PI);
  });
});
