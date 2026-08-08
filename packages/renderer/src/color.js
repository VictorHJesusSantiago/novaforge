/**
 * Colours are packed 24-bit integers (`0xRRGGBB`) with alpha carried separately as a float.
 *
 * Packing keeps a colour a single number in a component, which matters for Invariant C2
 * (components are plain data) and for the draw list's sort key. Alpha stays separate because
 * it is animated far more often than hue, and because the Canvas2D backend applies it through
 * `globalAlpha` rather than through the fill style.
 */

export const WHITE = 0xffffff;
export const BLACK = 0x000000;

/** The missing-asset colour. Chosen because nothing real is ever this colour by accident. */
export const MAGENTA = 0xff00ff;

/**
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @returns {number} packed 0xRRGGBB
 */
export function rgb(r, g, b) {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @param {number} a 0-1
 * @returns {{ color: number, alpha: number }}
 */
export function rgba(r, g, b, a) {
  return { color: rgb(r, g, b), alpha: a };
}

/**
 * Parse `#rgb`, `#rrggbb`, or the same without the hash.
 * @param {string} text
 * @returns {number} packed colour, or {@link MAGENTA} for anything unparseable — a bad colour
 *   in a data file should be loud on screen, not a crash or a silent black.
 */
export function fromHexString(text) {
  const hex = text.trim().replace(/^#/, '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].some(Number.isNaN)) return MAGENTA;
    return rgb(r, g, b);
  }
  if (hex.length === 6) {
    const value = parseInt(hex, 16);
    return Number.isNaN(value) ? MAGENTA : value;
  }
  return MAGENTA;
}

/**
 * @param {number} color packed 0xRRGGBB
 * @returns {{ r: number, g: number, b: number }}
 */
export function channels(color) {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

/**
 * @param {number} color packed 0xRRGGBB
 * @param {number} [alpha] 0-1
 * @returns {string} a CSS colour string for the Canvas2D backend.
 */
export function toCssColor(color, alpha = 1) {
  const { r, g, b } = channels(color);
  if (alpha >= 1) {
    return `#${color.toString(16).padStart(6, '0')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Interpolate two packed colours per channel.
 *
 * This is naive sRGB interpolation, not perceptual: blending red and green passes through a
 * muddy olive rather than yellow. Correct for tints and fades, which is what it is used for;
 * a gradient generator would want Oklab instead.
 *
 * @param {number} from packed 0xRRGGBB
 * @param {number} to packed 0xRRGGBB
 * @param {number} t 0-1
 * @returns {number}
 */
export function lerpColor(from, to, t) {
  const a = channels(from);
  const b = channels(to);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return rgb(
    Math.round(a.r + (b.r - a.r) * clamped),
    Math.round(a.g + (b.g - a.g) * clamped),
    Math.round(a.b + (b.b - a.b) * clamped),
  );
}
