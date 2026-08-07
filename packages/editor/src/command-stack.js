/**
 * Undo/redo, as a stack of reversible commands (SPEC §12).
 *
 * Every edit the editor makes — a field change, a create, a delete — goes through here rather
 * than mutating the world directly, which is what makes undo possible at all. A command is
 * plain `{ label, do(), undo() }`; this class owns only the stack discipline, not what any
 * particular command does.
 *
 * @typedef {object} Command
 * @property {string} label shown in an undo-history UI
 * @property {() => void} do
 * @property {() => void} undo
 */
export class CommandStack {
  /**
   * @param {object} [options]
   * @param {number} [options.maxSize] oldest entries are dropped past this — an editing session
   *   is not expected to need an unbounded history, and capping it is what keeps memory bounded
   *   during a long session instead of growing for as long as the tab stays open.
   */
  constructor(options = {}) {
    /** @type {number} */
    this.maxSize = options.maxSize ?? 200;

    /** @type {Command[]} @private */
    this._undoStack = [];

    /** @type {Command[]} @private */
    this._redoStack = [];

    /** @type {Set<() => void>} @private */
    this._listeners = new Set();
  }

  /** @returns {boolean} */
  get canUndo() {
    return this._undoStack.length > 0;
  }

  /** @returns {boolean} */
  get canRedo() {
    return this._redoStack.length > 0;
  }

  /** @returns {string | null} the label of the command `undo()` would revert. */
  get undoLabel() {
    return this._undoStack.length > 0 ? this._undoStack[this._undoStack.length - 1].label : null;
  }

  /** @returns {string | null} the label of the command `redo()` would replay. */
  get redoLabel() {
    return this._redoStack.length > 0 ? this._redoStack[this._redoStack.length - 1].label : null;
  }

  /**
   * Run a command and push it onto the undo stack.
   *
   * Committing a new command always clears the redo stack — the standard editor convention, and
   * the only sound one: the commands sitting in redo were undone from a history that this new
   * edit has just branched away from, so replaying them would silently apply edits the user
   * never asked for on top of a state they no longer describe.
   *
   * @param {Command} command
   * @returns {void}
   */
  execute(command) {
    command.do();
    this._undoStack.push(command);
    if (this._undoStack.length > this.maxSize) this._undoStack.shift();
    this._redoStack.length = 0;
    this._emit();
  }

  /**
   * @returns {boolean} true if a command was undone.
   */
  undo() {
    const command = this._undoStack.pop();
    if (command === undefined) return false;
    command.undo();
    this._redoStack.push(command);
    this._emit();
    return true;
  }

  /**
   * @returns {boolean} true if a command was redone.
   */
  redo() {
    const command = this._redoStack.pop();
    if (command === undefined) return false;
    command.do();
    this._undoStack.push(command);
    this._emit();
    return true;
  }

  /** Drop the entire history without undoing anything — for a fresh scene load. */
  clear() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._emit();
  }

  /**
   * @param {() => void} fn called after execute, undo, redo or clear
   * @returns {() => void} an unsubscribe function
   */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** @private */
  _emit() {
    for (const fn of this._listeners) fn();
  }
}
