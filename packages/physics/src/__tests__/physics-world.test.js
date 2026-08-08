import { describe, it, expect, beforeEach } from 'vitest';
import { World, Transform } from '@novaforge/core';
import { Rect } from '@novaforge/math';
import {
  PhysicsWorld,
  CONTACT_BEGIN,
  CONTACT_END,
  TRIGGER_ENTER,
  TRIGGER_EXIT,
} from '../physics-world.js';
import { RigidBody, Collider, BodyType, setMass, makeStatic } from '../components.js';
import { box, circle } from '../shapes.js';
import { Layers } from '../layers.js';

const STEP = 1 / 60;

/** @type {World} */ let world;
/** @type {PhysicsWorld} */ let physics;

beforeEach(() => {
  world = new World();
  physics = new PhysicsWorld({
    gravity: { x: 0, y: 980 },
    bounds: new Rect(-1000, -1000, 2000, 2000),
  });
});

/**
 * @param {object} options
 * @returns {number} the entity handle.
 */
function spawnBody({
  x = 0,
  y = 0,
  shape = box(20, 20),
  type = BodyType.DYNAMIC,
  mass = 1,
  restitution = 0,
  isTrigger = false,
  layer = Layers.DEFAULT,
  mask = Layers.ALL,
  gravityScale = 1,
} = {}) {
  const entity = world.createEntity();
  const transform = world.add(entity, Transform);
  transform.position.set(x, y);

  const body = world.add(entity, RigidBody, { type, restitution, gravityScale });
  if (type === BodyType.STATIC) makeStatic(body);
  else setMass(body, shape, mass);

  world.add(entity, Collider, { shape, isTrigger, layer, mask });
  return entity;
}

/** @param {number} count */
function run(count) {
  for (let i = 0; i < count; i += 1) {
    physics.step(world, STEP);
    world.events.swap();
  }
}

describe('integration', () => {
  it('accelerates a dynamic body under gravity', () => {
    const e = spawnBody({ y: 0 });
    run(60);
    expect(world.get(e, Transform)?.position.y).toBeGreaterThan(400);
  });

  it('leaves a static body where it is', () => {
    const e = spawnBody({ y: 0, type: BodyType.STATIC });
    run(60);
    expect(world.get(e, Transform)?.position.y).toBe(0);
  });

  it('honours gravityScale', () => {
    const normal = spawnBody({ x: 0 });
    const floaty = spawnBody({ x: 200, gravityScale: 0 });
    run(30);
    expect(world.get(normal, Transform)?.position.y).toBeGreaterThan(50);
    expect(world.get(floaty, Transform)?.position.y).toBe(0);
  });

  it('applies a force for exactly one step, then clears it', () => {
    const e = spawnBody({ gravityScale: 0 });
    world.get(e, RigidBody)?.force.set(1000, 0);

    physics.step(world, STEP);
    const afterOne = world.get(e, RigidBody)?.velocity.x ?? 0;
    expect(afterOne).toBeGreaterThan(0);

    physics.step(world, STEP);
    expect(world.get(e, RigidBody)?.velocity.x).toBeCloseTo(afterOne, 5);
  });

  // Exponential decay rather than subtraction, so damping cannot push a body backwards and
  // does not depend on the step size.
  it('damps velocity without reversing it', () => {
    const e = spawnBody({ gravityScale: 0 });
    const body = world.get(e, RigidBody);
    if (body) {
      body.velocity.set(100, 0);
      body.linearDamping = 0.9;
    }
    run(120);
    const vx = world.get(e, RigidBody)?.velocity.x ?? -1;
    expect(vx).toBeGreaterThanOrEqual(0);
    expect(vx).toBeLessThan(1);
  });

  it('does not rotate a fixedRotation body', () => {
    const e = spawnBody({ gravityScale: 0 });
    const body = world.get(e, RigidBody);
    if (body) {
      body.fixedRotation = true;
      body.angularVelocity = 10;
    }
    run(30);
    expect(world.get(e, Transform)?.rotation).toBe(0);
  });
});

describe('resting contacts', () => {
  it('stops a falling box on static ground', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    const falling = spawnBody({ x: 0, y: 0, shape: box(20, 20) });

    run(180);

    const y = world.get(falling, Transform)?.position.y ?? 0;
    // Ground top is at 180; the box half-height is 10, so it rests near y = 170.
    expect(y).toBeGreaterThan(160);
    expect(y).toBeLessThan(180);
  });

  // Impulses fix velocity, not position; without positional correction a resting body sinks
  // through the floor a little more every step.
  it('does not sink through the ground over a long rest', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    const resting = spawnBody({ x: 0, y: 150, shape: box(20, 20) });

    run(60);
    const early = world.get(resting, Transform)?.position.y ?? 0;
    run(600);
    const late = world.get(resting, Transform)?.position.y ?? 0;

    expect(Math.abs(late - early)).toBeLessThan(1);
  });

  it('settles to a near-zero velocity at rest', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    const resting = spawnBody({ x: 0, y: 100, shape: box(20, 20) });

    run(300);
    expect(Math.abs(world.get(resting, RigidBody)?.velocity.y ?? 99)).toBeLessThan(20);
  });

  it('stacks two boxes without them passing through each other', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    const lower = spawnBody({ x: 0, y: 150, shape: box(20, 20) });
    const upper = spawnBody({ x: 0, y: 120, shape: box(20, 20) });

    run(300);

    const lowerY = world.get(lower, Transform)?.position.y ?? 0;
    const upperY = world.get(upper, Transform)?.position.y ?? 0;
    expect(upperY).toBeLessThan(lowerY);
    expect(lowerY - upperY).toBeGreaterThan(15); // still roughly one box apart
  });

  // Restitution is the *minimum* of the two bodies', so the ground has to be bouncy too —
  // a bouncy ball on a dead floor does not bounce, which is the physically right answer.
  it('bounces a restitutive body back up', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC, restitution: 0.9 });
    const ball = spawnBody({ x: 0, y: 0, shape: circle(10), restitution: 0.9 });

    let highestAfterBounce = Infinity;
    let touched = false;
    for (let i = 0; i < 240; i += 1) {
      physics.step(world, STEP);
      const y = world.get(ball, Transform)?.position.y ?? 0;
      if (y > 150) touched = true;
      if (touched) highestAfterBounce = Math.min(highestAfterBounce, y);
      world.events.swap();
    }

    expect(touched).toBe(true);
    expect(highestAfterBounce).toBeLessThan(150); // it came back up
  });
});

describe('collision filtering', () => {
  it('lets non-matching layers pass through each other', () => {
    spawnBody({
      x: 0,
      y: 200,
      shape: box(400, 40),
      type: BodyType.STATIC,
      layer: Layers.TERRAIN,
      mask: Layers.PLAYER,
    });
    const ghost = spawnBody({ x: 0, y: 0, layer: Layers.ENEMY, mask: Layers.PLAYER });

    run(120);
    expect(world.get(ghost, Transform)?.position.y).toBeGreaterThan(300);
  });
});

describe('contact events', () => {
  it('emits contactBegin once when two bodies start touching', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    spawnBody({ x: 0, y: 150, shape: box(20, 20) });

    let begins = 0;
    for (let i = 0; i < 120; i += 1) {
      physics.step(world, STEP);
      world.events.swap();
      begins += world.events.count(CONTACT_BEGIN);
    }

    expect(begins).toBe(1);
  });

  it('emits contactEnd when the bodies separate', () => {
    const ground = spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    spawnBody({ x: 0, y: 178, shape: box(20, 20), gravityScale: 0 });

    physics.step(world, STEP);
    world.events.swap();
    expect(world.events.count(CONTACT_BEGIN)).toBe(1);

    // Teleport the ground far away; the contact must be reported as ended.
    world.get(ground, Transform)?.position.set(0, 5000);
    physics.step(world, STEP);
    world.events.swap();

    expect(world.events.count(CONTACT_END)).toBe(1);
  });

  it('reports the contact normal on begin', () => {
    spawnBody({ x: 0, y: 200, shape: box(400, 40), type: BodyType.STATIC });
    spawnBody({ x: 0, y: 150, shape: box(20, 20) });

    for (let i = 0; i < 120; i += 1) {
      physics.step(world, STEP);
      world.events.swap();
      const events = world.events.read(CONTACT_BEGIN);
      if (events.length > 0) {
        expect(Math.abs(events[0].normal.y)).toBeGreaterThan(0.9);
        return;
      }
    }
    throw new Error('no contact was ever reported');
  });
});

describe('triggers', () => {
  it('reports an overlap without resolving it', () => {
    spawnBody({ x: 0, y: 100, shape: box(200, 200), type: BodyType.STATIC, isTrigger: true });
    const faller = spawnBody({ x: 0, y: -100, shape: box(10, 10) });

    let triggered = false;
    for (let i = 0; i < 120; i += 1) {
      physics.step(world, STEP);
      world.events.swap();
      if (world.events.count(TRIGGER_ENTER) > 0) triggered = true;
    }

    expect(triggered).toBe(true);
    // Passed straight through rather than being stopped.
    expect(world.get(faller, Transform)?.position.y).toBeGreaterThan(300);
  });

  // Once per overlap, not once per frame. The breakout example lost two lives for one ball
  // before this was fixed.
  it('emits triggerEnter exactly once for a sustained overlap', () => {
    spawnBody({ x: 0, y: 0, shape: box(200, 200), type: BodyType.STATIC, isTrigger: true });
    spawnBody({ x: 0, y: 0, shape: box(10, 10), gravityScale: 0 });

    let enters = 0;
    for (let i = 0; i < 60; i += 1) {
      physics.step(world, STEP);
      world.events.swap();
      enters += world.events.count(TRIGGER_ENTER);
    }

    expect(enters).toBe(1);
  });

  it('emits triggerExit when the overlap ends', () => {
    const zone = spawnBody({
      x: 0,
      y: 0,
      shape: box(200, 200),
      type: BodyType.STATIC,
      isTrigger: true,
    });
    spawnBody({ x: 0, y: 0, shape: box(10, 10), gravityScale: 0 });

    physics.step(world, STEP);
    world.events.swap();
    expect(world.events.count(TRIGGER_ENTER)).toBe(1);

    world.get(zone, Transform)?.position.set(0, 5000);
    physics.step(world, STEP);
    world.events.swap();

    expect(world.events.count(TRIGGER_EXIT)).toBe(1);
    // An ending overlap belongs on the trigger channel, not the solid-contact one.
    expect(world.events.count(CONTACT_END)).toBe(0);
  });

  it('emits triggerEnter again after a genuine re-entry', () => {
    const zone = spawnBody({
      x: 0,
      y: 0,
      shape: box(200, 200),
      type: BodyType.STATIC,
      isTrigger: true,
    });
    spawnBody({ x: 0, y: 0, shape: box(10, 10), gravityScale: 0 });

    let enters = 0;
    const tick = () => {
      physics.step(world, STEP);
      world.events.swap();
      enters += world.events.count(TRIGGER_ENTER);
    };

    tick();
    world.get(zone, Transform)?.position.set(0, 5000);
    tick();
    world.get(zone, Transform)?.position.set(0, 0);
    tick();

    expect(enters).toBe(2);
  });

  it('identifies which side was the trigger', () => {
    const zone = spawnBody({ x: 0, y: 0, shape: box(200, 200), type: BodyType.STATIC, isTrigger: true });
    const mover = spawnBody({ x: 0, y: 0, shape: box(10, 10), gravityScale: 0 });

    physics.step(world, STEP);
    world.events.swap();

    const event = world.events.read(TRIGGER_ENTER)[0];
    expect(event.trigger).toBe(zone);
    expect(event.other).toBe(mover);
  });
});

describe('determinism', () => {
  // Invariant P2. If the solve order depended on quadtree traversal, replay and the editor's
  // play/stop snapshot would both be unreliable.
  it('produces identical results from identical inputs', () => {
    /** @returns {number[]} the final positions of a small pile. */
    function simulate() {
      const w = new World();
      const p = new PhysicsWorld({ gravity: { x: 0, y: 980 } });

      const ground = w.createEntity();
      w.add(ground, Transform).position.set(0, 300);
      makeStatic(w.add(ground, RigidBody));
      w.add(ground, Collider, { shape: box(600, 40) });

      for (let i = 0; i < 12; i += 1) {
        const e = w.createEntity();
        w.add(e, Transform).position.set(-100 + i * 18, 100 - i * 25);
        setMass(w.add(e, RigidBody, { restitution: 0.3 }), box(20, 20), 1);
        w.add(e, Collider, { shape: box(20, 20) });
      }

      for (let i = 0; i < 240; i += 1) {
        p.step(w, STEP);
        w.events.swap();
      }

      const out = [];
      for (const [, transform] of w.query([Transform])) {
        out.push(transform.position.x, transform.position.y);
      }
      return out;
    }

    expect(simulate()).toEqual(simulate());
  });
});

describe('spatial queries', () => {
  it('finds colliders in a region', () => {
    const near = spawnBody({ x: 0, y: 0, gravityScale: 0 });
    spawnBody({ x: 900, y: 900, gravityScale: 0 });

    physics.step(world, STEP);
    const found = physics.queryRegion({ minX: -50, minY: -50, maxX: 50, maxY: 50 });
    expect(found).toEqual([near]);
  });

  it('reports broadphase statistics', () => {
    spawnBody({ x: 0, y: 0 });
    spawnBody({ x: 5, y: 5 });
    physics.step(world, STEP);
    expect(physics.stats.bodies).toBe(2);
    expect(physics.stats.broadphasePairs).toBeGreaterThanOrEqual(1);
  });
});
