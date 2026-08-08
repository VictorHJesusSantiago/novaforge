import { describe, it, expect } from 'vitest';
import { Clock } from '@novaforge/core';
import { Loop } from '../loop.js';

/**
 * A hand-driven stand-in for `requestAnimationFrame`, so the loop can be tested with no
 * browser and no timers — the reason the scheduler is injectable at all.
 */
function manualScheduler() {
  /** @type {Map<number, (now: number) => void>} */
  const pending = new Map();
  let nextHandle = 1;

  return {
    schedule(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      pending.delete(handle);
    },
    /** Fire every queued callback with a timestamp. */
    flush(now) {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const callback of callbacks) callback(now);
    },
    get queued() {
      return pending.size;
    },
  };
}

describe('start and stop', () => {
  it('does not run frames before start', () => {
    const scheduler = manualScheduler();
    let frames = 0;
    new Loop({ onFrame: () => (frames += 1), schedule: scheduler.schedule, cancel: scheduler.cancel });

    scheduler.flush(0);
    expect(frames).toBe(0);
  });

  it('runs a frame per scheduled callback once started', () => {
    const scheduler = manualScheduler();
    let frames = 0;
    const loop = new Loop({
      onFrame: () => (frames += 1),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    loop.start();
    scheduler.flush(16);
    scheduler.flush(32);
    scheduler.flush(48);

    expect(frames).toBe(3);
  });

  it('re-queues itself so the loop continues', () => {
    const scheduler = manualScheduler();
    const loop = new Loop({
      onFrame: () => {},
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    loop.start();
    expect(scheduler.queued).toBe(1);
    scheduler.flush(16);
    expect(scheduler.queued).toBe(1);
  });

  it('stops running frames after stop', () => {
    const scheduler = manualScheduler();
    let frames = 0;
    const loop = new Loop({
      onFrame: () => (frames += 1),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    loop.start();
    scheduler.flush(16);
    loop.stop();
    scheduler.flush(32);

    expect(frames).toBe(1);
    expect(loop.running).toBe(false);
  });

  it('treats a second start as a no-op rather than doubling the frame rate', () => {
    const scheduler = manualScheduler();
    const loop = new Loop({
      onFrame: () => {},
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    loop.start();
    loop.start();
    expect(scheduler.queued).toBe(1);
  });

  it('treats a second stop as a no-op', () => {
    const loop = new Loop({ onFrame: () => {}, schedule: () => 1, cancel: () => {} });
    loop.stop();
    expect(() => loop.stop()).not.toThrow();
  });
});

describe('resync on start', () => {
  // Without this, resuming after a pause reports the entire idle period as one frame delta,
  // and everything lurches forward.
  it('discards the time spent paused', () => {
    const scheduler = manualScheduler();
    const clock = new Clock();
    /** @type {number[]} */
    const deltas = [];

    const loop = new Loop({
      clock,
      onFrame: (now) => deltas.push(clock.advance(now).delta),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    loop.start();
    scheduler.flush(0);
    scheduler.flush(16);
    loop.stop();

    loop.start(); // an hour later
    scheduler.flush(3600000);

    expect(deltas[deltas.length - 1]).toBe(0);
  });
});

describe('manual stepping', () => {
  // The editor's step button, and how the whole engine is driven headlessly in tests.
  it('runs exactly one frame without starting the loop', () => {
    let frames = 0;
    const loop = new Loop({ onFrame: () => (frames += 1), schedule: () => 1, cancel: () => {} });

    loop.tick(16);
    loop.tick(32);

    expect(frames).toBe(2);
    expect(loop.running).toBe(false);
  });

  it('passes the timestamp through', () => {
    /** @type {number[]} */
    const seen = [];
    const loop = new Loop({
      onFrame: (now) => seen.push(now),
      schedule: () => 1,
      cancel: () => {},
    });

    loop.tick(123);
    expect(seen).toEqual([123]);
  });
});
