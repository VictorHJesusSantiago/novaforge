/**
 * Easing curves. Every function maps [0, 1] to roughly [0, 1] and satisfies `f(0) === 0` and
 * `f(1) === 1`; the back and elastic families deliberately leave the range in the middle.
 *
 * Used by the animation system and, later, by the editor's curve editor.
 */

/** @typedef {(t: number) => number} EasingFunction */

/** @type {EasingFunction} */
export const linear = (t) => t;

/** @type {EasingFunction} */
export const quadIn = (t) => t * t;

/** @type {EasingFunction} */
export const quadOut = (t) => t * (2 - t);

/** @type {EasingFunction} */
export const quadInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/** @type {EasingFunction} */
export const cubicIn = (t) => t * t * t;

/** @type {EasingFunction} */
export const cubicOut = (t) => 1 + (t - 1) ** 3;

/** @type {EasingFunction} */
export const cubicInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 + (t - 1) * (2 * t - 2) * (2 * t - 2));

/** @type {EasingFunction} */
export const quartIn = (t) => t ** 4;

/** @type {EasingFunction} */
export const quartOut = (t) => 1 - (t - 1) ** 4;

/** @type {EasingFunction} */
export const quartInOut = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - 8 * (t - 1) ** 4);

/** @type {EasingFunction} */
export const quintIn = (t) => t ** 5;

/** @type {EasingFunction} */
export const quintOut = (t) => 1 + (t - 1) ** 5;

/** @type {EasingFunction} */
export const sineIn = (t) => 1 - Math.cos((t * Math.PI) / 2);

/** @type {EasingFunction} */
export const sineOut = (t) => Math.sin((t * Math.PI) / 2);

/** @type {EasingFunction} */
export const sineInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** @type {EasingFunction} */
export const expoIn = (t) => (t === 0 ? 0 : 2 ** (10 * (t - 1)));

/** @type {EasingFunction} */
export const expoOut = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

/** @type {EasingFunction} */
export const circIn = (t) => 1 - Math.sqrt(1 - t * t);

/** @type {EasingFunction} */
export const circOut = (t) => Math.sqrt(1 - (t - 1) ** 2);

/** Overshoots past 1 before settling. @type {EasingFunction} */
export const backIn = (t) => {
  const c = 1.70158;
  return t * t * ((c + 1) * t - c);
};

/** @type {EasingFunction} */
export const backOut = (t) => {
  const c = 1.70158;
  return 1 + (t - 1) * (t - 1) * ((c + 1) * (t - 1) + c);
};

/** Oscillates around the target before settling. @type {EasingFunction} */
export const elasticOut = (t) => {
  if (t === 0 || t === 1) return t;
  const period = 0.3;
  return 2 ** (-10 * t) * Math.sin(((t - period / 4) * (2 * Math.PI)) / period) + 1;
};

/** Multi-stage piecewise curve; each branch is one bounce. @type {EasingFunction} */
export const bounceOut = (t) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) {
    const t2 = t - 1.5 / d;
    return n * t2 * t2 + 0.75;
  }
  if (t < 2.5 / d) {
    const t2 = t - 2.25 / d;
    return n * t2 * t2 + 0.9375;
  }
  const t2 = t - 2.625 / d;
  return n * t2 * t2 + 0.984375;
};

/** @type {EasingFunction} */
export const bounceIn = (t) => 1 - bounceOut(1 - t);

/**
 * Turn any `in` curve into its `out` mirror, so a custom curve gets both directions for free.
 * @param {EasingFunction} fn
 * @returns {EasingFunction}
 */
export function mirror(fn) {
  return (t) => 1 - fn(1 - t);
}

/**
 * Combine an `in` curve and an `out` curve into an `inOut` curve.
 * @param {EasingFunction} inFn
 * @param {EasingFunction} outFn
 * @returns {EasingFunction}
 */
export function combine(inFn, outFn) {
  return (t) => (t < 0.5 ? inFn(t * 2) / 2 : 0.5 + outFn(t * 2 - 1) / 2);
}

/**
 * Look up a curve by name — the form the editor and any serialised animation use.
 * @type {Record<string, EasingFunction>}
 */
export const byName = {
  linear,
  quadIn,
  quadOut,
  quadInOut,
  cubicIn,
  cubicOut,
  cubicInOut,
  quartIn,
  quartOut,
  quartInOut,
  quintIn,
  quintOut,
  sineIn,
  sineOut,
  sineInOut,
  expoIn,
  expoOut,
  circIn,
  circOut,
  backIn,
  backOut,
  elasticOut,
  bounceIn,
  bounceOut,
};

/**
 * @param {string} name
 * @returns {EasingFunction} the named curve, or `linear` if the name is unknown.
 *   Falling back is deliberate: a typo in a data file should not stop the animation system.
 */
export function resolve(name) {
  return byName[name] ?? linear;
}
