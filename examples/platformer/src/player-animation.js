import { Transform } from '@novaforge/core';
import { ShapeRect } from '@novaforge/renderer';
import { defineTrack, defineTimeline, defineState, defineStateMachine } from '@novaforge/animation';
import { COLORS } from './config.js';

/**
 * The player's animation state machine — idle / run / jump, built from `@novaforge/animation`'s
 * `defineState`/`defineStateMachine`, the same Milestone 7 machinery its own tests exercise.
 *
 * There are no sprite sheets in this game (no image assets), so "animation" here means the
 * keyframe tracks move something visible on the plain `ShapeRect` the player is drawn as:
 * `Transform.scale` for a squash-and-stretch pulse, and `ShapeRect.color` for a tint change on
 * the airborne state. `systems/animation.js`'s `playerAnimationParamsSystem` is what feeds this
 * machine its `speed`/`grounded` parameters each frame; this module only describes the states.
 */

const SPEED_THRESHOLD = 12;

/** A gentle breathing pulse: scale nudges up and settles back over the loop. */
const idleMotion = defineTimeline('player-idle-motion', [
  defineTrack(Transform, 'scale', [
    { time: 0, value: { x: 1, y: 1 } },
    { time: 0.4, value: { x: 1, y: 1.04 } },
    { time: 0.8, value: { x: 1, y: 1 } },
  ]),
], { duration: 0.8, loop: true });

/** A quicker squash-and-stretch bounce timed to running steps. */
const runMotion = defineTimeline('player-run-motion', [
  defineTrack(Transform, 'scale', [
    { time: 0, value: { x: 1, y: 1 } },
    { time: 0.1, value: { x: 1.06, y: 0.92 } },
    { time: 0.2, value: { x: 0.94, y: 1.06 } },
    { time: 0.3, value: { x: 1, y: 1 } },
  ]),
], { duration: 0.3, loop: true });

/**
 * A one-shot stretch-and-tint on leaving the ground. Non-looping: once it finishes, the shape
 * holds its last keyframe (stretched, tinted) until the next transition swaps the timeline —
 * which is what makes "still airborne" visually distinct from "just left the ground".
 */
const jumpTimeline = defineTimeline(
  'player-jump',
  [
    defineTrack(Transform, 'scale', [
      { time: 0, value: { x: 0.82, y: 1.22 } },
      { time: 0.18, value: { x: 1, y: 1 } },
    ]),
    defineTrack(ShapeRect, 'color', [{ time: 0, value: COLORS.playerAirborne }]),
  ],
  { duration: 0.18, loop: false },
);

/** A single held keyframe — used to fold the "grounded" tint back in alongside a motion track. */
const landedColor = defineTimeline('player-landed-color', [
  defineTrack(ShapeRect, 'color', [{ time: 0, value: COLORS.player }]),
]);

/**
 * A `Timeline`'s tracks all share one playback clock, so grafting a short one-shot colour track
 * onto a long looping scale track would drag the colour out of sync with it on every loop.
 * Landing reliably re-enters `idle`/`run` through a fresh `play()` (state machine transitions
 * always force a restart — see `enterStateMachine`/`play`), so folding a single held colour
 * keyframe into the same timeline as the motion track is simpler than running a second
 * `TimelinePlayer` just to keep one colour in sync.
 * @param {import('@novaforge/animation').Timeline} motion
 * @param {import('@novaforge/animation').Timeline} color
 * @returns {import('@novaforge/animation').Timeline}
 */
function withColor(motion, color) {
  return defineTimeline(`${motion.name}+color`, [...motion.tracks, ...color.tracks], {
    duration: motion.duration,
    loop: motion.loop,
  });
}

/**
 * @returns {import('@novaforge/animation').StateMachine} a fresh machine per call, so a
 *   restarted run's controller never shares the mutable `states` map with a previous entity's.
 */
export function buildPlayerAnimationMachine() {
  const idle = defineState('idle', withColor(idleMotion, landedColor), [
    { to: 'run', condition: (p) => p.grounded && p.speed > SPEED_THRESHOLD },
    { to: 'jump', condition: (p) => !p.grounded },
  ]);
  const run = defineState('run', withColor(runMotion, landedColor), [
    { to: 'idle', condition: (p) => p.grounded && p.speed <= SPEED_THRESHOLD },
    { to: 'jump', condition: (p) => !p.grounded },
  ]);
  const jump = defineState('jump', jumpTimeline, [
    { to: 'idle', condition: (p) => p.grounded && p.speed <= SPEED_THRESHOLD },
    { to: 'run', condition: (p) => p.grounded && p.speed > SPEED_THRESHOLD },
  ]);

  return defineStateMachine('player-locomotion', [idle, run, jump], 'idle');
}
