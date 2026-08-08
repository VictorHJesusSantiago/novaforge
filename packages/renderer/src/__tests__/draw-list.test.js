import { describe, it, expect } from 'vitest';
import { AABB } from '@novaforge/math';
import { DrawList, DrawKind } from '../draw-list.js';
import { WHITE } from '../color.js';

/** @param {Partial<any>} [overrides] */
function sprite(overrides = {}) {
  return {
    texture: 'a',
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    ...overrides,
  };
}

describe('appending commands', () => {
  it('starts empty', () => {
    expect(new DrawList().length).toBe(0);
  });

  it('records a sprite with its defaults filled in', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 10, y: 20 }));

    const c = list.at(0);
    expect(c.kind).toBe(DrawKind.SPRITE);
    expect(c.x).toBe(10);
    expect(c.tint).toBe(WHITE);
    expect(c.alpha).toBe(1);
    expect(c.scaleX).toBe(1);
    expect(c.anchorX).toBe(0.5);
  });

  it('records every command kind', () => {
    const list = new DrawList();
    list.sprite(sprite());
    list.rect({ x: 0, y: 0, width: 10, height: 10 });
    list.circle({ x: 0, y: 0, radius: 5 });
    list.line({ x: 0, y: 0, x2: 10, y2: 10 });
    list.text({ text: 'hi', x: 0, y: 0 });

    expect(list.toArray().map((c) => c.kind)).toEqual([
      DrawKind.SPRITE,
      DrawKind.RECT,
      DrawKind.CIRCLE,
      DrawKind.LINE,
      DrawKind.TEXT,
    ]);
  });

  it('treats a null source as "the whole texture"', () => {
    const list = new DrawList();
    list.sprite(sprite({ source: null }));
    expect(list.at(0).sourceWidth).toBe(0);
  });

  it('records an atlas sub-rectangle', () => {
    const list = new DrawList();
    list.sprite(sprite({ source: { x: 16, y: 32, width: 8, height: 8 } }));
    const c = list.at(0);
    expect(c.sourceX).toBe(16);
    expect(c.sourceWidth).toBe(8);
  });

  // Reading past the live length silently draws last frame's sprite, which is a genuinely
  // confusing bug to chase.
  it('throws when reading past the live length', () => {
    const list = new DrawList();
    list.sprite(sprite());
    expect(() => list.at(1)).toThrow(RangeError);
    expect(() => list.at(-1)).toThrow(RangeError);
  });
});

describe('sorting', () => {
  it('orders by layer first', () => {
    const list = new DrawList();
    list.sprite(sprite({ layer: 5, texture: 'top' }));
    list.sprite(sprite({ layer: 1, texture: 'bottom' }));
    list.sort();
    expect(list.toArray().map((c) => c.texture)).toEqual(['bottom', 'top']);
  });

  it('orders by z within a layer', () => {
    const list = new DrawList();
    list.sprite(sprite({ layer: 1, z: 10, texture: 'far' }));
    list.sprite(sprite({ layer: 1, z: 0, texture: 'near' }));
    list.sort();
    expect(list.toArray().map((c) => c.texture)).toEqual(['near', 'far']);
  });

  // Layer must beat z, or a background element with a high z would cover the foreground.
  it('lets layer win over z', () => {
    const list = new DrawList();
    list.sprite(sprite({ layer: 0, z: 999, texture: 'background' }));
    list.sprite(sprite({ layer: 1, z: 0, texture: 'foreground' }));
    list.sort();
    expect(list.toArray().map((c) => c.texture)).toEqual(['background', 'foreground']);
  });

  // The property that makes WebGL2 batching possible in Milestone 6.
  it('groups equal (layer, z) commands by texture', () => {
    const list = new DrawList();
    list.sprite(sprite({ texture: 'b' }));
    list.sprite(sprite({ texture: 'a' }));
    list.sprite(sprite({ texture: 'b' }));
    list.sprite(sprite({ texture: 'a' }));
    list.sort();

    const ids = list.toArray().map((c) => c.textureId);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]).toBeGreaterThanOrEqual(ids[i - 1]);
    }
  });

  it('assigns a stable id per texture name', () => {
    const list = new DrawList();
    list.sprite(sprite({ texture: 'x' }));
    list.sprite(sprite({ texture: 'y' }));
    list.sprite(sprite({ texture: 'x' }));
    const [a, b, c] = list.toArray();
    expect(a.textureId).toBe(c.textureId);
    expect(a.textureId).not.toBe(b.textureId);
  });

  it('reserves texture id 0 for untextured commands', () => {
    const list = new DrawList();
    list.rect({ x: 0, y: 0, width: 1, height: 1 });
    expect(list.at(0).textureId).toBe(0);
  });

  it('sorting an empty or single-command list is a no-op', () => {
    const list = new DrawList();
    expect(() => list.sort()).not.toThrow();
    list.sprite(sprite());
    list.sort();
    expect(list.length).toBe(1);
  });
});

describe('culling', () => {
  const view = new AABB(-100, -100, 100, 100);

  it('keeps commands inside the view', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 0, y: 0 }));
    expect(list.cull(view)).toBe(0);
    expect(list.length).toBe(1);
  });

  it('drops commands far outside the view', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 10000, y: 0 }));
    expect(list.cull(view)).toBe(1);
    expect(list.length).toBe(0);
  });

  // Erring generous costs one wasted draw call; erring tight makes sprites pop out at the
  // screen edge, which is far more visible.
  it('keeps a sprite straddling the edge', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 105, y: 0, width: 40, height: 40 }));
    expect(list.cull(view)).toBe(0);
  });

  it('accounts for scale when deciding', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 150, y: 0, width: 32, height: 32, scaleX: 10, scaleY: 10 }));
    expect(list.cull(view)).toBe(0);
  });

  it('keeps a line with only one endpoint inside', () => {
    const list = new DrawList();
    list.line({ x: 0, y: 0, x2: 10000, y2: 0 });
    expect(list.cull(view)).toBe(0);
  });

  it('drops a line entirely outside', () => {
    const list = new DrawList();
    list.line({ x: 5000, y: 5000, x2: 6000, y2: 6000 });
    expect(list.cull(view)).toBe(1);
  });

  it('accounts for a circle radius', () => {
    const list = new DrawList();
    list.circle({ x: 150, y: 0, radius: 100 });
    expect(list.cull(view)).toBe(0);
  });

  it('keeps the survivors when culling from the middle', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 0, texture: 'keep-a' }));
    list.sprite(sprite({ x: 99999, texture: 'drop' }));
    list.sprite(sprite({ x: 10, texture: 'keep-b' }));

    list.cull(view);
    const kept = list.toArray().map((c) => c.texture).sort();
    expect(kept).toEqual(['keep-a', 'keep-b']);
  });

  it('reports the culled count in stats', () => {
    const list = new DrawList();
    list.sprite(sprite({ x: 99999 }));
    list.cull(view);
    expect(list.stats().culled).toBe(1);
  });
});

describe('pooling', () => {
  // Thousands of sprites per frame allocating fresh objects would hammer the nursery; the
  // pool is the reason a steady-state frame allocates nothing here.
  it('reuses command objects across frames', () => {
    const list = new DrawList();
    list.sprite(sprite());
    const first = list.at(0);

    list.clear();
    list.sprite(sprite({ x: 500 }));

    expect(list.at(0)).toBe(first);
    expect(list.at(0).x).toBe(500);
  });

  it('grows the pool only to the busiest frame so far', () => {
    const list = new DrawList();
    for (let i = 0; i < 100; i += 1) list.sprite(sprite());
    expect(list.stats().pooled).toBe(100);

    list.clear();
    for (let i = 0; i < 10; i += 1) list.sprite(sprite());
    expect(list.stats().pooled).toBe(100);
    expect(list.length).toBe(10);
  });

  it('clear resets the live length without dropping the pool', () => {
    const list = new DrawList();
    list.sprite(sprite());
    list.clear();
    expect(list.length).toBe(0);
    expect(list.toArray()).toEqual([]);
    expect(list.stats().pooled).toBe(1);
  });

  it('does not iterate stale pooled commands after a clear', () => {
    const list = new DrawList();
    list.sprite(sprite());
    list.sprite(sprite());
    list.clear();
    list.sprite(sprite());
    expect(Array.from(list)).toHaveLength(1);
  });
});
