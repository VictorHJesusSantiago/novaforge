import { Vec2, wrapAngle } from '@novaforge/math';

/**
 * The pure geometry behind the viewport's rotate and scale handles: where a handle sits in
 * world space, and what dragging it should produce. Split from `viewport-overlay.js` the same
 * way `viewport-picking.js` was — no DOM, no pointer events, fully testable in Node.
 */

/** World-space distance from an entity's centre to its rotate handle. */
export const ROTATE_HANDLE_DISTANCE = 50;

/** World-space distance from an entity's centre to its scale handle, at scale 1. */
export const SCALE_HANDLE_DISTANCE = 40;

/**
 * The rotate handle orbits the entity at a fixed distance, in the direction the entity is
 * currently facing — so it visibly tracks rotation instead of sitting in a corner that stops
 * meaning anything once the entity has turned.
 *
 * @param {{ x: number, y: number }} position
 * @param {number} rotation radians
 * @param {number} [distance]
 * @returns {Vec2}
 */
export function rotateHandlePosition(position, rotation, distance = ROTATE_HANDLE_DISTANCE) {
  return Vec2.from(position).addSelf(Vec2.fromAngle(rotation, distance));
}

/**
 * The scale handle sits at a corner offset that rotates with the entity (so it stays visually
 * attached to "the shape's corner" as the entity turns) and grows with the entity's current
 * scale, so a already-large entity's handle is proportionally further out.
 *
 * A single corner drives **uniform** scale — both axes move together. Independent per-axis
 * handles are a real feature this does not have; see the class doc on stated scope boundaries.
 *
 * @param {{ x: number, y: number }} position
 * @param {number} rotation radians
 * @param {{ x: number, y: number }} scale
 * @param {number} [distance]
 * @returns {Vec2}
 */
export function scaleHandlePosition(position, rotation, scale, distance = SCALE_HANDLE_DISTANCE) {
  // A fixed local direction (1, 1), rotated by the entity and scaled by its current magnitude.
  const magnitude = (Math.abs(scale.x) + Math.abs(scale.y)) / 2;
  const local = new Vec2(1, 1).normalizeSelf().scaleSelf(distance * Math.max(magnitude, 0.05));
  return Vec2.from(position).addSelf(local.rotate(rotation));
}

/**
 * @param {{ x: number, y: number }} center
 * @param {{ x: number, y: number }} point
 * @returns {number} the angle from `center` to `point`, in radians.
 */
export function angleFromCenter(center, point) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

/**
 * Uniform scale implied by dragging the scale handle to `point`, relative to where the drag
 * started.
 *
 * @param {{ x: number, y: number }} center
 * @param {{ x: number, y: number }} point current drag position, world space
 * @param {number} startDistance distance from `center` to the handle when the drag began
 * @param {{ x: number, y: number }} startScale the entity's scale when the drag began
 * @param {number} [minScale] a floor so a drag through the centre cannot invert or zero the scale
 * @returns {Vec2}
 */
export function scaleFromDrag(center, point, startDistance, startScale, minScale = 0.05) {
  const currentDistance = Math.hypot(point.x - center.x, point.y - center.y);
  const factor = startDistance > 1e-6 ? currentDistance / startDistance : 1;
  return new Vec2(
    Math.max(minScale, startScale.x * factor),
    Math.max(minScale, startScale.y * factor),
  );
}

/**
 * Snap a value to the nearest multiple of `step`. `step <= 0` disables snapping (returns
 * `value` unchanged) rather than dividing by zero — the caller's "snap enabled" toggle is
 * naturally expressible as `step = enabled ? gridSize : 0`.
 * @param {number} value
 * @param {number} step
 * @returns {number}
 */
export function snapValue(value, step) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * @param {{ x: number, y: number }} point
 * @param {number} step world units; `<= 0` disables snapping
 * @returns {Vec2}
 */
export function snapPoint(point, step) {
  return new Vec2(snapValue(point.x, step), snapValue(point.y, step));
}

/**
 * Snap an angle to the nearest multiple of `stepRadians`, wrapped into (-PI, PI] — angle
 * snapping without the wrap would make 179° snap toward 180° while -179° snapped toward -180°,
 * two names for the same direction that then refuse to agree.
 * @param {number} radians
 * @param {number} stepRadians `<= 0` disables snapping
 * @returns {number}
 */
export function snapAngle(radians, stepRadians) {
  if (stepRadians <= 0) return radians;
  return wrapAngle(Math.round(radians / stepRadians) * stepRadians);
}
