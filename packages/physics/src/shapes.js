import { Vec2, AABB, EPSILON } from '@novaforge/math';

/**
 * Collision shapes are plain data (Invariant C2), so a collider survives structured cloning for
 * the editor's play-mode snapshot.
 *
 * Only two primitives exist: circles and **convex** polygons. Concave shapes are not supported
 * and never will be — the standard answer is to decompose them into convex pieces, and pushing
 * that decision onto the author keeps the narrowphase to one algorithm instead of three.
 *
 * @readonly
 * @enum {string}
 */
export const ShapeType = {
  // Cast to the literal type rather than left as `string`, so that `shape.type === CIRCLE`
  // actually narrows the union at the call site. Without this every branch of the narrowphase
  // would need a cast to reach `radius` or `vertices`.
  CIRCLE: /** @type {'circle'} */ ('circle'),
  POLYGON: /** @type {'polygon'} */ ('polygon'),
};

/**
 * @typedef {object} CircleShape
 * @property {'circle'} type
 * @property {number} radius
 *
 * @typedef {object} PolygonShape
 * @property {'polygon'} type
 * @property {Array<{ x: number, y: number }>} vertices  counter-clockwise, convex, local space
 * @property {Array<{ x: number, y: number }>} normals   outward unit normal per edge
 *
 * @typedef {CircleShape | PolygonShape} Shape
 */

/**
 * @param {number} radius
 * @returns {CircleShape}
 */
export function circle(radius) {
  if (radius <= 0) throw new RangeError(`circle: radius must be positive, got ${radius}`);
  return { type: ShapeType.CIRCLE, radius };
}

/**
 * An axis-aligned box, centred on the body origin.
 * @param {number} width
 * @param {number} height
 * @returns {PolygonShape}
 */
export function box(width, height) {
  const hw = width / 2;
  const hh = height / 2;
  return polygon([
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]);
}

/**
 * A convex polygon.
 *
 * The vertices are normalised to counter-clockwise winding on construction, because the SAT
 * narrowphase derives outward normals by rotating each edge the same way every time. Accepting
 * either winding and inferring it per query would make every normal sign a runtime question.
 *
 * @param {Array<{ x: number, y: number }>} vertices at least 3, convex
 * @returns {PolygonShape}
 * @throws {RangeError} for fewer than three vertices.
 */
export function polygon(vertices) {
  if (vertices.length < 3) {
    throw new RangeError(`polygon: needs at least 3 vertices, got ${vertices.length}`);
  }

  const points = vertices.map((v) => ({ x: v.x, y: v.y }));
  if (signedArea(points) < 0) points.reverse();

  const normals = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const edge = new Vec2(next.x - current.x, next.y - current.y);
    if (edge.lengthSquared() < EPSILON * EPSILON) {
      throw new RangeError('polygon: found a zero-length edge (duplicate vertices?)');
    }
    // For counter-clockwise winding the outward normal is the edge rotated -90 degrees.
    const normal = new Vec2(edge.y, -edge.x).normalizeSelf();
    normals.push({ x: normal.x, y: normal.y });
  }

  return { type: ShapeType.POLYGON, vertices: points, normals };
}

/**
 * @param {Array<{ x: number, y: number }>} points
 * @returns {number} twice the signed area; positive for counter-clockwise winding.
 */
function signedArea(points) {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total;
}

/**
 * World-space bounds of a shape at a given transform.
 *
 * A rotated polygon is bounded by its actual rotated vertices; a circle ignores rotation
 * entirely, which is the one useful thing about circles.
 *
 * @param {Shape} shape
 * @param {{ x: number, y: number }} position
 * @param {number} rotation radians
 * @returns {AABB}
 */
export function shapeBounds(shape, position, rotation) {
  if (shape.type === ShapeType.CIRCLE) {
    return AABB.fromCircle(position, shape.radius);
  }

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const v of shape.vertices) {
    const x = position.x + v.x * cos - v.y * sin;
    const y = position.y + v.x * sin + v.y * cos;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return new AABB(minX, minY, maxX, maxY);
}

/**
 * @param {Shape} shape
 * @returns {number}
 */
export function shapeArea(shape) {
  if (shape.type === ShapeType.CIRCLE) return Math.PI * shape.radius * shape.radius;
  return Math.abs(signedArea(shape.vertices)) / 2;
}

/**
 * Moment of inertia about the shape's centroid, for a given mass.
 *
 * Rotational response is wrong without this — a box hit off-centre would slide instead of
 * spinning. The polygon case is the standard triangle-fan decomposition about the origin.
 *
 * @param {Shape} shape
 * @param {number} mass
 * @returns {number}
 */
export function momentOfInertia(shape, mass) {
  if (mass <= 0) return 0;

  if (shape.type === ShapeType.CIRCLE) {
    return 0.5 * mass * shape.radius * shape.radius;
  }

  const vertices = shape.vertices;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = Math.abs(a.x * b.y - a.y * b.x);
    numerator += cross * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y);
    denominator += cross;
  }

  if (denominator < EPSILON) return 0;
  return (mass / 6) * (numerator / denominator);
}

/**
 * Transform a polygon's vertices into world space.
 * @param {PolygonShape} shape
 * @param {{ x: number, y: number }} position
 * @param {number} rotation
 * @returns {Vec2[]}
 */
export function worldVertices(shape, position, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return shape.vertices.map(
    (v) => new Vec2(position.x + v.x * cos - v.y * sin, position.y + v.x * sin + v.y * cos),
  );
}

/**
 * Rotate a polygon's edge normals into world space. Normals are directions, so the position is
 * deliberately not applied.
 * @param {PolygonShape} shape
 * @param {number} rotation
 * @returns {Vec2[]}
 */
export function worldNormals(shape, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return shape.normals.map((n) => new Vec2(n.x * cos - n.y * sin, n.x * sin + n.y * cos));
}
