/** Scalar helpers shared across the engine. */

/** Tolerance for float comparisons throughout the engine. */
export const EPSILON = 1e-6;

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const TAU = Math.PI * 2;

/**
 * Constrain `value` to the inclusive range [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * @param {number} value
 * @returns {number} `value` constrained to [0, 1].
 */
export function clamp01(value) {
  return clamp(value, 0, 1);
}

/**
 * Linear interpolation. `t` is not clamped, so this doubles as extrapolation.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * The inverse of {@link lerp}: where does `value` sit between `a` and `b`?
 * Returns 0 for a degenerate range rather than dividing by zero.
 * @param {number} a
 * @param {number} b
 * @param {number} value
 * @returns {number}
 */
export function inverseLerp(a, b, value) {
  const range = b - a;
  if (Math.abs(range) < EPSILON) return 0;
  return (value - a) / range;
}

/**
 * Map `value` from one range onto another.
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
export function remap(value, inMin, inMax, outMin, outMax) {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

/**
 * Float equality within {@link EPSILON}, or a caller-supplied tolerance.
 * @param {number} a
 * @param {number} b
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function approximately(a, b, tolerance = EPSILON) {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Sign of a number, treating near-zero as zero. Unlike `Math.sign`, never returns -0.
 * @param {number} value
 * @returns {-1 | 0 | 1}
 */
export function sign(value) {
  if (value > EPSILON) return 1;
  if (value < -EPSILON) return -1;
  return 0;
}

/**
 * Wrap `value` into [min, max). Correct for negative inputs, which `%` is not.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function wrap(value, min, max) {
  const range = max - min;
  if (range <= 0) return min;
  return min + (((value - min) % range) + range) % range;
}

/**
 * Wrap an angle in radians into (-PI, PI]. Used everywhere rotations are compared or
 * interpolated, so that turning from 179deg to -179deg is a 2deg move and not a 358deg one.
 * @param {number} radians
 * @returns {number}
 */
export function wrapAngle(radians) {
  const wrapped = wrap(radians, -Math.PI, Math.PI);
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/**
 * Step from `current` toward `target` by at most `maxDelta`, never overshooting.
 * @param {number} current
 * @param {number} target
 * @param {number} maxDelta
 * @returns {number}
 */
export function moveTowards(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/**
 * Critically damped spring smoothing — the standard camera-follow curve.
 *
 * Frame-rate independent, and it does not overshoot. `state.velocity` is mutated and must be
 * carried across calls by the caller.
 *
 * @param {number} current
 * @param {number} target
 * @param {{ velocity: number }} state  mutable velocity carrier
 * @param {number} smoothTime  approximate seconds to reach the target
 * @param {number} dt  seconds elapsed
 * @param {number} [maxSpeed]
 * @returns {number}
 */
export function smoothDamp(current, target, state, smoothTime, dt, maxSpeed = Infinity) {
  const time = Math.max(0.0001, smoothTime);
  const omega = 2 / time;
  const x = omega * dt;
  // Padé approximation of exp(-x); cheaper than Math.exp and accurate over the range we use.
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const maxChange = maxSpeed * time;
  change = clamp(change, -maxChange, maxChange);

  const goal = current - change;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  let output = goal + (change + temp) * exp;

  // Prevent overshooting past the target.
  if (target - current > 0 === output > target) {
    output = target;
    state.velocity = (output - target) / dt;
  }
  return output;
}

/**
 * @param {number} value
 * @returns {boolean}
 */
export function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

/**
 * Round up to the next power of two. Used by the (future) atlas packer.
 * @param {number} value
 * @returns {number}
 */
export function nearestPowerOfTwo(value) {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}
