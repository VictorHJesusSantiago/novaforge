/**
 * Collision filtering.
 *
 * Every collider has a `layer` (one bit: what it *is*) and a `mask` (many bits: what it *wants
 * to hit*). Filtering is **symmetric** — both sides must agree (Invariant P1).
 *
 * Asymmetric filtering, where a collision happens if either side is interested, is the usual
 * shortcut and it produces the worst class of physics bug: a collision that registers for one
 * body's callbacks but not the other's, so an enemy takes damage from a bullet that visibly
 * passes through it. Requiring agreement makes that impossible to express.
 */

/**
 * The default layer set. These are examples, not a fixed vocabulary — a game is expected to
 * define its own. Bit 0 is reserved as `DEFAULT` so a collider constructed with no explicit
 * layer still collides with something.
 * @readonly
 * @enum {number}
 */
export const Layers = {
  DEFAULT: 1 << 0,
  PLAYER: 1 << 1,
  ENEMY: 1 << 2,
  PROJECTILE: 1 << 3,
  TERRAIN: 1 << 4,
  PICKUP: 1 << 5,
  TRIGGER: 1 << 6,
  UI: 1 << 7,
  /** Matches every layer. */
  ALL: 0xffffffff,
};

/**
 * @param {{ layer: number, mask: number }} a
 * @param {{ layer: number, mask: number }} b
 * @returns {boolean} true only if **both** colliders want the other.
 */
export function canCollide(a, b) {
  return (a.mask & b.layer) !== 0 && (b.mask & a.layer) !== 0;
}

/**
 * Build a mask from layer names.
 *
 * ```js
 * collider.mask = layerFromNames(['ENEMY', 'TERRAIN']);
 * ```
 *
 * @param {readonly string[]} names
 * @returns {number}
 * @throws {Error} on an unknown name — a typo would silently produce a mask of 0, and a
 *   collider that hits nothing looks exactly like a physics bug.
 */
export function layerFromNames(names) {
  let mask = 0;
  for (const name of names) {
    const bit = /** @type {Record<string, number>} */ (Layers)[name];
    if (bit === undefined) {
      throw new Error(`layerFromNames: unknown layer "${name}"`);
    }
    mask |= bit;
  }
  return mask;
}

/**
 * @param {number} mask
 * @returns {string} a readable list of the layers in a mask, for debugging and the editor.
 */
export function describeMask(mask) {
  if (mask === 0) return '(none)';
  if ((mask >>> 0) === (Layers.ALL >>> 0)) return 'ALL';

  const names = [];
  for (const [name, bit] of Object.entries(Layers)) {
    if (name === 'ALL') continue;
    if ((mask & bit) !== 0) names.push(name);
  }
  return names.length > 0 ? names.join(' | ') : `0x${(mask >>> 0).toString(16)}`;
}
