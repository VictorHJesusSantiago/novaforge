import { describe, it, expect } from 'vitest';
import { Layers, canCollide, layerFromNames, describeMask } from '../layers.js';

describe('symmetric filtering', () => {
  it('collides when both sides want each other', () => {
    const player = { layer: Layers.PLAYER, mask: Layers.ENEMY };
    const enemy = { layer: Layers.ENEMY, mask: Layers.PLAYER };
    expect(canCollide(player, enemy)).toBe(true);
  });

  // Invariant P1. Asymmetric filtering produces a collision that registers for one body's
  // callbacks but not the other's — a bullet that damages an enemy it visibly passes through.
  it('does not collide when only one side is interested', () => {
    const player = { layer: Layers.PLAYER, mask: Layers.ENEMY };
    const enemy = { layer: Layers.ENEMY, mask: Layers.TERRAIN };
    expect(canCollide(player, enemy)).toBe(false);
    expect(canCollide(enemy, player)).toBe(false);
  });

  it('is order independent', () => {
    const a = { layer: Layers.PLAYER, mask: Layers.ALL };
    const b = { layer: Layers.PICKUP, mask: Layers.PLAYER };
    expect(canCollide(a, b)).toBe(canCollide(b, a));
  });

  it('collides with everything under the ALL mask', () => {
    const universal = { layer: Layers.DEFAULT, mask: Layers.ALL };
    for (const bit of Object.values(Layers)) {
      expect(canCollide(universal, { layer: bit, mask: Layers.ALL })).toBe(true);
    }
  });

  it('collides with nothing under a zero mask', () => {
    const inert = { layer: Layers.DEFAULT, mask: 0 };
    expect(canCollide(inert, { layer: Layers.DEFAULT, mask: Layers.ALL })).toBe(false);
  });

  it('handles a multi-bit mask', () => {
    const bullet = { layer: Layers.PROJECTILE, mask: Layers.ENEMY | Layers.TERRAIN };
    expect(canCollide(bullet, { layer: Layers.ENEMY, mask: Layers.PROJECTILE })).toBe(true);
    expect(canCollide(bullet, { layer: Layers.TERRAIN, mask: Layers.ALL })).toBe(true);
    expect(canCollide(bullet, { layer: Layers.PICKUP, mask: Layers.ALL })).toBe(false);
  });
});

describe('layer bits', () => {
  it('gives each named layer a distinct single bit', () => {
    const named = Object.entries(Layers).filter(([name]) => name !== 'ALL');
    const bits = named.map(([, bit]) => bit);
    expect(new Set(bits).size).toBe(bits.length);
    for (const bit of bits) {
      expect(bit & (bit - 1)).toBe(0); // exactly one bit set
    }
  });

  it('reserves DEFAULT as bit 0, so an unconfigured collider still collides', () => {
    expect(Layers.DEFAULT).toBe(1);
    expect(canCollide(
      { layer: Layers.DEFAULT, mask: Layers.ALL },
      { layer: Layers.DEFAULT, mask: Layers.ALL },
    )).toBe(true);
  });
});

describe('layerFromNames', () => {
  it('combines named layers into a mask', () => {
    expect(layerFromNames(['ENEMY', 'TERRAIN'])).toBe(Layers.ENEMY | Layers.TERRAIN);
  });

  it('returns 0 for an empty list', () => {
    expect(layerFromNames([])).toBe(0);
  });

  // A typo would silently produce a mask of 0, and a collider that hits nothing looks exactly
  // like a physics bug rather than a configuration one.
  it('throws on an unknown layer name', () => {
    expect(() => layerFromNames(['NOT_A_LAYER'])).toThrow(/NOT_A_LAYER/);
  });
});

describe('describeMask', () => {
  it('names the layers in a mask', () => {
    const description = describeMask(Layers.PLAYER | Layers.ENEMY);
    expect(description).toContain('PLAYER');
    expect(description).toContain('ENEMY');
  });

  it('names the empty and universal masks specially', () => {
    expect(describeMask(0)).toBe('(none)');
    expect(describeMask(Layers.ALL)).toBe('ALL');
  });
});
