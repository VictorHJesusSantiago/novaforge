/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { World, Transform } from '@novaforge/core';
import { Camera2D } from '@novaforge/renderer';
import { CommandStack } from '../command-stack.js';
import { Selection } from '../selection.js';
import { ViewportOverlay } from '../viewport-overlay.js';

/**
 * jsdom does not implement a global `PointerEvent` constructor. `addEventListener` dispatches
 * purely by the event's `type` string, so a `MouseEvent` carrying the same type — and the
 * `clientX`/`clientY` the handlers actually read — is indistinguishable to the code under test.
 * @param {string} type
 * @param {number} x
 * @param {number} y
 * @returns {MouseEvent}
 */
function pointerEvent(type, x, y) {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

/** @type {World} */ let world;
/** @type {Camera2D} */ let camera;
/** @type {Selection} */ let selection;
/** @type {CommandStack} */ let stack;
/** @type {HTMLCanvasElement} */ let canvas;
/** @type {ViewportOverlay} */ let overlay;

beforeEach(() => {
  world = new World();
  camera = new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
  selection = new Selection();
  stack = new CommandStack();
  canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  overlay = new ViewportOverlay(canvas, world, camera, selection, stack);
});

describe('construction in a context-less environment', () => {
  // jsdom has no real 2D canvas backend; getContext('2d') returns null. Picking and dragging
  // must still work, and render() must not throw — only drawing degrades.
  it('does not throw when constructed or rendered with no 2D context', () => {
    expect(() => overlay.render()).not.toThrow();
  });
});

describe('picking', () => {
  it('selects the entity under a click', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    const screen = camera.worldToScreen({ x: 0, y: 0 });

    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));

    expect(selection.entity).toBe(entity);
  });

  it('clears the selection when clicking empty space', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);

    canvas.dispatchEvent(pointerEvent('pointerdown', 700, 500));

    expect(selection.entity).toBeNull();
  });
});

describe('dragging', () => {
  it('moves the selected entity live as the pointer moves', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    canvas.dispatchEvent(pointerEvent('pointermove', screen.x + 100, screen.y));

    expect(world.get(entity, Transform)?.position.x).toBeCloseTo(100, 3);
  });

  it('commits exactly one undo entry for a whole drag gesture', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    for (let i = 1; i <= 10; i += 1) {
      canvas.dispatchEvent(pointerEvent('pointermove', screen.x + i * 5, screen.y));
    }
    canvas.dispatchEvent(pointerEvent('pointerup', screen.x + 50, screen.y));

    expect(stack.canUndo).toBe(true);
    stack.undo();
    expect(stack.canUndo).toBe(false);
  });

  it('undo restores the pre-drag position as a real Vec2, not a plain object', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(3, 4);
    selection.select(entity);

    const screen = camera.worldToScreen({ x: 3, y: 4 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    canvas.dispatchEvent(pointerEvent('pointermove', screen.x + 200, screen.y + 50));
    canvas.dispatchEvent(pointerEvent('pointerup', screen.x + 200, screen.y + 50));

    stack.undo();

    const position = world.get(entity, Transform)?.position;
    expect(position?.x).toBeCloseTo(3, 3);
    expect(position?.y).toBeCloseTo(4, 3);
    // A real Vec2 exposes .set(); a plain {x,y} lookalike would not, and something calling it
    // later would throw far from this test.
    expect(typeof position?.set).toBe('function');
  });

  it('leaves the position as a real Vec2 after redo too', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    canvas.dispatchEvent(pointerEvent('pointermove', screen.x + 100, screen.y));
    canvas.dispatchEvent(pointerEvent('pointerup', screen.x + 100, screen.y));

    stack.undo();
    stack.redo();

    expect(typeof world.get(entity, Transform)?.position.set).toBe('function');
    expect(world.get(entity, Transform)?.position.x).toBeCloseTo(100, 3);
  });

  // A click that starts and ends on the handle with no movement must not push a no-op onto
  // the undo stack.
  it('does not record a command for a click with no movement', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    canvas.dispatchEvent(pointerEvent('pointerup', screen.x, screen.y));

    expect(stack.canUndo).toBe(false);
  });

  it('a second pointerdown away from the handle re-picks instead of dragging', () => {
    const a = world.spawn([Transform]);
    world.get(a, Transform)?.position.set(0, 0);
    const b = world.spawn([Transform]);
    world.get(b, Transform)?.position.set(300, 0);
    selection.select(a);

    const screenB = camera.worldToScreen({ x: 300, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screenB.x, screenB.y));

    expect(selection.entity).toBe(b);
  });
});

describe('rotate gizmo', () => {
  it('rotates the entity by dragging the rotate handle', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'rotate';

    const handleScreen = camera.worldToScreen({ x: 50, y: 0 }); // rotate handle at rotation 0
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));

    const target = camera.worldToScreen({ x: 0, y: 50 }); // drag to "straight down"
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    expect(world.get(entity, Transform)?.rotation).toBeCloseTo(Math.PI / 2, 2);
  });

  it('commits one undoable command per drag', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'rotate';

    const handleScreen = camera.worldToScreen({ x: 50, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));
    const target = camera.worldToScreen({ x: 0, y: 50 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));
    canvas.dispatchEvent(pointerEvent('pointerup', target.x, target.y));

    expect(stack.canUndo).toBe(true);
    stack.undo();
    expect(world.get(entity, Transform)?.rotation).toBe(0);
  });

  it('snaps to the configured angle step', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'rotate';
    overlay.snapAngleDegrees = 45;

    const handleScreen = camera.worldToScreen({ x: 50, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));
    // Drag to roughly 40 degrees — should snap to 45.
    const target = camera.worldToScreen({ x: Math.cos(0.7), y: Math.sin(0.7) });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    const rotation = world.get(entity, Transform)?.rotation ?? 0;
    expect(rotation).toBeCloseTo(Math.PI / 4, 2);
  });

  it('does not translate the entity while rotating', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(10, 20);
    selection.select(entity);
    overlay.gizmoMode = 'rotate';

    const handleScreen = camera.worldToScreen({ x: 60, y: 20 });
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));
    const target = camera.worldToScreen({ x: 10, y: 70 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    expect(world.get(entity, Transform)?.position.x).toBe(10);
    expect(world.get(entity, Transform)?.position.y).toBe(20);
  });
});

describe('scale gizmo', () => {
  it('scales the entity by dragging the scale handle outward', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'scale';

    // Scale handle at scale 1 sits at distance 40 along the (1,1) direction from centre.
    const direction = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const handleWorld = { x: direction.x * 40, y: direction.y * 40 };
    const handleScreen = camera.worldToScreen(handleWorld);
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));

    const target = camera.worldToScreen({ x: direction.x * 80, y: direction.y * 80 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    const scale = world.get(entity, Transform)?.scale;
    expect(scale?.x).toBeCloseTo(2, 1);
    expect(scale?.y).toBeCloseTo(2, 1);
  });

  it('commits one undoable command per drag', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'scale';

    const direction = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const handleScreen = camera.worldToScreen({ x: direction.x * 40, y: direction.y * 40 });
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));
    const target = camera.worldToScreen({ x: direction.x * 80, y: direction.y * 80 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));
    canvas.dispatchEvent(pointerEvent('pointerup', target.x, target.y));

    expect(stack.canUndo).toBe(true);
    stack.undo();
    expect(world.get(entity, Transform)?.scale.x).toBeCloseTo(1);
  });

  it('leaves scale as a real Vec2 after the drag', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'scale';

    const direction = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const handleScreen = camera.worldToScreen({ x: direction.x * 40, y: direction.y * 40 });
    canvas.dispatchEvent(pointerEvent('pointerdown', handleScreen.x, handleScreen.y));
    const target = camera.worldToScreen({ x: direction.x * 80, y: direction.y * 80 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));
    canvas.dispatchEvent(pointerEvent('pointerup', target.x, target.y));

    expect(typeof world.get(entity, Transform)?.scale.set).toBe('function');
  });
});

describe('translate snapping', () => {
  it('snaps the dragged position to the grid', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.snapGridSize = 10;

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    const target = camera.worldToScreen({ x: 23, y: 47 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    const position = world.get(entity, Transform)?.position;
    expect(position?.x).toBeCloseTo(20, 3);
    expect(position?.y).toBeCloseTo(50, 3);
  });

  it('does not snap when disabled', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.snapGridSize = 0;

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));
    const target = camera.worldToScreen({ x: 23, y: 47 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    const position = world.get(entity, Transform)?.position;
    expect(position?.x).toBeCloseTo(23, 3);
  });
});

describe('mode switching', () => {
  it('a pointerdown on the translate handle position does nothing while in rotate mode', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    selection.select(entity);
    overlay.gizmoMode = 'rotate';

    // The translate-mode handle sits at the entity centre; in rotate mode the handle has moved
    // away, so a click at the old (translate) position must not start a drag.
    const centerScreen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', centerScreen.x, centerScreen.y));
    const target = camera.worldToScreen({ x: 0, y: 100 });
    canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y));

    // No drag started: the entity's transform is untouched, and instead the click re-picked
    // (found nothing else nearby, so it cleared the selection).
    expect(world.get(entity, Transform)?.rotation).toBe(0);
  });
});

describe('dispose', () => {
  it('stops responding to pointer events', () => {
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);
    overlay.dispose();

    const screen = camera.worldToScreen({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerEvent('pointerdown', screen.x, screen.y));

    expect(selection.entity).toBeNull();
  });
});
