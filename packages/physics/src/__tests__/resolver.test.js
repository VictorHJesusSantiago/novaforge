import { describe, it, expect } from 'vitest';
import { Vec2 } from '@novaforge/math';
import {
  prepareContact,
  warmStartContact,
  solveContact,
  captureImpulses,
  resolveContact,
  applyPositionalCorrection,
} from '../resolver.js';

/**
 * @param {Partial<any>} [overrides]
 * @returns {any} a RigidBody-shaped object.
 */
function body(overrides = {}) {
  return {
    velocity: new Vec2(0, 0),
    angularVelocity: 0,
    inverseMass: 1,
    inverseInertia: 0,
    restitution: 0,
    friction: 0,
    ...overrides,
  };
}

/**
 * @param {Partial<any>} [overrides]
 * @returns {any} a manifold with the normal pointing from A to B.
 */
function manifold(overrides = {}) {
  return {
    normal: new Vec2(0, 1),
    penetration: 1,
    contacts: [new Vec2(0, 0)],
    ...overrides,
  };
}

describe('normal impulse', () => {
  it('cancels the approach velocity of two equal bodies', () => {
    const a = body({ velocity: new Vec2(0, 10) });
    const b = body({ velocity: new Vec2(0, -10) });

    resolveContact(manifold(), a, b, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(a.velocity.y).toBeCloseTo(0, 3);
    expect(b.velocity.y).toBeCloseTo(0, 3);
  });

  it('leaves an immovable body untouched and reflects the other', () => {
    const falling = body({ velocity: new Vec2(0, 10) });
    const ground = body({ inverseMass: 0, inverseInertia: 0 });

    resolveContact(manifold(), falling, ground, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(ground.velocity.y).toBe(0);
    expect(falling.velocity.y).toBeCloseTo(0, 3);
  });

  it('does nothing when the bodies are already separating', () => {
    const a = body({ velocity: new Vec2(0, -10) });
    const b = body({ velocity: new Vec2(0, 10) });

    resolveContact(manifold(), a, b, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(a.velocity.y).toBe(-10);
    expect(b.velocity.y).toBe(10);
  });

  it('does nothing when both bodies are immovable', () => {
    const a = body({ inverseMass: 0, velocity: new Vec2(0, 10) });
    const b = body({ inverseMass: 0, velocity: new Vec2(0, -10) });

    resolveContact(manifold(), a, b, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(a.velocity.y).toBe(10);
  });

  it('moves the lighter body more', () => {
    const light = body({ inverseMass: 10, velocity: new Vec2(0, 10) });
    const heavy = body({ inverseMass: 0.1, velocity: new Vec2(0, 0) });

    resolveContact(manifold(), light, heavy, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(Math.abs(light.velocity.y - 10)).toBeGreaterThan(Math.abs(heavy.velocity.y));
  });
});

describe('restitution', () => {
  it('bounces a fast body back', () => {
    const ball = body({ velocity: new Vec2(0, 100), restitution: 0.8 });
    const ground = body({ inverseMass: 0, restitution: 0.8 });

    resolveContact(manifold(), ball, ground, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(ball.velocity.y).toBeCloseTo(-80, 0);
  });

  it('takes the minimum of the two restitutions', () => {
    const bouncy = body({ velocity: new Vec2(0, 100), restitution: 1 });
    const dead = body({ inverseMass: 0, restitution: 0 });

    resolveContact(manifold(), bouncy, dead, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(bouncy.velocity.y).toBeCloseTo(0, 2);
  });

  it('ignores restitution below the velocity threshold', () => {
    const settling = body({ velocity: new Vec2(0, 0.5), restitution: 1 });
    const ground = body({ inverseMass: 0, restitution: 1 });

    resolveContact(manifold(), settling, ground, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(settling.velocity.y).toBeCloseTo(0, 3);
  });
});

describe('friction', () => {
  it('slows a body sliding along the contact', () => {
    const slider = body({ velocity: new Vec2(50, 10), friction: 0.5 });
    const ground = body({ inverseMass: 0, friction: 0.5 });

    resolveContact(manifold(), slider, ground, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(slider.velocity.x).toBeLessThan(50);
    expect(slider.velocity.x).toBeGreaterThan(0);
  });

  it('never reverses the sliding direction', () => {
    const slider = body({ velocity: new Vec2(1, 100), friction: 2 });
    const ground = body({ inverseMass: 0, friction: 2 });

    resolveContact(manifold(), slider, ground, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(slider.velocity.x).toBeGreaterThanOrEqual(0);
  });

  it('leaves a frictionless slide untouched', () => {
    const slider = body({ velocity: new Vec2(50, 10), friction: 0 });
    const ground = body({ inverseMass: 0, friction: 0 });

    resolveContact(manifold(), slider, ground, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(slider.velocity.x).toBeCloseTo(50, 5);
  });
});

describe('impulse accumulation', () => {
  it('gives both points of a symmetric manifold the same impulse', () => {
    const falling = body({ velocity: new Vec2(0, 10), inverseInertia: 0.015 });
    const ground = body({ inverseMass: 0, inverseInertia: 0 });

    const constraint = prepareContact(
      manifold({ contacts: [new Vec2(-10, 0), new Vec2(10, 0)] }),
      falling,
      ground,
      { x: 0, y: -10 },
      { x: 0, y: 10 },
    );
    if (constraint === null) throw new Error('expected a constraint');

    for (let i = 0; i < 8; i += 1) solveContact(constraint, falling, ground);

    const [left, right] = constraint.points;
    expect(left.normalImpulse).toBeCloseTo(right.normalImpulse, 4);
  });

  it('leaves a symmetric contact with no induced spin', () => {
    const falling = body({ velocity: new Vec2(0, 10), inverseInertia: 0.015 });
    const ground = body({ inverseMass: 0, inverseInertia: 0 });

    const constraint = prepareContact(
      manifold({ contacts: [new Vec2(-10, 0), new Vec2(10, 0)] }),
      falling,
      ground,
      { x: 0, y: -10 },
      { x: 0, y: 10 },
    );
    if (constraint === null) throw new Error('expected a constraint');
    for (let i = 0; i < 8; i += 1) solveContact(constraint, falling, ground);

    expect(Math.abs(falling.angularVelocity)).toBeLessThan(1e-6);
  });

  it('never accumulates a negative normal impulse', () => {
    const a = body({ velocity: new Vec2(0, 5) });
    const b = body({ inverseMass: 0 });

    const constraint = prepareContact(manifold(), a, b, { x: 0, y: -1 }, { x: 0, y: 1 });
    if (constraint === null) throw new Error('expected a constraint');

    for (let i = 0; i < 20; i += 1) solveContact(constraint, a, b);

    for (const point of constraint.points) {
      expect(point.normalImpulse).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('warm starting', () => {
  it('captures the accumulated impulses for the next step', () => {
    const a = body({ velocity: new Vec2(0, 10) });
    const b = body({ inverseMass: 0 });

    const constraint = prepareContact(manifold(), a, b, { x: 0, y: -1 }, { x: 0, y: 1 });
    if (constraint === null) throw new Error('expected a constraint');
    for (let i = 0; i < 4; i += 1) solveContact(constraint, a, b);

    const captured = captureImpulses(constraint);
    expect(captured.normal).toHaveLength(1);
    expect(captured.normal[0]).toBeGreaterThan(0);
  });

  it('seeds the next step from the captured impulses', () => {
    const previous = { normal: [42], tangent: [7] };
    const a = body({ velocity: new Vec2(0, 10) });
    const b = body({ inverseMass: 0 });

    const constraint = prepareContact(
      manifold(),
      a,
      b,
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      previous,
    );

    expect(constraint?.points[0].normalImpulse).toBe(42);
    expect(constraint?.points[0].tangentImpulse).toBe(7);
  });

  it('discards the cache when the contact count changes', () => {
    const previous = { normal: [42, 42], tangent: [0, 0] };
    const constraint = prepareContact(
      manifold({ contacts: [new Vec2(0, 0)] }),
      body(),
      body({ inverseMass: 0 }),
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      previous,
    );

    expect(constraint?.points[0].normalImpulse).toBe(0);
  });

  it('applies the seeded impulse to the bodies', () => {
    const a = body();
    const b = body();

    const constraint = prepareContact(
      manifold(),
      a,
      b,
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { normal: [10], tangent: [0] },
    );
    if (constraint === null) throw new Error('expected a constraint');

    warmStartContact(constraint, a, b);

    expect(a.velocity.y).toBeCloseTo(-10);
    expect(b.velocity.y).toBeCloseTo(10);
  });
});

describe('body type as the mass authority', () => {
  it('treats a static body as immovable even with a finite inverseMass', () => {
    const ball = body({ velocity: new Vec2(0, 380), restitution: 1, type: 'dynamic' });
    const wall = body({ restitution: 1, type: 'static', inverseMass: 1 });

    resolveContact(manifold(), ball, wall, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(ball.velocity.y).toBeCloseTo(-380, 0);
    expect(wall.velocity.y).toBe(0);
  });

  it('treats a kinematic body as immovable too', () => {
    const ball = body({ velocity: new Vec2(0, 100), restitution: 1, type: 'dynamic' });
    const paddle = body({ restitution: 1, type: 'kinematic', inverseMass: 1 });

    resolveContact(manifold(), ball, paddle, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(paddle.velocity.y).toBe(0);
    expect(ball.velocity.y).toBeCloseTo(-100, 0);
  });

  it('ignores a static body inertia field as well', () => {
    const ball = body({ velocity: new Vec2(0, 100), type: 'dynamic' });
    const wall = body({ type: 'static', inverseMass: 1, inverseInertia: 5 });

    resolveContact(
      manifold({ contacts: [new Vec2(20, 0)] }),
      ball,
      wall,
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    );

    expect(wall.angularVelocity).toBe(0);
  });

  it('keeps positional correction off a static body', () => {
    const posA = { x: 0, y: 0 };
    const posB = { x: 0, y: 1 };

    applyPositionalCorrection(
      manifold({ penetration: 10 }),
      body({ type: 'dynamic' }),
      body({ type: 'static', inverseMass: 1 }),
      posA,
      posB,
    );

    expect(posB.y).toBe(1);
    expect(posA.y).toBeLessThan(0);
  });

  it('still honours inverseMass 0 on a dynamic body', () => {
    const light = body({ velocity: new Vec2(0, 10), type: 'dynamic' });
    const immovable = body({ type: 'dynamic', inverseMass: 0 });

    resolveContact(manifold(), light, immovable, { x: 0, y: -1 }, { x: 0, y: 1 });

    expect(immovable.velocity.y).toBe(0);
    expect(light.velocity.y).toBeCloseTo(0, 3);
  });
});

describe('positional correction', () => {
  it('pushes overlapping bodies apart along the normal', () => {
    const a = body();
    const b = body();
    const posA = { x: 0, y: 0 };
    const posB = { x: 0, y: 1 };

    applyPositionalCorrection(manifold({ penetration: 10 }), a, b, posA, posB);

    expect(posA.y).toBeLessThan(0);
    expect(posB.y).toBeGreaterThan(1);
  });

  it('ignores overlap below the slop', () => {
    const posA = { x: 0, y: 0 };
    const posB = { x: 0, y: 1 };

    applyPositionalCorrection(manifold({ penetration: 0.001 }), body(), body(), posA, posB);

    expect(posA.y).toBe(0);
    expect(posB.y).toBe(1);
  });

  it('moves only the movable body', () => {
    const posA = { x: 0, y: 0 };
    const posB = { x: 0, y: 1 };

    applyPositionalCorrection(
      manifold({ penetration: 10 }),
      body({ inverseMass: 0 }),
      body(),
      posA,
      posB,
    );

    expect(posA.y).toBe(0);
    expect(posB.y).toBeGreaterThan(1);
  });

  it('corrects only a fraction per call, so it converges rather than overshooting', () => {
    const posA = { x: 0, y: 0 };
    const posB = { x: 0, y: 0 };

    applyPositionalCorrection(manifold({ penetration: 10 }), body(), body(), posA, posB);

    expect(posB.y - posA.y).toBeLessThan(10);
    expect(posB.y - posA.y).toBeGreaterThan(0);
  });
});
