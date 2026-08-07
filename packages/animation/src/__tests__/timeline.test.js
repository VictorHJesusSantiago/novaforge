import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, resetComponentRegistry } from '@novaforge/core';
import { defineTrack, defineTimeline } from '../timeline.js';

/** @type {any} */ let Position;

beforeEach(() => {
  resetComponentRegistry();
  Position = defineComponent('Position', () => ({ x: 0, y: 0 }), {
    x: { type: 'number' },
    y: { type: 'number' },
  });
});

describe('defineTrack', () => {
  it('sorts keyframes ascending by time', () => {
    const track = defineTrack(Position, 'x', [
      { time: 2, value: 20 },
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ]);
    expect(track.keyframes.map((k) => k.time)).toEqual([0, 1, 2]);
  });

  it('rejects zero keyframes', () => {
    expect(() => defineTrack(Position, 'x', [])).toThrow(RangeError);
  });

  it('rejects a field not in the component schema', () => {
    expect(() => defineTrack(Position, 'nope', [{ time: 0, value: 1 }])).toThrow(/schema field/);
  });

  it('rejects a component with no schema at all', () => {
    const Opaque = defineComponent('Opaque', () => ({ blob: {} }));
    expect(() => defineTrack(Opaque, 'blob', [{ time: 0, value: 1 }])).toThrow(RangeError);
  });
});

describe('defineTimeline', () => {
  it('derives duration from the latest keyframe across all tracks', () => {
    const trackA = defineTrack(Position, 'x', [{ time: 0, value: 0 }, { time: 3, value: 10 }]);
    const trackB = defineTrack(Position, 'y', [{ time: 0, value: 0 }, { time: 5, value: 10 }]);
    const timeline = defineTimeline('move', [trackA, trackB]);
    expect(timeline.duration).toBe(5);
  });

  it('accepts an explicit duration override', () => {
    const track = defineTrack(Position, 'x', [{ time: 0, value: 0 }, { time: 3, value: 10 }]);
    const timeline = defineTimeline('move', [track], { duration: 100 });
    expect(timeline.duration).toBe(100);
  });

  it('defaults to looping', () => {
    const track = defineTrack(Position, 'x', [{ time: 0, value: 0 }]);
    expect(defineTimeline('x', [track]).loop).toBe(true);
  });

  it('respects loop: false', () => {
    const track = defineTrack(Position, 'x', [{ time: 0, value: 0 }]);
    expect(defineTimeline('x', [track], { loop: false }).loop).toBe(false);
  });

  it('rejects zero tracks', () => {
    expect(() => defineTimeline('empty', [])).toThrow(RangeError);
  });
});
