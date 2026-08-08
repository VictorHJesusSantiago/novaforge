/**
 * Deterministic replay: record every raw input event and every frame timestamp, then feed both
 * back through `Game.frame()` to reproduce a session exactly.
 *
 * "Exactly" rests on three things this engine already guarantees on its own, that replay does
 * not have to re-earn: the fixed-step `Clock` turns identical timestamps into identical
 * `steps`/`delta`/`alpha` (ADR-0004); the physics solver is order-independent (Invariant P2);
 * and `Rng` is seeded (SPEC §1). Replay's only job is to make the *inputs* to that machinery —
 * device events and frame timestamps — reproducible too. Get those two things back to the
 * engine in the same shape they arrived in originally, and the rest follows for free.
 *
 * **How recording works.** `InputManager`'s `push*` methods (`pushKeyDown`, `pushMouseMove`, …)
 * are the *entire* raw-event surface — every DOM listener funnels through them (see
 * `InputManager.attach`). `ReplayRecorder` wraps those methods on a specific instance (an own
 * property shadows the prototype method for that instance only, so nothing else is affected) to
 * log `{ frame, method, args }` before forwarding to the real implementation. No InputManager
 * changes were needed to make this possible — it was already the narrowest possible surface.
 *
 * **The integration contract.** Call `recorder.recordFrame(now)` (recording) or
 * `player.nextFrame()` (playback) once per frame, **before** `game.frame(now)` — timestamps and
 * queued input both have to land before `preUpdate`'s `InputManager.update()` promotes pending
 * state into that frame's readable snapshot.
 */

/**
 * @typedef {object} ReplayEvent
 * @property {number} frame
 * @property {string} method one of InputManager's `push*` method names
 * @property {any[]} args
 *
 * @typedef {object} Recording
 * @property {number} version
 * @property {number[]} timestamps one entry per recorded frame, in call order
 * @property {ReplayEvent[]} events sorted by `frame`
 */

/** The recording format version this module reads and writes. */
export const REPLAY_FORMAT_VERSION = 1;

/** Every `InputManager` method that originates a raw device event. */
const RECORDED_METHODS = [
  'pushKeyDown',
  'pushKeyUp',
  'pushMouseDown',
  'pushMouseUp',
  'pushMouseMove',
  'pushWheel',
  'pushMouseLeave',
  'pushGamepadState',
];

export class ReplayRecorder {
  /**
   * @param {import('@novaforge/input').InputManager} input the instance to record — typically
   *   `game.input`
   */
  constructor(input) {
    /** @type {import('@novaforge/input').InputManager} */
    this.input = input;

    /** @type {ReplayEvent[]} */
    this.events = [];

    /** @type {number[]} */
    this.timestamps = [];

    /** @type {number} @private */
    this._frame = 0;

    /**
     * method name -> original implementation, so `stop()` can restore the instance to exactly
     * how it was.
     * @type {Map<string, Function>}
     * @private
     */
    this._originals = new Map();

    for (const method of RECORDED_METHODS) this._wrap(method);
  }

  /**
   * @param {string} method
   * @private
   */
  _wrap(method) {
    const original = /** @type {Function} */ (/** @type {any} */ (this.input)[method]).bind(this.input);
    this._originals.set(method, /** @type {any} */ (this.input)[method]);

    /** @type {any} */ (this.input)[method] = (/** @type {any[]} */ ...args) => {
      this.events.push({ frame: this._frame, method, args });
      return original(...args);
    };
  }

  /**
   * Mark the start of a new frame. Call once per frame, before `game.frame(now)`.
   * @param {number} now
   * @returns {void}
   */
  recordFrame(now) {
    this._frame += 1;
    this.timestamps.push(now);
  }

  /** Stop intercepting — restores the input manager's original methods. @returns {void} */
  stop() {
    for (const [method, fn] of this._originals) {
      /** @type {any} */ (this.input)[method] = fn;
    }
    this._originals.clear();
  }

  /** @returns {Recording} */
  toJSON() {
    return { version: REPLAY_FORMAT_VERSION, timestamps: this.timestamps, events: this.events };
  }

  /** @returns {string} the recording as JSON text. */
  toText() {
    return JSON.stringify(this.toJSON());
  }
}

export class ReplayPlayer {
  /**
   * @param {import('@novaforge/input').InputManager} input the instance to feed events into —
   *   should start from the same "nothing held" state the recording began from, which a freshly
   *   constructed `Game` already provides
   * @param {Recording} recording
   * @throws {Error} if the recording's format version is newer than this build understands
   */
  constructor(input, recording) {
    if (recording.version > REPLAY_FORMAT_VERSION) {
      throw new Error(
        `ReplayPlayer: recording format v${recording.version} is newer than this build understands (v${REPLAY_FORMAT_VERSION})`,
      );
    }

    /** @type {import('@novaforge/input').InputManager} */
    this.input = input;

    /** @type {number[]} */
    this.timestamps = recording.timestamps;

    /** @type {ReplayEvent[]} */
    this.events = recording.events;

    /** @type {number} frames consumed so far. */
    this.frame = 0;

    /** @type {number} @private */
    this._cursor = 0;
  }

  /** @returns {boolean} true once every recorded frame has been consumed. */
  get finished() {
    return this.frame >= this.timestamps.length;
  }

  /**
   * Apply every event recorded for the next frame and return its timestamp.
   *
   * @returns {number | null} the `now` to pass to `game.frame(now)`, or `null` once the
   *   recording is exhausted — the loop's natural termination check.
   */
  nextFrame() {
    if (this.finished) return null;

    this.frame += 1;
    while (this._cursor < this.events.length && this.events[this._cursor].frame === this.frame) {
      const event = this.events[this._cursor];
      /** @type {any} */ (this.input)[event.method](...event.args);
      this._cursor += 1;
    }

    return this.timestamps[this.frame - 1];
  }
}

/**
 * @param {string} text JSON produced by `ReplayRecorder.toText`
 * @returns {Recording}
 */
export function parseRecording(text) {
  return JSON.parse(text);
}
