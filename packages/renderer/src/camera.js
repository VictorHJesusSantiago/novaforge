import { Vec2, Mat3, AABB, clamp, smoothDamp } from '@novaforge/math';

/**
 * A 2D camera: position, zoom, rotation, and the projection between world and screen space.
 *
 * The camera owns no rendering. It produces a view matrix and a visible-bounds AABB, both of
 * which are plain data, which is why the culling tests run in Node with no canvas.
 */
export class Camera2D {
  /**
   * @param {object} [options]
   * @param {number} [options.viewportWidth]
   * @param {number} [options.viewportHeight]
   * @param {number} [options.zoom]
   */
  constructor(options = {}) {
    /** @type {Vec2} world position of the camera centre. */
    this.position = new Vec2(0, 0);

    /** @type {number} 2 shows half as much world, twice as large. */
    this.zoom = options.zoom ?? 1;

    /** @type {number} radians. */
    this.rotation = 0;

    /** @type {number} */
    this.viewportWidth = options.viewportWidth ?? 800;

    /** @type {number} */
    this.viewportHeight = options.viewportHeight ?? 600;

    /** @type {number} smallest allowed zoom. */
    this.minZoom = 0.05;

    /** @type {number} largest allowed zoom. */
    this.maxZoom = 64;

    /**
     * World-space rectangle the camera centre is confined to, or `null` for unbounded.
     * @type {AABB | null}
     */
    this.bounds = null;

    /** @type {{ velocity: number }} @private */
    this._followVelocityX = { velocity: 0 };

    /** @type {{ velocity: number }} @private */
    this._followVelocityY = { velocity: 0 };
  }

  /**
   * @param {number} width
   * @param {number} height
   * @returns {void}
   */
  resize(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * @param {number} value
   * @returns {void}
   */
  setZoom(value) {
    this.zoom = clamp(value, this.minZoom, this.maxZoom);
  }

  /**
   * Multiply the current zoom — the natural operation for a mouse wheel, where each notch
   * should feel like the same step whether zoomed in or out.
   * @param {number} factor
   * @returns {void}
   */
  zoomBy(factor) {
    this.setZoom(this.zoom * factor);
  }

  /**
   * Move the camera toward a target with critically damped smoothing.
   * @param {{ x: number, y: number }} target
   * @param {number} dt seconds
   * @param {number} [smoothTime] approximate seconds to catch up
   * @returns {void}
   */
  follow(target, dt, smoothTime = 0.15) {
    this.position.x = smoothDamp(this.position.x, target.x, this._followVelocityX, smoothTime, dt);
    this.position.y = smoothDamp(this.position.y, target.y, this._followVelocityY, smoothTime, dt);
    this.clampToBounds();
  }

  /**
   * Snap to a position, cancelling any follow momentum. Use on a scene change or a teleport,
   * where smoothing would produce a long slide across the level.
   * @param {{ x: number, y: number }} target
   * @returns {void}
   */
  snapTo(target) {
    this.position.set(target.x, target.y);
    this._followVelocityX.velocity = 0;
    this._followVelocityY.velocity = 0;
    this.clampToBounds();
  }

  /** Confine the camera centre to {@link bounds}, if one is set. */
  clampToBounds() {
    if (this.bounds === null) return;
    this.position.x = clamp(this.position.x, this.bounds.minX, this.bounds.maxX);
    this.position.y = clamp(this.position.y, this.bounds.minY, this.bounds.maxY);
  }

  /**
   * World space to screen space.
   *
   * The order is: translate by -position, rotate by -rotation, scale by zoom, then offset to the
   * viewport centre. Getting this order wrong is the classic camera bug — rotation would orbit
   * the world origin rather than the camera.
   *
   * @param {{ x: number, y: number }} point
   * @returns {Vec2}
   */
  worldToScreen(point) {
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;

    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    return new Vec2(
      rx * this.zoom + this.viewportWidth / 2,
      ry * this.zoom + this.viewportHeight / 2,
    );
  }

  /**
   * Screen space to world space — the exact inverse of {@link worldToScreen}.
   * This is what turns a mouse click into a world position, so the round trip is tested.
   * @param {{ x: number, y: number }} point
   * @returns {Vec2}
   */
  screenToWorld(point) {
    const sx = (point.x - this.viewportWidth / 2) / this.zoom;
    const sy = (point.y - this.viewportHeight / 2) / this.zoom;

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;

    return new Vec2(rx + this.position.x, ry + this.position.y);
  }

  /**
   * @returns {Mat3} the world-to-screen matrix, for backends that set a transform once per
   *   frame rather than transforming each command on the CPU.
   */
  viewMatrix() {
    return Mat3.translation(this.viewportWidth / 2, this.viewportHeight / 2)
      .multiply(Mat3.scaling(this.zoom, this.zoom))
      .multiply(Mat3.rotation(-this.rotation))
      .multiply(Mat3.translation(-this.position.x, -this.position.y));
  }

  /**
   * @returns {AABB} the world-space region currently visible.
   *
   * When the camera is rotated this returns the axis-aligned bound of the rotated view, which
   * is larger than what is actually on screen. That is the correct direction to err for
   * culling: too generous wastes a draw call, too tight makes sprites vanish at the edges.
   */
  visibleBounds() {
    const halfW = this.viewportWidth / 2 / this.zoom;
    const halfH = this.viewportHeight / 2 / this.zoom;

    if (this.rotation === 0) {
      return new AABB(
        this.position.x - halfW,
        this.position.y - halfH,
        this.position.x + halfW,
        this.position.y + halfH,
      );
    }

    const cos = Math.abs(Math.cos(this.rotation));
    const sin = Math.abs(Math.sin(this.rotation));
    const rotatedW = halfW * cos + halfH * sin;
    const rotatedH = halfW * sin + halfH * cos;

    return new AABB(
      this.position.x - rotatedW,
      this.position.y - rotatedH,
      this.position.x + rotatedW,
      this.position.y + rotatedH,
    );
  }

  /**
   * Zoom while keeping a fixed screen point anchored to the same world point — how every
   * map and editor viewport is expected to behave under a scroll wheel.
   * @param {{ x: number, y: number }} screenPoint
   * @param {number} factor
   * @returns {void}
   */
  zoomAround(screenPoint, factor) {
    const before = this.screenToWorld(screenPoint);
    this.zoomBy(factor);
    const after = this.screenToWorld(screenPoint);
    this.position.x += before.x - after.x;
    this.position.y += before.y - after.y;
    this.clampToBounds();
  }
}
