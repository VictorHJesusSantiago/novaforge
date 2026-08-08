import { PhysicsWorld } from './physics-world.js';

/** Resource key under which the world's `PhysicsWorld` is registered. */
export const PHYSICS_RESOURCE = 'physics';

/**
 * Install physics on a world.
 *
 * The step runs in `fixedUpdate` at order `0` — after `syncPreviousTransform` (order -1000),
 * which must capture the pre-step transform, and before gameplay systems that react to
 * collisions. Ordering here is load-bearing, not stylistic: run physics before the transform
 * sync and every sprite interpolates between the wrong pair of positions.
 *
 * @param {import('@novaforge/core').World} world
 * @param {ConstructorParameters<typeof PhysicsWorld>[0]} [options]
 * @returns {{ physics: PhysicsWorld, handles: number[] }}
 */
export function installPhysicsSystems(world, options) {
  const physics = new PhysicsWorld(options);
  world.setResource(PHYSICS_RESOURCE, physics);

  const handles = [
    world.addSystem(
      'fixedUpdate',
      (w, dt) => {
        physics.step(w, dt);
      },
      { order: 0, name: 'physicsStep' },
    ),
  ];

  return { physics, handles };
}
