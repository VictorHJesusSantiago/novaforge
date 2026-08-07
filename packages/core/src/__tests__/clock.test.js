import { describe, it, expect } from 'vitest';
import { Clock } from '../clock.js';

/** Advance a clock by a run of equal frames, returning the total fixed steps produced. */
function runFrames(clock, frameMs, count, startMs = 0) {
  let now = startMs;
  let steps = 0;
  clock.advance(now); // prime: the first call establishes the baseline
  for (let i = 0; i < count; i += 1) {
    now += frameMs;
    steps += clock.advance(now).steps;
  }
  return steps;
}

describe('first frame', () => {
  // Inventing a delta of 1/60 here would make the first frame of a replay differ from the rest.
  it('reports a zero delta and no steps, since there is no previous timestamp', () => {
    const result = new Clock().advance(1000);
    expect(result.delta).toBe(0);
    expect(result.steps).toBe(0);
    expect(result.alpha).toBe(0);
  });

  it('counts the priming call as a frame', () => {
    const clock = new Clock();
    clock.advance(0);
    expect(clock.frame).toBe(1);
  });
});

describe('fixed stepping', () => {
  // Not exactly 60: sixty additions of `1000/60` reach 999.9999999999999 ms, not 1000, so the
  // final step can land just short. Real timestamps drift the same way, which is precisely why
  // the accumulator carries the remainder instead of resetting each frame.
  it('produces one step per frame at roughly 60 Hz', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    const steps = runFrames(clock, 1000 / 60, 60);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
  });

  it('produces about half as many steps at 120 Hz', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    const steps = runFrames(clock, 1000 / 120, 120);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(61);
  });

  it('produces about two steps per frame at 30 Hz', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    const steps = runFrames(clock, 1000 / 30, 30);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(61);
  });

  // The point of the whole design: simulated time tracks real time regardless of refresh rate.
  it('advances the same simulated time at 60 Hz and at 144 Hz', () => {
    const a = new Clock();
    const b = new Clock();
    const stepsA = runFrames(a, 1000 / 60, 60);
    const stepsB = runFrames(b, 1000 / 144, 144);
    expect(Math.abs(stepsA - stepsB)).toBeLessThanOrEqual(2);
  });

  it('produces no steps when frames are shorter than the fixed delta', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    clock.advance(0);
    expect(clock.advance(1).steps).toBe(0);
    expect(clock.advance(2).steps).toBe(0);
  });

  it('accumulates sub-step time rather than discarding it', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    // Twenty 1 ms frames add up to 20 ms; still under one 16.67 ms step.
    expect(runFrames(clock, 1, 16)).toBe(0);
    // But the time is not lost: it eventually produces a step.
    expect(runFrames(clock, 1, 4, 16)).toBe(1);
  });
});

describe('spiral of death guard', () => {
  // Invariant T1. Without the clamp a 3-second stall owes 180 steps, which makes the next
  // frame slower, which owes more, and the page locks up.
  it('clamps a very long frame to maxFrameTime', () => {
    const clock = new Clock({ fixedDelta: 1 / 60, maxFrameTime: 0.25 });
    clock.advance(0);
    const { steps } = clock.advance(3000); // a 3-second stall

    expect(steps).toBeLessThanOrEqual(15);
    expect(clock.delta).toBeLessThanOrEqual(0.25);
  });

  it('never exceeds maxStepsPerFrame', () => {
    const clock = new Clock({ fixedDelta: 1 / 60, maxFrameTime: 0.25 });
    clock.advance(0);
    for (let i = 1; i <= 10; i += 1) {
      expect(clock.advance(i * 5000).steps).toBeLessThanOrEqual(clock.maxStepsPerFrame);
    }
  });

  it('recovers to a normal cadence after a stall', () => {
    const clock = new Clock();
    clock.advance(0);
    clock.advance(3000);
    let now = 3000;
    for (let i = 0; i < 10; i += 1) {
      now += 1000 / 60;
      expect(clock.advance(now).steps).toBeLessThanOrEqual(2);
    }
  });

  it('ignores a backwards timestamp instead of producing a negative delta', () => {
    const clock = new Clock();
    clock.advance(1000);
    const result = clock.advance(500);
    expect(result.delta).toBe(0);
    expect(result.steps).toBe(0);
  });
});

describe('alpha', () => {
  it('stays within [0, 1)', () => {
    const clock = new Clock();
    let now = 0;
    clock.advance(now);
    for (let i = 0; i < 200; i += 1) {
      now += 7.3; // deliberately not a multiple of the fixed delta
      const { alpha } = clock.advance(now);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('is near zero right after a step is consumed', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    clock.advance(0);
    const { alpha } = clock.advance(1000 / 60);
    expect(alpha).toBeLessThan(0.01);
  });

  it('is about half a step in when half a step has accumulated', () => {
    const clock = new Clock({ fixedDelta: 1 / 60 });
    clock.advance(0);
    clock.advance(1000 / 60 + 1000 / 120);
    expect(clock.accumulator / clock.fixedDelta).toBeCloseTo(0.5, 1);
  });
});

describe('timeScale', () => {
  it('pauses the simulation at zero', () => {
    const clock = new Clock({ timeScale: 0 });
    expect(runFrames(clock, 1000 / 60, 60)).toBe(0);
    expect(clock.elapsed).toBe(0);
  });

  it('halves the step count in slow motion', () => {
    const clock = new Clock({ timeScale: 0.5 });
    const steps = runFrames(clock, 1000 / 60, 60);
    expect(steps).toBeGreaterThanOrEqual(29);
    expect(steps).toBeLessThanOrEqual(31);
  });

  it('doubles the step count at double speed', () => {
    const clock = new Clock({ timeScale: 2 });
    const steps = runFrames(clock, 1000 / 60, 60);
    expect(steps).toBeGreaterThanOrEqual(119);
    expect(steps).toBeLessThanOrEqual(121);
  });

  it('keeps unscaled elapsed time independent of the scale, for UI', () => {
    const clock = new Clock({ timeScale: 0 });
    runFrames(clock, 1000 / 60, 60);
    expect(clock.elapsed).toBe(0);
    expect(clock.elapsedUnscaled).toBeCloseTo(1, 1);
  });
});

describe('resync', () => {
  // Without this, resuming from a paused editor or a background tab reports the entire stall
  // as one delta.
  it('makes the next frame report a zero delta', () => {
    const clock = new Clock();
    clock.advance(0);
    clock.advance(16);
    clock.resync();
    expect(clock.advance(100000).delta).toBe(0);
  });

  it('discards unconsumed accumulator time', () => {
    const clock = new Clock();
    clock.advance(0);
    clock.advance(10);
    clock.resync();
    expect(clock.accumulator).toBe(0);
  });
});

describe('counters', () => {
  it('tracks frames, steps and elapsed time', () => {
    const clock = new Clock();
    runFrames(clock, 1000 / 60, 60);
    expect(clock.frame).toBe(61); // 60 frames plus the priming call
    expect(clock.step).toBeGreaterThanOrEqual(59);
    expect(clock.step).toBeLessThanOrEqual(60);
    expect(clock.elapsed).toBeCloseTo(1, 1);
  });

  it('smooths fps toward the real frame rate', () => {
    const clock = new Clock();
    runFrames(clock, 1000 / 60, 200);
    expect(clock.fps).toBeGreaterThan(55);
    expect(clock.fps).toBeLessThan(65);
  });

  it('reset returns every counter to zero', () => {
    const clock = new Clock();
    runFrames(clock, 1000 / 60, 10);
    clock.reset();
    expect(clock.frame).toBe(0);
    expect(clock.step).toBe(0);
    expect(clock.elapsed).toBe(0);
    expect(clock.accumulator).toBe(0);
  });
});
