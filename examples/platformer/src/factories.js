import { Transform } from '@novaforge/core';
import { ShapeRect, ShapeCircle, TextLabel, Tilemap, resizeTilemap, setTile } from '@novaforge/renderer';
import { RigidBody, Collider, BodyType, box, setMass } from '@novaforge/physics';
import { AnimationController, TimelinePlayer, enterStateMachine } from '@novaforge/animation';
import { Player, PlayerState, Hazard, Goal, Coin, HudText } from './components.js';
import { PLAYER, TILE, LAYER, DRAW_LAYER, COLORS, TILE_ATLAS, TILE_FRAME_GROUND } from './config.js';
import { TILE_GROUND, LEVEL_PIXEL_WIDTH, HAZARD_Y } from './level.js';
import { buildPlayerAnimationMachine } from './player-animation.js';

/**
 * Entity factories.
 *
 * Kept apart from the scene, same reasoning as `examples/breakout`'s: the scene should read as
 * level *layout*, not a wall of component assignments.
 *
 * @typedef {import('@novaforge/runtime').Scene} Scene
 */

/**
 * @param {Scene} scene
 * @param {number} entity
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
function placeAt(scene, entity, x, y) {
  scene.world.getOrThrow(entity, Transform).position.set(x, y);
}

/**
 * Build the tilemap entity and paint every solid cell from the level grid.
 *
 * @param {Scene} scene
 * @param {number[][]} grid row-major, `TILE_GROUND` or `TILE_EMPTY`
 * @returns {number}
 */
export function createTilemap(scene, grid) {
  const rows = grid.length;
  const columns = rows > 0 ? grid[0].length : 0;

  const entity = scene.spawn(
    [Transform],
    [
      Tilemap,
      {
        atlas: TILE_ATLAS,
        tileWidth: TILE.size,
        tileHeight: TILE.size,
        layer: DRAW_LAYER.LEVEL,
      },
    ],
  );

  const tilemap = scene.world.getOrThrow(entity, Tilemap);
  resizeTilemap(tilemap, columns, rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (grid[row][column] === TILE_GROUND) setTile(tilemap, column, row, TILE_FRAME_GROUND);
    }
  }

  return entity;
}

/**
 * Generate solid colliders for the level from the same grid the tilemap renders.
 *
 * One collider per horizontal run of solid tiles, rather than one per 1x1 tile: a 23-tile floor
 * segment becomes a single box instead of 23, which is what actually matters for broadphase and
 * solver cost. This merges along rows only, not into full 2D rectangles (a floor two tiles thick
 * still produces one collider per row) — a proper rectangle-decomposition merge would shrink the
 * count further, but row-run merging is a few lines, does not need to handle the general
 * polygon-merging case, and already turns this level's ~90 solid cells into a dozen colliders.
 *
 * @param {Scene} scene
 * @param {number[][]} grid
 * @returns {number[]} the collider entities created
 */
export function buildGroundColliders(scene, grid) {
  /** @type {number[]} */
  const created = [];

  for (let row = 0; row < grid.length; row += 1) {
    const cells = grid[row];
    let runStart = -1;

    for (let column = 0; column <= cells.length; column += 1) {
      const solid = column < cells.length && cells[column] === TILE_GROUND;

      if (solid && runStart === -1) {
        runStart = column;
      } else if (!solid && runStart !== -1) {
        created.push(createGroundCollider(scene, runStart, row, column - runStart));
        runStart = -1;
      }
    }
  }

  return created;
}

/**
 * @param {Scene} scene
 * @param {number} column start column of the run
 * @param {number} row
 * @param {number} widthInTiles
 * @returns {number}
 */
function createGroundCollider(scene, column, row, widthInTiles) {
  const width = widthInTiles * TILE.size;
  const height = TILE.size;

  const entity = scene.spawn(
    [Transform],
    [RigidBody, { type: BodyType.STATIC, friction: 0.6, restitution: 0 }],
    [Collider, { shape: box(width, height), layer: LAYER.GROUND, mask: LAYER.PLAYER }],
  );

  placeAt(scene, entity, (column + widthInTiles / 2) * TILE.size, (row + 0.5) * TILE.size);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {{ x: number, y: number }} position
 * @returns {number}
 */
export function createPlayer(scene, { x, y }) {
  const shape = box(PLAYER.width, PLAYER.height);

  const entity = scene.spawn(
    [Transform],
    [Player],
    [PlayerState],
    [
      ShapeRect,
      { width: PLAYER.width, height: PLAYER.height, color: COLORS.player, layer: DRAW_LAYER.ENTITIES },
    ],
    [
      RigidBody,
      {
        type: BodyType.DYNAMIC,
        restitution: 0,
        friction: 0.6,
        gravityScale: 1,
        fixedRotation: true,
      },
    ],
    [
      Collider,
      { shape, layer: LAYER.PLAYER, mask: LAYER.GROUND | LAYER.HAZARD | LAYER.GOAL | LAYER.COIN },
    ],
    [AnimationController],
    [TimelinePlayer],
  );

  placeAt(scene, entity, x, y);
  setMass(scene.world.getOrThrow(entity, RigidBody), shape, 1);
  enterStateMachine(
    scene.world.getOrThrow(entity, AnimationController),
    scene.world.getOrThrow(entity, TimelinePlayer),
    buildPlayerAnimationMachine(),
  );

  return entity;
}

/**
 * The trigger below the level that costs a life. Sized well past both ends so nothing can walk
 * around it, the same approach as `examples/breakout`'s `createDeathZone`.
 * @param {Scene} scene
 * @returns {number}
 */
export function createHazard(scene) {
  const entity = scene.spawn(
    [Transform],
    [Hazard],
    [RigidBody, { type: BodyType.STATIC }],
    [
      Collider,
      {
        shape: box(LEVEL_PIXEL_WIDTH * 2, 40),
        layer: LAYER.HAZARD,
        mask: LAYER.PLAYER,
        isTrigger: true,
      },
    ],
  );

  placeAt(scene, entity, LEVEL_PIXEL_WIDTH / 2, HAZARD_Y);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {{ x: number, y: number }} position
 * @returns {number}
 */
export function createGoal(scene, { x, y }) {
  const entity = scene.spawn(
    [Transform],
    [Goal],
    [ShapeRect, { width: 20, height: 48, color: COLORS.goal, layer: DRAW_LAYER.ENTITIES }],
    [RigidBody, { type: BodyType.STATIC }],
    [Collider, { shape: box(24, 48), layer: LAYER.GOAL, mask: LAYER.PLAYER, isTrigger: true }],
  );

  placeAt(scene, entity, x, y);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {{ x: number, y: number }} position
 * @returns {number}
 */
export function createCoin(scene, { x, y }) {
  const entity = scene.spawn(
    [Transform],
    [Coin],
    [ShapeCircle, { radius: 8, color: COLORS.coin, layer: DRAW_LAYER.ENTITIES }],
    [RigidBody, { type: BodyType.STATIC }],
    [Collider, { shape: box(16, 16), layer: LAYER.COIN, mask: LAYER.PLAYER, isTrigger: true }],
  );

  placeAt(scene, entity, x, y);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {object} options
 * @param {number} options.offsetX screen-space, from the camera's visible top-left corner
 * @param {number} options.offsetY
 * @param {'score'|'lives'|'message'} options.field
 * @param {'left'|'center'|'right'} [options.align]
 * @param {string} [options.font]
 * @param {number} [options.color]
 * @returns {number}
 */
export function createHudText(
  scene,
  { offsetX, offsetY, field, align = 'center', font = '16px monospace', color = COLORS.hud },
) {
  return scene.spawn(
    [Transform],
    [HudText, { field, offsetX, offsetY }],
    [TextLabel, { text: '', font, align, color, layer: DRAW_LAYER.HUD }],
  );
}
