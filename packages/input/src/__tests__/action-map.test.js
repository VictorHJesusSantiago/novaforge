import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '../input-manager.js';
import { MouseButton } from '../mouse.js';

/** @type {InputManager} */ let input;
/** @type {import('../action-map.js').ActionMap} */ let actions;

beforeEach(() => {
  input = new InputManager();
  actions = input.actions;
});

describe('action bindings', () => {
  it('reports an action as down while its key is held', () => {
    actions.define('jump', [{ key: 'Space' }]);
    input.pushKeyDown('Space');
    input.update();
    expect(actions.isDown('jump')).toBe(true);
  });

  it('triggers on any of several bindings', () => {
    actions.define('jump', [{ key: 'Space' }, { key: 'KeyW' }, { gamepadButton: 0 }]);

    input.pushKeyDown('KeyW');
    input.update();
    expect(actions.isDown('jump')).toBe(true);

    input.pushKeyUp('KeyW');
    input.pushGamepadState([], [0]);
    input.update();
    expect(actions.isDown('jump')).toBe(true);
  });

  it('binds mouse buttons', () => {
    actions.define('fire', [{ mouse: MouseButton.LEFT }]);
    input.pushMouseDown(MouseButton.LEFT);
    input.update();
    expect(actions.isDown('fire')).toBe(true);
    expect(actions.pressed('fire')).toBe(true);
  });

  it('propagates edges through the action', () => {
    actions.define('jump', [{ key: 'Space' }]);

    input.pushKeyDown('Space');
    input.update();
    expect(actions.pressed('jump')).toBe(true);

    input.update();
    expect(actions.pressed('jump')).toBe(false);
    expect(actions.isDown('jump')).toBe(true);

    input.pushKeyUp('Space');
    input.update();
    expect(actions.released('jump')).toBe(true);
  });

  // A rebinding UI replaces bindings; it should not have to unregister first.
  it('replaces bindings when an action is redefined', () => {
    actions.define('jump', [{ key: 'Space' }]);
    actions.define('jump', [{ key: 'KeyJ' }]);

    input.pushKeyDown('Space');
    input.update();
    expect(actions.isDown('jump')).toBe(false);

    input.pushKeyDown('KeyJ');
    input.update();
    expect(actions.isDown('jump')).toBe(true);
  });

  it('reports false for an undefined action rather than throwing', () => {
    expect(actions.isDown('nonexistent')).toBe(false);
    expect(actions.pressed('nonexistent')).toBe(false);
    expect(actions.released('nonexistent')).toBe(false);
  });

  it('lists defined actions and their bindings', () => {
    actions.define('jump', [{ key: 'Space' }]);
    actions.define('fire', [{ mouse: 0 }]);
    expect(actions.names().sort()).toEqual(['fire', 'jump']);
    expect(actions.bindingsFor('jump')).toEqual([{ key: 'Space' }]);
  });
});

describe('axes', () => {
  beforeEach(() => {
    actions.defineAxis('moveX', { negative: ['KeyA'], positive: ['KeyD'] });
  });

  it('reads -1, 0 and 1', () => {
    input.update();
    expect(actions.axis('moveX')).toBe(0);

    input.pushKeyDown('KeyD');
    input.update();
    expect(actions.axis('moveX')).toBe(1);

    input.pushKeyUp('KeyD');
    input.pushKeyDown('KeyA');
    input.update();
    expect(actions.axis('moveX')).toBe(-1);
  });

  it('cancels when both directions are held', () => {
    input.pushKeyDown('KeyA');
    input.pushKeyDown('KeyD');
    input.update();
    expect(actions.axis('moveX')).toBe(0);
  });

  it('accepts several keys per direction', () => {
    actions.defineAxis('moveX', { negative: ['KeyA', 'ArrowLeft'], positive: ['KeyD'] });
    input.pushKeyDown('ArrowLeft');
    input.update();
    expect(actions.axis('moveX')).toBe(-1);
  });

  it('prefers a moved gamepad stick over the keyboard', () => {
    actions.defineAxis('moveX', { negative: ['KeyA'], positive: ['KeyD'], gamepadAxis: 0 });
    input.pushGamepadState([0.8], []);
    input.pushKeyDown('KeyA');
    input.update();
    expect(actions.axis('moveX')).toBeGreaterThan(0);
  });

  it('falls back to the keyboard when the stick is centred', () => {
    actions.defineAxis('moveX', { negative: ['KeyA'], positive: ['KeyD'], gamepadAxis: 0 });
    input.pushGamepadState([0], []);
    input.pushKeyDown('KeyA');
    input.update();
    expect(actions.axis('moveX')).toBe(-1);
  });

  it('returns 0 for an undefined axis', () => {
    expect(actions.axis('nope')).toBe(0);
  });
});

describe('vector', () => {
  beforeEach(() => {
    actions.defineAxis('moveX', { negative: ['KeyA'], positive: ['KeyD'] });
    actions.defineAxis('moveY', { negative: ['KeyW'], positive: ['KeyS'] });
  });

  it('reads both axes', () => {
    input.pushKeyDown('KeyD');
    input.update();
    expect(actions.vector('moveX', 'moveY')).toEqual({ x: 1, y: 0 });
  });

  it('normalises the diagonal to unit length', () => {
    input.pushKeyDown('KeyD');
    input.pushKeyDown('KeyS');
    input.update();

    const v = actions.vector('moveX', 'moveY');
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5);
    expect(v.x).toBeCloseTo(v.y, 5);
  });

  it('leaves a single-axis input at full magnitude', () => {
    input.pushKeyDown('KeyA');
    input.update();
    const v = actions.vector('moveX', 'moveY');
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5);
  });

  it('is zero when nothing is held', () => {
    input.update();
    expect(actions.vector('moveX', 'moveY')).toEqual({ x: 0, y: 0 });
  });
});

describe('clear', () => {
  it('removes every action and axis', () => {
    actions.define('jump', [{ key: 'Space' }]);
    actions.defineAxis('moveX', { positive: ['KeyD'] });
    actions.clear();

    input.pushKeyDown('Space');
    input.pushKeyDown('KeyD');
    input.update();

    expect(actions.isDown('jump')).toBe(false);
    expect(actions.axis('moveX')).toBe(0);
    expect(actions.names()).toEqual([]);
  });
});
