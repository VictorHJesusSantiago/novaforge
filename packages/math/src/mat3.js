import { Vec2 } from './vec2.js';
import { EPSILON } from './mathf.js';

/**
 * A 3x3 affine transform, stored column-major to match the layout WebGL expects, so the
 * WebGL2 backend can upload `m` directly with no repacking.
 *
 * ```
 * | m0  m3  m6 |
 * | m1  m4  m7 |
 * | m2  m5  m8 |
 * ```
 *
 * For a 2D affine transform the bottom row is always `(0, 0, 1)`; it is stored anyway so the
 * matrix can be handed to `uniformMatrix3fv` unchanged.
 */
export class Mat3 {
  constructor() {
    /** @type {Float32Array} column-major, 9 elements */
    this.m = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  /** @returns {Mat3} */
  static identity() {
    return new Mat3();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {Mat3}
   */
  static translation(x, y) {
    const out = new Mat3();
    out.m[6] = x;
    out.m[7] = y;
    return out;
  }

  /**
   * @param {number} radians
   * @returns {Mat3}
   */
  static rotation(radians) {
    const out = new Mat3();
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    out.m[0] = cos;
    out.m[1] = sin;
    out.m[3] = -sin;
    out.m[4] = cos;
    return out;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {Mat3}
   */
  static scaling(x, y) {
    const out = new Mat3();
    out.m[0] = x;
    out.m[4] = y;
    return out;
  }

  /**
   * Build translate * rotate * scale in one pass.
   *
   * Composing three matrices and multiplying them would cost 54 multiplies; this costs 4.
   * Every sprite in the draw list goes through here, so it is worth the explicit form.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} radians
   * @param {number} scaleX
   * @param {number} scaleY
   * @returns {Mat3}
   */
  static compose(x, y, radians, scaleX, scaleY) {
    const out = new Mat3();
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    out.m[0] = cos * scaleX;
    out.m[1] = sin * scaleX;
    out.m[3] = -sin * scaleY;
    out.m[4] = cos * scaleY;
    out.m[6] = x;
    out.m[7] = y;
    return out;
  }

  /** @returns {Mat3} */
  clone() {
    const out = new Mat3();
    out.m.set(this.m);
    return out;
  }

  /**
   * @param {Mat3} other
   * @returns {this}
   */
  copyFrom(other) {
    this.m.set(other.m);
    return this;
  }

  /** @returns {this} */
  setIdentity() {
    this.m.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    return this;
  }

  /**
   * `this * other`, i.e. apply `other` first, then `this`.
   * @param {Mat3} other
   * @returns {Mat3}
   */
  multiply(other) {
    const a = this.m;
    const b = other.m;
    const out = new Mat3();
    const o = out.m;

    o[0] = a[0] * b[0] + a[3] * b[1] + a[6] * b[2];
    o[1] = a[1] * b[0] + a[4] * b[1] + a[7] * b[2];
    o[2] = a[2] * b[0] + a[5] * b[1] + a[8] * b[2];

    o[3] = a[0] * b[3] + a[3] * b[4] + a[6] * b[5];
    o[4] = a[1] * b[3] + a[4] * b[4] + a[7] * b[5];
    o[5] = a[2] * b[3] + a[5] * b[4] + a[8] * b[5];

    o[6] = a[0] * b[6] + a[3] * b[7] + a[6] * b[8];
    o[7] = a[1] * b[6] + a[4] * b[7] + a[7] * b[8];
    o[8] = a[2] * b[6] + a[5] * b[7] + a[8] * b[8];

    return out;
  }

  /**
   * Transform a point (translation applies).
   * @param {{ x: number, y: number }} point
   * @returns {Vec2}
   */
  transformPoint(point) {
    const m = this.m;
    return new Vec2(
      m[0] * point.x + m[3] * point.y + m[6],
      m[1] * point.x + m[4] * point.y + m[7],
    );
  }

  /**
   * Transform a direction (translation is ignored). Use this for normals and velocities.
   * @param {{ x: number, y: number }} vector
   * @returns {Vec2}
   */
  transformVector(vector) {
    const m = this.m;
    return new Vec2(m[0] * vector.x + m[3] * vector.y, m[1] * vector.x + m[4] * vector.y);
  }

  /** @returns {number} determinant of the 2x2 linear part. */
  determinant() {
    const m = this.m;
    return m[0] * m[4] - m[1] * m[3];
  }

  /**
   * @returns {Mat3 | null} the inverse, or `null` if the matrix is singular.
   *   Callers must handle `null`; a zero-scaled entity produces exactly this case, and
   *   silently returning identity would place clicks at the wrong world position.
   */
  inverse() {
    const m = this.m;
    const det = this.determinant();
    if (Math.abs(det) < EPSILON) return null;

    const invDet = 1 / det;
    const out = new Mat3();
    const o = out.m;

    o[0] = m[4] * invDet;
    o[1] = -m[1] * invDet;
    o[3] = -m[3] * invDet;
    o[4] = m[0] * invDet;
    o[6] = (m[3] * m[7] - m[4] * m[6]) * invDet;
    o[7] = (m[1] * m[6] - m[0] * m[7]) * invDet;
    o[8] = 1;

    return out;
  }

  /**
   * Decompose back into translation, rotation, and scale.
   * Only valid for matrices built from {@link compose} — a sheared matrix will not round-trip.
   * @returns {{ x: number, y: number, rotation: number, scaleX: number, scaleY: number }}
   */
  decompose() {
    const m = this.m;
    const scaleX = Math.hypot(m[0], m[1]);
    const scaleY = Math.hypot(m[3], m[4]);
    // A negative determinant means one axis is mirrored; attribute it to y by convention.
    const sign = this.determinant() < 0 ? -1 : 1;
    return {
      x: m[6],
      y: m[7],
      rotation: Math.atan2(m[1], m[0]),
      scaleX,
      scaleY: scaleY * sign,
    };
  }

  /**
   * @param {Mat3} other
   * @param {number} [tolerance]
   * @returns {boolean}
   */
  equals(other, tolerance = EPSILON) {
    for (let i = 0; i < 9; i += 1) {
      if (Math.abs(this.m[i] - other.m[i]) > tolerance) return false;
    }
    return true;
  }

  /** @returns {number[]} */
  toArray() {
    return Array.from(this.m);
  }

  /** @returns {string} */
  toString() {
    const m = this.m;
    const f = (/** @type {number} */ v) => v.toFixed(2).padStart(7);
    return [
      `Mat3[${f(m[0])} ${f(m[3])} ${f(m[6])}`,
      `     ${f(m[1])} ${f(m[4])} ${f(m[7])}`,
      `     ${f(m[2])} ${f(m[5])} ${f(m[8])}]`,
    ].join('\n');
  }
}
