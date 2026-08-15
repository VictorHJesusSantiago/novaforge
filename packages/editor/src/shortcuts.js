import { deleteEntityCommand } from './commands.js';

/**
 * Default keyboard shortcuts.
 *
 * The combo-parsing half (`comboFromEvent`, `DEFAULT_BINDINGS`) is pure and tested directly
 * against plain objects shaped like a `KeyboardEvent` — no DOM dispatch needed to verify "does
 * Ctrl+Z map to undo." Only `installDefaultShortcuts` itself, which wires a combo to an actual
 * `Editor` action and attaches a real listener, needs a DOM.
 */

/**
 * Canonicalise a keyboard event into a combo string like `"ctrl+z"` or `"delete"`.
 *
 * Modifier order is fixed (ctrl, shift, alt) so the same physical chord always produces the
 * same string regardless of which order the browser happened to report the modifier flags in.
 * `event.key` is lower-cased so `Z` and `z` (Shift changes the reported key on most layouts)
 * are not treated as different shortcuts by accident.
 *
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @returns {string}
 */
export function comboFromEvent(event) {
  const parts = [];
  // metaKey (Cmd on macOS) is treated as the same modifier as ctrlKey, so one binding table
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(event.key.toLowerCase());
  return parts.join('+');
}

/**
 * @typedef {'undo'|'redo'|'delete'|'togglePlay'|'step'|'clearSelection'|'gizmoTranslate'|'gizmoRotate'|'gizmoScale'} ShortcutAction
 */

/**
 * combo string -> action name. Exported (rather than baked directly into
 * `installDefaultShortcuts`) so a host page can inspect it to render a "keyboard shortcuts"
 * help panel, or build a modified copy for its own rebinding UI.
 * @type {Record<string, ShortcutAction>}
 */
export const DEFAULT_BINDINGS = {
  'ctrl+z': 'undo',
  'ctrl+y': 'redo',
  'ctrl+shift+z': 'redo',
  delete: 'delete',
  backspace: 'delete',
  ' ': 'togglePlay',
  '.': 'step',
  escape: 'clearSelection',
  1: 'gizmoTranslate',
  2: 'gizmoRotate',
  3: 'gizmoScale',
};

/**
 * Attach the default keyboard shortcuts to an `Editor`.
 *
 * Ignored while focus is inside a form control — typing "z" to name an entity in the inspector
 * must not also undo, and hitting Space in a text field must not also toggle play mode. This is
 * the one thing every keyboard-shortcut implementation gets wrong on the first attempt, so it is
 * called out here rather than left to be rediscovered.
 *
 * @param {import('./editor.js').Editor} editor
 * @param {Document | HTMLElement} [target] defaults to `document`, so shortcuts work regardless
 *   of which element inside the page happens to have focus
 * @returns {() => void} an unsubscribe function
 */
export function installDefaultShortcuts(editor, target = document) {
  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    const active = document.activeElement;
    const tag = active?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const action = DEFAULT_BINDINGS[comboFromEvent(event)];
    if (action === undefined) return;

    event.preventDefault();
    runAction(editor, action);
  }

  target.addEventListener('keydown', /** @type {any} */ (onKeyDown));
  return () => target.removeEventListener('keydown', /** @type {any} */ (onKeyDown));
}

/**
 * @param {import('./editor.js').Editor} editor
 * @param {ShortcutAction} action
 * @returns {void}
 */
function runAction(editor, action) {
  switch (action) {
    case 'undo':
      editor.commandStack.undo();
      return;
    case 'redo':
      editor.commandStack.redo();
      return;
    case 'delete': {
      const entity = editor.selection.entity;
      if (entity === null) return;
      editor.commandStack.execute(deleteEntityCommand(editor.game.world, entity));
      editor.selection.clear();
      editor.sceneTree.refresh();
      return;
    }
    case 'togglePlay':
      if (editor.mode === 'play') editor.stop();
      else editor.play();
      return;
    case 'step':
      editor.step();
      return;
    case 'clearSelection':
      editor.selection.clear();
      return;
    case 'gizmoTranslate':
      editor.viewportOverlay.gizmoMode = 'translate';
      return;
    case 'gizmoRotate':
      editor.viewportOverlay.gizmoMode = 'rotate';
      return;
    case 'gizmoScale':
      editor.viewportOverlay.gizmoMode = 'scale';
      return;
    default:
      /** @type {never} */
      (action);
  }
}
