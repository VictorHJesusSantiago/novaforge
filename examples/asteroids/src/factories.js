import { Transform } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { ShapeCircle, TextLabel } from '@novaforge/renderer';
import { RigidBody, Collider, BodyType, circle } from '@novaforge/physics';
import { Ship, Bullet, Asteroid, Wrappable, HudText } from './components.js';
import { PLAYFIELD, SHIP, BULLET, ASTEROID, LAYER, DRAW_LAYER, COLORS } from './config.js';

/**
 * Entity factories.
 *
 * Kept apart from the scene so the scene reads as level *layout* rather than as a wall of
 * component assignments — see breakout's `factories.js` for the same reasoning.
 *
 * @typedef {import('@novaforge/runtime').Scene} Scene
 */

/**
 * @param {Scene} scene
 * @returns {number}
 */
export function createShip(scene) {
  const shape = circle(SHIP.radius);
  const entity = scene.spawn(
    [
      Transform,
      {
        position: new Vec2(PLAYFIELD.width / 2, PLAYFIELD.height / 2),
        rotation: -Math.PI / 2,
      },
    ],
    [Ship],
    [ShapeCircle, { radius: SHIP.radius, color: COLORS.ship, layer: DRAW_LAYER.ENTITIES }],
    [
      RigidBody,
      {
        type: BodyType.DYNAMIC,
        gravityScale: 0,
        linearDamping: SHIP.drag,
        angularDamping: 0,
        fixedRotation: true,
        restitution: 0,
        friction: 0,
      },
    ],
    [
      Collider,
      {
        shape,
        layer: LAYER.SHIP,
        mask: LAYER.ASTEROID,
        isTrigger: true,
      },
    ],
    [Wrappable, { margin: SHIP.radius }],
  );
  return entity;
}

/**
 * @param {Scene} scene
 * @param {object} options
 * @param {'large'|'medium'|'small'} options.size
 * @param {number} options.x
 * @param {number} options.y
 * @param {{ x: number, y: number }} options.velocity
 * @returns {number}
 */
export function createAsteroid(scene, { size, x, y, velocity }) {
  const info = ASTEROID.sizes[size];
  const shape = circle(info.radius);
  const entity = scene.spawn(
    [Transform, { position: new Vec2(x, y) }],
    [Asteroid, { size }],
    [ShapeCircle, { radius: info.radius, color: COLORS.asteroid, layer: DRAW_LAYER.ENTITIES }],
    [
      RigidBody,
      {
        type: BodyType.DYNAMIC,
        gravityScale: 0,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 1,
        friction: 0,
      },
    ],
    [
      Collider,
      {
        shape,
        layer: LAYER.ASTEROID,
        mask: LAYER.SHIP | LAYER.BULLET,
        isTrigger: false,
      },
    ],
    [Wrappable, { margin: info.radius }],
  );

  const body = scene.world.getOrThrow(entity, RigidBody);
  body.velocity.set(velocity.x, velocity.y);
  body.angularVelocity = (velocity.x + velocity.y) % 1.5;

  return entity;
}

/**
 * @param {Scene} scene
 * @param {object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} options.rotation radians; also the bullet's flight direction
 * @returns {number}
 */
export function createBullet(scene, { x, y, rotation }) {
  const shape = circle(BULLET.radius);
  const entity = scene.spawn(
    [Transform, { position: new Vec2(x, y), rotation }],
    [Bullet, { life: BULLET.lifetime }],
    [ShapeCircle, { radius: BULLET.radius, color: COLORS.bullet, layer: DRAW_LAYER.ENTITIES }],
    [
      RigidBody,
      {
        type: BodyType.DYNAMIC,
        gravityScale: 0,
        linearDamping: 0,
        angularDamping: 0,
        fixedRotation: true,
        restitution: 0,
        friction: 0,
      },
    ],
    [
      Collider,
      {
        shape,
        layer: LAYER.BULLET,
        mask: LAYER.ASTEROID,
        isTrigger: true,
      },
    ],
    [Wrappable, { margin: BULLET.radius }],
  );

  const body = scene.world.getOrThrow(entity, RigidBody);
  body.velocity.set(Math.cos(rotation) * BULLET.speed, Math.sin(rotation) * BULLET.speed);
  return entity;
}

/**
 * @param {Scene} scene
 * @param {object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {'score'|'lives'|'wave'|'message'} options.field
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
    [Transform, { position: new Vec2(x, y) }],
    [HudText, { field }],
    [TextLabel, { text: '', font, align, color, layer: DRAW_LAYER.HUD }],
  );
  return entity;
}
