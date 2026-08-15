import { Transform } from '@novaforge/core';
import { RigidBody } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { clamp } from '@novaforge/math';
import { Paddle } from '../components.js';
import { PLAYFIELD, PADDLE } from '../config.js';

/**
 * Drive the paddle from the player's input.
 *
 * Runs in `fixedUpdate` so that the paddle moves in the same deterministic steps the ball does.
 * Moving it in `update` would make the paddle's velocity — which the collision solver reads to
 * impart english to the ball — depend on the display refresh rate.
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} dt
 * @returns {void}
 */
export function paddleSystem(world, dt) {
  const input = world.getResource(INPUT_RESOURCE);
  if (input === undefined) return;

  const direction = input.actions.axis('moveX');
  const halfWidth = PADDLE.width / 2;
  const minX = PLAYFIELD.wallThickness + halfWidth;
  const maxX = PLAYFIELD.width - PLAYFIELD.wallThickness - halfWidth;

  world.query([Transform, RigidBody, Paddle]).each((_entity, transform, body) => {
    const target = transform.position.x + direction * PADDLE.speed * dt;
    const clamped = clamp(target, minX, maxX);

    body.velocity.x = (clamped - transform.position.x) / dt;
    body.velocity.y = 0;
  });
}
