import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../world.js';
import { defineComponent, defineTag, resetComponentRegistry } from '../component.js';
import { NULL_ENTITY, entityIndex } from '../entity.js';

/** @type {any} */ let Position;
/** @type {any} */ let Velocity;
/** @type {any} */ let Frozen;

beforeEach(() => {
  resetComponentRegistry();
  Position = defineComponent('Position', () => ({ x: 0, y: 0 }));
  Velocity = defineComponent('Velocity', () => ({ dx: 0, dy: 0 }));
  Frozen = defineTag('Frozen');
});

describe('entity lifecycle', () => {
  it('creates live entities', () => {
    const world = new World();
    const e = world.createEntity();
    expect(world.isAlive(e)).toBe(true);
    expect(world.entityCount).toBe(1);
  });

  it('never mints the null handle', () => {
    const world = new World();
    for (let i = 0; i < 100; i += 1) {
      expect(world.createEntity()).not.toBe(NULL_ENTITY);
    }
    expect(world.isAlive(NULL_ENTITY)).toBe(false);
  });

  it('kills the handle immediately on destroy', () => {
    const world = new World();
    const e = world.createEntity();
    world.destroy(e);
    expect(world.isAlive(e)).toBe(false);
    expect(world.entityCount).toBe(0);
  });

  it('treats a second destroy as a no-op', () => {
    const world = new World();
    const e = world.createEntity();
    expect(world.destroy(e)).toBe(true);
    expect(world.destroy(e)).toBe(false);
    expect(world.entityCount).toBe(0);
  });

  it('defers storage cleanup until flushDestroyed', () => {
    const world = new World();
    const e = world.createEntity();
    world.add(e, Position);
    world.destroy(e);

    expect(world.pendingDestroyCount).toBe(1);
    expect(world.store(Position).size).toBe(1);

    expect(world.flushDestroyed()).toBe(1);
    expect(world.pendingDestroyCount).toBe(0);
    expect(world.store(Position).size).toBe(0);
  });

  it('destroyImmediate reclaims without waiting for a flush', () => {
    const world = new World();
    const e = world.createEntity();
    world.add(e, Position);
    world.destroyImmediate(e);
    expect(world.store(Position).size).toBe(0);
    expect(world.pendingDestroyCount).toBe(0);
  });
});

describe('entity handle generations', () => {
  // Invariant E1. This is the single most important correctness property in the ECS: it is
  // what makes it safe for a component to hold another entity's handle.
  it('does not resurrect a stale handle when the index is reused', () => {
    const world = new World();
    const first = world.createEntity();
    world.destroy(first);
    world.flushDestroyed();

    const second = world.createEntity();
    expect(entityIndex(second)).toBe(entityIndex(first)); // index was recycled
    expect(second).not.toBe(first); // but the handle differs
    expect(world.isAlive(first)).toBe(false);
    expect(world.isAlive(second)).toBe(true);
  });

  it('rejects component access through a stale handle', () => {
    const world = new World();
    const stale = world.createEntity();
    world.add(stale, Position, { x: 99 });
    world.destroy(stale);
    world.flushDestroyed();

    const fresh = world.createEntity();
    world.add(fresh, Position, { x: 1 });

    expect(world.get(stale, Position)).toBeUndefined();
    expect(world.has(stale, Position)).toBe(false);
    expect(world.get(fresh, Position)?.x).toBe(1);
  });

  // Invariant E3: LIFO reuse keeps the dense arrays compact.
  it('reuses indices last-in-first-out', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    world.destroy(a);
    world.destroy(b);
    world.flushDestroyed();

    const next = world.createEntity();
    expect(entityIndex(next)).toBe(entityIndex(b));
  });

  it('does not leak indices over many create/destroy cycles', () => {
    const world = new World();
    for (let i = 0; i < 10000; i += 1) {
      const e = world.createEntity();
      world.destroy(e);
      world.flushDestroyed();
    }
    expect(world.entityCount).toBe(0);
    // One index, recycled ten thousand times.
    expect(world.stats().storedComponents).toBe(0);
  });
});

describe('components', () => {
  it('applies factory defaults', () => {
    const world = new World();
    const e = world.createEntity();
    expect(world.add(e, Position)).toEqual({ x: 0, y: 0 });
  });

  it('overlays supplied values onto the defaults', () => {
    const world = new World();
    const e = world.createEntity();
    expect(world.add(e, Position, { x: 5 })).toEqual({ x: 5, y: 0 });
  });

  // A shared instance across entities is a bug that hides for a long time, so the factory
  // contract is asserted directly.
  it('gives every entity its own instance', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    world.add(a, Position).x = 10;
    expect(world.get(b, Position)).toBeUndefined();

    world.add(b, Position);
    expect(world.get(b, Position)?.x).toBe(0);
  });

  it('overwrites on re-add, resetting to defaults', () => {
    const world = new World();
    const e = world.createEntity();
    world.add(e, Position, { x: 50 });
    world.add(e, Position);
    expect(world.get(e, Position)?.x).toBe(0);
  });

  it('removes a component', () => {
    const world = new World();
    const e = world.createEntity();
    world.add(e, Position);
    expect(world.remove(e, Position)).toBe(true);
    expect(world.has(e, Position)).toBe(false);
    expect(world.remove(e, Position)).toBe(false);
  });

  it('stores a tag as a bare true rather than an object', () => {
    const world = new World();
    const e = world.createEntity();
    expect(world.add(e, Frozen)).toBe(true);
    expect(world.has(e, Frozen)).toBe(true);
  });

  // A silent no-op here produces entities that mysteriously lack components later.
  it('throws when adding to a dead entity', () => {
    const world = new World();
    const e = world.createEntity();
    world.destroy(e);
    expect(() => world.add(e, Position)).toThrow(/not alive/);
  });

  it('getOrThrow reports the missing component by name', () => {
    const world = new World();
    const e = world.createEntity();
    expect(() => world.getOrThrow(e, Position)).toThrow(/Position/);
  });

  it('getOrAdd attaches a default when absent and reuses it afterwards', () => {
    const world = new World();
    const e = world.createEntity();
    const created = world.getOrAdd(e, Position);
    created.x = 7;
    expect(world.getOrAdd(e, Position)).toBe(created);
    expect(world.getOrAdd(e, Position).x).toBe(7);
  });

  it('lists every component on an entity', () => {
    const world = new World();
    const e = world.createEntity();
    world.add(e, Position);
    world.add(e, Velocity);
    const names = world.componentsOf(e).map((c) => c.type.name).sort();
    expect(names).toEqual(['Position', 'Velocity']);
  });
});

describe('spawn', () => {
  it('creates an entity with components in one call', () => {
    const world = new World();
    const e = world.spawn([Position, { x: 3 }], [Velocity, { dx: 1 }], [Frozen]);
    expect(world.get(e, Position)?.x).toBe(3);
    expect(world.get(e, Velocity)?.dx).toBe(1);
    expect(world.has(e, Frozen)).toBe(true);
  });
});

describe('resources', () => {
  it('stores and reads a resource', () => {
    const world = new World();
    world.setResource('config', { volume: 0.5 });
    expect(world.getResource('config')).toEqual({ volume: 0.5 });
  });

  it('returns undefined for an unknown resource', () => {
    expect(new World().getResource('nope')).toBeUndefined();
  });

  // Usually means a plugin failed to install; failing loudly points straight at it.
  it('requireResource throws with the key in the message', () => {
    expect(() => new World().requireResource('renderer')).toThrow(/renderer/);
  });
});

describe('entities', () => {
  it('lists every live entity', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    expect(world.entities().sort()).toEqual([a, b].sort());
  });

  // Deliberately not a query: the editor's scene tree must see an entity with nothing on it
  // yet, and a query requires at least one component.
  it('includes entities with no components at all', () => {
    const world = new World();
    const bare = world.createEntity();
    expect(world.entities()).toEqual([bare]);
  });

  it('excludes destroyed entities immediately', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    world.destroy(a);
    expect(world.entities()).toEqual([b]);
  });

  it('is empty for a fresh world', () => {
    expect(new World().entities()).toEqual([]);
  });

  it('never includes a stale handle after its index is recycled', () => {
    const world = new World();
    const first = world.createEntity();
    world.destroy(first);
    world.flushDestroyed();
    const second = world.createEntity();

    expect(world.entities()).toEqual([second]);
    expect(world.entities()).not.toContain(first);
  });
});

describe('teardown', () => {
  it('clearEntities empties entities but keeps systems', () => {
    const world = new World();
    world.addSystem('update', () => {});
    world.spawn([Position]);
    world.clearEntities();

    expect(world.entityCount).toBe(0);
    expect(world.store(Position).size).toBe(0);
    expect(world.scheduler.size).toBe(1);
  });

  it('reset clears everything', () => {
    const world = new World();
    world.addSystem('update', () => {});
    world.setResource('a', 1);
    world.spawn([Position]);
    world.reset();

    expect(world.entityCount).toBe(0);
    expect(world.scheduler.size).toBe(0);
    expect(world.getResource('a')).toBeUndefined();
  });

  it('is usable again after clearEntities', () => {
    const world = new World();
    world.spawn([Position]);
    world.clearEntities();
    const e = world.spawn([Position, { x: 8 }]);
    expect(world.isAlive(e)).toBe(true);
    expect(world.get(e, Position)?.x).toBe(8);
  });
});

describe('stats', () => {
  it('reports live counters', () => {
    const world = new World();
    world.spawn([Position], [Velocity]);
    world.spawn([Position]);
    const stats = world.stats();
    expect(stats.entities).toBe(2);
    expect(stats.storedComponents).toBe(3);
    expect(stats.componentTypes).toBe(2);
  });
});
