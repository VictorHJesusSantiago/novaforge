import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '../input-manager.js';
import { MouseButton } from '../mouse.js';

/** @type {InputManager} */ let input;

beforeEach(() => {
  input = new InputManager();
});

describe('keyboard state', () => {
  it('does not expose a key until the frame is updated', () => {
    input.pushKeyDown('Space');
    expect(input.isKeyDown('Space')).toBe(false);
    input.update();
    expect(input.isKeyDown('Space')).toBe(true);
  });

  it('holds a key down across frames', () => {
    input.pushKeyDown('KeyA');
    input.update();
    input.update();
    input.update();
    expect(input.isKeyDown('KeyA')).toBe(true);
  });

  it('releases a key', () => {
    input.pushKeyDown('KeyA');
    input.update();
    input.pushKeyUp('KeyA');
    input.update();
    expect(input.isKeyDown('KeyA')).toBe(false);
  });

  it('tracks several keys independently', () => {
    input.pushKeyDown('KeyA');
    input.pushKeyDown('KeyD');
    input.update();
    expect(input.isKeyDown('KeyA')).toBe(true);
    expect(input.isKeyDown('KeyD')).toBe(true);
    expect(input.isKeyDown('KeyS')).toBe(false);
    expect(input.anyKeyDown()).toBe(true);
  });
});

describe('edge detection', () => {
  it('reports pressed for exactly one frame', () => {
    input.pushKeyDown('Space');
    input.update();
    expect(input.keyPressed('Space')).toBe(true);

    input.update();
    expect(input.keyPressed('Space')).toBe(false);
    expect(input.isKeyDown('Space')).toBe(true);
  });

  it('reports released for exactly one frame', () => {
    input.pushKeyDown('Space');
    input.update();
    input.pushKeyUp('Space');
    input.update();
    expect(input.keyReleased('Space')).toBe(true);

    input.update();
    expect(input.keyReleased('Space')).toBe(false);
  });

  it('keeps the edge stable for every read within a frame', () => {
    input.pushKeyDown('Space');
    input.update();
    expect(input.keyPressed('Space')).toBe(true);
    expect(input.keyPressed('Space')).toBe(true);
    expect(input.keyPressed('Space')).toBe(true);
  });

  it('detects a tap that starts and ends between two updates', () => {
    input.pushKeyDown('Space');
    input.update();
    expect(input.keyPressed('Space')).toBe(true);
    input.pushKeyUp('Space');
    input.update();
    expect(input.keyReleased('Space')).toBe(true);
  });

  it('reports no edge for a key that was never touched', () => {
    input.update();
    expect(input.keyPressed('KeyZ')).toBe(false);
    expect(input.keyReleased('KeyZ')).toBe(false);
  });
});

describe('mouse', () => {
  it('tracks button state with edges', () => {
    input.pushMouseDown(MouseButton.LEFT);
    input.update();
    expect(input.isMouseDown(MouseButton.LEFT)).toBe(true);
    expect(input.mousePressed(MouseButton.LEFT)).toBe(true);

    input.update();
    expect(input.mousePressed(MouseButton.LEFT)).toBe(false);

    input.pushMouseUp(MouseButton.LEFT);
    input.update();
    expect(input.mouseReleased(MouseButton.LEFT)).toBe(true);
  });

  it('tracks position and frame delta', () => {
    input.pushMouseMove(100, 200);
    input.update();
    expect(input.mouse.x).toBe(100);
    expect(input.mouse.y).toBe(200);

    input.pushMouseMove(110, 190);
    input.update();
    expect(input.mouse.deltaX).toBe(10);
    expect(input.mouse.deltaY).toBe(-10);
  });

  it('accumulates wheel movement within a frame and resets after', () => {
    input.pushWheel(1);
    input.pushWheel(1);
    input.pushWheel(-1);
    input.update();
    expect(input.mouse.wheel).toBe(1);

    input.update();
    expect(input.mouse.wheel).toBe(0);
  });

  it('releases held buttons when the pointer leaves', () => {
    input.pushMouseDown(MouseButton.LEFT);
    input.update();
    input.pushMouseLeave();
    input.update();

    expect(input.isMouseDown(MouseButton.LEFT)).toBe(false);
    expect(input.mouse.inside).toBe(false);
  });
});

describe('gamepad', () => {
  it('reports button state with edges', () => {
    input.pushGamepadState([0, 0], [0]);
    input.update();
    expect(input.isGamepadButtonDown(0)).toBe(true);
    expect(input.gamepadButtonPressed(0)).toBe(true);

    input.pushGamepadState([0, 0], []);
    input.update();
    expect(input.gamepadButtonReleased(0)).toBe(true);
  });

  it('zeroes axis noise inside the dead zone', () => {
    input.pushGamepadState([0.05, -0.1], []);
    input.update();
    expect(input.gamepadAxis(0)).toBe(0);
    expect(input.gamepadAxis(1)).toBe(0);
  });

  it('rescales past the dead zone so full deflection still reaches 1', () => {
    input.pushGamepadState([1, -1], []);
    input.update();
    expect(input.gamepadAxis(0)).toBeCloseTo(1, 5);
    expect(input.gamepadAxis(1)).toBeCloseTo(-1, 5);
  });

  it('does not jump discontinuously at the dead zone edge', () => {
    input.pushGamepadState([0.16, 0], []);
    input.update();
    expect(input.gamepadAxis(0)).toBeGreaterThan(0);
    expect(input.gamepadAxis(0)).toBeLessThan(0.05);
  });

  it('reports 0 for an axis the pad does not have', () => {
    input.pushGamepadState([0], []);
    input.update();
    expect(input.gamepadAxis(9)).toBe(0);
  });
});

describe('releaseAll', () => {
  it('drops every held input', () => {
    input.pushKeyDown('KeyD');
    input.pushMouseDown(MouseButton.LEFT);
    input.pushGamepadState([], [0]);
    input.update();

    input.releaseAll();
    input.update();

    expect(input.isKeyDown('KeyD')).toBe(false);
    expect(input.isMouseDown(MouseButton.LEFT)).toBe(false);
    expect(input.isGamepadButtonDown(0)).toBe(false);
  });

  it('reports the resulting releases as edges', () => {
    input.pushKeyDown('KeyD');
    input.update();
    input.releaseAll();
    input.update();
    expect(input.keyReleased('KeyD')).toBe(true);
  });
});

describe('headless operation', () => {
  it('constructs and runs with no DOM present', () => {
    expect(() => {
      const manager = new InputManager();
      manager.pushKeyDown('Space');
      manager.update();
      manager.detach();
    }).not.toThrow();
  });
});
