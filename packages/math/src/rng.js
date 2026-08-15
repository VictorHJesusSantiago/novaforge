/**
 * A seeded pseudo-random number generator (mulberry32).
 *
 * `Math.random()` cannot be seeded, which makes it unusable here: SPEC §1 requires that the
 * same inputs and the same seed reproduce the same simulation, and replay recording depends on
 * it. Mulberry32 is chosen for being 32-bit, one line of state, and fast enough to call
 * thousands of times per frame — it is not, and does not need to be, cryptographically secure.
 */
export class Rng {
  /**
   * @param {number} [seed] 32-bit integer seed.
   */
  constructor(seed = 0x9e3779b9) {
    /** @type {number} */
    this.seed = seed >>> 0;
    /** @type {number} */
    this.state = this.seed;
  }

  /**
   * Derive a seed from a string, so scenes and levels can be named rather than numbered.
   * FNV-1a.
   * @param {string} text
   * @returns {Rng}
   */
  static fromString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return new Rng(hash >>> 0);
  }

  /** Restart the sequence from the original seed. */
  reset() {
    this.state = this.seed;
  }

  /**
   * Capture the generator state so a world snapshot can restore it exactly.
   * @returns {{ seed: number, state: number }}
   */
  save() {
    return { seed: this.seed, state: this.state };
  }

  /**
   * @param {{ seed: number, state: number }} snapshot
   */
  restore(snapshot) {
    this.seed = snapshot.seed >>> 0;
    this.state = snapshot.state >>> 0;
  }

  /**
   * @returns {number} the next float in [0, 1).
   */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number} a float in [min, max).
   */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number} an integer in [min, max], both inclusive.
   */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * @param {number} [probability] chance of `true`, in [0, 1].
   * @returns {boolean}
   */
  bool(probability = 0.5) {
    return this.next() < probability;
  }

  /**
   * @returns {-1 | 1}
   */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  /**
   * @template T
   * @param {readonly T[]} items
   * @returns {T} a uniformly chosen element.
   * @throws {RangeError} if `items` is empty — returning `undefined` would let the mistake
   *   travel far from its cause.
   */
  pick(items) {
    if (items.length === 0) throw new RangeError('Rng.pick: cannot pick from an empty array');
    return items[this.int(0, items.length - 1)];
  }

  /**
   * Choose an index by relative weight.
   * @param {readonly number[]} weights  non-negative; need not sum to 1.
   * @returns {number}
   * @throws {RangeError} if the weights are empty or sum to zero.
   */
  weightedIndex(weights) {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) throw new RangeError('Rng.weightedIndex: weights must sum to more than zero');

    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i += 1) {
      roll -= Math.max(0, weights[i]);
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  /**
   * Fisher-Yates, in place.
   * @template T
   * @param {T[]} items
   * @returns {T[]} the same array, shuffled.
   */
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /**
   * @returns {{ x: number, y: number }} a uniformly distributed point on the unit circle.
   */
  onUnitCircle() {
    const angle = this.next() * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  /**
   * @returns {{ x: number, y: number }} a uniformly distributed point inside the unit circle.
   *   The square root is what keeps it uniform; without it, points bunch at the centre.
   */
  insideUnitCircle() {
    const angle = this.next() * Math.PI * 2;
    const radius = Math.sqrt(this.next());
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  /**
   * Normally distributed value via the Box-Muller transform.
   * @param {number} [mean]
   * @param {number} [stdDev]
   * @returns {number}
   */
  gaussian(mean = 0, stdDev = 1) {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    return mean + magnitude * Math.cos(2 * Math.PI * v) * stdDev;
  }
}
