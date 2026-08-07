/**
 * @typedef {import('./timeline.js').Keyframe} Keyframe
 * @typedef {import('./timeline.js').KeyframeTrack} KeyframeTrack
 * @typedef {import('./timeline.js').Timeline} Timeline
 * @typedef {import('./state-machine.js').Transition} Transition
 * @typedef {import('./state-machine.js').AnimationState} AnimationState
 * @typedef {import('./state-machine.js').StateMachine} StateMachine
 *
 * Type-only re-exports — a `@typedef` produces no runtime code, so a consumer can write
 * `import('@novaforge/animation').Timeline` from the barrel, the same way it imports the
 * runtime values, without having to know these types actually live in `timeline.js` and
 * `state-machine.js`. See `@novaforge/core`'s `index.js` for the same pattern, adopted for the
 * same reason: `@novaforge/editor`'s timeline panel needs to name these types too.
 */

/**
 * @novaforge/animation — keyframe tracks over arbitrary component fields, a timeline player,
 * and a state machine (SPEC's Milestone 7).
 *
 * Depends only on `core` and `math`, sitting parallel to `renderer`/`physics`/`input`/`audio` in
 * the dependency graph (SPEC §2) — it animates *any* schema-declared field of *any* component,
 * not specifically rendering- or physics-related ones, so it has no reason to depend on either.
 */

export { defineTrack, defineTimeline } from './timeline.js';
export { sampleTrack, interpolateValue } from './sampler.js';
export { TimelinePlayer, play, timelineSystem, installTimelineSystem } from './player.js';
export {
  defineState,
  defineStateMachine,
  AnimationController,
  enterStateMachine,
  setParameter,
  stateMachineSystem,
  installStateMachineSystem,
} from './state-machine.js';
