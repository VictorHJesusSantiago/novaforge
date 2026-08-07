import { RigidBody } from '@novaforge/physics';
import { AnimationController, setParameter } from '@novaforge/animation';
import { Player, PlayerState } from '../components.js';

/**
 * Feed the player's animation state machine its parameters from the actual physical state each
 * frame. The state machine (`stateMachineSystem`, installed by `installStateMachineSystem` in
 * `play-scene.js`) only ever reacts to `controller.parameters` — this is the one system that
 * decides what those numbers mean, kept separate from `player-animation.js`'s state/transition
 * definitions the same way `systems/player.js`'s control logic is kept separate from the
 * component definitions in `components.js`.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function playerAnimationParamsSystem(world) {
  world
    .query([RigidBody, PlayerState, AnimationController, Player])
    .each((_entity, body, state, controller) => {
      setParameter(controller, 'speed', Math.abs(body.velocity.x));
      setParameter(controller, 'grounded', state.grounded);
    });
}
