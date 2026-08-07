import { Transform } from '@novaforge/core';
import { RigidBody, TRIGGER_ENTER } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Hazard, Player, SESSION } from '../components.js';
import { PLAYER_START } from '../level.js';

/**
 * Lose a life when the player touches the hazard trigger — falling into the gap or off either
 * end of the level — and either respawn at the start or end the run.
 *
 * Driven by `TRIGGER_ENTER`, not a y-position poll, for the same reason
 * `examples/breakout`'s `ballLossSystem` reads `TRIGGER_ENTER` rather than checking the ball's
 * position every frame: the rule lives in one place, and the hazard can be moved or resized
 * without touching this code.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function hazardSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined || session.outcome !== 'playing') return;

  const events = world.events.read(TRIGGER_ENTER);
  if (events.length === 0) return;

  let hit = false;
  for (const event of events) {
    if (world.has(event.trigger, Hazard) && world.has(event.other, Player)) hit = true;
  }
  if (!hit) return;

  session.lives -= 1;
  world.getResource(AUDIO_RESOURCE)?.play('hurt');

  const player = world.query([Transform, RigidBody, Player]).first();

  if (session.lives <= 0) {
    session.outcome = 'lost';
    session.message = 'Game over — press Space to restart';
    if (player !== null) player[2].velocity.set(0, 0);
    return;
  }

  if (player !== null) {
    const [, transform, body] = player;
    transform.position.set(PLAYER_START.x, PLAYER_START.y);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);
  }
}

/**
 * Build the restart system, closing over the level rebuilder — the same shape as
 * `examples/breakout`'s `makeRestartSystem`.
 *
 * @param {() => void} rebuild
 * @returns {(world: import('@novaforge/core').World) => void}
 */
export function makeRestartSystem(rebuild) {
  return function restartSystem(/** @type {import('@novaforge/core').World} */ world) {
    const session = world.getResource(SESSION);
    const input = world.getResource(INPUT_RESOURCE);
    if (session === undefined || input === undefined) return;
    if (session.outcome === 'playing') return;

    if (input.actions.pressed('jump')) {
      rebuild();
    }
  };
}
