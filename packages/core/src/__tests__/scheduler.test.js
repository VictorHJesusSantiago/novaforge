import { describe, it, expect } from 'vitest';
import { Scheduler, STAGES } from '../scheduler.js';
import { World } from '../world.js';

describe('stage registration', () => {
  it('exposes the five stages in execution order', () => {
    expect(STAGES).toEqual(['preUpdate', 'fixedUpdate', 'update', 'postUpdate', 'render']);
  });

  it('runs a registered system', () => {
    const scheduler = new Scheduler();
    const world = new World();
    let ran = 0;
    scheduler.add('update', () => {
      ran += 1;
    });
    scheduler.run('update', world, 0.016);
    expect(ran).toBe(1);
  });

  it('passes the world and delta through', () => {
    const scheduler = new Scheduler();
    const world = new World();
    let received = null;
    scheduler.add('update', (w, dt) => {
      received = { w, dt };
    });
    scheduler.run('update', world, 0.5);
    expect(received?.w).toBe(world);
    expect(received?.dt).toBe(0.5);
  });

  it('keeps stages independent', () => {
    const scheduler = new Scheduler();
    const world = new World();
    let update = 0;
    let render = 0;
    scheduler.add('update', () => {
      update += 1;
    });
    scheduler.add('render', () => {
      render += 1;
    });
    scheduler.run('update', world, 0);
    expect(update).toBe(1);
    expect(render).toBe(0);
  });

  it('running an empty stage is a no-op', () => {
    expect(() => new Scheduler().run('render', new World(), 0)).not.toThrow();
  });

  it('throws on an unknown stage and lists the valid ones', () => {
    const scheduler = new Scheduler();
    expect(() => scheduler.add(/** @type {any} */ ('tick'), () => {})).toThrow(/preUpdate/);
  });

  it('rejects a non-function system', () => {
    const scheduler = new Scheduler();
    expect(() => scheduler.add('update', /** @type {any} */ (42))).toThrow(TypeError);
  });
});

describe('ordering', () => {
  it('runs lower order values first', () => {
    const scheduler = new Scheduler();
    const order = [];
    scheduler.add('update', () => order.push('late'), { order: 10 });
    scheduler.add('update', () => order.push('early'), { order: -10 });
    scheduler.add('update', () => order.push('middle'), { order: 0 });
    scheduler.run('update', new World(), 0);
    expect(order).toEqual(['early', 'middle', 'late']);
  });

  it('breaks ties by registration order, and the sort is stable', () => {
    const scheduler = new Scheduler();
    const order = [];
    scheduler.add('update', () => order.push('a'));
    scheduler.add('update', () => order.push('b'));
    scheduler.add('update', () => order.push('c'));
    scheduler.run('update', new World(), 0);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('keeps ordering stable across repeated runs', () => {
    const scheduler = new Scheduler();
    const world = new World();
    const runs = [];
    scheduler.add('update', () => runs.push('x'), { order: 1 });
    scheduler.add('update', () => runs.push('y'), { order: 1 });
    scheduler.run('update', world, 0);
    scheduler.run('update', world, 0);
    expect(runs).toEqual(['x', 'y', 'x', 'y']);
  });
});

describe('lifecycle', () => {
  it('removes a system by handle', () => {
    const scheduler = new Scheduler();
    let ran = 0;
    const handle = scheduler.add('update', () => {
      ran += 1;
    });
    expect(scheduler.remove(handle)).toBe(true);
    scheduler.run('update', new World(), 0);
    expect(ran).toBe(0);
  });

  it('reports false when removing an unknown handle', () => {
    expect(new Scheduler().remove(999)).toBe(false);
  });

  it('skips a disabled system without unregistering it', () => {
    const scheduler = new Scheduler();
    let ran = 0;
    const handle = scheduler.add('update', () => {
      ran += 1;
    });
    scheduler.setEnabled(handle, false);
    scheduler.run('update', new World(), 0);
    expect(ran).toBe(0);
    expect(scheduler.size).toBe(1);

    scheduler.setEnabled(handle, true);
    scheduler.run('update', new World(), 0);
    expect(ran).toBe(1);
  });

  it('allows a system to register another system mid-stage', () => {
    const scheduler = new Scheduler();
    const world = new World();
    let added = 0;
    scheduler.add('update', () => {
      scheduler.add('update', () => {
        added += 1;
      });
    });

    scheduler.run('update', world, 0);
    expect(added).toBe(0);
    scheduler.run('update', world, 0);
    expect(added).toBe(1);
  });

  it('allows a system to remove itself mid-stage', () => {
    const scheduler = new Scheduler();
    const world = new World();
    let ran = 0;
    const handle = scheduler.add('update', () => {
      ran += 1;
      scheduler.remove(handle);
    });
    scheduler.run('update', world, 0);
    scheduler.run('update', world, 0);
    expect(ran).toBe(1);
  });

  it('clear removes everything', () => {
    const scheduler = new Scheduler();
    scheduler.add('update', () => {});
    scheduler.add('render', () => {});
    scheduler.clear();
    expect(scheduler.size).toBe(0);
  });
});

describe('profiling', () => {
  it('records no timings while profiling is off', () => {
    const scheduler = new Scheduler();
    scheduler.add('update', () => {}, { name: 'noop' });
    scheduler.run('update', new World(), 0);
    expect(scheduler.profile()[0].ms).toBe(0);
  });

  it('records a timing per system while profiling is on', () => {
    const scheduler = new Scheduler();
    scheduler.profiling = true;
    scheduler.add('update', () => {
      let total = 0;
      for (let i = 0; i < 100000; i += 1) total += i;
      return total;
    }, { name: 'busy' });
    scheduler.run('update', new World(), 0);

    const row = scheduler.profile().find((r) => r.name === 'busy');
    expect(row?.ms).toBeGreaterThanOrEqual(0);
    expect(row?.stage).toBe('update');
  });

  it('names anonymous systems by their stage', () => {
    const scheduler = new Scheduler();
    scheduler.add('render', () => {});
    expect(scheduler.profile()[0].name).toMatch(/render/);
  });

  it('prefers an explicit name over the function name', () => {
    const scheduler = new Scheduler();
    scheduler.add('update', function movement() {}, { name: 'Movement' });
    expect(scheduler.profile()[0].name).toBe('Movement');
  });
});

describe('World integration', () => {
  it('runStage runs the systems registered through the world', () => {
    const world = new World();
    let ran = 0;
    world.addSystem('fixedUpdate', () => {
      ran += 1;
    });
    world.runStage('fixedUpdate', 1 / 60);
    expect(ran).toBe(1);
  });

  it('removeSystem unregisters through the world', () => {
    const world = new World();
    const handle = world.addSystem('update', () => {});
    expect(world.removeSystem(handle)).toBe(true);
    expect(world.scheduler.size).toBe(0);
  });
});
