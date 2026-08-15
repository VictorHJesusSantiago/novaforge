import { describe, it, expect, beforeEach } from 'vitest';
import { World, Transform } from '@novaforge/core';
import { AtlasRegistry, TextureAtlas } from '../atlas.js';
import { DrawList } from '../draw-list.js';
import { Camera2D } from '../camera.js';
import { DRAW_LIST_RESOURCE } from '../systems.js';
import {
  Tilemap,
  resizeTilemap,
  inTilemapBounds,
  setTile,
  getTile,
  worldToTile,
  tilemapRenderSystem,
  installTilemapSystem,
} from '../tilemap.js';

/** @type {World} */ let world;
/** @type {DrawList} */ let drawList;
/** @type {AtlasRegistry} */ let registry;

beforeEach(() => {
  world = new World();
  drawList = new DrawList();
  registry = new AtlasRegistry();
  registry.register(
    'tiles',
    TextureAtlas.fromGrid('tileset', { frameWidth: 16, frameHeight: 16, columns: 2, rows: 1 }),
  );
  world.setResource(DRAW_LIST_RESOURCE, drawList);
  world.setResource('atlasRegistry', registry);
});

describe('resizeTilemap', () => {
  it('allocates a grid filled empty', () => {
    const tilemap = Tilemap.factory();
    resizeTilemap(tilemap, 4, 3);
    expect(tilemap.columns).toBe(4);
    expect(tilemap.rows).toBe(3);
    expect(tilemap.tiles).toHaveLength(12);
    expect(Array.from(tilemap.tiles).every((v) => v === -1)).toBe(true);
  });
});

describe('bounds and tile access', () => {
  /** @returns {any} a 3x3 tilemap. */
  function grid() {
    const tilemap = Tilemap.factory();
    resizeTilemap(tilemap, 3, 3);
    return tilemap;
  }

  it('reports in-bounds cells', () => {
    const tilemap = grid();
    expect(inTilemapBounds(tilemap, 0, 0)).toBe(true);
    expect(inTilemapBounds(tilemap, 2, 2)).toBe(true);
  });

  it('reports out-of-bounds cells on every edge', () => {
    const tilemap = grid();
    expect(inTilemapBounds(tilemap, -1, 0)).toBe(false);
    expect(inTilemapBounds(tilemap, 0, -1)).toBe(false);
    expect(inTilemapBounds(tilemap, 3, 0)).toBe(false);
    expect(inTilemapBounds(tilemap, 0, 3)).toBe(false);
  });

  it('sets and reads a tile by frame name', () => {
    const tilemap = grid();
    setTile(tilemap, 1, 1, '0_0');
    expect(getTile(tilemap, 1, 1)).toBe('0_0');
  });

  it('returns null for an empty cell', () => {
    expect(getTile(grid(), 0, 0)).toBeNull();
  });

  it('clears a tile by passing null', () => {
    const tilemap = grid();
    setTile(tilemap, 0, 0, '0_0');
    setTile(tilemap, 0, 0, null);
    expect(getTile(tilemap, 0, 0)).toBeNull();
  });

  it('setTile out of bounds is a silent no-op', () => {
    const tilemap = grid();
    expect(() => setTile(tilemap, 99, 99, '0_0')).not.toThrow();
    expect(getTile(tilemap, 99, 99)).toBeNull();
  });

  it('reuses the same frame index for repeated frame names', () => {
    const tilemap = grid();
    setTile(tilemap, 0, 0, '0_0');
    setTile(tilemap, 1, 0, '0_0');
    setTile(tilemap, 2, 0, '0_1');
    expect(tilemap.frameNames).toEqual(['0_0', '0_1']);
    expect(tilemap.tiles[0]).toBe(tilemap.tiles[1]);
  });

  it('worldToTile maps a point back to its cell', () => {
    const tilemap = grid();
    tilemap.tileWidth = 16;
    tilemap.tileHeight = 16;
    const cell = worldToTile(tilemap, { x: 100, y: 200 }, { x: 133, y: 217 });
    expect(cell).toEqual({ column: 2, row: 1 });
  });
});

describe('tilemapRenderSystem', () => {
  /** @returns {number} an entity with a Transform and a small filled Tilemap. */
  function spawnFilledMap() {
    const entity = world.spawn([Transform], [Tilemap, { atlas: 'tiles' }]);
    const tilemap = world.get(entity, Tilemap);
    resizeTilemap(tilemap, 4, 4);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        setTile(tilemap, column, row, column % 2 === 0 ? '0_0' : '0_1');
      }
    }
    return entity;
  }

  it('emits one sprite command per filled tile with no camera', () => {
    spawnFilledMap();
    tilemapRenderSystem(world);
    expect(drawList.length).toBe(16);
  });

  it('skips empty cells', () => {
    const entity = world.spawn([Transform], [Tilemap, { atlas: 'tiles' }]);
    const tilemap = world.get(entity, Tilemap);
    resizeTilemap(tilemap, 2, 2);
    setTile(tilemap, 0, 0, '0_0');

    tilemapRenderSystem(world);

    expect(drawList.length).toBe(1);
  });

  it('positions tiles at their world-space cell centre', () => {
    const entity = world.spawn([Transform], [Tilemap, { atlas: 'tiles' }]);
    world.get(entity, Transform)?.position.set(100, 200);
    const tilemap = world.get(entity, Tilemap);
    tilemap.tileWidth = 16;
    tilemap.tileHeight = 16;
    resizeTilemap(tilemap, 1, 1);
    setTile(tilemap, 0, 0, '0_0');

    tilemapRenderSystem(world);

    expect(drawList.at(0).x).toBe(108);
    expect(drawList.at(0).y).toBe(208);
  });

  it('resolves the atlas source rect per tile', () => {
    spawnFilledMap();
    tilemapRenderSystem(world);
    const first = drawList.toArray()[0];
    expect(first.texture).toBe('tileset');
    expect(first.sourceWidth).toBe(16);
  });

  it('skips an invisible or fully transparent tilemap', () => {
    const entity = world.spawn([Transform], [Tilemap, { atlas: 'tiles', visible: false }]);
    resizeTilemap(world.get(entity, Tilemap), 2, 2);
    setTile(world.get(entity, Tilemap), 0, 0, '0_0');
    tilemapRenderSystem(world);
    expect(drawList.length).toBe(0);
  });

  it('does nothing for an unregistered atlas', () => {
    const entity = world.spawn([Transform], [Tilemap, { atlas: 'missing' }]);
    resizeTilemap(world.get(entity, Tilemap), 2, 2);
    setTile(world.get(entity, Tilemap), 0, 0, '0_0');
    expect(() => tilemapRenderSystem(world)).not.toThrow();
    expect(drawList.length).toBe(0);
  });

  it('culls to the camera and draws far fewer commands than the map contains', () => {
    const entity = world.spawn([Transform], [Tilemap, { atlas: 'tiles' }]);
    const tilemap = world.get(entity, Tilemap);
    tilemap.tileWidth = 16;
    tilemap.tileHeight = 16;
    resizeTilemap(tilemap, 200, 200);
    for (let row = 0; row < 200; row += 1) {
      for (let column = 0; column < 200; column += 1) {
        setTile(tilemap, column, row, '0_0');
      }
    }

    const camera = new Camera2D({ viewportWidth: 320, viewportHeight: 240 });
    camera.position.set(0, 0);
    world.setResource('camera', camera);

    tilemapRenderSystem(world);

    expect(drawList.length).toBeGreaterThan(0);
    expect(drawList.length).toBeLessThan(200 * 200);
    expect(drawList.length).toBeLessThan(500);
  });

  it('still draws every tile when no camera is installed, as the degraded fallback', () => {
    const bare = new World();
    bare.setResource(DRAW_LIST_RESOURCE, drawList);
    bare.setResource('atlasRegistry', registry);

    const entity = bare.spawn([Transform], [Tilemap, { atlas: 'tiles' }]);
    const tilemap = bare.get(entity, Tilemap);
    resizeTilemap(tilemap, 3, 3);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) setTile(tilemap, column, row, '0_0');
    }

    tilemapRenderSystem(bare);

    expect(drawList.length).toBe(9);
  });
});

describe('installTilemapSystem', () => {
  it('registers the renderer in the render stage', () => {
    const handle = installTilemapSystem(world);
    const entry = world.scheduler.systemsIn('render').find((s) => s.handle === handle);
    expect(entry?.name).toBe('tilemapRender');
  });
});
