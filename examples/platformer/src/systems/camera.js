import { Transform } from '@novaforge/core';
import { Player } from '../components.js';
import { LEVEL_PIXEL_HEIGHT } from '../level.js';

/**
 * Follow the player horizontally, with critically damped smoothing so the camera does not
 * whip-pan on every direction change.
 *
 * Runs in `update`, not `fixedUpdate`: camera motion is purely presentational (nothing reads the
 * camera's position back into the simulation), the same reasoning `@novaforge/animation`'s
 * `timelineSystem` documents for tweens. `Camera2D.follow` takes a real-time `dt`, and `update`'s
 * `dt` is exactly that — `fixedUpdate`'s would make the smoothing time depend on the physics
 * step rate instead of wall-clock time.
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} dt seconds
 * @returns {void}
 */
export function cameraFollowSystem(world, dt) {
  const camera = world.getResource('camera');
  if (camera === undefined) return;

  const player = world.query([Transform, Player]).first();
  if (player === null) return;

  // The whole level fits inside the viewport vertically (see `play-scene.js`'s `camera.bounds`),
  // so only x is ever worth following — a constant y keeps the horizon from bobbing on every jump.
  const target = { x: player[1].position.x, y: LEVEL_PIXEL_HEIGHT / 2 };
  camera.follow(target, dt);
}
