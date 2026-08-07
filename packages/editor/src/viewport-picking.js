import { Transform } from '@novaforge/core';

/**
 * The pure half of viewport entity picking: no canvas, no pointer events, just "given a screen
 * point, which entity is that." Split out the same way `webgl2-batch.js` is split from
 * `webgl2-renderer.js` — the geometry is worth testing in Node, the DOM glue around it is not.
 *
 * **Stated approximation.** Picking is nearest-Transform-centre-within-a-screen-radius, not
 * per-shape hit testing against a sprite's actual bounds or a rotated polygon's true silhouette.
 * A precise version would need to know how to hit-test every shape kind a scene might contain —
 * `Sprite`, `ShapeRect`, `ShapeCircle`, a physics `Collider`'s convex polygon — which is a real
 * feature on its own. Nearest-centre is honest about being an approximation, is right often
 * enough that clicking near a small object still selects it, and never needs updating when a
 * new drawable component is added to the engine.
 */

/**
 * @param {import('@novaforge/core').World} world
 * @param {import('@novaforge/renderer').Camera2D} camera
 * @param {readonly number[]} candidates entities to consider, typically `world.entities()`
 * @param {{ x: number, y: number }} screenPoint
 * @param {number} [maxScreenDistance] pixels; a candidate further than this from the click is
 *   never picked, so clicking empty space clears the selection instead of grabbing whatever is
 *   merely nearest on an otherwise-empty screen.
 * @returns {number | null} the picked entity, or `null` if nothing was close enough.
 */
export function pickEntity(world, camera, candidates, screenPoint, maxScreenDistance = 24) {
  let best = null;
  let bestDistanceSquared = maxScreenDistance * maxScreenDistance;

  for (const entity of candidates) {
    const transform = world.get(entity, Transform);
    if (transform === undefined) continue;

    const screen = camera.worldToScreen(transform.position);
    const dx = screen.x - screenPoint.x;
    const dy = screen.y - screenPoint.y;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared <= bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      best = entity;
    }
  }

  return best;
}
