import { Transform } from '@novaforge/core';
import { ShapeRect, ShapeCircle, TextLabel } from '@novaforge/renderer';
import { RigidBody, Collider, BodyType, box, circle, setMass } from '@novaforge/physics';
import { Paddle, Ball, Brick, DeathZone, HudText } from './components.js';
import { PLAYFIELD, PADDLE, BALL, BRICKS, LAYER, DRAW_LAYER, COLORS } from './config.js';

/**
 * Entity factories.
 *
 * Kept apart from the scene so the scene reads as level *layout* rather than as a wall of
 * component assignments, and so the editor can eventually call the same functions from a
 * "create brick" button.
 *
 * @typedef {import('@novaforge/runtime').Scene} Scene
 */

/**
 * Place a freshly spawned entity.
 *
 * `getOrThrow` rather than `get`: the caller just created the entity with a `Transform` one line
 * earlier, so a missing one is a programming error, not a case to handle.
 *
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
 * @param {Scene} scene
 * @param {{ x: number, y: number, width: number, height: number }} options
 * @returns {number}
 */
export function createWall(scene, { x, y, width, height }) {
  const entity = scene.spawn(
    [Transform],
    [ShapeRect, { width, height, color: COLORS.wall, layer: DRAW_LAYER.PLAYFIELD }],
    [RigidBody, { type: BodyType.STATIC, restitution: 1, friction: 0 }],
    [Collider, { shape: box(width, height), layer: LAYER.WALL, mask: LAYER.BALL }],
  );

  placeAt(scene, entity, x, y);
  return entity;
}

/**
 * @param {Scene} scene
 * @returns {number}
 */
export function createPaddle(scene) {
  const entity = scene.spawn(
    [Transform],
    [Paddle],
    [
      ShapeRect,
      {
        width: PADDLE.width,
        height: PADDLE.height,
        color: COLORS.paddle,
        layer: DRAW_LAYER.ENTITIES,
      },
    ],
    [
      RigidBody,
      {
        type: BodyType.KINEMATIC,
        restitution: 1,
        friction: 0,
        fixedRotation: true,
      },
    ],
    [Collider, { shape: box(PADDLE.width, PADDLE.height), layer: LAYER.PADDLE, mask: LAYER.BALL }],
  );

  placeAt(scene, entity, PLAYFIELD.width / 2, PADDLE.y);
  return entity;
}

/**
 * @param {Scene} scene
 * @returns {number}
 */
export function createBall(scene) {
  const shape = circle(BALL.radius);
  const entity = scene.spawn(
    [Transform],
    [Ball],
    [ShapeCircle, { radius: BALL.radius, color: COLORS.ball, layer: DRAW_LAYER.ENTITIES }],
    [
      RigidBody,
      {
        type: BodyType.DYNAMIC,
        restitution: 1,
        friction: 0,
        gravityScale: 0,
        linearDamping: 0,
        angularDamping: 0,
        fixedRotation: true,
      },
    ],
    [
      Collider,
      {
        shape,
        layer: LAYER.BALL,
        mask: LAYER.WALL | LAYER.PADDLE | LAYER.BRICK | LAYER.DEATH_ZONE,
      },
    ],
  );

  setMass(scene.world.getOrThrow(entity, RigidBody), shape, 1);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {number} column
 * @param {number} row
 * @returns {number}
 */
export function createBrick(scene, column, row) {
  const totalWidth = BRICKS.columns * BRICKS.width + (BRICKS.columns - 1) * BRICKS.gapX;
  const originX = (PLAYFIELD.width - totalWidth) / 2 + BRICKS.width / 2;

  const entity = scene.spawn(
    [Transform],
    [Brick, { points: BRICKS.points[row], row }],
    [
      ShapeRect,
      {
        width: BRICKS.width,
        height: BRICKS.height,
        color: BRICKS.colors[row],
        layer: DRAW_LAYER.ENTITIES,
      },
    ],
    [RigidBody, { type: BodyType.STATIC, restitution: 1, friction: 0 }],
    [Collider, { shape: box(BRICKS.width, BRICKS.height), layer: LAYER.BRICK, mask: LAYER.BALL }],
  );

  placeAt(
    scene,
    entity,
    originX + column * (BRICKS.width + BRICKS.gapX),
    BRICKS.originY + row * (BRICKS.height + BRICKS.gapY),
  );
  return entity;
}

/**
 * The strip below the paddle. A trigger rather than a solid: it must detect the ball, not
 * bounce it.
 * @param {Scene} scene
 * @returns {number}
 */
export function createDeathZone(scene) {
  const entity = scene.spawn(
    [Transform],
    [DeathZone],
    [RigidBody, { type: BodyType.STATIC }],
    [
      Collider,
      {
        shape: box(PLAYFIELD.width * 2, 40),
        layer: LAYER.DEATH_ZONE,
        mask: LAYER.BALL,
        isTrigger: true,
      },
    ],
  );

  placeAt(scene, entity, PLAYFIELD.width / 2, PLAYFIELD.height + 40);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {'score'|'lives'|'message'} options.field
 * @param {'left'|'center'|'right'} [options.align]
 * @param {string} [options.font]
 * @param {number} [options.color]
 * @returns {number}
 */
export function createHudText(
  scene,
  { x, y, field, align = 'center', font = '16px monospace', color = COLORS.hud },
) {
  const entity = scene.spawn(
    [Transform],
    [HudText, { field }],
    [TextLabel, { text: '', font, align, color, layer: DRAW_LAYER.HUD }],
  );

  placeAt(scene, entity, x, y);
  return entity;
}
