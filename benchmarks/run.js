import { World, Transform } from '@novaforge/core';
import { RigidBody, Collider, BodyType, PhysicsWorld, box, setMass, makeStatic } from '@novaforge/physics';
import { Rect } from '@novaforge/math';

/**
 * A small, honest set of throughput numbers for the claims made in the docs — SPEC §5's "a
 * query costs O(rarest component)", the quadtree broadphase's whole reason to exist, and the
 * physics solver's per-step cost. Run with `npm run bench`.
 *
 * Not a rigorous statistical benchmark suite (no warmup calibration, no percentiles) — a
 * before/after sanity check for "did this change make things dramatically slower," which is
 * what actually gets used during development. Node's `--expose-gc` flag (already in the npm
 * script) lets each section force a collection first, so one section's garbage does not skew
 * the next section's timing.
 */

/**
 * @param {string} name
 * @param {number} iterations
 * @param {() => void} fn
 * @returns {void}
 */
function bench(name, iterations, fn) {
  if (typeof globalThis.gc === 'function') globalThis.gc();

  // One untimed pass lets V8 warm up the function before the measured run.
  fn();

  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  const elapsedMs = performance.now() - started;

  const perCallUs = (elapsedMs / iterations) * 1000;
  console.log(
    `${name.padEnd(42)} ${elapsedMs.toFixed(1).padStart(8)} ms total  ` +
      `${perCallUs.toFixed(2).padStart(8)} us/call  (${iterations} calls)`,
  );
}

console.log('NovaForge benchmarks\n' + '='.repeat(60));

// ---------------------------------------------------------------- entity churn

{
  const world = new World();
  console.log('\n-- entity lifecycle --');
  bench('create 10,000 bare entities', 20, () => {
    world.clearEntities();
    for (let i = 0; i < 10000; i += 1) world.createEntity();
  });

  bench('create+destroy 10,000 entities', 20, () => {
    world.clearEntities();
    const entities = [];
    for (let i = 0; i < 10000; i += 1) entities.push(world.createEntity());
    for (const entity of entities) world.destroy(entity);
    world.flushDestroyed();
  });
}

// ------------------------------------------------------------------- queries

{
  const world = new World();
  for (let i = 0; i < 20000; i += 1) world.spawn([Transform]);
  // One rare entity in a sea of 20,000 — the case SPEC §5 claims stays cheap.
  world.spawn([Transform], [RigidBody]);

  console.log('\n-- queries (20,000 entities with Transform, 1 also with RigidBody) --');

  bench('iterate all 20,000 (wide query)', 200, () => {
    for (const _ of world.query([Transform])) {
      /* the loop itself is what is timed */
    }
  });

  bench('iterate the 1 rare match (narrow query)', 2000, () => {
    for (const _ of world.query([Transform, RigidBody])) {
      /* the loop itself is what is timed */
    }
  });
}

// ------------------------------------------------------------------- physics

/**
 * @param {number} count
 * @returns {{ world: World, physics: PhysicsWorld }}
 */
function buildPhysicsScene(count) {
  const world = new World();
  const physics = new PhysicsWorld({
    gravity: { x: 0, y: 980 },
    bounds: new Rect(-2000, -2000, 4000, 4000),
  });

  const ground = world.createEntity();
  world.add(ground, Transform).position.set(0, 500);
  makeStatic(world.add(ground, RigidBody));
  world.add(ground, Collider, { shape: box(2000, 40) });

  const perRow = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i += 1) {
    const shape = box(18, 18);
    const entity = world.createEntity();
    world.add(entity, Transform).position.set(
      (i % perRow) * 22 - (perRow * 22) / 2,
      Math.floor(i / perRow) * -22 - 100,
    );
    setMass(world.add(entity, RigidBody, { type: BodyType.DYNAMIC }), shape, 1);
    world.add(entity, Collider, { shape });
  }

  return { world, physics };
}

{
  console.log('\n-- physics step (falling box grid onto a floor) --');
  for (const count of [100, 500, 2000]) {
    const { world, physics } = buildPhysicsScene(count);
    // Run a few steps first so the grid is actually in contact — a resting-contact-heavy step
    // is the realistic steady-state cost, not the first, contact-free step.
    for (let i = 0; i < 30; i += 1) physics.step(world, 1 / 60);

    bench(`step() with ${count} dynamic bodies`, 60, () => {
      physics.step(world, 1 / 60);
    });
  }
}

console.log('\nDone.');
