/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Transform } from '@novaforge/core';
import { Game } from '@novaforge/runtime';
import { Editor } from '../editor.js';
import { installDefaultShortcuts } from '../shortcuts.js';

/** @param {string} key @param {object} [modifiers] @returns {KeyboardEvent} */
function key(key_, modifiers = {}) {
  return new KeyboardEvent('keydown', { key: key_, bubbles: true, cancelable: true, ...modifiers });
}

/** @type {Game} */ let game;
/** @type {Editor} */ let editor;
/** @type {() => void} */ let uninstall;

beforeEach(() => {
  game = new Game({ physics: false });
  editor = new Editor(game, {
    sceneTree: document.createElement('div'),
    inspector: document.createElement('div'),
    assetPanel: document.createElement('div'),
    overlayCanvas: document.createElement('canvas'),
  });
  uninstall = installDefaultShortcuts(editor, document.body);
});

afterEach(() => {
  uninstall();
});

describe('undo / redo', () => {
  it('Ctrl+Z undoes the last command', () => {
    const entity = game.world.createEntity();
    editor.commandStack.execute({
      label: 'test',
      do: () => game.world.get(entity, Transform),
      undo: () => {},
    });
    expect(editor.commandStack.canUndo).toBe(true);

    document.body.dispatchEvent(key('z', { ctrlKey: true }));

    expect(editor.commandStack.canUndo).toBe(false);
  });

  it('Ctrl+Y redoes', () => {
    let calls = 0;
    editor.commandStack.execute({ label: 'x', do: () => (calls += 1), undo: () => {} });
    editor.commandStack.undo();

    document.body.dispatchEvent(key('y', { ctrlKey: true }));

    expect(calls).toBe(2);
  });
});

describe('delete', () => {
  it('Delete removes the selected entity', () => {
    const entity = game.world.spawn([Transform]);
    editor.selection.select(entity);

    document.body.dispatchEvent(key('Delete'));

    expect(game.world.isAlive(entity)).toBe(false);
  });

  it('does nothing when nothing is selected', () => {
    expect(() => document.body.dispatchEvent(key('Delete'))).not.toThrow();
  });
});

describe('play / stop toggle', () => {
  it('Space enters play mode', () => {
    document.body.dispatchEvent(key(' '));
    expect(editor.mode).toBe('play');
  });

  it('Space again returns to edit mode', () => {
    document.body.dispatchEvent(key(' '));
    document.body.dispatchEvent(key(' '));
    expect(editor.mode).toBe('edit');
  });
});

describe('gizmo mode switching', () => {
  it('digit keys switch the viewport gizmo mode', () => {
    document.body.dispatchEvent(key('2'));
    expect(editor.viewportOverlay.gizmoMode).toBe('rotate');
    document.body.dispatchEvent(key('3'));
    expect(editor.viewportOverlay.gizmoMode).toBe('scale');
    document.body.dispatchEvent(key('1'));
    expect(editor.viewportOverlay.gizmoMode).toBe('translate');
  });
});

describe('escape', () => {
  it('clears the selection', () => {
    const entity = game.world.createEntity();
    editor.selection.select(entity);
    document.body.dispatchEvent(key('Escape'));
    expect(editor.selection.entity).toBeNull();
  });
});

// The single most important behaviour a keyboard shortcut system has to get right.
describe('ignored while a form control has focus', () => {
  it('does not undo while typing in a text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();

    editor.commandStack.execute({ label: 'x', do: () => {}, undo: () => {} });
    input.dispatchEvent(key('z', { ctrlKey: true }));

    expect(editor.commandStack.canUndo).toBe(true);
    input.remove();
  });

  it('does not toggle play while typing a space in a text field', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(key(' '));

    expect(editor.mode).toBe('edit');
    input.remove();
  });
});

describe('uninstall', () => {
  it('stops responding after the returned function is called', () => {
    uninstall();
    document.body.dispatchEvent(key('2'));
    expect(editor.viewportOverlay.gizmoMode).toBe('translate');
  });
});
