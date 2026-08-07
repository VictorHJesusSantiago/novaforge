import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events.js';

describe('buffered events', () => {
  // The defining property: emitting and reading in the same frame must not deliver, otherwise
  // whether a system sees an event depends on whether it happens to run after the emitter.
  it('does not deliver within the same frame', () => {
    const bus = new EventBus();
    bus.emit('damage', { amount: 10 });
    expect(bus.read('damage')).toHaveLength(0);
  });

  it('delivers after a swap', () => {
    const bus = new EventBus();
    bus.emit('damage', { amount: 10 });
    bus.swap();
    expect(bus.read('damage')).toEqual([{ amount: 10 }]);
  });

  it('drops events after the following swap', () => {
    const bus = new EventBus();
    bus.emit('damage', 1);
    bus.swap();
    expect(bus.read('damage')).toHaveLength(1);
    bus.swap();
    expect(bus.read('damage')).toHaveLength(0);
  });

  it('preserves emission order', () => {
    const bus = new EventBus();
    bus.emit('n', 1);
    bus.emit('n', 2);
    bus.emit('n', 3);
    bus.swap();
    expect(bus.read('n')).toEqual([1, 2, 3]);
  });

  it('keeps channels separate', () => {
    const bus = new EventBus();
    bus.emit('a', 'x');
    bus.emit('b', 'y');
    bus.swap();
    expect(bus.read('a')).toEqual(['x']);
    expect(bus.read('b')).toEqual(['y']);
  });

  // Callers iterate the result directly, so an idle channel must not be undefined.
  it('returns an empty array for a channel that never fired', () => {
    const bus = new EventBus();
    expect(bus.read('never')).toEqual([]);
    expect(() => {
      for (const _ of bus.read('never')) { /* empty */ }
    }).not.toThrow();
  });

  it('counts readable events', () => {
    const bus = new EventBus();
    bus.emit('a', 1);
    bus.emit('a', 2);
    bus.swap();
    expect(bus.count('a')).toBe(2);
    expect(bus.count('b')).toBe(0);
  });

  it('lists the channels holding events', () => {
    const bus = new EventBus();
    bus.emit('a', 1);
    bus.swap();
    expect(bus.activeChannels()).toEqual(['a']);
  });

  it('survives many swap cycles without accumulating', () => {
    const bus = new EventBus();
    for (let i = 0; i < 1000; i += 1) {
      bus.emit('tick', i);
      bus.swap();
      expect(bus.count('tick')).toBe(1);
    }
  });
});

describe('overflow guard', () => {
  // A typo'd channel name that nothing reads would otherwise leak for the whole session.
  it('drops the surplus past the cap and warns once', () => {
    const bus = new EventBus();
    bus.maxEventsPerChannel = 10;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < 100; i += 1) bus.emit('spam', i);
    bus.swap();

    expect(bus.count('spam')).toBe(10);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('immediate events', () => {
  it('delivers synchronously to subscribers', () => {
    const bus = new EventBus();
    const received = [];
    bus.subscribe('loaded', (payload) => received.push(payload));
    bus.publish('loaded', 'texture');
    expect(received).toEqual(['texture']);
  });

  it('delivers to every subscriber and reports the count', () => {
    const bus = new EventBus();
    bus.subscribe('x', () => {});
    bus.subscribe('x', () => {});
    expect(bus.publish('x', null)).toBe(2);
  });

  it('unsubscribes through the returned function', () => {
    const bus = new EventBus();
    let calls = 0;
    const off = bus.subscribe('x', () => {
      calls += 1;
    });
    bus.publish('x');
    off();
    bus.publish('x');
    expect(calls).toBe(1);
  });

  it('publishing to a channel with no subscribers is a no-op', () => {
    expect(new EventBus().publish('nobody')).toBe(0);
  });

  // One broken listener must not take down the frame.
  it('isolates a throwing handler from the others', () => {
    const bus = new EventBus();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reached = false;

    bus.subscribe('x', () => {
      throw new Error('boom');
    });
    bus.subscribe('x', () => {
      reached = true;
    });

    expect(() => bus.publish('x')).not.toThrow();
    expect(reached).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('keeps the immediate and buffered paths independent', () => {
    const bus = new EventBus();
    let immediate = 0;
    bus.subscribe('x', () => {
      immediate += 1;
    });
    bus.emit('x', 1);
    bus.swap();
    expect(immediate).toBe(0);
    expect(bus.count('x')).toBe(1);
  });
});

describe('clear', () => {
  it('drops buffered events and subscribers', () => {
    const bus = new EventBus();
    let called = 0;
    bus.subscribe('x', () => {
      called += 1;
    });
    bus.emit('x', 1);
    bus.clear();
    bus.swap();

    expect(bus.count('x')).toBe(0);
    bus.publish('x');
    expect(called).toBe(0);
  });
});
