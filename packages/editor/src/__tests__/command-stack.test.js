import { describe, it, expect, vi } from 'vitest';
import { CommandStack } from '../command-stack.js';

/** @returns {{ command: import('../command-stack.js').Command, log: string[] }} */
function recordingCommand(label, log) {
  return {
    label,
    do: () => log.push(`do:${label}`),
    undo: () => log.push(`undo:${label}`),
  };
}

describe('execute', () => {
  it('runs the command immediately', () => {
    const stack = new CommandStack();
    const log = [];
    stack.execute(recordingCommand('a', log));
    expect(log).toEqual(['do:a']);
  });

  it('enables undo after executing', () => {
    const stack = new CommandStack();
    expect(stack.canUndo).toBe(false);
    stack.execute(recordingCommand('a', []));
    expect(stack.canUndo).toBe(true);
  });

  it('clears the redo stack on a new command', () => {
    const stack = new CommandStack();
    const log = [];
    stack.execute(recordingCommand('a', log));
    stack.undo();
    expect(stack.canRedo).toBe(true);

    stack.execute(recordingCommand('b', log));
    expect(stack.canRedo).toBe(false);
  });
});

describe('undo and redo', () => {
  it('reverses the most recent command', () => {
    const stack = new CommandStack();
    const log = [];
    stack.execute(recordingCommand('a', log));
    stack.undo();
    expect(log).toEqual(['do:a', 'undo:a']);
  });

  it('unwinds several commands in reverse order', () => {
    const stack = new CommandStack();
    const log = [];
    stack.execute(recordingCommand('a', log));
    stack.execute(recordingCommand('b', log));
    stack.undo();
    stack.undo();
    expect(log).toEqual(['do:a', 'do:b', 'undo:b', 'undo:a']);
  });

  it('replays an undone command on redo', () => {
    const stack = new CommandStack();
    const log = [];
    stack.execute(recordingCommand('a', log));
    stack.undo();
    stack.redo();
    expect(log).toEqual(['do:a', 'undo:a', 'do:a']);
  });

  it('reports false when there is nothing to undo or redo', () => {
    const stack = new CommandStack();
    expect(stack.undo()).toBe(false);
    expect(stack.redo()).toBe(false);
  });

  it('exposes the label of what undo/redo would do', () => {
    const stack = new CommandStack();
    stack.execute(recordingCommand('rename', []));
    expect(stack.undoLabel).toBe('rename');
    expect(stack.redoLabel).toBeNull();

    stack.undo();
    expect(stack.undoLabel).toBeNull();
    expect(stack.redoLabel).toBe('rename');
  });
});

describe('bounded history', () => {
  it('drops the oldest command once maxSize is exceeded', () => {
    const stack = new CommandStack({ maxSize: 2 });
    const log = [];
    stack.execute(recordingCommand('a', log));
    stack.execute(recordingCommand('b', log));
    stack.execute(recordingCommand('c', log));

    stack.undo();
    stack.undo();
    expect(stack.undo()).toBe(false);
    expect(log.filter((l) => l.startsWith('undo'))).toEqual(['undo:c', 'undo:b']);
  });
});

describe('clear', () => {
  it('drops the whole history without calling undo', () => {
    const stack = new CommandStack();
    const log = [];
    stack.execute(recordingCommand('a', log));
    stack.clear();

    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(log).toEqual(['do:a']);
  });
});

describe('change notification', () => {
  it('notifies on execute, undo, redo and clear', () => {
    const stack = new CommandStack();
    const handler = vi.fn();
    stack.onChange(handler);

    stack.execute(recordingCommand('a', []));
    stack.undo();
    stack.redo();
    stack.clear();

    expect(handler).toHaveBeenCalledTimes(4);
  });

  it('stops notifying after unsubscribing', () => {
    const stack = new CommandStack();
    const handler = vi.fn();
    const unsubscribe = stack.onChange(handler);
    unsubscribe();

    stack.execute(recordingCommand('a', []));
    expect(handler).not.toHaveBeenCalled();
  });
});
