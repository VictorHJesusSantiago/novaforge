/**
 * The backend interface (SPEC Invariant R1).
 *
 * Every backend consumes the identical `DrawList`. Nothing that cannot be expressed as a draw
 * command may be added here, however convenient a particular backend would make it — the moment
 * one backend gains a capability the other cannot express, the abstraction is decorative and
 * the WebGL2 work in Milestone 6 becomes a rewrite instead of an addition.
 *
 * This is an abstract base rather than a duck-typed convention so that a half-implemented
 * backend fails loudly at construction rather than silently drawing nothing.
 */
export class Renderer {
  constructor() {
    if (new.target === Renderer) {
      throw new TypeError('Renderer is abstract; construct a backend such as Canvas2DRenderer');
    }

    /** @type {number} */
    this.width = 0;

    /** @type {number} */
    this.height = 0;

    /** Draw calls issued in the last frame — the number Milestone 6 exists to reduce. */
    this.drawCalls = 0;
  }

  /**
   * @param {number} _width
   * @param {number} _height
   * @returns {void}
   */
  resize(_width, _height) {
    throw new Error(`${this.constructor.name} must implement resize()`);
  }

  /**
   * Prepare for a frame: clear, reset state.
   * @returns {void}
   */
  beginFrame() {
    throw new Error(`${this.constructor.name} must implement beginFrame()`);
  }

  /**
   * Draw a sorted draw list through a camera.
   * @param {import('./draw-list.js').DrawList} _drawList
   * @param {import('./camera.js').Camera2D} _camera
   * @returns {void}
   */
  submit(_drawList, _camera) {
    throw new Error(`${this.constructor.name} must implement submit()`);
  }

  /**
   * Finish the frame: flush batches, present.
   * @returns {void}
   */
  endFrame() {
    throw new Error(`${this.constructor.name} must implement endFrame()`);
  }

  /**
   * Release GPU or DOM resources.
   * @returns {void}
   */
  dispose() {
  }

  /**
   * @returns {{ backend: string, width: number, height: number, drawCalls: number }}
   */
  stats() {
    return {
      backend: this.constructor.name,
      width: this.width,
      height: this.height,
      drawCalls: this.drawCalls,
    };
  }
}
