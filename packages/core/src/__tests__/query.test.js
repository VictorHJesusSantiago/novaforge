import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../world.js';
import { defineComponent, defineTag, resetComponentRegistry } from '../component.js';

/** @type {any} */ let Position;
/** @type {any} */ let Velocity;
/** @type {any} */ let Health;
/** @type {any} */ let Frozen;

beforeEach(() => {
  resetComponentRegistry();
  Position = defineComponent('Position', () => ({ x: 0, y: 0 }));
  Velocity = defineComponent('Velocity', () => ({ dx: 0, dy: 0 }));
  Health = defineComponent('Health', () => ({ hp: 100 }));
  Frozen = defineTag('Frozen');
});

describe('query matching', () => {
  it('yields entities holding every required component', () => {
    const world = new World();
    const both = world.spawn([Position], [Velocity]);
    world.spawn([Position]);
    world.spawn([Velocity]);

    const found = world.query([Position, Velocity]).entities();
    expect(found).toEqual([both]);
  });

  it('yields component values alongside the entity', () => {
    const world = new World();
    world.spawn([Position, { x: 7 }], [Velocity, { dx: 3 }]);

    const [[, position, velocity]] = Array.from(world.query([Position, Velocity]));
    expect(position.x).toBe(7);
    expect(velocity.dx).toBe(3);
  });

  it('yields live references, so mutating through the query sticks', () => {
    const world = new World();
    const e = world.spawn([Position]);
    for (const [, position] of world.query([Position])) position.x = 42;
    expect(world.get(e, Position)?.x).toBe(42);
  });

  it('excludes entities holding a "without" component', () => {
    const world = new World();
    const moving = world.spawn([Position]);
    world.spawn([Position], [Frozen]);

    expect(world.query([Position], { without: [Frozen] }).entities()).toEqual([moving]);
  });

  it('excludes destroyed entities immediately, before any flush', () => {
    const world = new World();
    const keep = world.spawn([Position]);
    const kill = world.spawn([Position]);
    world.destroy(kill);

    expect(world.query([Position]).entities()).toEqual([keep]);
  });

  it('matches nothing in an empty world', () => {
    const world = new World();
    expect(world.query([Position]).isEmpty()).toBe(true);
    expect(world.query([Position]).count()).toBe(0);
  });

  it('rejects an empty component list', () => {
    const world = new World();
    expect(() => world.query([])).toThrow(/at least one/);
  });
});

describe('query mutation safety', () => {
  // Invariant Q1. Without the snapshot, a swap-remove during iteration moves an unvisited
  // entity into an already-visited slot and it is silently skipped — the classic
  // "every other enemy survives" bug.
  it('visits every survivor when entities are destroyed mid-iteration', () => {
    const world = new World();
    const entities = [];
    for (let i = 0; i < 100; i += 1) {
      entities.push(world.spawn([Position, { x: i }], [Health]));
    }

    const visited = new Set();
    for (const [entity, position] of world.query([Position, Health])) {
      visited.add(entity);
      if (position.x % 2 === 0) world.destroy(entity);
    }

    expect(visited.size).toBe(100);
  });

  it('never yields an entity destroyed earlier in the same iteration', () => {
    const world = new World();
    const a = world.spawn([Position]);
    const b = world.spawn([Position]);
    const c = world.spawn([Position]);

    const seen = [];
    for (const [entity] of world.query([Position])) {
      seen.push(entity);
      // Destroy everything on the first visit.
      world.destroy(a);
      world.destroy(b);
      world.destroy(c);
    }

    expect(seen).toHaveLength(1);
  });

  it('does not visit entities spawned during iteration', () => {
    const world = new World();
    world.spawn([Position]);

    let visits = 0;
    for (const [] of world.query([Position])) {
      visits += 1;
      if (visits < 50) world.spawn([Position]);
    }

    // The snapshot was taken before any of the new entities existed.
    expect(visits).toBe(1);
    expect(world.entityCount).toBe(2);
  });

  it('skips entities that lose a required component mid-iteration', () => {
    const world = new World();
    const a = world.spawn([Position, { x: 0 }], [Health]);
    const b = world.spawn([Position, { x: 1 }], [Health]);

    const seen = [];
    for (const [entity] of world.query([Position, Health])) {
      seen.push(entity);
      if (entity === a) world.remove(b, Health);
    }

    // Whichever came first, the other must have been re-checked and rejected.
    if (seen[0] === a) expect(seen).toEqual([a]);
    else expect(seen).toEqual([b, a]);
  });
});

describe('query driving store', () => {
  // The performance property from SPEC §5: cost is bounded by the rarest component, not by
  // the world size.
  it('drives iteration from the smallest participating store', () => {
    const world = new World();
    for (let i = 0; i < 5000; i += 1) world.spawn([Position]);
    const rare = world.spawn([Position], [Health]);

    const query = world.query([Position, Health]);

    // Count probes by instrumenting the small store's snapshot method.
    const smallStore = world.store(Health);
    let snapshots = 0;
    const original = smallStore.entityIndices.bind(smallStore);
    smallStore.entityIndices = () => {
      snapshots += 1;
      return original();
    };

    expect(query.entities()).toEqual([rare]);
    expect(snapshots).toBe(1);
  });
});

describe('query iteration forms', () => {
  it('each passes values as arguments and reports the visit count', () => {
    const world = new World();
    world.spawn([Position, { x: 1 }], [Velocity, { dx: 10 }]);
    world.spawn([Position, { x: 2 }], [Velocity, { dx: 20 }]);

    let sum = 0;
    const visited = world.query([Position, Velocity]).each((_entity, position, velocity) => {
      sum += position.x + velocity.dx;
    });

    expect(visited).toBe(2);
    expect(sum).toBe(33);
  });

  it('each handles arities beyond the unrolled cases', () => {
    const world = new World();
    const D = defineComponent('D', () => ({ v: 4 }));
    world.spawn([Position], [Velocity], [Health], [D]);

    let arity = 0;
    world.query([Position, Velocity, Health, D]).each((...args) => {
      arity = args.length;
    });
    expect(arity).toBe(5); // entity + four components
  });

  it('count matches the number of yielded entities', () => {
    const world = new World();
    for (let i = 0; i < 10; i += 1) world.spawn([Position]);
    const query = world.query([Position]);
    expect(query.count()).toBe(Array.from(query).length);
  });

  it('first returns null when nothing matches', () => {
    expect(new World().query([Position]).first()).toBeNull();
  });

  it('first returns a match when one exists', () => {
    const world = new World();
    const e = world.spawn([Position, { x: 9 }]);
    const result = world.query([Position]).first();
    expect(result?.[0]).toBe(e);
    expect(result?.[1].x).toBe(9);
  });
});

describe('query caching', () => {
  it('returns the same instance for the same shape', () => {
    const world = new World();
    expect(world.query([Position, Velocity])).toBe(world.query([Position, Velocity]));
  });

  it('distinguishes queries by their "without" set', () => {
    const world = new World();
    expect(world.query([Position])).not.toBe(world.query([Position], { without: [Frozen] }));
  });

  it('a cached query reflects later changes to the world', () => {
    const world = new World();
    const query = world.query([Position]);
    expect(query.count()).toBe(0);
    world.spawn([Position]);
    expect(query.count()).toBe(1);
  });
});
