import { describe, it, expect } from 'vitest';
import { comboFromEvent, DEFAULT_BINDINGS } from '../shortcuts.js';

describe('comboFromEvent', () => {
  it('produces a bare key for no modifiers', () => {
    expect(comboFromEvent({ key: 'a' })).toBe('a');
  });

  it('lower-cases the key, so Shift+Z and z read the same modifier-adjusted key', () => {
    expect(comboFromEvent({ key: 'Z', shiftKey: true })).toBe('shift+z');
  });

  it('includes ctrl for ctrlKey', () => {
    expect(comboFromEvent({ key: 'z', ctrlKey: true })).toBe('ctrl+z');
  });

  // Cmd on macOS reports as metaKey, not ctrlKey; treating them the same is what lets one
  // binding table work on every platform.
  it('treats metaKey the same as ctrlKey', () => {
    expect(comboFromEvent({ key: 'z', metaKey: true })).toBe('ctrl+z');
  });

  it('does not double the ctrl prefix when both ctrlKey and metaKey are set', () => {
    expect(comboFromEvent({ key: 'z', ctrlKey: true, metaKey: true })).toBe('ctrl+z');
  });

  it('combines several modifiers in a fixed order', () => {
    expect(comboFromEvent({ key: 'z', ctrlKey: true, shiftKey: true, altKey: true })).toBe(
      'ctrl+shift+alt+z',
    );
  });

  it('handles named keys like Delete and Escape', () => {
    expect(comboFromEvent({ key: 'Delete' })).toBe('delete');
    expect(comboFromEvent({ key: 'Escape' })).toBe('escape');
  });

  it('handles the space key literally', () => {
    expect(comboFromEvent({ key: ' ' })).toBe(' ');
  });
});

describe('DEFAULT_BINDINGS', () => {
  it('maps undo and redo', () => {
    expect(DEFAULT_BINDINGS['ctrl+z']).toBe('undo');
    expect(DEFAULT_BINDINGS['ctrl+y']).toBe('redo');
    expect(DEFAULT_BINDINGS['ctrl+shift+z']).toBe('redo');
  });

  it('maps delete and backspace to the same action', () => {
    expect(DEFAULT_BINDINGS.delete).toBe('delete');
    expect(DEFAULT_BINDINGS.backspace).toBe('delete');
  });

  it('maps space to togglePlay', () => {
    expect(DEFAULT_BINDINGS[' ']).toBe('togglePlay');
  });

  it('maps 1/2/3 to the three gizmo modes', () => {
    expect(DEFAULT_BINDINGS['1']).toBe('gizmoTranslate');
    expect(DEFAULT_BINDINGS['2']).toBe('gizmoRotate');
    expect(DEFAULT_BINDINGS['3']).toBe('gizmoScale');
  });
});
