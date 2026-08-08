import { Clock } from '@novaforge/core';

/**
 * The frame loop: turns wall-clock time into stage invocations.
 *
 * Kept separate from `Game` so it can be driven by something other than
 * `requestAnimationFrame` — the test suite steps it by hand, and the editor drives it one frame
 * at a time for its step button. The scheduler abstraction is one function, and it is what makes
 * "run 1000 frames headlessly" a two-line test rather than a browser automation problem.
 */
export class Loop {
  /**
   * @param {object} options
   * @param {(now: number) => void} options.onFrame
   * @param {Clock} [options.clock]
   * @param {(callback: (now: number) => void) => number} [options.schedule]
   *   defaults to `requestAnimationFrame`
   * @param {(handle: number) => void} [options.cancel]
   */
  constructor(options) {
    /** @type {Clock} */
    this.clock = options.clock ?? new Clock();

    /** @type {(now: number) => void} @private */
    this._onFrame = options.onFrame;

    /** @type {(callback: (now: number) => void) => number} @private */
    this._schedule =
      options.schedule ??
      ((callback) => /** @type {any} */ (globalThis).requestAnimationFrame(callback));

    /** @type {(handle: number) => void} @private */
    this._cancel =
      options.cancel ?? ((handle) => /** @type {any} */ (globalThis).cancelAnimationFrame(handle));

    /** @type {number | null} @private */
    this._handle = null;

    /** @type {boolean} */
    this.running = false;
  }

  /** Begin looping. @returns {void} */
  start() {
    if (this.running) return;
    this.running = true;
    // Forget any timestamp from before the pause, so the first frame back does not report the
    // entire idle period as one delta.
    this.clock.resync();
    this._queue();
  }

  /** Stop looping. @returns {void} */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._handle !== null) {
      this._cancel(this._handle);
      this._handle = null;
    }
  }

  /**
   * Run exactly one frame, whether or not the loop is running. The editor's step button, and
   * how the tests drive the whole engine.
   * @param {number} now milliseconds
   * @returns {void}
   */
  tick(now) {
    this._onFrame(now);
  }

  /** @private */
  _queue() {
    this._handle = this._schedule((now) => {
      if (!this.running) return;
      this._onFrame(now);
      this._queue();
    });
  }
}
