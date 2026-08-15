/**
 * Named actions bound to physical inputs.
 *
 * Gameplay asks "did the player want to jump", not "is the space bar down". That indirection is
 * what makes rebinding, gamepad support, and two local players possible without touching a
 * single gameplay system — and it costs one line per action to set up.
 *
 * @typedef {object} Binding
 * @property {string} [key] a `KeyboardEvent.code`, e.g. `'Space'`, `'KeyW'`, `'ArrowLeft'`
 * @property {number} [mouse] a `MouseButton` index
 * @property {number} [gamepadButton] a standard-mapping gamepad button index
 * @property {number} [gamepadAxis] a gamepad axis index
 * @property {number} [axisDirection] `1` or `-1`, which end of the axis triggers the action
 *
 * @typedef {object} AxisBinding
 * @property {string[]} [negative] keys pushing the axis toward -1
 * @property {string[]} [positive] keys pushing the axis toward +1
 * @property {number} [gamepadAxis] a gamepad axis read directly
 */
export class ActionMap {
  /**
   * @param {import('./input-manager.js').InputManager} input
   */
  constructor(input) {
    /** @type {import('./input-manager.js').InputManager} @private */
    this._input = input;

    /** @type {Map<string, Binding[]>} @private */
    this._actions = new Map();

    /** @type {Map<string, AxisBinding>} @private */
    this._axes = new Map();
  }

  /**
   * Bind an action to one or more physical inputs. Any of them triggers it.
   *
   * ```js
   * actions.define('jump', [{ key: 'Space' }, { key: 'KeyW' }, { gamepadButton: 0 }]);
   * ```
   *
   * Defining an existing action replaces its bindings, which is what a settings screen needs.
   *
   * @param {string} name
   * @param {Binding[]} bindings
   * @returns {this}
   */
  define(name, bindings) {
    this._actions.set(name, bindings);
    return this;
  }

  /**
   * Bind a named axis, read as a float in [-1, 1].
   *
   * ```js
   * actions.defineAxis('moveX', { negative: ['KeyA', 'ArrowLeft'], positive: ['KeyD', 'ArrowRight'] });
   * ```
   *
   * @param {string} name
   * @param {AxisBinding} binding
   * @returns {this}
   */
  defineAxis(name, binding) {
    this._axes.set(name, binding);
    return this;
  }

  /**
   * @param {string} name
   * @returns {boolean} true while any bound input is held.
   */
  isDown(name) {
    return this._any(name, (binding) => this._bindingDown(binding, false));
  }

  /**
   * @param {string} name
   * @returns {boolean} true only on the frame the action went down.
   */
  pressed(name) {
    return this._any(name, (binding) => this._bindingEdge(binding, 'pressed'));
  }

  /**
   * @param {string} name
   * @returns {boolean} true only on the frame the action went up.
   */
  released(name) {
    return this._any(name, (binding) => this._bindingEdge(binding, 'released'));
  }

  /**
   * @param {string} name
   * @returns {number} the axis value in [-1, 1], or 0 for an undefined axis.
   *   Returning 0 rather than throwing: a missing axis should make the character stand still,
   *   not crash the frame.
   */
  axis(name) {
    const binding = this._axes.get(name);
    if (binding === undefined) return 0;

    if (binding.gamepadAxis !== undefined) {
      const value = this._input.gamepadAxis(binding.gamepadAxis);
      if (Math.abs(value) > 0) return value;
    }

    let result = 0;
    for (const key of binding.negative ?? []) {
      if (this._input.isKeyDown(key)) result -= 1;
    }
    for (const key of binding.positive ?? []) {
      if (this._input.isKeyDown(key)) result += 1;
    }
    return Math.max(-1, Math.min(1, result));
  }

  /**
   * Two axes as a vector, with the diagonal normalised.
   *
   * Without normalising, a player holding two directions moves 1.41× faster diagonally — the
   * single most common movement bug in 2D games.
   *
   * @param {string} horizontal
   * @param {string} vertical
   * @returns {{ x: number, y: number }}
   */
  vector(horizontal, vertical) {
    const x = this.axis(horizontal);
    const y = this.axis(vertical);
    const lengthSquared = x * x + y * y;
    if (lengthSquared > 1) {
      const length = Math.sqrt(lengthSquared);
      return { x: x / length, y: y / length };
    }
    return { x, y };
  }

  /**
   * @param {string} name
   * @returns {Binding[]} the current bindings, for a settings screen.
   */
  bindingsFor(name) {
    return this._actions.get(name) ?? [];
  }

  /** @returns {string[]} every defined action name. */
  names() {
    return Array.from(this._actions.keys());
  }

  /** Remove every action and axis. */
  clear() {
    this._actions.clear();
    this._axes.clear();
  }

  /**
   * @param {string} name
   * @param {(binding: Binding) => boolean} predicate
   * @returns {boolean}
   * @private
   */
  _any(name, predicate) {
    const bindings = this._actions.get(name);
    if (bindings === undefined) return false;
    for (const binding of bindings) {
      if (predicate(binding)) return true;
    }
    return false;
  }

  /**
   * @param {Binding} binding
   * @param {boolean} _edge
   * @returns {boolean}
   * @private
   */
  _bindingDown(binding, _edge) {
    if (binding.key !== undefined && this._input.isKeyDown(binding.key)) return true;
    if (binding.mouse !== undefined && this._input.isMouseDown(binding.mouse)) return true;
    if (binding.gamepadButton !== undefined && this._input.isGamepadButtonDown(binding.gamepadButton)) {
      return true;
    }
    if (binding.gamepadAxis !== undefined) {
      const value = this._input.gamepadAxis(binding.gamepadAxis);
      const direction = binding.axisDirection ?? 1;
      if (value * direction > 0.5) return true;
    }
    return false;
  }

  /**
   * @param {Binding} binding
   * @param {'pressed'|'released'} kind
   * @returns {boolean}
   * @private
   */
  _bindingEdge(binding, kind) {
    if (binding.key !== undefined) {
      if (kind === 'pressed' ? this._input.keyPressed(binding.key) : this._input.keyReleased(binding.key)) {
        return true;
      }
    }
    if (binding.mouse !== undefined) {
      if (
        kind === 'pressed'
          ? this._input.mousePressed(binding.mouse)
          : this._input.mouseReleased(binding.mouse)
      ) {
        return true;
      }
    }
    if (binding.gamepadButton !== undefined) {
      if (
        kind === 'pressed'
          ? this._input.gamepadButtonPressed(binding.gamepadButton)
          : this._input.gamepadButtonReleased(binding.gamepadButton)
      ) {
        return true;
      }
    }
    return false;
  }
}
