import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, resetComponentRegistry } from '@novaforge/core';
import { defineTrack } from '@novaforge/animation';
import { CommandStack } from '../command-stack.js';
import { setKeyframeCommand, removeKeyframeCommand } from '../timeline-commands.js';

/** @type {any} */ let Widget;
/** @type {CommandStack} */ let stack;

beforeEach(() => {
  resetComponentRegistry();
  Widget = defineComponent('Widget', () => ({ n: 0 }), { n: { type: 'number' } });
  stack = new CommandStack();
});

describe('setKeyframeCommand', () => {
  it('adds a new keyframe at the given time', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    stack.execute(setKeyframeCommand(track, 5, 50));
    expect(track.keyframes).toHaveLength(2);
    expect(track.keyframes.find((k) => k.time === 5)?.value).toBe(50);
  });

  it('keeps keyframes sorted by time after inserting in the middle', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }, { time: 10, value: 100 }]);
    stack.execute(setKeyframeCommand(track, 5, 50));
    expect(track.keyframes.map((k) => k.time)).toEqual([0, 5, 10]);
  });

  it('overwrites the value of an existing keyframe at the same time', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    stack.execute(setKeyframeCommand(track, 0, 99));
    expect(track.keyframes).toHaveLength(1);
    expect(track.keyframes[0].value).toBe(99);
  });

  it('undo removes a newly-added keyframe', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    stack.execute(setKeyframeCommand(track, 5, 50));
    stack.undo();
    expect(track.keyframes).toHaveLength(1);
  });

  it('undo restores the previous value of an overwritten keyframe', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    stack.execute(setKeyframeCommand(track, 0, 99));
    stack.undo();
    expect(track.keyframes[0].value).toBe(0);
  });

  it('treats times within a small epsilon as the same keyframe', () => {
    const track = defineTrack(Widget, 'n', [{ time: 2, value: 20 }]);
    stack.execute(setKeyframeCommand(track, 2 + 1e-9, 99));
    expect(track.keyframes).toHaveLength(1);
    expect(track.keyframes[0].value).toBe(99);
  });
});

describe('removeKeyframeCommand', () => {
  it('removes the keyframe at the given time', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }, { time: 5, value: 50 }]);
    stack.execute(removeKeyframeCommand(track, 5));
    expect(track.keyframes).toHaveLength(1);
  });

  it('undo restores the removed keyframe', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }, { time: 5, value: 50 }]);
    stack.execute(removeKeyframeCommand(track, 5));
    stack.undo();
    expect(track.keyframes.find((k) => k.time === 5)?.value).toBe(50);
  });

  it('is a harmless no-op for a time with no keyframe', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    expect(() => stack.execute(removeKeyframeCommand(track, 99))).not.toThrow();
    expect(track.keyframes).toHaveLength(1);
  });
});
