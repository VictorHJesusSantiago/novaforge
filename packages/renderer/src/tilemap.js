import { defineComponent, Transform } from '@novaforge/core';
import { DRAW_LIST_RESOURCE } from './systems.js';

/**
 * A grid of tiles drawn from a texture atlas.
 *
 * `tiles` is a flat `Int32Array`, row-major, one entry per cell. `-1` means empty. A typed array
 * rather than a 2D array of objects because a tilemap is exactly the case Invariant C2 exists
 * for: the whole grid must survive `JSON.stringify` for the editor's scene serialisation and
 * `structuredClone` for its play-mode snapshot, and a flat numeric array does both for free
 * while an array of `{ frame, rotation, ... }` objects would need a custom (de)serialiser.
 *
 * Rendering culls to the camera and walks only the visible cell range — a 1000x1000 map costs
 * the same per frame as a 40x30 one, which is the entire point of a tilemap component existing
 * instead of one entity per tile.
 */
export const Tilemap = defineComponent(
  'Tilemap',
  () => ({
    atlas: '',
    columns: 0,
    rows: 0,
    tileWidth: 16,
    tileHeight: 16,
    /** @type {Int32Array} row-major, one entry per cell; index into `frameNames`. */
    tiles: new Int32Array(0),
    /**
     * Frame names, indexed by the values in `tiles`. Stored once here rather than repeating a
     * string per cell, so a 1000x1000 map costs 4 MB of indices, not an arbitrary amount of
     * repeated string data.
     * @type {string[]}
     */
    frameNames: [],
    layer: 0,
    z: 0,
    tint: 0xffffff,
    alpha: 1,
    visible: true,
  }),
  {
    atlas: { type: 'asset' },
    columns: { type: 'number', min: 0, step: 1 },
    rows: { type: 'number', min: 0, step: 1 },
    tileWidth: { type: 'number', min: 1 },
    tileHeight: { type: 'number', min: 1 },
    layer: { type: 'number', step: 1 },
    z: { type: 'number', step: 1 },
    alpha: { type: 'number', min: 0, max: 1, step: 0.01 },
    visible: { type: 'boolean' },
  },
);

/**
 * Allocate a tilemap's grid storage sized for `columns` x `rows`, filled empty.
 *
 * A helper rather than leaving callers to compute `columns * rows` themselves — that
 * multiplication done inconsistently between allocation and indexing is exactly the kind of
 * off-by-one that corrupts every tile after the first misaligned row.
 *
 * @param {any} tilemap a Tilemap instance
 * @param {number} columns
 * @param {number} rows
 * @returns {void}
 */
export function resizeTilemap(tilemap, columns, rows) {
  tilemap.columns = columns;
  tilemap.rows = rows;
  const next = new Int32Array(columns * rows).fill(-1);
  tilemap.tiles = next;
}

/**
 * @param {any} tilemap
 * @param {number} column
 * @param {number} row
 * @returns {boolean}
 */
export function inTilemapBounds(tilemap, column, row) {
  return column >= 0 && column < tilemap.columns && row >= 0 && row < tilemap.rows;
}

/**
 * Set a tile by frame name. Out-of-bounds is a no-op — a level editor painting near an edge
 * should not crash the tool over an off-by-one drag.
 * @param {any} tilemap
 * @param {number} column
 * @param {number} row
 * @param {string | null} frameName `null` clears the tile
 * @returns {void}
 */
export function setTile(tilemap, column, row, frameName) {
  if (!inTilemapBounds(tilemap, column, row)) return;

  let index = -1;
  if (frameName !== null) {
    index = tilemap.frameNames.indexOf(frameName);
    if (index === -1) {
      index = tilemap.frameNames.length;
      tilemap.frameNames.push(frameName);
    }
  }
  tilemap.tiles[row * tilemap.columns + column] = index;
}

/**
 * @param {any} tilemap
 * @param {number} column
 * @param {number} row
 * @returns {string | null} the frame at a cell, or `null` for empty or out-of-bounds.
 */
export function getTile(tilemap, column, row) {
  if (!inTilemapBounds(tilemap, column, row)) return null;
  const index = tilemap.tiles[row * tilemap.columns + column];
  return index === -1 ? null : (tilemap.frameNames[index] ?? null);
}

/**
 * World-space point to the cell that contains it, relative to the tilemap's `Transform`.
 * @param {any} tilemap
 * @param {{ x: number, y: number }} origin the tilemap entity's Transform position
 * @param {{ x: number, y: number }} worldPoint
 * @returns {{ column: number, row: number }}
 */
export function worldToTile(tilemap, origin, worldPoint) {
  return {
    column: Math.floor((worldPoint.x - origin.x) / tilemap.tileWidth),
    row: Math.floor((worldPoint.y - origin.y) / tilemap.tileHeight),
  };
}

/**
 * Emit a sprite command per visible tile.
 *
 * The culling here is what makes large maps cheap: it computes the cell range overlapping the
 * camera and walks only that rectangle, rather than the whole grid and relying on
 * `DrawList.cull` to discard the rest after they have already been built into commands.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function tilemapRenderSystem(world) {
  const drawList = world.getResource(DRAW_LIST_RESOURCE);
  const registry = world.getResource('atlasRegistry');
  const camera = world.getResource('camera');
  if (drawList === undefined || registry === undefined) return;

  world.query([Transform, Tilemap]).each((_entity, transform, tilemap) => {
    if (!tilemap.visible || tilemap.alpha <= 0 || tilemap.columns === 0) return;

    const atlas = registry.get(tilemap.atlas);
    if (atlas === undefined) return;

    const origin = transform.position;

    const bounds =
      camera !== undefined
        ? camera.visibleBounds()
        : {
            minX: origin.x,
            minY: origin.y,
            maxX: origin.x + tilemap.columns * tilemap.tileWidth,
            maxY: origin.y + tilemap.rows * tilemap.tileHeight,
          };

    const minColumn = Math.max(0, Math.floor((bounds.minX - origin.x) / tilemap.tileWidth) - 1);
    const maxColumn = Math.min(
      tilemap.columns - 1,
      Math.ceil((bounds.maxX - origin.x) / tilemap.tileWidth) + 1,
    );
    const minRow = Math.max(0, Math.floor((bounds.minY - origin.y) / tilemap.tileHeight) - 1);
    const maxRow = Math.min(
      tilemap.rows - 1,
      Math.ceil((bounds.maxY - origin.y) / tilemap.tileHeight) + 1,
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const frameIndex = tilemap.tiles[row * tilemap.columns + column];
        if (frameIndex === -1) continue;

        const frameName = tilemap.frameNames[frameIndex];
        const rect = atlas.frame(frameName);
        if (rect === undefined) continue;

        drawList.sprite({
          texture: atlas.texture,
          x: origin.x + column * tilemap.tileWidth + tilemap.tileWidth / 2,
          y: origin.y + row * tilemap.tileHeight + tilemap.tileHeight / 2,
          width: tilemap.tileWidth,
          height: tilemap.tileHeight,
          layer: tilemap.layer,
          z: tilemap.z,
          tint: tilemap.tint,
          alpha: tilemap.alpha,
          source: rect,
        });
      }
    }
  });
}

/**
 * Install the tilemap renderer on a world.
 * @param {import('@novaforge/core').World} world
 * @returns {number} the system handle
 */
export function installTilemapSystem(world) {
  return world.addSystem('render', tilemapRenderSystem, { order: -10, name: 'tilemapRender' });
}
