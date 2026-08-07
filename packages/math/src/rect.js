import { Vec2 } from './vec2.js';

/**
 * An axis-aligned rectangle defined by its top-left corner plus a size.
 *
 * Distinct from {@link import('./aabb.js').AABB}, which stores min/max. Rect is the authoring
 * form — texture source rects, viewports, UI layout — and AABB is the query form used by the
 * broadphase. Keeping them separate stops "is `height` inclusive?" bugs at the boundary.
 */
export class Rect {
  /**
   * @param {number} [x]
   * @param {number} [y]
   * @param {number} [width]
   * @param {number} [height]
   */
  constructor(x = 0, y = 0, width = 0, height = 0) {
    /** @type {number} */
    this.x = x;
    /** @type {number} */
    this.y = y;
    /** @type {number} */
    this.width = width;
    /** @type {number} */
    this.height = height;
  }

  /**
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   * @returns {Rect}
   */
  static fromBounds(minX, minY, maxX, maxY) {
    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * @param {{ x: number, y: number }} center
   * @param {number} width
   * @param {number} height
   * @returns {Rect}
   */
  static fromCenter(center, width, height) {
    return new Rect(center.x - width / 2, center.y - height / 2, width, height);
  }

  get left() {
    return this.x;
  }

  get right() {
    return this.x + this.width;
  }

  get top() {
    return this.y;
  }

  get bottom() {
    return this.y + this.height;
  }

  /** @returns {Vec2} */
  get center() {
    return new Vec2(this.x + this.width / 2, this.y + this.height / 2);
  }

  /** @returns {number} */
  get area() {
    return this.width * this.height;
  }

  /** @returns {Rect} */
  clone() {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @returns {this}
   */
  set(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }

  /**
   * @param {{ x: number, y: number }} point
   * @returns {boolean} true if `point` is inside. Left and top edges are inclusive, right and
   *   bottom are exclusive, so adjacent rects tile without overlap.
   */
  containsPoint(point) {
    return (
      point.x >= this.x &&
      point.x < this.right &&
      point.y >= this.y &&
      point.y < this.bottom
    );
  }

  /**
   * @param {Rect} other
   * @returns {boolean} true if `other` is fully inside this rect.
   */
  containsRect(other) {
    return (
      other.x >= this.x &&
      other.y >= this.y &&
      other.right <= this.right &&
      other.bottom <= this.bottom
    );
  }

  /**
   * @param {Rect} other
   * @returns {boolean} true if the rects overlap. Touching edges do not count as overlapping.
   */
  intersects(other) {
    return (
      this.x < other.right &&
      this.right > other.x &&
      this.y < other.bottom &&
      this.bottom > other.y
    );
  }

  /**
   * @param {Rect} other
   * @returns {Rect | null} the overlapping region, or `null` if they do not overlap.
   */
  intersection(other) {
    const minX = Math.max(this.x, other.x);
    const minY = Math.max(this.y, other.y);
    const maxX = Math.min(this.right, other.right);
    const maxY = Math.min(this.bottom, other.bottom);
    if (maxX <= minX || maxY <= minY) return null;
    return Rect.fromBounds(minX, minY, maxX, maxY);
  }

  /**
   * @param {Rect} other
   * @returns {Rect} the smallest rect containing both.
   */
  union(other) {
    return Rect.fromBounds(
      Math.min(this.x, other.x),
      Math.min(this.y, other.y),
      Math.max(this.right, other.right),
      Math.max(this.bottom, other.bottom),
    );
  }

  /**
   * Grow (or shrink, with a negative amount) in every direction.
   * @param {number} amount
   * @returns {Rect}
   */
  inflate(amount) {
    return new Rect(
      this.x - amount,
      this.y - amount,
      this.width + amount * 2,
      this.height + amount * 2,
    );
  }

  /**
   * @param {number} dx
   * @param {number} dy
   * @returns {Rect}
   */
  translate(dx, dy) {
    return new Rect(this.x + dx, this.y + dy, this.width, this.height);
  }

  /**
   * Split into four equal quadrants, in the order the quadtree expects:
   * north-west, north-east, south-west, south-east.
   * @returns {[Rect, Rect, Rect, Rect]}
   */
  subdivide() {
    const hw = this.width / 2;
    const hh = this.height / 2;
    return [
      new Rect(this.x, this.y, hw, hh),
      new Rect(this.x + hw, this.y, hw, hh),
      new Rect(this.x, this.y + hh, hw, hh),
      new Rect(this.x + hw, this.y + hh, hw, hh),
    ];
  }

  /**
   * @param {Rect} other
   * @returns {boolean}
   */
  equals(other) {
    return (
      this.x === other.x &&
      this.y === other.y &&
      this.width === other.width &&
      this.height === other.height
    );
  }

  /** @returns {{ x: number, y: number, width: number, height: number }} */
  toJSON() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /** @returns {string} */
  toString() {
    return `Rect(${this.x}, ${this.y}, ${this.width}x${this.height})`;
  }
}
