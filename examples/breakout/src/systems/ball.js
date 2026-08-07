import { Transform } from '@novaforge/core';
import { Rng } from '@novaforge/math';
import { RigidBody, TRIGGER_ENTER } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Ball, Paddle, SESSION } from '../components.js';
import { BALL, PADDLE, PLAYFIELD, RULES } from '../config.js';

/** Seeded so a recorded session replays identically (SPEC §1). */
const rng = new Rng(0xbeef);

/**
 * Hold an unlaunched ball on the paddle, and launch it on the fire action.
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function ballAttachSystem(world) {
  const input = world.getResource(INPUT_RESOURCE);
  const launch = input !== undefined && input.actions.pressed('launch');

  const paddle = world.query([Transform, Paddle]).first();
  if (paddle === null) return;
  const paddleTransform = paddle[1];

  world.query([Transform, RigidBody, Ball]).each((_entity, transform, body, ball) => {
    if (!ball.attached) return;

    transform.position.x = paddleTransform.position.x;
    transform.position.y = PADDLE.y - PADDLE.height / 2 - BALL.radius - 1;
    // Keep the interpolated render in step with the teleport, or the ball smears across the
    // screen on the frame it is repositioned.
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);

    if (launch) {
      const angle = -Math.PI / 2 + rng.range(-BALL.launchSpreadRadians, BALL.launchSpreadRadians);
      body.velocity.set(Math.cos(angle) * BALL.speed, Math.sin(angle) * BALL.speed);
      ball.attached = false;
    }
  });
}

/**
 * Force the ball back to its exact nominal speed, and out of any near-horizontal path.
 *
 * Two separate corrections, both necessary:
 *
 * The solver is energy-*conserving in intent* but not to the last decimal — restitution is
 * applied to a velocity that positional correction has already nudged, so a long rally slowly
 * gains or loses speed. Renormalising every step pins it exactly.
 *
 * And a ball travelling almost horizontally ping-pongs between the side walls indefinitely with
 * nothing the player can do. Every implementation of this game needs the nudge; the alternative
 * is a game that occasionally stops being playable.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function ballSpeedSystem(world) {
  world.query([RigidBody, Ball]).each((_entity, body, ball) => {
    if (ball.attached) return;

    const speed = body.velocity.length();
    if (speed < 1) return; // wedged; the next contact will free it

    let { x, y } = body.velocity;

    const minVertical = BALL.minVerticalRatio;
    if (Math.abs(y) / speed < minVertical) {
      const sign = y < 0 ? -1 : 1;
      y = sign * speed * minVertical;
      // Rebuild the horizontal component so the direction stays a unit vector.
      const horizontal = Math.sqrt(Math.max(0, speed * speed - y * y));
      x = (x < 0 ? -1 : 1) * horizontal;
    }

    const corrected = Math.hypot(x, y);
    body.velocity.set((x / corrected) * BALL.speed, (y / corrected) * BALL.speed);
  });
}

/**
 * Lose a life when the ball reaches the death zone.
 *
 * Driven by the physics trigger event rather than by polling the ball's y position, so that the
 * rule lives in one place and the death zone can be moved or resized without touching code.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function ballLossSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined || session.outcome !== 'playing') return;

  const events = world.events.read(TRIGGER_ENTER);
  if (events.length === 0) return;

  let lost = false;
  for (const event of events) {
    if (world.has(event.other, Ball)) lost = true;
  }
  if (!lost) return;

  session.lives -= 1;
  world.getResource(AUDIO_RESOURCE)?.play('lose');

  if (session.lives <= 0) {
    session.outcome = 'lost';
    session.message = 'Game over — press Space to restart';
    world.query([RigidBody, Ball]).each((_entity, body) => body.velocity.set(0, 0));
    return;
  }

  // Reattach rather than respawn: the ball entity keeps its identity, so anything holding a
  // handle to it stays valid.
  world.query([Ball]).each((_entity, ball) => {
    ball.attached = true;
  });
}

/**
 * Build the restart system, closing over the level rebuilder.
 *
 * A factory rather than a plain system because the rebuild belongs to the scene, and passing it
 * through a world resource just to avoid a closure would be indirection for its own sake.
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

    if (input.actions.pressed('launch')) {
      session.score = 0;
      session.lives = RULES.lives;
      session.outcome = 'playing';
      session.message = '';
      rebuild();
    }
  };
}

/** Exported for the HUD, which reports the playfield centre. */
export const PLAYFIELD_CENTER_X = PLAYFIELD.width / 2;
