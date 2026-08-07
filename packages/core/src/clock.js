/**
 * The fixed-timestep clock (SPEC §7, ADR-0004).
 *
 * The simulation advances in constant increments regardless of how fast the display refreshes.
 * That is what makes the same inputs produce the same result on a 60 Hz laptop and a 165 Hz
 * desktop, which the replay recorder and the editor's play/stop snapshot both depend on.
 *
 * ```js
 * const clock = new Clock();
 * const { steps, alpha, delta } = clock.advance(now);
 * for (let i = 0; i < steps; i += 1) world.runStage('fixedUpdate', clock.fixedDelta);
 * world.runStage('update', delta);
 * renderer.render(world, alpha);
 * ```
 */
export class Clock {
  /**
   * @param {object} [options]
   * @param {number} [options.fixedDelta] seconds per simulation step. Default 1/60.
   * @param {number} [options.maxFrameTime] the largest real delta the accumulator will accept,
   *   in seconds. Default 0.25.
   * @param {number} [options.timeScale] simulation speed multiplier.
   */
  constructor(options = {}) {
    /** @type {number} */
    this.fixedDelta = options.fixedDelta ?? 1 / 60;

    /**
     * The spiral-of-death guard (Invariant T1).
     *
     * If a frame takes 3 seconds — a tab restored from the background, a long GC pause — the
     * accumulator would owe 180 fixed steps. Running them makes the next frame slower still,
     * which owes even more, and the page locks up. Clamping the *input* means the simulation
     * silently runs slow for one frame instead, which is recoverable and invisible.
     * @type {number}
     */
    this.maxFrameTime = options.maxFrameTime ?? 0.25;

    /** @type {number} 0 pauses the simulation; 0.5 is slow motion; 2 is double speed. */
    this.timeScale = options.timeScale ?? 1;

    /** @type {number} unconsumed simulation time, in seconds. @private */
    this._accumulator = 0;

    /** @type {number | null} timestamp of the previous `advance`, in ms. @private */
    this._lastTime = null;

    /** @type {number} scaled seconds since the clock started. */
    this.elapsed = 0;

    /** @type {number} unscaled seconds since the clock started — for UI, which ignores pause. */
    this.elapsedUnscaled = 0;

    /** @type {number} frames advanced. */
    this.frame = 0;

    /** @type {number} fixed steps run. */
    this.step = 0;

    /** @type {number} the last real frame delta, in seconds, after clamping. */
    this.delta = 0;

    /** @type {number} smoothed frames per second. */
    this.fps = 0;

    /** @type {number} exponential smoothing factor for {@link fps}. @private */
    this._fpsSmoothing = 0.1;
  }

  /**
   * Advance the clock to `nowMs`.
   *
   * @param {number} nowMs a monotonic timestamp in milliseconds, as `performance.now()` or the
   *   argument `requestAnimationFrame` supplies.
   * @returns {{ steps: number, alpha: number, delta: number }}
   *   `steps` — how many `fixedUpdate` passes to run.
   *   `alpha` — how far between the last and next fixed step the render should interpolate, in
   *   [0, 1).
   *   `delta` — the real (clamped, scaled) frame time for variable-step systems.
   */
  advance(nowMs) {
    if (this._lastTime === null) {
      // The first frame has no previous timestamp. Reporting a delta of 0 is the only honest
      // answer; inventing 1/60 would make the first frame of a replay differ from the rest.
      this._lastTime = nowMs;
      this.frame += 1;
      this.delta = 0;
      return { steps: 0, alpha: 0, delta: 0 };
    }

    const realDelta = Math.max(0, (nowMs - this._lastTime) / 1000);
    this._lastTime = nowMs;

    const clamped = Math.min(realDelta, this.maxFrameTime);
    const scaled = clamped * this.timeScale;

    this.delta = scaled;
    this.elapsed += scaled;
    this.elapsedUnscaled += clamped;
    this.frame += 1;

    if (realDelta > 0) {
      const instantaneous = 1 / realDelta;
      this.fps =
        this.fps === 0
          ? instantaneous
          : this.fps + (instantaneous - this.fps) * this._fpsSmoothing;
    }

    this._accumulator += scaled;

    let steps = 0;
    while (this._accumulator >= this.fixedDelta) {
      this._accumulator -= this.fixedDelta;
      steps += 1;
    }
    this.step += steps;

    return {
      steps,
      alpha: this._accumulator / this.fixedDelta,
      delta: scaled,
    };
  }

  /**
   * Forget the previous timestamp so the next `advance` reports a zero delta.
   *
   * Call this after anything that stalls the loop — resuming from a paused editor, returning
   * from a background tab, finishing a long asset load. Without it the next frame reports the
   * entire stall as one delta, and even clamped that is a visible jump.
   */
  resync() {
    this._lastTime = null;
    this._accumulator = 0;
  }

  /** Reset every counter. */
  reset() {
    this._accumulator = 0;
    this._lastTime = null;
    this.elapsed = 0;
    this.elapsedUnscaled = 0;
    this.frame = 0;
    this.step = 0;
    this.delta = 0;
    this.fps = 0;
  }

  /** @returns {number} unconsumed simulation time, in seconds. Exposed for tests and debugging. */
  get accumulator() {
    return this._accumulator;
  }

  /**
   * @returns {number} the largest number of fixed steps a single frame can produce, given the
   *   current clamp. Useful as an assertion in tests and shown in the debug overlay.
   */
  get maxStepsPerFrame() {
    return Math.floor((this.maxFrameTime * this.timeScale) / this.fixedDelta) + 1;
  }
}
