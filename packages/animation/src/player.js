import { defineComponent } from '@novaforge/core';
import { sampleTrack, interpolateValue } from './sampler.js';

/**
 * Per-entity timeline playback state.
 *
 * Holds a *reference* to the `Timeline`, not a copy of its tracks — the same design as
 * `@novaforge/renderer`'s `Animator`, and for the same reason: editing a timeline in place (the
 * editor's timeline panel does exactly this) updates every entity playing it with no resync
 * step.
 */
export const TimelinePlayer = defineComponent(
  'TimelinePlayer',
  () => ({
    /** @type {import('./timeline.js').Timeline | null} */
    timeline: null,
    /** Seconds into the timeline. */
    time: 0,
    /** Multiplies playback rate; 0 pauses without losing position. */
    speed: 1,
    playing: true,
    /** True once a non-looping timeline has reached its end. */
    finished: false,
  }),
  {
    time: { type: 'number', min: 0 },
    speed: { type: 'number', step: 0.1 },
    playing: { type: 'boolean' },
    finished: { type: 'boolean' },
  },
);

/**
 * Start a timeline from the beginning.
 *
 * Re-entering the same, still-running timeline is a no-op by default — a system calling
 * `play(player, walkTimeline)` every frame while a condition holds must not restart playback on
 * every call.
 *
 * @param {any} player a TimelinePlayer instance
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ force?: boolean }} [options]
 * @returns {void}
 */
export function play(player, timeline, options = {}) {
  if (!options.force && player.timeline === timeline && !player.finished) return;
  player.timeline = timeline;
  player.time = 0;
  player.playing = true;
  player.finished = false;
}

/**
 * Advance every playing timeline by `dt` and write the sampled values onto their components.
 *
 * Runs in `update`, not `fixedUpdate` — a tween is a presentational concern with no effect on
 * simulation state, the same reasoning `syncPreviousTransform`'s placement and the sprite
 * `animationSystem` both document (SPEC §6).
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} dt seconds
 * @returns {void}
 */
export function timelineSystem(world, dt) {
  world.query([TimelinePlayer]).each((entity, player) => {
    const timeline = player.timeline;
    if (timeline === null || !player.playing || player.finished) return;

    player.time += dt * player.speed;

    if (player.time >= timeline.duration) {
      if (timeline.duration <= 0) {
        player.time = 0;
      } else if (timeline.loop) {
        player.time %= timeline.duration;
      } else {
        player.time = timeline.duration;
        player.finished = true;
      }
    }

    for (const track of timeline.tracks) {
      const component = world.get(entity, track.component);
      if (component === undefined) continue;

      const { from, to, t } = sampleTrack(track, player.time);
      component[track.field] = interpolateValue(track.component, track.field, from, to, t);
    }
  });
}

/**
 * Install the timeline system on a world.
 * @param {import('@novaforge/core').World} world
 * @returns {number} the system handle
 */
export function installTimelineSystem(world) {
  return world.addSystem('update', timelineSystem, { order: -5, name: 'timeline' });
}
