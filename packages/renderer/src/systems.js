import { lerp, wrapAngle } from '@novaforge/math';
import { Transform } from '@novaforge/core';
import { Sprite, ShapeRect, ShapeCircle, TextLabel } from './components.js';

/**
 * Render systems.
 *
 * Every one of these reads the world and writes only to the draw list — never to a canvas, and
 * never back into the simulation (ARCHITECTURE.md, "Data flow between packages"). That is what
 * makes them testable without a browser and what will let the WebGL2 backend reuse them
 * unchanged.
 *
 * In the `render` stage the `dt` argument carries the clock's **alpha**, not a time delta. The
 * stage runs once per frame with a value in [0, 1) describing how far the render is between the
 * last and next fixed step.
 */

/** Resource key under which the runtime stores the frame's `DrawList`. */
export const DRAW_LIST_RESOURCE = 'drawList';

/**
 * Copy the current transform into the previous one.
 *
 * Must run **first** in `fixedUpdate`, before any system moves anything. Running it late (or in
 * `update`) makes previous and current identical, interpolation a no-op, and the judder it
 * exists to remove comes back — with no visible error to explain why.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function syncPreviousTransform(world) {
  world.query([Transform]).each((_entity, transform) => {
    transform.previousPosition.x = transform.position.x;
    transform.previousPosition.y = transform.position.y;
    transform.previousRotation = transform.rotation;
  });
}

/**
 * Interpolated world position for the current render.
 * @param {any} transform
 * @param {number} alpha
 * @returns {{ x: number, y: number, rotation: number }}
 */
function interpolate(transform, alpha) {
  const delta = wrapAngle(transform.rotation - transform.previousRotation);
  return {
    x: lerp(transform.previousPosition.x, transform.position.x, alpha),
    y: lerp(transform.previousPosition.y, transform.position.y, alpha),
    rotation: transform.previousRotation + delta * alpha,
  };
}

/**
 * Emit a sprite command per visible `Transform` + `Sprite`.
 * @param {import('@novaforge/core').World} world
 * @param {number} alpha
 * @returns {void}
 */
export function spriteRenderSystem(world, alpha) {
  const drawList = world.getResource(DRAW_LIST_RESOURCE);
  if (drawList === undefined) return;

  world.query([Transform, Sprite]).each((_entity, transform, sprite) => {
    if (!sprite.visible || sprite.alpha <= 0) return;
    const at = interpolate(transform, alpha);
    drawList.sprite({
      texture: sprite.texture,
      x: at.x,
      y: at.y,
      rotation: at.rotation,
      width: sprite.width,
      height: sprite.height,
      scaleX: transform.scale.x,
      scaleY: transform.scale.y,
      anchorX: sprite.anchorX,
      anchorY: sprite.anchorY,
      tint: sprite.tint,
      alpha: sprite.alpha,
      layer: sprite.layer,
      z: sprite.z,
      source: sprite.source,
    });
  });
}

/**
 * Emit rectangle and circle commands.
 * @param {import('@novaforge/core').World} world
 * @param {number} alpha
 * @returns {void}
 */
export function shapeRenderSystem(world, alpha) {
  const drawList = world.getResource(DRAW_LIST_RESOURCE);
  if (drawList === undefined) return;

  world.query([Transform, ShapeRect]).each((_entity, transform, shape) => {
    if (!shape.visible || shape.alpha <= 0) return;
    const at = interpolate(transform, alpha);
    drawList.rect({
      x: at.x,
      y: at.y,
      rotation: at.rotation,
      width: shape.width * transform.scale.x,
      height: shape.height * transform.scale.y,
      anchorX: shape.anchorX,
      anchorY: shape.anchorY,
      tint: shape.color,
      alpha: shape.alpha,
      filled: shape.filled,
      lineWidth: shape.lineWidth,
      layer: shape.layer,
      z: shape.z,
    });
  });

  world.query([Transform, ShapeCircle]).each((_entity, transform, shape) => {
    if (!shape.visible || shape.alpha <= 0) return;
    const at = interpolate(transform, alpha);
    drawList.circle({
      x: at.x,
      y: at.y,
      radius: shape.radius * Math.max(transform.scale.x, transform.scale.y),
      tint: shape.color,
      alpha: shape.alpha,
      filled: shape.filled,
      lineWidth: shape.lineWidth,
      layer: shape.layer,
      z: shape.z,
    });
  });
}

/**
 * Emit text commands.
 * @param {import('@novaforge/core').World} world
 * @param {number} alpha
 * @returns {void}
 */
export function textRenderSystem(world, alpha) {
  const drawList = world.getResource(DRAW_LIST_RESOURCE);
  if (drawList === undefined) return;

  world.query([Transform, TextLabel]).each((_entity, transform, label) => {
    if (!label.visible || label.alpha <= 0 || label.text === '') return;
    const at = interpolate(transform, alpha);
    drawList.text({
      text: label.text,
      x: at.x,
      y: at.y,
      font: label.font,
      align: label.align,
      tint: label.color,
      alpha: label.alpha,
      layer: label.layer,
      z: label.z,
    });
  });
}

/**
 * Register every render system on a world, in the correct stages and order.
 *
 * The ordering here is not cosmetic: `syncPreviousTransform` at order `-1000` in `fixedUpdate`
 * guarantees it runs before any gameplay system moves anything.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {number[]} the system handles, so a scene can unregister them on exit.
 */
export function installRenderSystems(world) {
  return [
    world.addSystem('fixedUpdate', syncPreviousTransform, {
      order: -1000,
      name: 'syncPreviousTransform',
    }),
    world.addSystem('render', spriteRenderSystem, { order: 0, name: 'spriteRender' }),
    world.addSystem('render', shapeRenderSystem, { order: 10, name: 'shapeRender' }),
    world.addSystem('render', textRenderSystem, { order: 100, name: 'textRender' }),
  ];
}
