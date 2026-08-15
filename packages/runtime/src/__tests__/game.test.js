import { describe, it, expect, beforeEach } from 'vitest';
import { Transform } from '@novaforge/core';
import { ShapeRect, Sprite } from '@novaforge/renderer';
import { RigidBody, Collider, BodyType, box, setMass, makeStatic } from '@novaforge/physics';
import { Game } from '../game.js';
import { Scene } from '../scene.js';

/**
 * End-to-end tests over the whole engine, run headlessly.
 *
 * A `Game` with no canvas has no renderer, but every other stage still runs — including
 * `render`, which still fills the draw list. That is what makes it possible to assert on
 * exactly what *would* have been drawn without a browser, a canvas, or image comparison.
 */

/** @type {Game} */ let game;

beforeEach(() => {
  game = new Game({ gravity: { x: 0, y: 980 } });
});

/**
 * Drive N frames at a steady 60 Hz.
 * @param {number} count
 * @param {number} [startMs]
 */
function runFrames(count, startMs = 0) {
  let now = startMs;
  game.frame(now);
  for (let i = 0; i < count; i += 1) {
    now += 1000 / 60;
    game.frame(now);
  }
  return now;
}

describe('headless construction', () => {
  it('builds without a canvas', () => {
    expect(game.renderer).toBeNull();
    expect(game.world).toBeDefined();
    expect(game.physics).not.toBeNull();
  });

  it('installs the engine systems in the right stages', () => {
    const fixed = game.world.scheduler.systemsIn('fixedUpdate').map((s) => s.name);
    expect(fixed[0]).toBe('syncPreviousTransform');
    expect(fixed).toContain('physicsStep');

    expect(game.world.scheduler.systemsIn('preUpdate').map((s) => s.name)).toContain('sampleInput');
    expect(game.world.scheduler.systemsIn('render').map((s) => s.name)).toContain('spriteRender');
  });

  it('can skip physics entirely', () => {
    const noPhysics = new Game({ physics: false });
    expect(noPhysics.physics).toBeNull();
    expect(noPhysics.world.scheduler.systemsIn('fixedUpdate').map((s) => s.name)).not.toContain(
      'physicsStep',
    );
  });

  it('registers the shared resources', () => {
    expect(game.world.getResource('drawList')).toBe(game.drawList);
    expect(game.world.getResource('camera')).toBe(game.camera);
    expect(game.world.getResource('input')).toBe(game.input);
  });
});

describe('the frame', () => {
  it('runs every stage in order', () => {
    /** @type {string[]} */
    const order = [];
    for (const stage of ['preUpdate', 'fixedUpdate', 'update', 'postUpdate', 'render']) {
      game.world.addSystem(/** @type {any} */ (stage), () => order.push(stage), { order: 500 });
    }

    game.frame(0);
    order.length = 0;
    game.frame(1000 / 60);

    expect(order).toEqual(['preUpdate', 'fixedUpdate', 'update', 'postUpdate', 'render']);
  });

  it('runs fixedUpdate a variable number of times and the others exactly once', () => {
    let fixed = 0;
    let update = 0;
    game.world.addSystem('fixedUpdate', () => (fixed += 1), { order: 500 });
    game.world.addSystem('update', () => (update += 1), { order: 500 });

    runFrames(60);

    expect(update).toBe(61);
    expect(fixed).toBeGreaterThanOrEqual(58);
    expect(fixed).toBeLessThanOrEqual(61);
  });

  it('hands the render stage an alpha in [0, 1), not a time delta', () => {
    /** @type {number[]} */
    const alphas = [];
    game.world.addSystem('render', (_world, alpha) => alphas.push(alpha), { order: 500 });

    let now = 0;
    game.frame(now);
    for (let i = 0; i < 50; i += 1) {
      now += 7.3;
      game.frame(now);
    }

    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('rebuilds the draw list from scratch each frame', () => {
    const e = game.world.spawn([Transform], [ShapeRect, { width: 10, height: 10 }]);
    expect(e).toBeGreaterThan(0);

    runFrames(1);
    const first = game.drawList.length;
    runFrames(1, 1000);

    expect(game.drawList.length).toBe(first);
    expect(first).toBe(1);
  });

  it('flushes deferred destroys once per frame', () => {
    const doomed = game.world.spawn([Transform]);
    game.world.addSystem('update', (world) => world.destroy(doomed), { order: 500 });

    expect(game.world.entityCount).toBe(1);
    runFrames(1);
    expect(game.world.entityCount).toBe(0);
    expect(game.world.pendingDestroyCount).toBe(0);
  });
});

describe('events across frames', () => {
  it('delivers an event to the next frame regardless of system order', () => {
    /** @type {number[]} */
    const received = [];

    game.world.addSystem('update', (world) => {
      for (const payload of world.events.read('ping')) received.push(payload);
    }, { order: 1 });

    let sent = 0;
    game.world.addSystem('update', (world) => {
      sent += 1;
      world.events.emit('ping', sent);
    }, { order: 2 });

    runFrames(3);

    expect(sent).toBeGreaterThan(1);
    expect(received.length).toBeGreaterThan(0);
    expect(received[0]).toBe(1);
  });
});

describe('physics through the full frame', () => {
  /**
   * @param {object} options
   * @returns {number}
   */
  function spawnBody({ x, y, width = 20, height = 20, isStatic = false }) {
    const shape = box(width, height);
    const world = game.world;
    const entity = world.createEntity();
    world.add(entity, Transform).position.set(x, y);

    const body = world.add(entity, RigidBody, {
      type: isStatic ? BodyType.STATIC : BodyType.DYNAMIC,
    });
    if (isStatic) makeStatic(body);
    else setMass(body, shape, 1);

    world.add(entity, Collider, { shape });
    world.add(entity, ShapeRect, { width, height });
    return entity;
  }

  it('falls under gravity and lands on static ground', () => {
    spawnBody({ x: 0, y: 300, width: 400, height: 40, isStatic: true });
    const falling = spawnBody({ x: 0, y: 0 });

    runFrames(240);

    const y = game.world.get(falling, Transform)?.position.y ?? 0;
    expect(y).toBeGreaterThan(255);
    expect(y).toBeLessThan(285);
  });

  it('keeps the render transform interpolating between fixed steps', () => {
    const falling = spawnBody({ x: 0, y: 0 });
    runFrames(30);

    const transform = game.world.get(falling, Transform);
    expect(transform?.previousPosition.y).not.toBe(transform?.position.y);
    expect(transform?.previousPosition.y).toBeLessThan(transform?.position.y ?? 0);
  });
});

describe('culling and sorting', () => {
  it('culls commands outside the camera and keeps the rest', () => {
    const visible = game.world.spawn([Transform], [ShapeRect, { width: 10, height: 10 }]);
    const distant = game.world.spawn([Transform], [ShapeRect, { width: 10, height: 10 }]);
    game.world.get(distant, Transform)?.position.set(99999, 99999);
    expect(visible).toBeGreaterThan(0);

    runFrames(1);

    expect(game.drawList.length).toBe(1);
    expect(game.drawList.culled).toBe(1);
  });

  it('sorts the surviving commands into draw order', () => {
    for (const layer of [5, 1, 3]) {
      game.world.spawn([Transform], [ShapeRect, { width: 10, height: 10, layer }]);
    }

    runFrames(1);

    const layers = game.drawList.toArray().map((c) => c.layer);
    expect(layers).toEqual([1, 3, 5]);
  });

  it('mixes sprites and shapes into one sorted list', () => {
    game.world.spawn([Transform], [Sprite, { texture: 'a', layer: 2 }]);
    game.world.spawn([Transform], [ShapeRect, { width: 10, height: 10, layer: 1 }]);

    runFrames(1);

    expect(game.drawList.length).toBe(2);
    expect(game.drawList.at(0).layer).toBe(1);
  });
});

describe('scenes end to end', () => {
  class Playground extends Scene {
    onEnter() {
      this.spawn([Transform], [ShapeRect, { width: 10, height: 10 }]);
      this.addSystem('update', () => {});
    }
  }

  it('starts on a scene and ticks it', async () => {
    game.scenes.register('playground', Playground);
    await game.scenes.change('playground');

    runFrames(5);

    expect(game.world.entityCount).toBe(1);
    expect(game.drawList.length).toBe(1);
  });

  it('leaves nothing behind after destroy', async () => {
    game.scenes.register('playground', Playground);
    await game.scenes.change('playground');
    await game.destroy();

    expect(game.world.entityCount).toBe(0);
    expect(game.world.scheduler.size).toBe(0);
    expect(game.scenes.depth).toBe(0);
  });

  it('runs plugin teardown on destroy', async () => {
    let torn = false;
    game.use(() => () => {
      torn = true;
    });

    await game.destroy();
    expect(torn).toBe(true);
  });
});

describe('resize', () => {
  it('moves the camera viewport with the canvas', () => {
    game.resize(1024, 768);
    expect(game.camera.viewportWidth).toBe(1024);
    expect(game.camera.viewportHeight).toBe(768);
  });
});

describe('debugInfo', () => {
  it('reports live counters', () => {
    game.world.spawn([Transform], [ShapeRect, { width: 10, height: 10 }]);
    runFrames(10);

    const info = game.debugInfo();
    expect(info.entities).toBe(1);
    expect(info.drawCommands).toBe(1);
    expect(info.frame).toBe(11);
    expect(info.systems.render).toBeGreaterThan(0);
    expect(info.physics).not.toBeNull();
  });
});
