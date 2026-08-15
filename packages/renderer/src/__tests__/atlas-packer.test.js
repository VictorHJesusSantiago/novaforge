import { describe, it, expect } from 'vitest';
import { packRects, packingEfficiency } from '../atlas-packer.js';

describe('packRects', () => {
  it('places a single rect at the origin', () => {
    const result = packRects([{ id: 'a', width: 10, height: 10 }]);
    expect(result.placements.get('a')).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('returns an empty result for no rects', () => {
    const result = packRects([]);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    expect(result.placements.size).toBe(0);
  });

  it('packs two rects side by side when they fit on one shelf', () => {
    const result = packRects([
      { id: 'a', width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 },
    ], { maxWidth: 100, padding: 0 });

    expect(result.placements.get('a')).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(result.placements.get('b')).toEqual({ x: 10, y: 0, width: 10, height: 10 });
    expect(result.height).toBe(10);
  });

  it('wraps to a new shelf when a row would overflow maxWidth', () => {
    const result = packRects([
      { id: 'a', width: 60, height: 10 },
      { id: 'b', width: 60, height: 10 },
    ], { maxWidth: 100, padding: 0 });

    expect(result.placements.get('a')?.y).toBe(0);
    expect(result.placements.get('b')?.y).toBe(10);
    expect(result.placements.get('b')?.x).toBe(0);
  });

  it('sizes the shelf by its tallest member', () => {
    const result = packRects([
      { id: 'tall', width: 10, height: 40 },
      { id: 'short', width: 10, height: 10 },
      { id: 'next-row', width: 90, height: 5 },
    ], { maxWidth: 100, padding: 0 });

    expect(result.placements.get('next-row')?.y).toBe(40);
  });

  it('the atlas width is always exactly maxWidth when there is at least one rect', () => {
    const result = packRects([{ id: 'a', width: 5, height: 5 }], { maxWidth: 256 });
    expect(result.width).toBe(256);
  });

  it('accounts for padding between rects on the same shelf', () => {
    const result = packRects([
      { id: 'a', width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 },
    ], { maxWidth: 100, padding: 2 });

    expect(result.placements.get('b')?.x).toBe(12);
  });

  it('never lets padding leak into a rect\'s own reported size', () => {
    const result = packRects([{ id: 'a', width: 10, height: 10 }], { padding: 5 });
    expect(result.placements.get('a')).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('places every rect somewhere, and every placement matches its input size', () => {
    const rects = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      width: 8 + (i % 5) * 4,
      height: 8 + (i % 7) * 3,
    }));
    const result = packRects(rects, { maxWidth: 128 });

    for (const rect of rects) {
      const placement = result.placements.get(rect.id);
      expect(placement).toBeDefined();
      expect(placement?.width).toBe(rect.width);
      expect(placement?.height).toBe(rect.height);
    }
  });

  it('never overlaps two placements', () => {
    const rects = Array.from({ length: 40 }, (_, i) => ({
      id: `r${i}`,
      width: 6 + (i % 9) * 5,
      height: 6 + (i % 6) * 5,
    }));
    const result = packRects(rects, { maxWidth: 200, padding: 1 });
    const placed = Array.from(result.placements.values());

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        const overlaps =
          a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('rejects a rect wider than maxWidth', () => {
    expect(() => packRects([{ id: 'huge', width: 500, height: 10 }], { maxWidth: 256 })).toThrow(
      /does not fit/,
    );
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      packRects([
        { id: 'a', width: 10, height: 10 },
        { id: 'a', width: 5, height: 5 },
      ]),
    ).toThrow(/duplicate/);
  });

  it('does not mutate the input array order', () => {
    const rects = [
      { id: 'small', width: 5, height: 5 },
      { id: 'big', width: 5, height: 50 },
    ];
    const copy = [...rects];
    packRects(rects);
    expect(rects).toEqual(copy);
  });
});

describe('packingEfficiency', () => {
  it('is 1 for a single rect exactly filling the atlas', () => {
    const result = packRects([{ id: 'a', width: 100, height: 50 }], { maxWidth: 100, padding: 0 });
    expect(packingEfficiency(result, [{ id: 'a', width: 100, height: 50 }])).toBeCloseTo(1);
  });

  it('is between 0 and 1 for a partially-filled atlas', () => {
    const rects = [{ id: 'a', width: 10, height: 10 }];
    const result = packRects(rects, { maxWidth: 100 });
    const efficiency = packingEfficiency(result, rects);
    expect(efficiency).toBeGreaterThan(0);
    expect(efficiency).toBeLessThan(1);
  });

  it('is 0 for an empty pack', () => {
    expect(packingEfficiency(packRects([]), [])).toBe(0);
  });
});
