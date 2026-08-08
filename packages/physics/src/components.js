import { defineComponent } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { Layers } from './layers.js';
import { box, momentOfInertia } from './shapes.js';

/**
 * How a body participates in the simulation.
 * @readonly
 * @enum {string}
 */
export const BodyType = {
  // Cast to literal types so `body.type` stays a union rather than widening to `string`.
  /** Moved by forces and collisions. */
  DYNAMIC: /** @type {'dynamic'} */ ('dynamic'),
  /** Never moves, infinite mass. Ground, walls. */
  STATIC: /** @type {'static'} */ ('static'),
  /** Moved only by direct velocity assignment; unaffected by collisions. Platforms, doors. */
  KINEMATIC: /** @type {'kinematic'} */ ('kinematic'),
};

/**
 * Motion state and material properties.
 *
 * Mass is stored as its **inverse**, which is the form every impulse calculation actually wants
 * and which makes "infinite mass" a plain `0` rather than a division by zero and a scattering of
 * `isStatic` checks through the solver.
 */
export const RigidBody = defineComponent(
  'RigidBody',
  () => ({
    /** @type {'dynamic'|'static'|'kinematic'} */
    type: BodyType.DYNAMIC,
    velocity: new Vec2(0, 0),
    angularVelocity: 0,
    force: new Vec2(0, 0),
    torque: 0,
    /** 0 means infinite mass. */
    inverseMass: 1,
    /** 0 means the body never rotates. */
    inverseInertia: 0,
    /** Bounciness, 0 to 1. */
    restitution: 0.2,
    /** Coulomb friction coefficient. */
    friction: 0.4,
    /** Velocity lost per second, 0 to 1. */
    linearDamping: 0,
    angularDamping: 0.05,
    /** Multiplier on world gravity; 0 makes a body float. */
    gravityScale: 1,
    /** When true the body ignores torque entirely — what most platformer characters want. */
    fixedRotation: false,
  }),
  {
    type: { type: 'enum', options: ['dynamic', 'static', 'kinematic'] },
    velocity: { type: 'vec2' },
    angularVelocity: { type: 'number', step: 0.01 },
    restitution: { type: 'number', min: 0, max: 1, step: 0.01 },
    friction: { type: 'number', min: 0, max: 2, step: 0.01 },
    linearDamping: { type: 'number', min: 0, max: 1, step: 0.01 },
    angularDamping: { type: 'number', min: 0, max: 1, step: 0.01 },
    gravityScale: { type: 'number', step: 0.1 },
    fixedRotation: { type: 'boolean' },
  },
);

/**
 * The shape a body collides with, plus its filtering.
 *
 * A trigger reports overlap but is not resolved — pickups, checkpoints, damage zones. That is
 * one boolean rather than a separate component because a trigger otherwise needs every field a
 * collider has, and duplicating them is how the two drift apart.
 */
export const Collider = defineComponent(
  'Collider',
  () => ({
    /** @type {import('./shapes.js').Shape} */
    shape: box(32, 32),
    /** Offset from the entity's Transform, in local space. */
    offset: new Vec2(0, 0),
    /** What this collider *is*. One bit. */
    layer: Layers.DEFAULT,
    /** What this collider wants to hit. Many bits. */
    mask: Layers.ALL,
    /** Overlaps are reported but never resolved. */
    isTrigger: false,
  }),
  {
    // 'opaque': a shape's vertex/normal arrays are not something a generic form field can edit
    // usefully. The inspector renders it read-only; the serialiser still round-trips it exactly,
    // since a Shape is already plain JSON-safe data (Invariant C2).
    shape: { type: 'opaque', label: 'Shape' },
    layer: { type: 'number', step: 1 },
    mask: { type: 'number', step: 1 },
    isTrigger: { type: 'boolean' },
    offset: { type: 'vec2' },
  },
);

/**
 * Set a body's mass, deriving the inverse mass and inertia from its shape.
 *
 * Setting `inverseMass` by hand without also setting `inverseInertia` gives a body that
 * translates correctly but will not spin — a subtle wrongness that looks like "the physics feels
 * off" rather than like a bug, so this helper exists to make the correct thing the easy thing.
 *
 * @param {any} body a RigidBody instance
 * @param {import('./shapes.js').Shape} shape
 * @param {number} mass  0 or less means infinite (static)
 * @returns {void}
 */
export function setMass(body, shape, mass) {
  if (mass <= 0) {
    body.inverseMass = 0;
    body.inverseInertia = 0;
    return;
  }

  body.inverseMass = 1 / mass;

  if (body.fixedRotation) {
    body.inverseInertia = 0;
    return;
  }

  const inertia = momentOfInertia(shape, mass);
  body.inverseInertia = inertia > 0 ? 1 / inertia : 0;
}

/**
 * Turn a body into an immovable one.
 * @param {any} body a RigidBody instance
 * @returns {void}
 */
export function makeStatic(body) {
  body.type = BodyType.STATIC;
  body.inverseMass = 0;
  body.inverseInertia = 0;
  body.velocity.set(0, 0);
  body.angularVelocity = 0;
}
