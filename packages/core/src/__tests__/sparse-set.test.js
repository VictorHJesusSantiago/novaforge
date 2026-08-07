import { describe, it, expect } from 'vitest';
import { SparseSet } from '../sparse-set.js';

describe('SparseSet basics', () => {
  it('starts empty', () => {
    const set = new SparseSet();
    expect(set.size).toBe(0);
    expect(set.has(0)).toBe(false);
    expect(set.get(0)).toBeUndefined();
  });

  it('stores and reads a value', () => {
    const set = new SparseSet();
    set.set(42, 'hello');
    expect(set.size).toBe(1);
    expect(set.has(42)).toBe(true);
    expect(set.get(42)).toBe('hello');
  });

  it('overwrites without growing', () => {
    const set = new SparseSet();
    set.set(42, 'first');
    set.set(42, 'second');
    expect(set.size).toBe(1);
    expect(set.get(42)).toBe('second');
  });

  it('handles sparse, far-apart indices', () => {
    const set = new SparseSet();
    set.set(0, 'a');
    set.set(100000, 'b');
    expect(set.size).toBe(2);
    expect(set.get(100000)).toBe('b');
  });
});

describe('SparseSet deletion', () => {
  it('removes a value', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    expect(set.delete(1)).toBe(true);
    expect(set.has(1)).toBe(false);
    expect(set.size).toBe(0);
  });

  it('reports false when deleting something absent', () => {
    expect(new SparseSet().delete(99)).toBe(false);
  });

  it('keeps the other entries intact after a swap-remove', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    set.set(2, 'b');
    set.set(3, 'c');
    set.delete(1);

    expect(set.size).toBe(2);
    expect(set.get(2)).toBe('b');
    expect(set.get(3)).toBe('c');
    expect(set.has(1)).toBe(false);
  });

  it('deletes the last element without disturbing anything', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    set.set(2, 'b');
    set.delete(2);
    expect(set.get(1)).toBe('a');
    expect(set.size).toBe(1);
  });

  it('survives delete-then-reinsert of the same index', () => {
    const set = new SparseSet();
    set.set(5, 'a');
    set.delete(5);
    set.set(5, 'b');
    expect(set.get(5)).toBe('b');
    expect(set.size).toBe(1);
    expect(set.validate()).toBe(true);
  });
});

describe('SparseSet invariants', () => {
  // Invariant C1 (SPEC §4): sparse, dense and data must stay in lockstep. Swap-remove is the
  // operation most likely to break it, so it is exercised hard here.
  it('holds C1 through a long random workload', () => {
    const set = new SparseSet();
    let seed = 1234;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const mirror = new Map();
    for (let i = 0; i < 5000; i += 1) {
      const index = Math.floor(random() * 200);
      if (random() < 0.6) {
        set.set(index, index * 10);
        mirror.set(index, index * 10);
      } else {
        set.delete(index);
        mirror.delete(index);
      }
    }

    expect(set.validate()).toBe(true);
    expect(set.size).toBe(mirror.size);
    for (const [index, value] of mirror) {
      expect(set.get(index)).toBe(value);
    }
  });

  it('leaves no stale sparse entry readable after a delete', () => {
    const set = new SparseSet();
    set.set(10, 'a');
    set.set(20, 'b');
    set.delete(20);
    // 20's old sparse slot pointed at dense index 1, which no longer exists.
    expect(set.has(20)).toBe(false);
    expect(set.get(20)).toBeUndefined();
  });
});

describe('SparseSet iteration', () => {
  it('yields every entry exactly once', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    set.set(5, 'b');
    set.set(9, 'c');

    const seen = new Map(Array.from(set));
    expect(seen.size).toBe(3);
    expect(seen.get(5)).toBe('b');
  });

  it('entityIndices returns a copy, not a live view', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    const snapshot = set.entityIndices();
    set.set(2, 'b');
    expect(snapshot).toEqual([1]);
  });
});

describe('SparseSet clear', () => {
  it('empties the set', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    set.set(2, 'b');
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has(1)).toBe(false);
    expect(set.validate()).toBe(true);
  });

  it('is reusable after clearing', () => {
    const set = new SparseSet();
    set.set(1, 'a');
    set.clear();
    set.set(1, 'b');
    expect(set.get(1)).toBe('b');
    expect(set.validate()).toBe(true);
  });
});
