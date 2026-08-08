import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@novaforge/core';
import { DrawList } from '../draw-list.js';
import * as components from '../components.js';
import * as systems from '../systems.js';

/**
 * The renderer's components are module-level singletons created by `defineComponent`, which
 * rejects duplicate names. That is safe here because vitest gives every test file its own
 * module registry, so this file imports them exactly once — and a fresh `World` per test is
 * all the isolation the tests actually need, since component storage is per-world.
 */
const mod = { ...components, ...systems };

/** @type {World} */ let world;
/** @type {DrawList} */ let drawList;

beforeEach(() => {
  world = new World();
  drawList = new DrawList();
  world.setResource(mod.DRAW_LIST_RESOURCE, drawList);
});

describe('spriteRenderSystem', () => {
  it('emits one command per visible sprite', () => {
    world.spawn([mod.Transform], [mod.Sprite, { texture: 'a' }]);
    world.spawn([mod.Transform], [mod.Sprite, { texture: 'b' }]);

    mod.spriteRenderSystem(world, 0);
    expect(drawList.length).toBe(2);
  });

  it('skips invisible sprites', () => {
    world.spawn([mod.Transform], [mod.Sprite, { visible: false }]);
    mod.spriteRenderSystem(world, 0);
    expect(drawList.length).toBe(0);
  });

  it('skips fully transparent sprites', () => {
    world.spawn([mod.Transform], [mod.Sprite, { alpha: 0 }]);
    mod.spriteRenderSystem(world, 0);
    expect(drawList.length).toBe(0);
  });

  it('ignores entities without a Transform', () => {
    const e = world.createEntity();
    world.add(e, mod.Sprite, { texture: 'a' });
    mod.spriteRenderSystem(world, 0);
    expect(drawList.length).toBe(0);
  });

  it('carries the sprite fields onto the command', () => {
    const e = world.spawn(
      [mod.Transform],
      [mod.Sprite, { texture: 'hero', width: 64, height: 48, layer: 3, z: 7, tint: 0xff0000 }],
    );
    world.get(e, mod.Transform).position.set(10, 20);

    mod.spriteRenderSystem(world, 1);

    const c = drawList.at(0);
    expect(c.texture).toBe('hero');
    expect(c.width).toBe(64);
    expect(c.layer).toBe(3);
    expect(c.z).toBe(7);
    expect(c.tint).toBe(0xff0000);
  });

  it('passes the transform scale through to the command', () => {
    const e = world.spawn([mod.Transform], [mod.Sprite]);
    world.get(e, mod.Transform).scale.set(2, 3);
    mod.spriteRenderSystem(world, 1);
    expect(drawList.at(0).scaleX).toBe(2);
    expect(drawList.at(0).scaleY).toBe(3);
  });

  // The system must not touch a canvas, so it works with no DOM at all — which is exactly
  // why this test file runs in Node.
  it('does nothing when no draw list resource is registered', () => {
    const bare = new World();
    bare.spawn([mod.Transform], [mod.Sprite]);
    expect(() => mod.spriteRenderSystem(bare, 0)).not.toThrow();
  });
});

describe('render interpolation', () => {
  /** @returns {any} the Transform of a freshly spawned sprite entity. */
  function spawnMoving(fromX, toX) {
    const e = world.spawn([mod.Transform], [mod.Sprite]);
    const transform = world.get(e, mod.Transform);
    transform.previousPosition.set(fromX, 0);
    transform.position.set(toX, 0);
    return transform;
  }

  it('draws at the previous position at alpha 0', () => {
    spawnMoving(0, 100);
    mod.spriteRenderSystem(world, 0);
    expect(drawList.at(0).x).toBeCloseTo(0);
  });

  it('draws at the current position at alpha 1', () => {
    spawnMoving(0, 100);
    mod.spriteRenderSystem(world, 1);
    expect(drawList.at(0).x).toBeCloseTo(100);
  });

  // The whole reason Transform carries two extra fields (ADR-0004).
  it('draws between the two at a fractional alpha', () => {
    spawnMoving(0, 100);
    mod.spriteRenderSystem(world, 0.25);
    expect(drawList.at(0).x).toBeCloseTo(25);
  });

  it('interpolates rotation through the shortest arc', () => {
    const e = world.spawn([mod.Transform], [mod.Sprite]);
    const transform = world.get(e, mod.Transform);
    // 179 degrees to -179 degrees: a 2-degree move, not a 358-degree one.
    transform.previousRotation = (179 * Math.PI) / 180;
    transform.rotation = (-179 * Math.PI) / 180;

    mod.spriteRenderSystem(world, 0.5);

    const drawn = drawList.at(0).rotation;
    const distance = Math.abs(drawn - transform.previousRotation);
    expect(distance).toBeLessThan(Math.PI / 45); // under 4 degrees
  });
});

describe('syncPreviousTransform', () => {
  it('copies current into previous', () => {
    const e = world.spawn([mod.Transform]);
    const transform = world.get(e, mod.Transform);
    transform.position.set(42, 84);
    transform.rotation = 1.5;

    mod.syncPreviousTransform(world);

    expect(transform.previousPosition.x).toBe(42);
    expect(transform.previousPosition.y).toBe(84);
    expect(transform.previousRotation).toBe(1.5);
  });

  it('copies values rather than aliasing the vector', () => {
    const e = world.spawn([mod.Transform]);
    const transform = world.get(e, mod.Transform);
    mod.syncPreviousTransform(world);
    transform.position.set(999, 999);
    expect(transform.previousPosition.x).toBe(0);
  });

  // Registered at order -1000 so it lands before any gameplay system moves anything.
  it('is installed first in fixedUpdate', () => {
    mod.installRenderSystems(world);
    const first = world.scheduler.systemsIn('fixedUpdate')[0];
    expect(first.name).toBe('syncPreviousTransform');
    expect(first.order).toBeLessThan(0);
  });
});

describe('shape and text systems', () => {
  it('emits rectangle commands scaled by the transform', () => {
    const e = world.spawn([mod.Transform], [mod.ShapeRect, { width: 10, height: 20 }]);
    world.get(e, mod.Transform).scale.set(3, 2);

    mod.shapeRenderSystem(world, 1);

    expect(drawList.at(0).width).toBe(30);
    expect(drawList.at(0).height).toBe(40);
  });

  // A circle has one radius, so a non-uniform scale cannot be represented exactly; taking the
  // larger axis stays conservative for culling.
  it('scales a circle by the larger axis', () => {
    const e = world.spawn([mod.Transform], [mod.ShapeCircle, { radius: 10 }]);
    world.get(e, mod.Transform).scale.set(3, 1);
    mod.shapeRenderSystem(world, 1);
    expect(drawList.at(0).radius).toBe(30);
  });

  it('emits text commands', () => {
    world.spawn([mod.Transform], [mod.TextLabel, { text: 'Score: 10' }]);
    mod.textRenderSystem(world, 1);
    expect(drawList.at(0).text).toBe('Score: 10');
  });

  it('skips empty text rather than emitting a no-op command', () => {
    world.spawn([mod.Transform], [mod.TextLabel, { text: '' }]);
    mod.textRenderSystem(world, 1);
    expect(drawList.length).toBe(0);
  });
});

describe('installRenderSystems', () => {
  it('registers the render systems in draw order', () => {
    mod.installRenderSystems(world);
    const names = world.scheduler.systemsIn('render').map((s) => s.name);
    expect(names).toEqual(['spriteRender', 'shapeRender', 'textRender']);
  });

  it('returns handles the caller can unregister', () => {
    const handles = mod.installRenderSystems(world);
    expect(handles).toHaveLength(4);
    for (const handle of handles) expect(world.removeSystem(handle)).toBe(true);
    expect(world.scheduler.size).toBe(0);
  });
});
