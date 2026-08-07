import { TILE, PLAYER } from './config.js';

/**
 * The hand-authored level, as tile-index data.
 *
 * `LEVEL_GRID` is a real 2D array (rows of columns), the same shape `@novaforge/renderer`'s
 * `Tilemap` stores internally — this module just builds it with named rectangles instead of a
 * wall of individual `grid[r][c] = 1` assignments, which would be equally "hand-authored" but
 * much harder to read back and check for an off-by-one gap.
 *
 * Legend: `TILE_EMPTY` (nothing, air) or `TILE_GROUND` (solid).
 */
export const TILE_EMPTY = 0;
export const TILE_GROUND = 1;

const COLUMNS = 40;
const ROWS = 14;

/**
 * @param {number} columns
 * @param {number} rows
 * @returns {number[][]}
 */
function makeGrid(columns, rows) {
  return Array.from({ length: rows }, () => new Array(columns).fill(TILE_EMPTY));
}

/**
 * @param {number[][]} grid
 * @param {number} column
 * @param {number} row
 * @param {number} width
 * @param {number} height
 * @param {number} value
 * @returns {void}
 */
function fillRect(grid, column, row, width, height, value) {
  for (let r = row; r < row + height; r += 1) {
    if (grid[r] === undefined) continue;
    for (let c = column; c < column + width; c += 1) {
      if (c < 0 || c >= grid[r].length) continue;
      grid[r][c] = value;
    }
  }
}

const grid = makeGrid(COLUMNS, ROWS);

// The floor, in two segments with a three-tile gap between them (columns 14-16) that cannot be
// walked across — the player has to jump it.
fillRect(grid, 0, 12, 14, 2, TILE_GROUND);
fillRect(grid, 17, 12, 23, 2, TILE_GROUND);

// A low stepping platform near the start — reachable with a short hop, and its left face is
// used by the gameplay test to prove a solid tile actually stops horizontal movement.
fillRect(grid, 4, 9, 4, 1, TILE_GROUND);

// A higher platform past the gap. Purely a change of scenery — optional, not on the critical
// path to the goal — but it is what makes this "platforms at different heights" rather than a
// flat floor with one obstacle.
fillRect(grid, 26, 7, 4, 1, TILE_GROUND);

// The rise leading up to the goal: two tiles taller than the floor, so reaching the goal needs
// one more jump after crossing the gap.
fillRect(grid, 34, 10, 6, 4, TILE_GROUND);

/** The finished level, ready for `factories.js` to read. */
export const LEVEL_GRID = grid;
export const LEVEL_COLUMNS = COLUMNS;
export const LEVEL_ROWS = ROWS;
export const LEVEL_PIXEL_WIDTH = COLUMNS * TILE.size;
export const LEVEL_PIXEL_HEIGHT = ROWS * TILE.size;

/** Where the player spawns and respawns after losing a life — resting exactly on the floor. */
export const PLAYER_START = { x: 2 * TILE.size + TILE.size / 2, y: 12 * TILE.size - PLAYER.height / 2 };

/** The flag the player must touch to win, sitting just above the rise's top surface. */
export const GOAL_POSITION = { x: 37 * TILE.size + TILE.size / 2, y: 9 * TILE.size + 16 };

/**
 * The y coordinate of a wide trigger below the level's lowest tile. Anything that falls through
 * the gap — or off either end — lands in it and loses a life, the same role
 * `examples/breakout`'s `DeathZone` plays below the paddle.
 */
export const HAZARD_Y = LEVEL_PIXEL_HEIGHT + 80;

/** Coin pickups. One sits over the gap, rewarding the jump that crossing it requires. */
export const COIN_POSITIONS = [
  { x: 6 * TILE.size, y: 9 * TILE.size - 16 },
  { x: 15 * TILE.size + 16, y: 10 * TILE.size },
  { x: 27 * TILE.size + 16, y: 7 * TILE.size - 16 },
];
