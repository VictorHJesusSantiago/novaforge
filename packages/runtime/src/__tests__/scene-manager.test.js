import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@novaforge/core';
import { SceneManager } from '../scene-manager.js';
import { Scene } from '../scene.js';

/** A stand-in for `Game`; the scene manager only ever touches `assets`. */
const fakeGame = { assets: { loadManifest: async () => {} } };

/** @type {string[]} */ let log;
/** @type {World} */ let world;
/** @type {SceneManager} */ let scenes;

class Recording extends Scene {
  onEnter() {
    log.push(`enter:${this.name}`);
  }
  onExit() {
    log.push(`exit:${this.name}`);
  }
  onPause() {
    log.push(`pause:${this.name}`);
  }
  onResume() {
    log.push(`resume:${this.name}`);
  }
}

class Level extends Recording {}
class Menu extends Recording {}

beforeEach(() => {
  log = [];
  world = new World();
  scenes = new SceneManager(world, /** @type {any} */ (fakeGame));
  scenes.register('level', Level).register('menu', Menu);
});

describe('change', () => {
  it('enters a scene', async () => {
    await scenes.change('level');
    expect(scenes.active?.name).toBe('level');
    expect(log).toEqual(['enter:level']);
  });

  it('exits the previous scene before entering the next', async () => {
    await scenes.change('level');
    await scenes.change('menu');
    expect(log).toEqual(['enter:level', 'exit:level', 'enter:menu']);
    expect(scenes.depth).toBe(1);
  });

  it('collapses a whole stack', async () => {
    await scenes.change('level');
    await scenes.push('menu');
    await scenes.change('level');
    expect(scenes.depth).toBe(1);
    expect(scenes.active?.name).toBe('level');
  });

  // A typo'd scene name is a programming error and should say so, naming the alternatives.
  it('throws for an unregistered scene and lists what is known', async () => {
    await expect(scenes.change('nope')).rejects.toThrow(/level/);
  });
});

describe('push and pop', () => {
  // The pause-menu requirement: the level must survive underneath, entities and all.
  it('pauses the scene below rather than tearing it down', async () => {
    await scenes.change('level');
    await scenes.push('menu');

    expect(log).toEqual(['enter:level', 'pause:level', 'enter:menu']);
    expect(scenes.depth).toBe(2);
    expect(scenes.active?.name).toBe('menu');
  });

  it('resumes the scene below on pop', async () => {
    await scenes.change('level');
    await scenes.push('menu');
    log.length = 0;

    await scenes.pop();

    expect(log).toEqual(['exit:menu', 'resume:level']);
    expect(scenes.active?.name).toBe('level');
  });

  it('popping an empty stack is a no-op', async () => {
    expect(await scenes.pop()).toBeNull();
  });

  it('reports the stack bottom-first', async () => {
    await scenes.change('level');
    await scenes.push('menu');
    expect(scenes.stackNames()).toEqual(['level', 'menu']);
  });
});

describe('teardown', () => {
  class Populated extends Scene {
    onEnter() {
      this.addSystem('update', () => {});
      this.addSystem('render', () => {});
      this.spawn();
      this.spawn();
    }
  }

  beforeEach(() => {
    scenes.register('populated', Populated);
  });

  // Leaked systems from a previous scene make the game behave as though two levels are
  // running at once, because they are.
  it('unregisters the systems a scene registered', async () => {
    await scenes.change('populated');
    expect(world.scheduler.size).toBe(2);

    await scenes.change('level');
    expect(world.scheduler.size).toBe(0);
  });

  it('destroys the entities a scene spawned', async () => {
    await scenes.change('populated');
    expect(world.entityCount).toBe(2);

    await scenes.change('level');
    expect(world.entityCount).toBe(0);
  });

  it('leaves entities it did not spawn alone', async () => {
    const outsider = world.createEntity();
    await scenes.change('populated');
    await scenes.change('level');

    expect(world.isAlive(outsider)).toBe(true);
  });

  it('clear tears down the whole stack', async () => {
    await scenes.change('populated');
    await scenes.push('menu');
    await scenes.clear();

    expect(scenes.depth).toBe(0);
    expect(world.scheduler.size).toBe(0);
    expect(world.entityCount).toBe(0);
  });
});

describe('transition guarding', () => {
  class Slow extends Scene {
    async onEnter() {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  beforeEach(() => {
    scenes.register('slow', Slow);
  });

  // Scene changes are async because of preloading; two interleaved teardowns would corrupt
  // the stack. The guard surfaces as a rejection rather than a synchronous throw, because
  // `change` is async and a caller should only ever have to handle one failure channel.
  it('rejects a second transition while one is in flight', async () => {
    const first = scenes.change('slow');
    await expect(scenes.change('level')).rejects.toThrow(/already running/);
    await first;
  });

  it('allows a transition once the previous one settles', async () => {
    await scenes.change('slow');
    expect(scenes.isTransitioning).toBe(false);
    await expect(scenes.change('level')).resolves.toBeDefined();
  });

  it('clears the transition flag even when entering throws', async () => {
    class Broken extends Scene {
      onEnter() {
        throw new Error('boom');
      }
    }
    scenes.register('broken', Broken);

    await expect(scenes.change('broken')).rejects.toThrow('boom');
    expect(scenes.isTransitioning).toBe(false);
  });
});

describe('scene helpers', () => {
  it('refuses to register systems before the scene is bound', () => {
    const scene = new Scene('unbound');
    expect(() => scene.addSystem('update', () => {})).toThrow(/before the scene was bound/);
    expect(() => scene.spawn()).toThrow(/before the scene was bound/);
  });

  it('counts what it owns', async () => {
    class Counted extends Scene {
      onEnter() {
        this.addSystem('update', () => {});
        this.spawn();
        this.spawn();
        this.spawn();
      }
    }
    scenes.register('counted', Counted);
    await scenes.change('counted');

    expect(scenes.active?.systemCount).toBe(1);
    expect(scenes.active?.entityCount).toBe(3);
  });

  it('defaults its name to the class name', () => {
    expect(new Level().name).toBe('Level');
  });
});
