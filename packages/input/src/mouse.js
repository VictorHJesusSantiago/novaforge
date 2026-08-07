/**
 * Mouse button indices, matching the DOM's `MouseEvent.button`.
 * @readonly
 * @enum {number}
 */
export const MouseButton = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  BACK: 3,
  FORWARD: 4,
};

/**
 * Mouse state for one frame.
 *
 * Screen and world coordinates are both carried. The world position is filled in by the input
 * system using the active camera; without a camera it stays equal to the screen position, which
 * is the correct degenerate answer rather than a crash.
 */
export class MouseState {
  constructor() {
    /** @type {number} position in CSS pixels relative to the canvas. */
    this.x = 0;

    /** @type {number} */
    this.y = 0;

    /** @type {number} movement since the previous frame. */
    this.deltaX = 0;

    /** @type {number} */
    this.deltaY = 0;

    /** @type {number} world-space position, projected through the active camera. */
    this.worldX = 0;

    /** @type {number} */
    this.worldY = 0;

    /**
     * Accumulated wheel movement this frame. Normalised to notches rather than raw pixels,
     * because the raw value differs by an order of magnitude between a mouse wheel and a
     * trackpad, and every consumer would otherwise have to normalise it itself.
     * @type {number}
     */
    this.wheel = 0;

    /** @type {boolean} true while the pointer is over the attached element. */
    this.inside = false;
  }
}
