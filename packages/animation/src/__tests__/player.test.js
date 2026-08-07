import { describe, it, expect, beforeEach } from 'vitest';
import { World, defineComponent, resetComponentRegistry } from '@novaforge/core';
import { defineTrack, defineTimeline } from '../timeline.js';
import { TimelinePlayer, play, timelineSystem, installTimelineSystem } from '../player.js';

/** @type {any} */ let Widget;
/** @type {World} */ let world;

beforeEach(() => {
  resetComponentRegistry();
  Widget = defineComponent('Widget', () => ({ n: 0 }), { n: { type: 'number' } });
  world = new World();
});

/** @returns {import('../timeline.js').Timeline} a 0 -> 100 ramp over 10 seconds. */
function ramp(options) {
  const track = defineTrack(Widget, 'n', [
    { time: 0, value: 0 },
    { time: 10, value: 100 },
  ]);
  return defineTimeline('ramp', [track], options);
}

describe('play', () => {
  it('starts a timeline from time 0', () => {
    const player = TimelinePlayer.factory();
    play(player, ramp());
    expect(player.time).toBe(0);
    expect(player.playing).toBe(true);
  });

  it('is a no-op for the same, still-running timeline', () => {
    const timeline = ramp();
    const player = TimelinePlayer.factory();
    play(player, timeline);
    player.time = 5;
    play(player, timeline);
    expect(player.time).toBe(5);
  });

  it('restarts a finished timeline even without force', () => {
    const timeline = ramp();
    const player = TimelinePlayer.factory();
    player.timeline = timeline;
    player.finished = true;
    play(player, timeline);
    expect(player.finished).toBe(false);
    expect(player.time).toBe(0);
  });

  it('force restarts an unfinished, already-playing timeline', () => {
    const timeline = ramp();
    const player = TimelinePlayer.factory();
    play(player, timeline);
    player.time = 5;
    play(player, timeline, { force: true });
    expect(player.time).toBe(0);
  });
});

describe('timelineSystem', () => {
  /** @returns {number} an entity with a Widget and a playing TimelinePlayer. */
  function spawnPlaying(timeline) {
    const entity = world.spawn([Widget], [TimelinePlayer]);
    play(world.get(entity, TimelinePlayer), timeline);
    return entity;
  }

  it('advances time and writes the sampled value onto the component', () => {
    const entity = spawnPlaying(ramp());
    timelineSystem(world, 5);
    expect(world.get(entity, Widget)?.n).toBeCloseTo(50);
  });

  it('does nothing for an entity with no timeline assigned', () => {
    const entity = world.spawn([Widget], [TimelinePlayer]);
    expect(() => timelineSystem(world, 1)).not.toThrow();
    expect(world.get(entity, Widget)?.n).toBe(0);
  });

  it('does nothing while paused', () => {
    const entity = spawnPlaying(ramp());
    const player = world.get(entity, TimelinePlayer);
    if (player) player.playing = false;
    timelineSystem(world, 5);
    expect(world.get(entity, Widget)?.n).toBe(0);
  });

  it('loops back past the end for a looping timeline', () => {
    const entity = spawnPlaying(ramp({ loop: true }));
    timelineSystem(world, 15); // 1.5x the 10s duration
    expect(world.get(entity, Widget)?.n).toBeCloseTo(50, 0); // wrapped to 5s in
  });

  it('clamps and marks finished for a non-looping timeline', () => {
    const entity = spawnPlaying(ramp({ loop: false }));
    timelineSystem(world, 15);
    const player = world.get(entity, TimelinePlayer);
    expect(player?.finished).toBe(true);
    expect(world.get(entity, Widget)?.n).toBeCloseTo(100);
  });

  it('does not advance a finished timeline further', () => {
    const entity = spawnPlaying(ramp({ loop: false }));
    timelineSystem(world, 15);
    const valueAtFinish = world.get(entity, Widget)?.n;
    timelineSystem(world, 5);
    expect(world.get(entity, Widget)?.n).toBe(valueAtFinish);
  });

  it('honours speed as a multiplier', () => {
    const entity = spawnPlaying(ramp());
    const player = world.get(entity, TimelinePlayer);
    if (player) player.speed = 2;
    timelineSystem(world, 2.5); // 2.5 * 2 = 5s in
    expect(world.get(entity, Widget)?.n).toBeCloseTo(50);
  });

  it('skips an entity whose component was removed mid-flight', () => {
    const entity = spawnPlaying(ramp());
    world.remove(entity, Widget);
    expect(() => timelineSystem(world, 1)).not.toThrow();
  });

  // A duration of 0 (every keyframe at time 0) must not spin or divide by zero.
  it('handles a zero-duration timeline without spinning', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 42 }]);
    const timeline = defineTimeline('instant', [track]);
    const entity = spawnPlaying(timeline);
    expect(() => timelineSystem(world, 1)).not.toThrow();
    expect(world.get(entity, Widget)?.n).toBe(42);
  });
});

describe('installTimelineSystem', () => {
  it('registers the system in update', () => {
    const handle = installTimelineSystem(world);
    const entry = world.scheduler.systemsIn('update').find((s) => s.handle === handle);
    expect(entry?.name).toBe('timeline');
  });
});
