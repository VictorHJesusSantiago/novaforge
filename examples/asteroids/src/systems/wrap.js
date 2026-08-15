import { Transform } from '@novaforge/core';
import { wrap as wrapValue } from '@novaforge/math';
import { Wrappable } from '../components.js';
import { PLAYFIELD } from '../config.js';

/**
 * Screen wrap: an entity that leaves the playfield through one edge reappears at the other.
 *
 * The physics package's own broadphase has a `bounds` rect, but that is a *performance* hint for
 * the quadtree, not a boundary — bodies outside it still simulate, they just lose the tree's
 * benefit. Wrapping is genuinely game-specific behaviour, so it is a small system here rather
 * than an engine feature; Asteroids is the only NovaForge example that needs it.
 *
 * Runs in `fixedUpdate`, after the physics step, so it corrects the position the integrator just
 * produced before anything else reads it this step.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function wrapSystem(world) {
  world.query([Transform, Wrappable]).each((_entity, transform, wrappable) => {
    const margin = wrappable.margin;
    const wrappedX = wrapValue(transform.position.x, -margin, PLAYFIELD.width + margin);
    const wrappedY = wrapValue(transform.position.y, -margin, PLAYFIELD.height + margin);

    if (wrappedX === transform.position.x && wrappedY === transform.position.y) return;

    transform.position.x = wrappedX;
    transform.position.y = wrappedY;
    transform.previousPosition.copyFrom(transform.position);
  });
}
