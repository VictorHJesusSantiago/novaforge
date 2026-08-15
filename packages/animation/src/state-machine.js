import { defineComponent } from '@novaforge/core';
import { TimelinePlayer, play } from './player.js';

/**
 * A named animation state machine — states, each holding a timeline, connected by transitions
 * that fire when a condition over a small parameter bag becomes true. The Unity-`Animator`-style
 * shape: a walking character has `idle`, `walk`, `jump` states, and a transition from `idle` to
 * `walk` reads `parameters.speed > 0.1`.
 *
 * @typedef {object} Transition
 * @property {string} to the state name to switch to
 * @property {(parameters: Record<string, any>) => boolean} condition
 *
 * @typedef {object} AnimationState
 * @property {string} name
 * @property {import('./timeline.js').Timeline} timeline
 * @property {Transition[]} transitions checked in order; the first whose condition is true wins
 */

/**
 * @param {string} name
 * @param {import('./timeline.js').Timeline} timeline
 * @param {Transition[]} [transitions]
 * @returns {AnimationState}
 */
export function defineState(name, timeline, transitions = []) {
  return { name, timeline, transitions };
}

/**
 * @typedef {object} StateMachine
 * @property {string} name
 * @property {Map<string, AnimationState>} states
 * @property {string} initial
 */

/**
 * @param {string} name
 * @param {AnimationState[]} states
 * @param {string} initial the starting state's name
 * @returns {StateMachine}
 * @throws {RangeError} for zero states, a transition targeting an undefined state, or an
 *   `initial` that does not name a defined state — every one of these would otherwise surface as
 *   a silently-stuck controller at runtime instead of a clear error at definition time.
 */
export function defineStateMachine(name, states, initial) {
  if (states.length === 0) {
    throw new RangeError(`defineStateMachine: "${name}" has no states`);
  }

  const map = new Map(states.map((state) => [state.name, state]));

  for (const state of states) {
    for (const transition of state.transitions) {
      if (!map.has(transition.to)) {
        throw new RangeError(
          `defineStateMachine: "${name}" has a transition from "${state.name}" to undefined state "${transition.to}"`,
        );
      }
    }
  }

  if (!map.has(initial)) {
    throw new RangeError(`defineStateMachine: "${name}"'s initial state "${initial}" is not defined`);
  }

  return { name, states: map, initial };
}

/**
 * Per-entity state machine controller. Requires a `TimelinePlayer` on the same entity — the
 * controller decides *which* timeline should be playing; `TimelinePlayer`/`timelineSystem`
 * still do the actual sampling, the same separation `Animator` (frame playback) and its system
 * have in `@novaforge/renderer`.
 */
export const AnimationController = defineComponent(
  'AnimationController',
  () => ({
    /** @type {StateMachine | null} */
    machine: null,
    /** @type {string} */
    current: '',
    /** @type {Record<string, any>} */
    parameters: {},
  }),
  {
    current: { type: 'string' },
  },
);

/**
 * Attach a state machine to an entity's controller, entering its initial state.
 * @param {any} controller an AnimationController instance
 * @param {any} player the entity's TimelinePlayer instance
 * @param {StateMachine} machine
 * @returns {void}
 */
export function enterStateMachine(controller, player, machine) {
  controller.machine = machine;
  controller.current = machine.initial;
  const state = /** @type {AnimationState} */ (machine.states.get(machine.initial));
  play(player, state.timeline, { force: true });
}

/**
 * @param {any} controller
 * @param {string} key
 * @param {any} value
 * @returns {void}
 */
export function setParameter(controller, key, value) {
  controller.parameters[key] = value;
}

/**
 * Check the current state's transitions and switch state when one fires. Runs before
 * `timelineSystem` so a transition taken this frame is reflected in the very same frame's
 * sampling, not one frame late.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function stateMachineSystem(world) {
  world.query([AnimationController, TimelinePlayer]).each((_entity, controller, player) => {
    const machine = controller.machine;
    if (machine === null) return;

    const state = machine.states.get(controller.current);
    if (state === undefined) return;

    for (const transition of state.transitions) {
      if (!transition.condition(controller.parameters)) continue;

      const next = /** @type {AnimationState} */ (machine.states.get(transition.to));
      controller.current = next.name;
      play(player, next.timeline, { force: true });
      return;
    }
  });
}

/**
 * Install the state machine system on a world, ordered to run immediately before the timeline
 * system so a transition this frame is sampled this frame.
 * @param {import('@novaforge/core').World} world
 * @returns {number} the system handle
 */
export function installStateMachineSystem(world) {
  return world.addSystem('update', stateMachineSystem, { order: -6, name: 'animationStateMachine' });
}
