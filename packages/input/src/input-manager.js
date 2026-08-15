import { MouseState } from './mouse.js';
import { ActionMap } from './action-map.js';

/** Resource key under which the world's `InputManager` is registered. */
export const INPUT_RESOURCE = 'input';

/**
 * Device sampling with frame-accurate edge detection.
 *
 * **The design that matters:** DOM listeners do not update the state gameplay reads. They push
 * into a pending set, and {@link update} — called once per frame in `preUpdate` — promotes that
 * into the frame's snapshot and diffs it against the previous frame to compute `pressed` and
 * `released` edges.
 *
 * Two things fall out of that. Systems running several times per frame (`fixedUpdate`) see a
 * *stable* snapshot rather than input that changes mid-frame, which is Invariant I1. And the
 * whole class works with no DOM at all — {@link pushKeyDown} and friends are the public device
 * event API, so the tests drive it directly and headless simulation and input replay come for
 * free.
 */
export class InputManager {
  constructor() {
    /** @type {Set<string>} keys held as of this frame's snapshot. @private */
    this._keys = new Set();

    /** @type {Set<string>} keys held as of last frame. @private */
    this._previousKeys = new Set();

    /** @type {Set<string>} raw device state, written by listeners between frames. @private */
    this._pendingKeys = new Set();

    /** @type {Set<number>} @private */
    this._mouseButtons = new Set();

    /** @type {Set<number>} @private */
    this._previousMouseButtons = new Set();

    /** @type {Set<number>} @private */
    this._pendingMouseButtons = new Set();

    /** @type {Set<number>} @private */
    this._gamepadButtons = new Set();

    /** @type {Set<number>} @private */
    this._previousGamepadButtons = new Set();

    /** @type {Set<number>} raw pad state, replaced wholesale each poll. @private */
    this._pendingGamepadButtons = new Set();

    /** @type {number[]} @private */
    this._gamepadAxes = [];

    /** Mouse state for this frame. */
    this.mouse = new MouseState();

    /** @type {number} @private */
    this._pendingMouseX = 0;

    /** @type {number} @private */
    this._pendingMouseY = 0;

    /** @type {number} @private */
    this._pendingWheel = 0;

    /** @type {boolean} @private */
    this._pendingInside = false;

    /**
     * Stick movement below this is treated as zero. Analogue sticks do not return exactly to
     * centre, and without a dead zone a character drifts on an untouched controller.
     * @type {number}
     */
    this.gamepadDeadZone = 0.15;

    /** Named actions. */
    this.actions = new ActionMap(this);

    /** @type {EventTarget | null} @private */
    this._target = null;

    /** @type {Array<() => void>} @private */
    this._detachers = [];
  }


  /**
   * @param {string} code a `KeyboardEvent.code`
   * @returns {void}
   */
  pushKeyDown(code) {
    this._pendingKeys.add(code);
  }

  /**
   * @param {string} code
   * @returns {void}
   */
  pushKeyUp(code) {
    this._pendingKeys.delete(code);
  }

  /**
   * @param {number} button
   * @returns {void}
   */
  pushMouseDown(button) {
    this._pendingMouseButtons.add(button);
  }

  /**
   * @param {number} button
   * @returns {void}
   */
  pushMouseUp(button) {
    this._pendingMouseButtons.delete(button);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  pushMouseMove(x, y) {
    this._pendingMouseX = x;
    this._pendingMouseY = y;
    this._pendingInside = true;
  }

  /**
   * @param {number} notches positive scrolls away from the user
   * @returns {void}
   */
  pushWheel(notches) {
    this._pendingWheel += notches;
  }

  /**
   * The pointer left the attached element. Held buttons are released, because the browser will
   * not report a mouseup that happens outside the element and a stuck button is worse than a
   * missed one.
   * @returns {void}
   */
  pushMouseLeave() {
    this._pendingInside = false;
    this._pendingMouseButtons.clear();
  }

  /**
   * Replace the gamepad snapshot. Called once per frame by {@link update} when a pad is
   * connected; tests call it directly.
   * @param {number[]} axes
   * @param {number[]} pressedButtons indices currently held
   * @returns {void}
   */
  pushGamepadState(axes, pressedButtons) {
    this._gamepadAxes = axes;
    this._pendingGamepadButtons = new Set(pressedButtons);
  }

  /**
   * Drop every held input.
   *
   * Call on window blur: keys held when the tab loses focus never report a keyup, so without
   * this the player returns to a game that thinks they are still holding right.
   * @returns {void}
   */
  releaseAll() {
    this._pendingKeys.clear();
    this._pendingMouseButtons.clear();
    this._pendingGamepadButtons = new Set();
  }


  /**
   * Promote pending device state into this frame's snapshot and compute the edges.
   *
   * Must run exactly once per frame, at the top of `preUpdate`. Running it twice would consume
   * the edges and make every `pressed` check in the second half of the frame report false.
   * @returns {void}
   */
  update() {
    this._pollGamepad();

    this._previousKeys = this._keys;
    this._keys = new Set(this._pendingKeys);

    this._previousMouseButtons = this._mouseButtons;
    this._mouseButtons = new Set(this._pendingMouseButtons);

    this._previousGamepadButtons = this._gamepadButtons;
    this._gamepadButtons = new Set(this._pendingGamepadButtons ?? []);

    this.mouse.deltaX = this._pendingMouseX - this.mouse.x;
    this.mouse.deltaY = this._pendingMouseY - this.mouse.y;
    this.mouse.x = this._pendingMouseX;
    this.mouse.y = this._pendingMouseY;
    this.mouse.wheel = this._pendingWheel;
    this.mouse.inside = this._pendingInside;

    this._pendingWheel = 0;
  }

  /** @private */
  _pollGamepad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (pad === null) continue;
      const pressed = [];
      for (let i = 0; i < pad.buttons.length; i += 1) {
        if (pad.buttons[i].pressed) pressed.push(i);
      }
      this.pushGamepadState(Array.from(pad.axes), pressed);
      return;
    }
  }


  /**
   * @param {string} code
   * @returns {boolean}
   */
  isKeyDown(code) {
    return this._keys.has(code);
  }

  /**
   * @param {string} code
   * @returns {boolean} true only on the frame the key went down.
   */
  keyPressed(code) {
    return this._keys.has(code) && !this._previousKeys.has(code);
  }

  /**
   * @param {string} code
   * @returns {boolean} true only on the frame the key went up.
   */
  keyReleased(code) {
    return !this._keys.has(code) && this._previousKeys.has(code);
  }

  /** @returns {boolean} true if any key at all is held. */
  anyKeyDown() {
    return this._keys.size > 0;
  }

  /**
   * @param {number} button
   * @returns {boolean}
   */
  isMouseDown(button) {
    return this._mouseButtons.has(button);
  }

  /**
   * @param {number} button
   * @returns {boolean}
   */
  mousePressed(button) {
    return this._mouseButtons.has(button) && !this._previousMouseButtons.has(button);
  }

  /**
   * @param {number} button
   * @returns {boolean}
   */
  mouseReleased(button) {
    return !this._mouseButtons.has(button) && this._previousMouseButtons.has(button);
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  isGamepadButtonDown(index) {
    return this._gamepadButtons.has(index);
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  gamepadButtonPressed(index) {
    return this._gamepadButtons.has(index) && !this._previousGamepadButtons.has(index);
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  gamepadButtonReleased(index) {
    return !this._gamepadButtons.has(index) && this._previousGamepadButtons.has(index);
  }

  /**
   * @param {number} index
   * @returns {number} the axis value with the dead zone applied, in [-1, 1].
   */
  gamepadAxis(index) {
    const raw = this._gamepadAxes[index] ?? 0;
    if (Math.abs(raw) < this.gamepadDeadZone) return 0;
    const sign = raw < 0 ? -1 : 1;
    return sign * ((Math.abs(raw) - this.gamepadDeadZone) / (1 - this.gamepadDeadZone));
  }


  /**
   * Attach DOM listeners. Optional — the manager is fully usable without a DOM.
   * @param {HTMLElement} element the canvas, for pointer coordinates
   * @param {Window & typeof globalThis} [windowTarget] for key and blur events
   * @returns {void}
   */
  attach(element, windowTarget = /** @type {any} */ (globalThis.window)) {
    this.detach();
    this._target = element;

    /**
     * @param {EventTarget} target
     * @param {string} type
     * @param {(event: any) => void} handler
     */
    const on = (target, type, handler) => {
      target.addEventListener(type, handler);
      this._detachers.push(() => target.removeEventListener(type, handler));
    };

    on(windowTarget, 'keydown', (event) => {
      this.pushKeyDown(event.code);
      if (PREVENTED_KEYS.has(event.code)) event.preventDefault();
    });
    on(windowTarget, 'keyup', (event) => this.pushKeyUp(event.code));

    on(windowTarget, 'blur', () => this.releaseAll());

    on(element, 'mousedown', (event) => this.pushMouseDown(event.button));
    on(element, 'mouseup', (event) => this.pushMouseUp(event.button));
    on(element, 'mouseleave', () => this.pushMouseLeave());
    on(element, 'contextmenu', (event) => event.preventDefault());

    on(element, 'mousemove', (event) => {
      const rect = element.getBoundingClientRect();
      this.pushMouseMove(event.clientX - rect.left, event.clientY - rect.top);
    });

    on(element, 'wheel', (event) => {
      this.pushWheel(Math.sign(event.deltaY));
      event.preventDefault();
    });
  }

  /** Remove every DOM listener. @returns {void} */
  detach() {
    for (const detacher of this._detachers) detacher();
    this._detachers.length = 0;
    this._target = null;
  }
}

/** Keys whose default browser behaviour would interfere with a game. */
const PREVENTED_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
]);
