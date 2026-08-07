/**
 * @novaforge/math — 2D math primitives.
 *
 * Every type here is plain data with no engine dependencies, which is what allows the
 * simulation packages to stay testable in Node with no DOM present.
 */

export { Vec2 } from './vec2.js';
export { Mat3 } from './mat3.js';
export { Rect } from './rect.js';
export { AABB } from './aabb.js';
export { Rng } from './rng.js';
export * as easing from './easing.js';
export {
  EPSILON,
  DEG_TO_RAD,
  RAD_TO_DEG,
  TAU,
  clamp,
  clamp01,
  lerp,
  inverseLerp,
  remap,
  approximately,
  sign,
  wrap,
  wrapAngle,
  moveTowards,
  smoothDamp,
  nearestPowerOfTwo,
  isPowerOfTwo,
} from './mathf.js';
