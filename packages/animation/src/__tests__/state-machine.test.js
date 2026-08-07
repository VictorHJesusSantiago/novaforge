import { describe, it, expect, beforeEach } from 'vitest';
import { World, defineComponent, resetComponentRegistry } from '@novaforge/core';
import { defineTrack, defineTimeline } from '../timeline.js';
import { TimelinePlayer } from '../player.js';
import {
  defineState,
  defineStateMachine,
  AnimationController,
  enterStateMachine,
  setParameter,
  stateMachineSystem,
  installStateMachineSystem,
} from '../state-machine.js';

/** @type {any} */ let Widget;
/** @type {World} */ let world;

beforeEach(() => {
  resetComponentRegistry();
  Widget = defineComponent('Widget', () => ({ n: 0 }), { n: { type: 'number' } });
  world = new World();
});

/** @param {number} value @returns {import('../timeline.js').Timeline} a static one-keyframe timeline. */
function staticTimeline(name, value) {
  return defineTimeline(name, [defineTrack(Widget, 'n', [{ time: 0, value }])]);
}

describe('defineStateMachine', () => {
  it('builds a machine with a lookup map of states', () => {
    const idle = defineState('idle', staticTimeline('idle', 0));
    const machine = defineStateMachine('m', [idle], 'idle');
    expect(machine.states.get('idle')).toBe(idle);
  });

  it('rejects zero states', () => {
    expect(() => defineStateMachine('m', [], 'idle')).toThrow(RangeError);
  });

  it('rejects an initial state that was not defined', () => {
    const idle = defineState('idle', staticTimeline('idle', 0));
    expect(() => defineStateMachine('m', [idle], 'missing')).toThrow(/initial state/);
  });

  it('rejects a transition targeting an undefined state', () => {
    const idle = defineState('idle', staticTimeline('idle', 0), [
      { to: 'nonexistent', condition: () => true },
    ]);
    expect(() => defineStateMachine('m', [idle], 'idle')).toThrow(/undefined state/);
  });
});

describe('enterStateMachine', () => {
  it('sets the current state and plays its timeline', () => {
    const idle = defineState('idle', staticTimeline('idle', 1));
    const machine = defineStateMachine('m', [idle], 'idle');

    const controller = AnimationController.factory();
    const player = TimelinePlayer.factory();
    enterStateMachine(controller, player, machine);

    expect(controller.current).toBe('idle');
    expect(player.timeline).toBe(idle.timeline);
  });
});

describe('stateMachineSystem', () => {
  /**
   * A two-state machine: idle -> walk when parameters.speed > 0.1, walk -> idle otherwise.
   * @returns {{ machine: any, idleTimeline: any, walkTimeline: any }}
   */
  function walkMachine() {
    const idleTimeline = staticTimeline('idle', 0);
    const walkTimeline = staticTimeline('walk', 1);

    const walk = defineState('walk', walkTimeline, [
      { to: 'idle', condition: (p) => !(p.speed > 0.1) },
    ]);
    const idle = defineState('idle', idleTimeline, [
      { to: 'walk', condition: (p) => p.speed > 0.1 },
    ]);

    return { machine: defineStateMachine('locomotion', [idle, walk], 'idle'), idleTimeline, walkTimeline };
  }

  it('stays in the current state when no condition fires', () => {
    const { machine } = walkMachine();
    const entity = world.spawn([Widget], [AnimationController], [TimelinePlayer]);
    enterStateMachine(world.get(entity, AnimationController), world.get(entity, TimelinePlayer), machine);

    stateMachineSystem(world);

    expect(world.get(entity, AnimationController)?.current).toBe('idle');
  });

  it('transitions when a condition becomes true', () => {
    const { machine, walkTimeline } = walkMachine();
    const entity = world.spawn([Widget], [AnimationController], [TimelinePlayer]);
    const controller = world.get(entity, AnimationController);
    const player = world.get(entity, TimelinePlayer);
    enterStateMachine(controller, player, machine);

    setParameter(controller, 'speed', 5);
    stateMachineSystem(world);

    expect(controller.current).toBe('walk');
    expect(player.timeline).toBe(walkTimeline);
  });

  it('transitions back when the condition reverses', () => {
    const { machine } = walkMachine();
    const entity = world.spawn([Widget], [AnimationController], [TimelinePlayer]);
    const controller = world.get(entity, AnimationController);
    const player = world.get(entity, TimelinePlayer);
    enterStateMachine(controller, player, machine);

    setParameter(controller, 'speed', 5);
    stateMachineSystem(world);
    setParameter(controller, 'speed', 0);
    stateMachineSystem(world);

    expect(controller.current).toBe('idle');
  });

  it('takes only one transition per frame, even if the destination state would also fire', () => {
    // idle -> walk -> run, all conditions simultaneously true. A naive implementation that
    // re-evaluates the new state's own transitions in the same pass would land on 'run' in one
    // frame; this system must stop after the first hop.
    const idleT = staticTimeline('idle', 0);
    const walkT = staticTimeline('walk', 1);
    const runT = staticTimeline('run', 2);

    const run = defineState('run', runT);
    const walk = defineState('walk', walkT, [{ to: 'run', condition: () => true }]);
    const idle = defineState('idle', idleT, [{ to: 'walk', condition: () => true }]);
    const machine = defineStateMachine('m', [idle, walk, run], 'idle');

    const entity = world.spawn([Widget], [AnimationController], [TimelinePlayer]);
    const controller = world.get(entity, AnimationController);
    const player = world.get(entity, TimelinePlayer);
    enterStateMachine(controller, player, machine);

    stateMachineSystem(world);
    expect(controller.current).toBe('walk');

    stateMachineSystem(world);
    expect(controller.current).toBe('run');
  });

  it('checks transitions in declared order and takes the first that matches', () => {
    const a = staticTimeline('a', 0);
    const target = defineState('target', staticTimeline('target', 2));
    const start = defineState('start', a, [
      { to: 'target', condition: () => true },
      { to: 'target', condition: () => true },
    ]);
    const machine = defineStateMachine('m', [start, target], 'start');

    const entity = world.spawn([Widget], [AnimationController], [TimelinePlayer]);
    const controller = world.get(entity, AnimationController);
    enterStateMachine(controller, world.get(entity, TimelinePlayer), machine);

    stateMachineSystem(world);
    expect(controller.current).toBe('target');
  });

  it('does nothing for an entity with no machine attached', () => {
    const entity = world.spawn([Widget], [AnimationController], [TimelinePlayer]);
    expect(() => stateMachineSystem(world)).not.toThrow();
    expect(world.get(entity, AnimationController)?.current).toBe('');
  });

  it('ignores an entity without a TimelinePlayer', () => {
    const { machine } = walkMachine();
    const entity = world.spawn([Widget], [AnimationController]);
    const controller = world.get(entity, AnimationController);
    if (controller) controller.machine = machine;
    expect(() => stateMachineSystem(world)).not.toThrow();
  });
});

describe('installStateMachineSystem', () => {
  it('registers ahead of the timeline system, in update', () => {
    const handle = installStateMachineSystem(world);
    const entry = world.scheduler.systemsIn('update').find((s) => s.handle === handle);
    expect(entry?.name).toBe('animationStateMachine');
    expect(entry?.order).toBeLessThan(0);
  });
});
