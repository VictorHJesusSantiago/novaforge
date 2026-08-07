import { Vec2 } from './vec2.js';

/**
 * An axis-aligned bounding box stored as min/max corners.
 *
 * This is the query form used by the physics broadphase. Min/max is the right layout there
 * because overlap tests are four comparisons with no arithmetic, and because merging boxes
 * (which the quadtree does constantly) is four min/max operations.
 */
export class AABB {
  /**
   * @param {number} [minX]
   * @param {number} [minY]
   * @param {number} [maxX]
   * @param {number} [maxY]
   */
  constructor(minX = 0, minY = 0, maxX = 0, maxY = 0) {
    /** @type {number} */
    this.minX = minX;
    /** @type {number} */
    this.minY = minY;
    /** @type {number} */
    this.maxX = maxX;
    /** @type {number} */
    this.maxY = maxY;
  }

  /**
   * @param {{ x: number, y: number }} center
   * @param {number} halfWidth
   * @param {number} halfHeight
   * @returns {AABB}
   */
  static fromCenter(center, halfWidth, halfHeight) {
    return new AABB(
      center.x - halfWidth,
      center.y - halfHeight,
      center.x + halfWidth,
      center.y + halfHeight,
    );
  }

  /**
   * Smallest box containing every point. Returns an empty box for an empty input.
   * @param {Array<{ x: number, y: number }>} points
   * @returns {AABB}
   */
  static fromPoints(points) {
    if (points.length === 0) return new AABB(0, 0, 0, 0);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return new AABB(minX, minY, maxX, maxY);
  }

  /**
   * @param {{ x: number, y: number }} center
   * @param {number} radius
   * @returns {AABB}
   */
  static fromCircle(center, radius) {
    return new AABB(center.x - radius, center.y - radius, center.x + radius, center.y + radius);
  }

  get width() {
    return this.maxX - this.minX;
  }

  get height() {
    return this.maxY - this.minY;
  }

  /** @returns {Vec2} */
  get center() {
    return new Vec2((this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2);
  }

  /** @returns {number} */
  get area() {
    return this.width * this.height;
  }

  /** @returns {number} half the box perimeter — the SAH cost metric, used when tuning the tree. */
  get perimeterHalf() {
    return this.width + this.height;
  }

  /** @returns {AABB} */
  clone() {
    return new AABB(this.minX, this.minY, this.maxX, this.maxY);
  }

  /**
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   * @returns {this}
   */
  set(minX, minY, maxX, maxY) {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
    return this;
  }

  /**
   * @param {{ x: number, y: number }} point
   * @returns {boolean}
   */
  containsPoint(point) {
    return (
      point.x >= this.minX &&
      point.x <= this.maxX &&
      point.y >= this.minY &&
      point.y <= this.maxY
    );
  }

  /**
   * @param {AABB} other
   * @returns {boolean}
   */
  contains(other) {
    return (
      other.minX >= this.minX &&
      other.minY >= this.minY &&
      other.maxX <= this.maxX &&
      other.maxY <= this.maxY
    );
  }

  /**
   * Overlap test. Touching boxes count as overlapping here — the broadphase must be
   * conservative, since a false positive costs one narrowphase call and a false negative
   * costs a missed collision.
   * @param {AABB} other
   * @returns {boolean}
   */
  overlaps(other) {
    return (
      this.minX <= other.maxX &&
      this.maxX >= other.minX &&
      this.minY <= other.maxY &&
      this.maxY >= other.minY
    );
  }

  /**
   * @param {AABB} other
   * @returns {AABB} the smallest box containing both.
   */
  merge(other) {
    return new AABB(
      Math.min(this.minX, other.minX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY),
    );
  }

  /**
   * @param {number} amount
   * @returns {AABB}
   */
  expand(amount) {
    return new AABB(
      this.minX - amount,
      this.minY - amount,
      this.maxX + amount,
      this.maxY + amount,
    );
  }

  /**
   * Expand along a motion vector — a cheap swept bound, used to catch fast movers before
   * proper continuous collision detection exists.
   * @param {{ x: number, y: number }} motion
   * @returns {AABB}
   */
  sweep(motion) {
    return new AABB(
      Math.min(this.minX, this.minX + motion.x),
      Math.min(this.minY, this.minY + motion.y),
      Math.max(this.maxX, this.maxX + motion.x),
      Math.max(this.maxY, this.maxY + motion.y),
    );
  }

  /**
   * @param {{ x: number, y: number }} point
   * @returns {Vec2} the closest point on or inside the box.
   */
  closestPoint(point) {
    return new Vec2(
      Math.min(Math.max(point.x, this.minX), this.maxX),
      Math.min(Math.max(point.y, this.minY), this.maxY),
    );
  }

  /**
   * Slab-method ray cast.
   * @param {{ x: number, y: number }} origin
   * @param {{ x: number, y: number }} direction  need not be normalised
   * @param {number} [maxDistance]
   * @returns {number | null} distance along `direction` to the entry point, or `null` for a miss.
   */
  raycast(origin, direction, maxDistance = Infinity) {
    let tMin = 0;
    let tMax = maxDistance;

    // x slab. A zero direction component means the ray is parallel to the slab: it either
    // starts inside it (no constraint) or misses entirely.
    if (Math.abs(direction.x) < 1e-9) {
      if (origin.x < this.minX || origin.x > this.maxX) return null;
    } else {
      const invD = 1 / direction.x;
      let t1 = (this.minX - origin.x) * invD;
      let t2 = (this.maxX - origin.x) * invD;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    // y slab
    if (Math.abs(direction.y) < 1e-9) {
      if (origin.y < this.minY || origin.y > this.maxY) return null;
    } else {
      const invD = 1 / direction.y;
      let t1 = (this.minY - origin.y) * invD;
      let t2 = (this.maxY - origin.y) * invD;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    return tMin;
  }

  /**
   * @param {AABB} other
   * @returns {boolean}
   */
  equals(other) {
    return (
      this.minX === other.minX &&
      this.minY === other.minY &&
      this.maxX === other.maxX &&
      this.maxY === other.maxY
    );
  }

  /** @returns {{ minX: number, minY: number, maxX: number, maxY: number }} */
  toJSON() {
    return { minX: this.minX, minY: this.minY, maxX: this.maxX, maxY: this.maxY };
  }

  /** @returns {string} */
  toString() {
    return `AABB(${this.minX}, ${this.minY} .. ${this.maxX}, ${this.maxY})`;
  }
}
