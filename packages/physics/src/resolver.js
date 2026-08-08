import { Vec2, EPSILON } from '@novaforge/math';
import { BodyType } from './components.js';

/**
 * Sequential-impulse contact resolution.
 *
 * Split into two phases, which is not cosmetic — it is what makes a stack of boxes stable:
 *
 * - {@link prepareContact} runs **once** per manifold per step. It caches the lever arms and
 *   effective masses, captures the approach velocity that restitution is measured against, and
 *   seeds each contact point with last step's impulse.
 * - {@link warmStartContact} runs once, applying those seeded impulses.
 * - {@link solveContact} runs **several times**, accumulating a total impulse per contact point
 *   and applying only the difference each pass.
 *
 * Two things make this stable, and both were added because the naive version visibly failed:
 *
 * **Accumulation.** A solver that applies a fresh impulse per pass gives the first contact point
 * of a two-point manifold a larger impulse than the second, because the second sees a relative
 * velocity the first has already reduced. On a box resting flat that asymmetry is a torque: the
 * box acquires spin from nothing, the spin makes the contact asymmetric, and the box squirts
 * sideways out of the stack. Clamping the accumulated *total* converges to the symmetric answer.
 *
 * **Warm starting.** Even with accumulation, a fixed iteration budget leaves a small residual
 * error every step, and over a few hundred steps that residual integrates into visible drift —
 * measured at roughly 14 world units of lateral creep over 300 steps with 8 iterations. Carrying
 * the previous step's impulses forward starts the solver near the answer instead of at zero, so
 * the same budget converges much further. It is the difference between a stack that needs 32
 * iterations and one that is solid at 8.
 */

/**
 * How much of the overlap is corrected per step, 0 to 1.
 *
 * Correcting 100% in one step overshoots — the correction becomes a velocity the next step must
 * undo, and a stack oscillates. 20% converges over a handful of steps with no visible sink.
 */
const CORRECTION_PERCENT = 0.2;

/**
 * Overlap tolerated without any correction, in world units.
 *
 * Bodies in a resting stack always overlap by a hair because gravity pushes them together every
 * step. Correcting that hair every step is the classic jitter, so a little is left uncorrected.
 */
const PENETRATION_SLOP = 0.05;

/**
 * Approach speed below which restitution is ignored, in world units per second.
 *
 * A body at rest is re-accelerated by gravity every step and so arrives at its contact with a
 * small downward velocity. Bouncing that back would make a resting body vibrate forever.
 * Box2D calls the same constant `b2_velocityThreshold`.
 */
const RESTITUTION_THRESHOLD = 1;

/**
 * @typedef {object} ContactPoint
 * @property {number} rax lever arm from A's centre of mass
 * @property {number} ray
 * @property {number} rbx lever arm from B's centre of mass
 * @property {number} rby
 * @property {number} normalMass 1 / effective mass along the normal
 * @property {number} tangentMass 1 / effective mass along the tangent
 * @property {number} velocityBias restitution target
 * @property {number} normalImpulse accumulated across solver passes
 * @property {number} tangentImpulse accumulated across solver passes
 *
 * @typedef {object} ContactConstraint
 * @property {Vec2} normal points from A to B
 * @property {Vec2} tangent
 * @property {number} friction
 * @property {number} penetration
 * @property {number} invMassA effective inverse mass, after the body type is accounted for
 * @property {number} invInertiaA
 * @property {number} invMassB
 * @property {number} invInertiaB
 * @property {ContactPoint[]} points
 */

/**
 * Effective inverse mass, with the **body type as the authority** (Invariant P3).
 *
 * A body declared `static` or `kinematic` is immovable by collisions no matter what its
 * `inverseMass` field says. Trusting the field instead produced one of the nastiest bugs in
 * this project's history: a wall marked `static` but left at the default mass absorbed half of
 * every impulse into a body the integrator then refused to move, so a ball hitting it simply
 * stopped dead. Nothing threw, nothing warned, and the wall looked correct in the inspector.
 *
 * @param {any} body
 * @returns {number}
 */
function effectiveInverseMass(body) {
  if (body.type === BodyType.STATIC || body.type === BodyType.KINEMATIC) return 0;
  return body.inverseMass;
}

/**
 * @param {any} body
 * @returns {number}
 */
function effectiveInverseInertia(body) {
  if (body.type === BodyType.STATIC || body.type === BodyType.KINEMATIC) return 0;
  return body.inverseInertia;
}

/**
 * Build the solver constraint for one manifold. Call once per step, before any solve pass.
 *
 * @param {import('./sat.js').Manifold} manifold normal points from A to B
 * @param {any} bodyA RigidBody instance
 * @param {any} bodyB RigidBody instance
 * @param {{ x: number, y: number }} positionA centre of mass of A
 * @param {{ x: number, y: number }} positionB centre of mass of B
 * @param {{ normal: number[], tangent: number[] } | undefined} [previousImpulses]
 *   last step's accumulated impulses for this pair, for warm starting
 * @returns {ContactConstraint | null} `null` when neither body can move.
 */
export function prepareContact(manifold, bodyA, bodyB, positionA, positionB, previousImpulses) {
  const invMassA = effectiveInverseMass(bodyA);
  const invMassB = effectiveInverseMass(bodyB);
  const invInertiaA = effectiveInverseInertia(bodyA);
  const invInertiaB = effectiveInverseInertia(bodyB);
  const inverseMassSum = invMassA + invMassB;

  // Two immovable bodies overlapping is a level-design problem, not a physics one.
  if (inverseMassSum <= 0) return null;

  const normal = manifold.normal;
  const tangent = new Vec2(-normal.y, normal.x);
  const restitution = Math.min(bodyA.restitution, bodyB.restitution);
  // Friction between two materials is conventionally the geometric mean of their coefficients,
  // which keeps a slippery body slippery even against a grippy one.
  const friction = Math.sqrt(bodyA.friction * bodyB.friction);

  /** @type {ContactPoint[]} */
  const points = [];

  for (const contact of manifold.contacts) {
    const rax = contact.x - positionA.x;
    const ray = contact.y - positionA.y;
    const rbx = contact.x - positionB.x;
    const rby = contact.y - positionB.y;

    const raCrossN = rax * normal.y - ray * normal.x;
    const rbCrossN = rbx * normal.y - rby * normal.x;
    const normalDenominator =
      inverseMassSum + raCrossN * raCrossN * invInertiaA + rbCrossN * rbCrossN * invInertiaB;

    const raCrossT = rax * tangent.y - ray * tangent.x;
    const rbCrossT = rbx * tangent.y - rby * tangent.x;
    const tangentDenominator =
      inverseMassSum + raCrossT * raCrossT * invInertiaA + rbCrossT * rbCrossT * invInertiaB;

    // Restitution is measured against the approach velocity *before* solving. Measuring it
    // during the solve would compound it across passes.
    const approach = relativeNormalVelocity(bodyA, bodyB, rax, ray, rbx, rby, normal);
    const velocityBias = -approach > RESTITUTION_THRESHOLD ? restitution * approach : 0;

    points.push({
      rax,
      ray,
      rbx,
      rby,
      normalMass: normalDenominator > EPSILON ? 1 / normalDenominator : 0,
      tangentMass: tangentDenominator > EPSILON ? 1 / tangentDenominator : 0,
      velocityBias,
      normalImpulse: 0,
      tangentImpulse: 0,
    });
  }

  // Seed from the previous step, but only when the manifold has the same shape. Contact points
  // are matched by index, which holds while the reference face is stable and is exactly what a
  // changed count signals is no longer true — so a differing count discards the cache rather
  // than applying last step's edge impulse to this step's face contact.
  if (previousImpulses !== undefined && previousImpulses.normal.length === points.length) {
    for (let i = 0; i < points.length; i += 1) {
      points[i].normalImpulse = previousImpulses.normal[i];
      points[i].tangentImpulse = previousImpulses.tangent[i];
    }
  }

  return {
    normal,
    tangent,
    friction,
    penetration: manifold.penetration,
    invMassA,
    invInertiaA,
    invMassB,
    invInertiaB,
    points,
  };
}

/**
 * Apply the seeded impulses from the previous step.
 *
 * A separate pass, run after **every** constraint has been prepared. Applying it inside
 * `prepareContact` would change the velocities that later constraints measure their restitution
 * against, making the result depend on the order pairs happen to be prepared in — which would
 * break Invariant P2.
 *
 * @param {ContactConstraint} constraint
 * @param {any} bodyA
 * @param {any} bodyB
 * @returns {void}
 */
export function warmStartContact(constraint, bodyA, bodyB) {
  const { normal, tangent, points } = constraint;

  for (const point of points) {
    const ix = normal.x * point.normalImpulse + tangent.x * point.tangentImpulse;
    const iy = normal.y * point.normalImpulse + tangent.y * point.tangentImpulse;
    applyImpulse(bodyA, -ix, -iy, point.rax, point.ray, constraint.invMassA, constraint.invInertiaA);
    applyImpulse(bodyB, ix, iy, point.rbx, point.rby, constraint.invMassB, constraint.invInertiaB);
  }
}

/**
 * Extract the accumulated impulses so the next step can warm start from them.
 * @param {ContactConstraint} constraint
 * @returns {{ normal: number[], tangent: number[] }}
 */
export function captureImpulses(constraint) {
  return {
    normal: constraint.points.map((p) => p.normalImpulse),
    tangent: constraint.points.map((p) => p.tangentImpulse),
  };
}

/**
 * Run one solver pass over a constraint, mutating both bodies' velocities.
 *
 * @param {ContactConstraint} constraint
 * @param {any} bodyA
 * @param {any} bodyB
 * @returns {void}
 */
export function solveContact(constraint, bodyA, bodyB) {
  const { normal, tangent, friction, points } = constraint;

  // Normal impulses first: friction's Coulomb limit depends on the normal impulse, so solving
  // friction against a stale normal impulse would let a body slide on the frame it lands.
  for (const point of points) {
    const vn = relativeNormalVelocity(bodyA, bodyB, point.rax, point.ray, point.rbx, point.rby, normal);

    const lambda = -(vn + point.velocityBias) * point.normalMass;

    // Clamp the accumulated total, not this pass's increment. A contact may only push, never
    // pull, and clamping the increment would let an earlier over-correction stay stuck.
    const previous = point.normalImpulse;
    point.normalImpulse = Math.max(previous + lambda, 0);
    const applied = point.normalImpulse - previous;

    applyImpulse(bodyA, -normal.x * applied, -normal.y * applied, point.rax, point.ray, constraint.invMassA, constraint.invInertiaA);
    applyImpulse(bodyB, normal.x * applied, normal.y * applied, point.rbx, point.rby, constraint.invMassB, constraint.invInertiaB);
  }

  for (const point of points) {
    const vt = relativeTangentVelocity(
      bodyA,
      bodyB,
      point.rax,
      point.ray,
      point.rbx,
      point.rby,
      tangent,
    );

    const lambda = -vt * point.tangentMass;

    // Coulomb's law: friction can never exceed mu times the normal force. Without the clamp,
    // friction reverses a sliding body instead of merely slowing it.
    const limit = friction * point.normalImpulse;
    const previous = point.tangentImpulse;
    point.tangentImpulse = clamp(previous + lambda, -limit, limit);
    const applied = point.tangentImpulse - previous;

    applyImpulse(bodyA, -tangent.x * applied, -tangent.y * applied, point.rax, point.ray, constraint.invMassA, constraint.invInertiaA);
    applyImpulse(bodyB, tangent.x * applied, tangent.y * applied, point.rbx, point.rby, constraint.invMassB, constraint.invInertiaB);
  }
}

/**
 * Push overlapping bodies apart positionally.
 *
 * Impulses fix *velocity*, not *position*. A body resting under gravity is re-penetrated every
 * step by exactly the distance gravity moved it, and with impulses alone it sinks slowly through
 * the floor. This nudges positions directly, in proportion to inverse mass, so the heavier body
 * moves less.
 *
 * @param {import('./sat.js').Manifold} manifold
 * @param {any} bodyA
 * @param {any} bodyB
 * @param {{ x: number, y: number }} positionA mutated
 * @param {{ x: number, y: number }} positionB mutated
 * @returns {void}
 */
export function applyPositionalCorrection(manifold, bodyA, bodyB, positionA, positionB) {
  const invMassA = effectiveInverseMass(bodyA);
  const invMassB = effectiveInverseMass(bodyB);
  const inverseMassSum = invMassA + invMassB;
  if (inverseMassSum <= 0) return;

  const depth = manifold.penetration - PENETRATION_SLOP;
  if (depth <= 0) return;

  const magnitude = (depth / inverseMassSum) * CORRECTION_PERCENT;
  const correctionX = manifold.normal.x * magnitude;
  const correctionY = manifold.normal.y * magnitude;

  positionA.x -= correctionX * invMassA;
  positionA.y -= correctionY * invMassA;
  positionB.x += correctionX * invMassB;
  positionB.y += correctionY * invMassB;
}

/**
 * Resolve a manifold end to end: prepare, solve `iterations` times, then correct positions.
 *
 * A convenience for single-pair use — tests, and gameplay code doing a one-off resolve. The
 * physics world does not use it, because it must interleave the passes across *every* contact
 * so that a stack converges as a whole rather than one pair at a time.
 *
 * @param {import('./sat.js').Manifold} manifold
 * @param {any} bodyA
 * @param {any} bodyB
 * @param {{ x: number, y: number }} positionA
 * @param {{ x: number, y: number }} positionB
 * @param {number} [iterations]
 * @returns {void}
 */
export function resolveContact(manifold, bodyA, bodyB, positionA, positionB, iterations = 4) {
  const constraint = prepareContact(manifold, bodyA, bodyB, positionA, positionB);
  if (constraint === null) return;

  warmStartContact(constraint, bodyA, bodyB);
  for (let i = 0; i < iterations; i += 1) {
    solveContact(constraint, bodyA, bodyB);
  }
  applyPositionalCorrection(manifold, bodyA, bodyB, positionA, positionB);
}

/**
 * Relative velocity at a contact point, projected onto the normal. Negative means approaching.
 * @param {any} bodyA
 * @param {any} bodyB
 * @param {number} rax
 * @param {number} ray
 * @param {number} rbx
 * @param {number} rby
 * @param {Vec2} normal
 * @returns {number}
 */
function relativeNormalVelocity(bodyA, bodyB, rax, ray, rbx, rby, normal) {
  // Velocity of a point on a rotating body is v + omega x r, which in 2D is (-w*ry, w*rx).
  const ax = bodyA.velocity.x - bodyA.angularVelocity * ray;
  const ay = bodyA.velocity.y + bodyA.angularVelocity * rax;
  const bx = bodyB.velocity.x - bodyB.angularVelocity * rby;
  const by = bodyB.velocity.y + bodyB.angularVelocity * rbx;
  return (bx - ax) * normal.x + (by - ay) * normal.y;
}

/**
 * @param {any} bodyA
 * @param {any} bodyB
 * @param {number} rax
 * @param {number} ray
 * @param {number} rbx
 * @param {number} rby
 * @param {Vec2} tangent
 * @returns {number}
 */
function relativeTangentVelocity(bodyA, bodyB, rax, ray, rbx, rby, tangent) {
  const ax = bodyA.velocity.x - bodyA.angularVelocity * ray;
  const ay = bodyA.velocity.y + bodyA.angularVelocity * rax;
  const bx = bodyB.velocity.x - bodyB.angularVelocity * rby;
  const by = bodyB.velocity.y + bodyB.angularVelocity * rbx;
  return (bx - ax) * tangent.x + (by - ay) * tangent.y;
}

/**
 * @param {any} body
 * @param {number} ix
 * @param {number} iy
 * @param {number} rx lever arm x
 * @param {number} ry lever arm y
 * @param {number} invMass effective inverse mass, from the constraint
 * @param {number} invInertia effective inverse inertia, from the constraint
 * @returns {void}
 */
function applyImpulse(body, ix, iy, rx, ry, invMass, invInertia) {
  if (invMass === 0) return;
  body.velocity.x += ix * invMass;
  body.velocity.y += iy * invMass;
  body.angularVelocity += (rx * iy - ry * ix) * invInertia;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
