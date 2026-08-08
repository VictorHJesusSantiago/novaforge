import { Vec2, EPSILON } from '@novaforge/math';
import { ShapeType, worldVertices, worldNormals } from './shapes.js';

/**
 * The narrowphase: exact collision detection between two shapes, using the Separating Axis
 * Theorem for polygons and analytic tests for circles.
 *
 * **The convention that matters:** every manifold's `normal` points from **A toward B**, and
 * `penetration` is a positive overlap depth. Getting this backwards makes bodies attract instead
 * of separate, so it is stated once here and asserted in the tests rather than re-derived at
 * each call site.
 *
 * SAT in one sentence: two convex shapes are disjoint if and only if there is some axis on which
 * their projections do not overlap, and for polygons it suffices to test the edge normals of
 * both. If no such axis exists, the axis of *least* overlap is the shortest way to push them
 * apart, which is exactly the collision normal.
 *
 * @typedef {object} Manifold
 * @property {Vec2} normal unit vector pointing from A to B
 * @property {number} penetration overlap depth, always positive
 * @property {Vec2[]} contacts one or two world-space contact points
 */

/**
 * Collide any two shapes at their world transforms.
 * @param {import('./shapes.js').Shape} shapeA
 * @param {{ x: number, y: number }} positionA
 * @param {number} rotationA
 * @param {import('./shapes.js').Shape} shapeB
 * @param {{ x: number, y: number }} positionB
 * @param {number} rotationB
 * @returns {Manifold | null} `null` when the shapes are not touching.
 */
export function collide(shapeA, positionA, rotationA, shapeB, positionB, rotationB) {
  // Written as nested checks rather than precomputed booleans so that each branch narrows the
  // shape union, and `radius` / `vertices` are reachable without a cast.
  if (shapeA.type === ShapeType.CIRCLE) {
    if (shapeB.type === ShapeType.CIRCLE) {
      return collideCircles(positionA, shapeA.radius, positionB, shapeB.radius);
    }
    return collideCirclePolygon(
      positionA,
      shapeA.radius,
      worldVertices(shapeB, positionB, rotationB),
      worldNormals(shapeB, rotationB),
    );
  }

  if (shapeB.type === ShapeType.CIRCLE) {
    // Solve it the other way round, then flip the normal so it still points A to B.
    const manifold = collideCirclePolygon(
      positionB,
      shapeB.radius,
      worldVertices(shapeA, positionA, rotationA),
      worldNormals(shapeA, rotationA),
    );
    if (manifold === null) return null;
    manifold.normal = manifold.normal.negate();
    return manifold;
  }

  return collidePolygons(
    worldVertices(shapeA, positionA, rotationA),
    worldNormals(shapeA, rotationA),
    worldVertices(shapeB, positionB, rotationB),
    worldNormals(shapeB, rotationB),
  );
}

/**
 * Circle against circle — no SAT needed, the answer is one distance comparison.
 * @param {{ x: number, y: number }} centerA
 * @param {number} radiusA
 * @param {{ x: number, y: number }} centerB
 * @param {number} radiusB
 * @returns {Manifold | null}
 */
export function collideCircles(centerA, radiusA, centerB, radiusB) {
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const distanceSquared = dx * dx + dy * dy;
  const radiusSum = radiusA + radiusB;

  if (distanceSquared >= radiusSum * radiusSum) return null;

  const distance = Math.sqrt(distanceSquared);

  // Perfectly concentric circles have no meaningful normal. Picking +x arbitrarily is better
  // than dividing by zero and poisoning the solver with NaN, and the resolver will separate
  // them along that axis on the next step.
  if (distance < EPSILON) {
    return {
      normal: new Vec2(1, 0),
      penetration: radiusSum,
      contacts: [new Vec2(centerA.x, centerA.y)],
    };
  }

  const normal = new Vec2(dx / distance, dy / distance);
  return {
    normal,
    penetration: radiusSum - distance,
    contacts: [new Vec2(centerA.x + normal.x * radiusA, centerA.y + normal.y * radiusA)],
  };
}

/**
 * Circle against convex polygon. The returned normal points from the **circle** to the polygon.
 *
 * Three cases, decided by which Voronoi region of the closest face the circle centre falls in:
 * beyond the first vertex, beyond the second, or in front of the face itself. Handling only the
 * face case is the usual shortcut, and it makes circles catch on the corners between two
 * adjacent boxes — the single most reported bug in hand-rolled 2D physics.
 *
 * @param {{ x: number, y: number }} center
 * @param {number} radius
 * @param {Vec2[]} vertices world-space, counter-clockwise
 * @param {Vec2[]} normals world-space outward normals
 * @returns {Manifold | null}
 */
export function collideCirclePolygon(center, radius, vertices, normals) {
  // Deepest face: the one whose plane the centre is furthest in front of.
  let separation = -Infinity;
  let faceIndex = 0;

  for (let i = 0; i < normals.length; i += 1) {
    const v = vertices[i];
    const s = normals[i].x * (center.x - v.x) + normals[i].y * (center.y - v.y);
    if (s > radius) return null; // a separating axis exists
    if (s > separation) {
      separation = s;
      faceIndex = i;
    }
  }

  const v1 = vertices[faceIndex];
  const v2 = vertices[(faceIndex + 1) % vertices.length];
  const faceNormal = normals[faceIndex];

  // Centre inside the polygon: push straight out along the nearest face.
  if (separation < EPSILON) {
    return {
      normal: faceNormal.negate(),
      penetration: radius + Math.abs(separation),
      contacts: [new Vec2(center.x, center.y)],
    };
  }

  const toCenter = new Vec2(center.x - v1.x, center.y - v1.y);
  const edge = v2.sub(v1);

  // Region beyond v1.
  if (toCenter.dot(edge) <= 0) {
    const distance = Math.hypot(center.x - v1.x, center.y - v1.y);
    if (distance > radius) return null;
    const normal = new Vec2(v1.x - center.x, v1.y - center.y).normalizeSelf();
    return { normal, penetration: radius - distance, contacts: [v1.clone()] };
  }

  // Region beyond v2.
  const fromV2 = new Vec2(center.x - v2.x, center.y - v2.y);
  if (fromV2.dot(edge.negate()) <= 0) {
    const distance = Math.hypot(center.x - v2.x, center.y - v2.y);
    if (distance > radius) return null;
    const normal = new Vec2(v2.x - center.x, v2.y - center.y).normalizeSelf();
    return { normal, penetration: radius - distance, contacts: [v2.clone()] };
  }

  // In front of the face itself.
  const normal = faceNormal.negate();
  return {
    normal,
    penetration: radius - separation,
    contacts: [new Vec2(center.x + normal.x * separation, center.y + normal.y * separation)],
  };
}

/**
 * Convex polygon against convex polygon, by SAT with reference/incident face clipping.
 *
 * The clipping step is what produces **two** contact points for a flat resting contact. With a
 * single contact point a box resting on the ground has nothing resisting rotation about that
 * point, so it rocks endlessly instead of settling — which is why the Milestone 3 exit criterion
 * is "500 bodies settle into a stable pile" rather than "boxes collide".
 *
 * @param {Vec2[]} verticesA world-space, counter-clockwise
 * @param {Vec2[]} normalsA world-space outward normals
 * @param {Vec2[]} verticesB
 * @param {Vec2[]} normalsB
 * @returns {Manifold | null}
 */
export function collidePolygons(verticesA, normalsA, verticesB, normalsB) {
  const fromA = axisLeastPenetration(verticesA, normalsA, verticesB);
  if (fromA.distance >= 0) return null; // separating axis found on A

  const fromB = axisLeastPenetration(verticesB, normalsB, verticesA);
  if (fromB.distance >= 0) return null; // separating axis found on B

  // The face with the *least* penetration is the reference face. A small bias toward A keeps
  // the choice from flip-flopping between frames when the two are nearly equal, which would
  // otherwise make a resting contact jitter.
  const preferA = fromA.distance > fromB.distance - 1e-5;

  const referenceVertices = preferA ? verticesA : verticesB;
  const referenceNormals = preferA ? normalsA : normalsB;
  const referenceIndex = preferA ? fromA.index : fromB.index;
  const incidentVertices = preferA ? verticesB : verticesA;
  const incidentNormals = preferA ? normalsB : normalsA;

  const referenceNormal = referenceNormals[referenceIndex];
  const v1 = referenceVertices[referenceIndex];
  const v2 = referenceVertices[(referenceIndex + 1) % referenceVertices.length];

  // The incident face is the one most anti-parallel to the reference normal — the face that is
  // "facing into" the collision.
  const incident = findIncidentFace(referenceNormal, incidentVertices, incidentNormals);

  const edgeDirection = v2.sub(v1).normalizeSelf();

  // Clip the incident face against the two side planes of the reference face, so that only the
  // portion actually overlapping the reference face survives.
  let clipped = clipToPlane(edgeDirection.negate(), -edgeDirection.dot(v1), incident);
  if (clipped.length < 2) return null;

  clipped = clipToPlane(edgeDirection, edgeDirection.dot(v2), clipped);
  if (clipped.length < 2) return null;

  const referenceOffset = referenceNormal.dot(v1);

  /** @type {Vec2[]} */
  const contacts = [];
  let penetrationSum = 0;

  for (const point of clipped) {
    const depth = referenceNormal.dot(point) - referenceOffset;
    if (depth <= 0) {
      contacts.push(point);
      penetrationSum += -depth;
    }
  }

  if (contacts.length === 0) return null;

  return {
    // The reference normal points out of the reference polygon. If the reference was B, that
    // is B toward A, so it has to be flipped to honour the A-to-B convention.
    normal: preferA ? referenceNormal.clone() : referenceNormal.negate(),
    penetration: penetrationSum / contacts.length,
    contacts,
  };
}

/**
 * The face of `vertices` whose outward normal gives the greatest separation from `otherVertices`.
 *
 * A positive result means a separating axis exists and the shapes are disjoint.
 *
 * @param {Vec2[]} vertices
 * @param {Vec2[]} normals
 * @param {Vec2[]} otherVertices
 * @returns {{ distance: number, index: number }}
 */
function axisLeastPenetration(vertices, normals, otherVertices) {
  let bestDistance = -Infinity;
  let bestIndex = 0;

  for (let i = 0; i < normals.length; i += 1) {
    const normal = normals[i];
    // The other shape's support point *against* this normal is its deepest point along it.
    const supportPoint = support(otherVertices, -normal.x, -normal.y);
    const v = vertices[i];
    const distance = normal.x * (supportPoint.x - v.x) + normal.y * (supportPoint.y - v.y);

    if (distance > bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return { distance: bestDistance, index: bestIndex };
}

/**
 * The vertex furthest along a direction.
 * @param {Vec2[]} vertices
 * @param {number} dx
 * @param {number} dy
 * @returns {Vec2}
 */
function support(vertices, dx, dy) {
  let best = vertices[0];
  let bestProjection = -Infinity;

  for (const vertex of vertices) {
    const projection = vertex.x * dx + vertex.y * dy;
    if (projection > bestProjection) {
      bestProjection = projection;
      best = vertex;
    }
  }

  return best;
}

/**
 * @param {Vec2} referenceNormal
 * @param {Vec2[]} vertices
 * @param {Vec2[]} normals
 * @returns {[Vec2, Vec2]} the incident face as a pair of endpoints.
 */
function findIncidentFace(referenceNormal, vertices, normals) {
  let minDot = Infinity;
  let index = 0;

  for (let i = 0; i < normals.length; i += 1) {
    const dot = normals[i].dot(referenceNormal);
    if (dot < minDot) {
      minDot = dot;
      index = i;
    }
  }

  return [vertices[index].clone(), vertices[(index + 1) % vertices.length].clone()];
}

/**
 * Clip a segment against a half-plane, keeping the part where `normal · p <= offset`.
 *
 * Both endpoints outside gives an empty result; one outside gives the surviving endpoint plus
 * the intersection point.
 *
 * @param {Vec2} normal
 * @param {number} offset
 * @param {Vec2[]} face two endpoints
 * @returns {Vec2[]}
 */
function clipToPlane(normal, offset, face) {
  /** @type {Vec2[]} */
  const out = [];

  const d1 = normal.dot(face[0]) - offset;
  const d2 = normal.dot(face[1]) - offset;

  if (d1 <= 0) out.push(face[0]);
  if (d2 <= 0) out.push(face[1]);

  // Opposite signs means the segment crosses the plane.
  if (d1 * d2 < 0) {
    const alpha = d1 / (d1 - d2);
    out.push(face[0].lerp(face[1], alpha));
  }

  return out;
}
