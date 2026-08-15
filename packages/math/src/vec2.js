import { EPSILON, clamp, lerp } from './mathf.js';

/**
 * A 2D vector.
 *
 * Mutating methods (`addSelf`, `scaleSelf`, …) exist alongside allocating ones because the
 * physics inner loop runs thousands of times per step and cannot afford an allocation per
 * operation. Gameplay code should prefer the allocating variants; hot loops use the `*Self` ones.
 */
export class Vec2 {
  /**
   * @param {number} [x]
   * @param {number} [y]
   */
  constructor(x = 0, y = 0) {
    /** @type {number} */
    this.x = x;
    /** @type {number} */
    this.y = y;
  }


  /** @returns {Vec2} */
  static zero() {
    return new Vec2(0, 0);
  }

  /** @returns {Vec2} */
  static one() {
    return new Vec2(1, 1);
  }

  /** @returns {Vec2} */
  static up() {
    return new Vec2(0, -1);
  }

  /** @returns {Vec2} */
  static down() {
    return new Vec2(0, 1);
  }

  /** @returns {Vec2} */
  static left() {
    return new Vec2(-1, 0);
  }

  /** @returns {Vec2} */
  static right() {
    return new Vec2(1, 0);
  }

  /**
   * Unit vector at `radians` from the +x axis.
   * @param {number} radians
   * @param {number} [length]
   * @returns {Vec2}
   */
  static fromAngle(radians, length = 1) {
    return new Vec2(Math.cos(radians) * length, Math.sin(radians) * length);
  }

  /**
   * @param {{ x: number, y: number }} source
   * @returns {Vec2}
   */
  static from(source) {
    return new Vec2(source.x, source.y);
  }


  /** @returns {Vec2} */
  clone() {
    return new Vec2(this.x, this.y);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {this}
   */
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {this}
   */
  copyFrom(other) {
    this.x = other.x;
    this.y = other.y;
    return this;
  }


  /**
   * @param {{ x: number, y: number }} other
   * @returns {Vec2}
   */
  add(other) {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {this}
   */
  addSelf(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {Vec2}
   */
  sub(other) {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {this}
   */
  subSelf(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  /**
   * @param {number} scalar
   * @returns {Vec2}
   */
  scale(scalar) {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  /**
   * @param {number} scalar
   * @returns {this}
   */
  scaleSelf(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  /**
   * Component-wise multiply. Distinct from {@link scale}, which takes a scalar.
   * @param {{ x: number, y: number }} other
   * @returns {Vec2}
   */
  multiply(other) {
    return new Vec2(this.x * other.x, this.y * other.y);
  }

  /**
   * Add `other * scalar` in one step — the single most common operation in an integrator.
   * @param {{ x: number, y: number }} other
   * @param {number} scalar
   * @returns {this}
   */
  addScaledSelf(other, scalar) {
    this.x += other.x * scalar;
    this.y += other.y * scalar;
    return this;
  }

  /** @returns {Vec2} */
  negate() {
    return new Vec2(-this.x, -this.y);
  }


  /** @returns {number} */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Squared length. Prefer this for comparisons — it avoids a square root.
   * @returns {number}
   */
  lengthSquared() {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {number}
   */
  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {number}
   */
  distanceSquaredTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {number}
   */
  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  /**
   * The z component of the 3D cross product. Its sign tells you which side `other` is on,
   * which is what the SAT narrowphase uses to orient contact normals.
   * @param {{ x: number, y: number }} other
   * @returns {number}
   */
  cross(other) {
    return this.x * other.y - this.y * other.x;
  }

  /** @returns {number} angle from the +x axis, in radians, in (-PI, PI]. */
  angle() {
    return Math.atan2(this.y, this.x);
  }

  /**
   * @param {{ x: number, y: number }} other
   * @returns {number} signed angle from this vector to `other`.
   */
  angleTo(other) {
    return Math.atan2(this.cross(other), this.dot(other));
  }


  /**
   * @returns {Vec2} unit vector, or a zero vector if this vector has no direction.
   */
  normalized() {
    const len = this.length();
    if (len < EPSILON) return new Vec2(0, 0);
    return new Vec2(this.x / len, this.y / len);
  }

  /** @returns {this} */
  normalizeSelf() {
    const len = this.length();
    if (len < EPSILON) {
      this.x = 0;
      this.y = 0;
    } else {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  /**
   * @param {number} max
   * @returns {Vec2} this vector, shortened to `max` if it is longer.
   */
  clampLength(max) {
    const lenSq = this.lengthSquared();
    if (lenSq <= max * max || lenSq < EPSILON) return this.clone();
    return this.scale(max / Math.sqrt(lenSq));
  }

  /**
   * Rotate counter-clockwise by `radians`.
   * @param {number} radians
   * @returns {Vec2}
   */
  rotate(radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vec2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  /**
   * Rotate around an arbitrary pivot.
   * @param {number} radians
   * @param {{ x: number, y: number }} pivot
   * @returns {Vec2}
   */
  rotateAround(radians, pivot) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = this.x - pivot.x;
    const dy = this.y - pivot.y;
    return new Vec2(pivot.x + dx * cos - dy * sin, pivot.y + dx * sin + dy * cos);
  }

  /**
   * The left-hand perpendicular. Used to derive separating axes from polygon edges.
   * @returns {Vec2}
   */
  perpendicular() {
    return new Vec2(-this.y, this.x);
  }

  /**
   * Reflect across a surface normal. `normal` is assumed to be unit length.
   * @param {{ x: number, y: number }} normal
   * @returns {Vec2}
   */
  reflect(normal) {
    const d = 2 * this.dot(normal);
    return new Vec2(this.x - d * normal.x, this.y - d * normal.y);
  }

  /**
   * Projection of this vector onto `other`.
   * @param {{ x: number, y: number }} other
   * @returns {Vec2}
   */
  projectOnto(other) {
    const lenSq = other.x * other.x + other.y * other.y;
    if (lenSq < EPSILON) return new Vec2(0, 0);
    const scalar = this.dot(other) / lenSq;
    return new Vec2(other.x * scalar, other.y * scalar);
  }

  /**
   * @param {{ x: number, y: number }} other
   * @param {number} t
   * @returns {Vec2}
   */
  lerp(other, t) {
    return new Vec2(lerp(this.x, other.x, t), lerp(this.y, other.y, t));
  }

  /**
   * Step toward `target` by at most `maxDelta`, without overshooting.
   * @param {{ x: number, y: number }} target
   * @param {number} maxDelta
   * @returns {Vec2}
   */
  moveTowards(target, maxDelta) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= maxDelta * maxDelta || distSq < EPSILON) {
      return new Vec2(target.x, target.y);
    }
    const dist = Math.sqrt(distSq);
    return new Vec2(this.x + (dx / dist) * maxDelta, this.y + (dy / dist) * maxDelta);
  }

  /**
   * @param {{ x: number, y: number }} min
   * @param {{ x: number, y: number }} max
   * @returns {Vec2}
   */
  clampComponents(min, max) {
    return new Vec2(clamp(this.x, min.x, max.x), clamp(this.y, min.y, max.y));
  }


  /**
   * @param {{ x: number, y: number }} other
   * @param {number} [tolerance]
   * @returns {boolean}
   */
  equals(other, tolerance = EPSILON) {
    return Math.abs(this.x - other.x) <= tolerance && Math.abs(this.y - other.y) <= tolerance;
  }

  /** @returns {boolean} */
  isZero() {
    return this.lengthSquared() < EPSILON * EPSILON;
  }

  /** @returns {boolean} true if both components are finite numbers. */
  isFinite() {
    return Number.isFinite(this.x) && Number.isFinite(this.y);
  }


  /** @returns {{ x: number, y: number }} */
  toJSON() {
    return { x: this.x, y: this.y };
  }

  /** @returns {string} */
  toString() {
    return `Vec2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }
}
