import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, resetComponentRegistry } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { defineTrack } from '../timeline.js';
import { sampleTrack, interpolateValue } from '../sampler.js';

/** @type {any} */ let Widget;

beforeEach(() => {
  resetComponentRegistry();
  Widget = defineComponent(
    'Widget',
    () => ({ n: 0, point: new Vec2(0, 0), tint: 0, label: '', on: false }),
    {
      n: { type: 'number' },
      point: { type: 'vec2' },
      tint: { type: 'color' },
      label: { type: 'string' },
      on: { type: 'boolean' },
    },
  );
});

describe('sampleTrack', () => {
  /** @type {any} */
  let track;
  beforeEach(() => {
    track = defineTrack(Widget, 'n', [
      { time: 0, value: 0 },
      { time: 10, value: 100 },
    ]);
  });

  it('returns t=0 exactly at the first keyframe', () => {
    expect(sampleTrack(track, 0)).toEqual({ from: 0, to: 0, t: 0 });
  });

  it('interpolates halfway between two keyframes', () => {
    const result = sampleTrack(track, 5);
    expect(result.from).toBe(0);
    expect(result.to).toBe(100);
    expect(result.t).toBeCloseTo(0.5);
  });

  it('clamps before the first keyframe', () => {
    const result = sampleTrack(track, -5);
    expect(result.from).toBe(0);
    expect(result.to).toBe(0);
  });

  it('clamps after the last keyframe', () => {
    const result = sampleTrack(track, 999);
    expect(result.from).toBe(100);
    expect(result.to).toBe(100);
  });

  it('picks the correct segment among more than two keyframes', () => {
    const multi = defineTrack(Widget, 'n', [
      { time: 0, value: 0 },
      { time: 10, value: 100 },
      { time: 20, value: 0 },
    ]);
    const early = sampleTrack(multi, 5);
    expect(early.from).toBe(0);
    expect(early.to).toBe(100);

    const late = sampleTrack(multi, 15);
    expect(late.from).toBe(100);
    expect(late.to).toBe(0);
  });

  it('applies the outgoing keyframe\'s ease function', () => {
    const eased = defineTrack(Widget, 'n', [
      { time: 0, value: 0, ease: () => 0.9 },
      { time: 10, value: 100 },
    ]);
    expect(sampleTrack(eased, 5).t).toBe(0.9);
  });

  it('defaults to linear when no ease is given', () => {
    expect(sampleTrack(track, 2.5).t).toBeCloseTo(0.25);
  });

  it('does not divide by zero for two keyframes at the same time', () => {
    const degenerate = defineTrack(Widget, 'n', [
      { time: 5, value: 0 },
      { time: 5, value: 100 },
    ]);
    expect(() => sampleTrack(degenerate, 5)).not.toThrow();
  });
});

describe('interpolateValue', () => {
  it('lerps a number field', () => {
    expect(interpolateValue(Widget, 'n', 0, 100, 0.25)).toBe(25);
  });

  it('lerps a vec2 field component-wise', () => {
    const result = interpolateValue(Widget, 'point', new Vec2(0, 0), new Vec2(10, 20), 0.5);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('blends a color field channel-wise, not as a raw numeric lerp', () => {
    const result = interpolateValue(Widget, 'tint', 0xff0000, 0x00ff00, 0.5);
    expect((result >> 16) & 0xff).toBeCloseTo(128, -1);
    expect((result >> 8) & 0xff).toBeCloseTo(128, -1);
  });

  it('returns the exact endpoints for a color field', () => {
    expect(interpolateValue(Widget, 'tint', 0xff0000, 0x00ff00, 0)).toBe(0xff0000);
    expect(interpolateValue(Widget, 'tint', 0xff0000, 0x00ff00, 1)).toBe(0x00ff00);
  });

  it('holds the "from" value for a string field until the segment ends', () => {
    expect(interpolateValue(Widget, 'label', 'a', 'b', 0)).toBe('a');
    expect(interpolateValue(Widget, 'label', 'a', 'b', 0.99)).toBe('a');
    expect(interpolateValue(Widget, 'label', 'a', 'b', 1)).toBe('b');
  });

  it('holds a boolean field the same way', () => {
    expect(interpolateValue(Widget, 'on', false, true, 0.5)).toBe(false);
    expect(interpolateValue(Widget, 'on', false, true, 1)).toBe(true);
  });
});
