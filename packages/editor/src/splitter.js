import { resizedSize } from './resize-math.js';

/**
 * A drag handle that resizes a panel, by writing pixel sizes into a CSS custom property.
 *
 * The custom-property approach is what keeps this generic: `Splitter` does not know or care
 * about the host page's grid layout, only that some CSS value should become `"{n}px"` while
 * dragging. `examples/editor`'s layout references `var(--tree-width, 240px)` etc. in its own
 * `grid-template-columns`/`rows`, so writing the property is enough to resize the whole grid
 * track — no grid-template string parsing needed anywhere.
 */
export class Splitter {
  /**
   * @param {HTMLElement} handle the draggable bar
   * @param {object} options
   * @param {'horizontal'|'vertical'} options.orientation `'horizontal'` drags left/right and
   *   resizes a width; `'vertical'` drags up/down and resizes a height
   * @param {HTMLElement} options.target element whose custom property is written
   * @param {string} options.property CSS custom property name, e.g. `'--tree-width'`
   * @param {number} options.initial starting size in pixels
   * @param {number} [options.min]
   * @param {number} [options.max]
   * @param {boolean} [options.invert] see `resize-math.js`'s `resizedSize` for what this means
   */
  constructor(handle, options) {
    /** @type {HTMLElement} */
    this.handle = handle;
    /** @type {HTMLElement} */
    this.target = options.target;
    /** @type {string} */
    this.property = options.property;
    /** @type {'horizontal'|'vertical'} */
    this.orientation = options.orientation;
    /** @type {number} */
    this.min = options.min ?? 100;
    /** @type {number} */
    this.max = options.max ?? 800;
    /** @type {boolean} */
    this.invert = options.invert ?? false;

    /** @type {number} */
    this.size = options.initial;
    this._apply();

    /** @type {{ startSize: number, startPointer: number } | null} @private */
    this._drag = null;

    /** @private */
    this._onPointerDown = (/** @type {PointerEvent} */ event) => {
      this._drag = { startSize: this.size, startPointer: this._pointerCoord(event) };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    /** @private */
    this._onPointerMove = (/** @type {PointerEvent} */ event) => {
      if (this._drag === null) return;
      const delta = this._pointerCoord(event) - this._drag.startPointer;
      this.size = resizedSize(this._drag.startSize, delta, this.min, this.max, this.invert);
      this._apply();
    };
    /** @private */
    this._onPointerUp = (/** @type {PointerEvent} */ event) => {
      this._drag = null;
      handle.releasePointerCapture?.(event.pointerId);
    };

    handle.addEventListener('pointerdown', this._onPointerDown);
    handle.addEventListener('pointermove', this._onPointerMove);
    handle.addEventListener('pointerup', this._onPointerUp);
    handle.addEventListener('pointercancel', this._onPointerUp);
  }

  /**
   * @param {PointerEvent} event
   * @returns {number}
   * @private
   */
  _pointerCoord(event) {
    return this.orientation === 'horizontal' ? event.clientX : event.clientY;
  }

  /** @private */
  _apply() {
    this.target.style.setProperty(this.property, `${this.size}px`);
  }

  /**
   * Set the size programmatically (a "reset to default" button, for instance).
   * @param {number} px
   * @returns {void}
   */
  setSize(px) {
    this.size = Math.min(this.max, Math.max(this.min, px));
    this._apply();
  }

  /** Remove every pointer listener. @returns {void} */
  dispose() {
    this.handle.removeEventListener('pointerdown', this._onPointerDown);
    this.handle.removeEventListener('pointermove', this._onPointerMove);
    this.handle.removeEventListener('pointerup', this._onPointerUp);
    this.handle.removeEventListener('pointercancel', this._onPointerUp);
  }
}
