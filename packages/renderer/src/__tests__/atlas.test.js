import { describe, it, expect } from 'vitest';
import { TextureAtlas, AtlasRegistry } from '../atlas.js';

describe('TextureAtlas construction', () => {
  it('stores frames by name', () => {
    const atlas = new TextureAtlas('hero', {
      idle: { x: 0, y: 0, width: 16, height: 16 },
    });
    expect(atlas.frame('idle')).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(atlas.texture).toBe('hero');
  });

  it('reports frame count and names', () => {
    const atlas = new TextureAtlas('hero', {
      a: { x: 0, y: 0, width: 1, height: 1 },
      b: { x: 1, y: 0, width: 1, height: 1 },
    });
    expect(atlas.frameCount).toBe(2);
    expect(atlas.frameNames()).toEqual(['a', 'b']);
  });

  it('has() reports presence without allocating', () => {
    const atlas = new TextureAtlas('hero', { a: { x: 0, y: 0, width: 1, height: 1 } });
    expect(atlas.has('a')).toBe(true);
    expect(atlas.has('missing')).toBe(false);
  });

  it('returns undefined for an unknown frame rather than throwing', () => {
    const atlas = new TextureAtlas('hero', {});
    expect(atlas.frame('nope')).toBeUndefined();
  });
});

describe('TextureAtlas.fromJSON', () => {
  it('parses the TexturePacker JSON (array) shape', () => {
    const atlas = TextureAtlas.fromJSON('hero', {
      frames: {
        walk_0: { frame: { x: 0, y: 0, w: 16, h: 16 } },
        walk_1: { frame: { x: 16, y: 0, w: 16, h: 16 } },
      },
    });
    expect(atlas.frame('walk_0')).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(atlas.frame('walk_1')?.x).toBe(16);
  });

  it('throws when the manifest has no frames object', () => {
    expect(() => TextureAtlas.fromJSON('hero', {})).toThrow(/frames/);
    expect(() => TextureAtlas.fromJSON('hero', null)).toThrow(/frames/);
  });

  it('throws when an individual frame entry is missing its rect', () => {
    expect(() =>
      TextureAtlas.fromJSON('hero', { frames: { broken: {} } }),
    ).toThrow(/broken/);
  });
});

describe('TextureAtlas.fromGrid', () => {
  it('lays out a regular grid, naming frames row_column', () => {
    const atlas = TextureAtlas.fromGrid('sheet', {
      frameWidth: 16,
      frameHeight: 16,
      columns: 3,
      rows: 2,
    });
    expect(atlas.frameCount).toBe(6);
    expect(atlas.frame('0_0')).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(atlas.frame('0_2')).toEqual({ x: 32, y: 0, width: 16, height: 16 });
    expect(atlas.frame('1_0')).toEqual({ x: 0, y: 16, width: 16, height: 16 });
  });

  it('accounts for margins and an offset origin', () => {
    const atlas = TextureAtlas.fromGrid('sheet', {
      frameWidth: 10,
      frameHeight: 10,
      columns: 2,
      rows: 1,
      marginX: 2,
      marginY: 2,
      offsetX: 5,
      offsetY: 5,
    });
    expect(atlas.frame('0_0')).toEqual({ x: 5, y: 5, width: 10, height: 10 });
    expect(atlas.frame('0_1')).toEqual({ x: 17, y: 5, width: 10, height: 10 });
  });
});

describe('AtlasRegistry', () => {
  it('registers and resolves a frame in one call', () => {
    const registry = new AtlasRegistry();
    registry.register('hero', new TextureAtlas('hero.png', { idle: { x: 0, y: 0, width: 8, height: 8 } }));
    expect(registry.resolve('hero', 'idle')).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  });

  it('resolve returns null for an unknown atlas or frame', () => {
    const registry = new AtlasRegistry();
    expect(registry.resolve('nope', 'idle')).toBeNull();

    registry.register('hero', new TextureAtlas('hero.png', {}));
    expect(registry.resolve('hero', 'missing')).toBeNull();
  });

  it('has() and get() report registration', () => {
    const registry = new AtlasRegistry();
    expect(registry.has('hero')).toBe(false);
    registry.register('hero', new TextureAtlas('hero.png', {}));
    expect(registry.has('hero')).toBe(true);
    expect(registry.get('hero')?.texture).toBe('hero.png');
  });

  it('clear removes every atlas', () => {
    const registry = new AtlasRegistry();
    registry.register('hero', new TextureAtlas('hero.png', {}));
    registry.clear();
    expect(registry.has('hero')).toBe(false);
  });
});
