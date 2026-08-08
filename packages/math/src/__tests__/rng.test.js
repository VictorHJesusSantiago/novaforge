import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';

describe('Rng determinism', () => {
  // This is the property the whole replay and editor-snapshot feature rests on.
  it('produces an identical sequence for an identical seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('reset replays the sequence from the beginning', () => {
    const rng = new Rng(999);
    const first = [rng.next(), rng.next(), rng.next()];
    rng.reset();
    expect([rng.next(), rng.next(), rng.next()]).toEqual(first);
  });

  it('save and restore resume mid-sequence exactly', () => {
    const rng = new Rng(42);
    rng.next();
    rng.next();
    const snapshot = rng.save();
    const expected = [rng.next(), rng.next(), rng.next()];

    rng.restore(snapshot);
    expect([rng.next(), rng.next(), rng.next()]).toEqual(expected);
  });

  it('derives a stable seed from a string', () => {
    expect(new Rng(Rng.fromString('level-one').seed).next()).toBe(
      new Rng(Rng.fromString('level-one').seed).next(),
    );
    expect(Rng.fromString('a').seed).not.toBe(Rng.fromString('b').seed);
  });
});

describe('Rng distribution', () => {
  it('stays within [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('has a mean near 0.5 over many samples', () => {
    const rng = new Rng(2024);
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i += 1) sum += rng.next();
    expect(sum / n).toBeCloseTo(0.5, 2);
  });

  it('range respects its bounds', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it('int is inclusive at both ends', () => {
    const rng = new Rng(11);
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) seen.add(rng.int(1, 3));
    expect(seen).toEqual(new Set([1, 2, 3]));
  });
});

describe('Rng helpers', () => {
  it('picks an element from an array', () => {
    const rng = new Rng(5);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i += 1) {
      expect(items).toContain(rng.pick(items));
    }
  });

  // Returning undefined would let the mistake surface far from its cause.
  it('throws instead of returning undefined for an empty array', () => {
    expect(() => new Rng(1).pick([])).toThrow(RangeError);
  });

  it('weightedIndex respects the weights', () => {
    const rng = new Rng(77);
    const counts = [0, 0, 0];
    for (let i = 0; i < 10000; i += 1) counts[rng.weightedIndex([1, 0, 9])] += 1;
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBeGreaterThan(counts[0] * 5);
  });

  it('weightedIndex rejects a zero total', () => {
    expect(() => new Rng(1).weightedIndex([0, 0])).toThrow(RangeError);
  });

  it('shuffle preserves every element', () => {
    const rng = new Rng(31);
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = rng.shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('onUnitCircle returns unit-length points', () => {
    const rng = new Rng(13);
    for (let i = 0; i < 500; i += 1) {
      const p = rng.onUnitCircle();
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
    }
  });

  it('insideUnitCircle stays inside the circle', () => {
    const rng = new Rng(17);
    for (let i = 0; i < 500; i += 1) {
      const p = rng.insideUnitCircle();
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1.0000001);
    }
  });

  it('gaussian centres on the requested mean', () => {
    const rng = new Rng(19);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) sum += rng.gaussian(10, 2);
    expect(sum / n).toBeCloseTo(10, 1);
  });
});
