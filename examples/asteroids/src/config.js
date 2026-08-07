/**
 * Every tunable number in one file.
 *
 * Not a style preference: this is what the editor's inspector will eventually edit, and having
 * the values scattered through the systems would mean finding them all first.
 */

export const PLAYFIELD = {
  width: 800,
  height: 600,
};

export const SHIP = {
  radius: 14,
  /** Radians per second while turning. */
  rotateSpeed: 3.6,
  /** Units per second squared while thrusting. */
  thrustAccel: 260,
  maxSpeed: 320,
  /** Fraction of velocity lost per second — the "space friction" that makes the ship
   *  controllable with a keyboard instead of drifting forever like the real thing would. */
  drag: 0.6,
  fireCooldown: 0.25,
  /** Seconds of immunity after a respawn, so spawning back into a moving asteroid is not an
   *  automatic second death. */
  respawnInvulnerability: 2.5,
};

export const BULLET = {
  radius: 2,
  speed: 480,
  /** Seconds before an unspent bullet despawns. Without this a miss wraps the playfield forever
   *  and slowly fills the world with live triggers nothing is checking for. */
  lifetime: 0.9,
};

export const ASTEROID = {
  /**
   * Radius, points awarded, and drift speed per size tier.
   *
   * Typed as a plain string index rather than the `'large'|'medium'|'small'` literal union:
   * the value read back off an `Asteroid` component has already gone through a component
   * store round-trip, which widens it to `string` for the type checker even though it is one
   * of the three at runtime. A generic index keeps the lookup honest without a cast at every
   * call site.
   * @type {Record<string, { radius: number, points: number, speed: number }>}
   */
  sizes: {
    large: { radius: 40, points: 20, speed: 70 },
    medium: { radius: 24, points: 50, speed: 110 },
    small: { radius: 12, points: 100, speed: 170 },
  },
  /**
   * What a destroyed asteroid splits into. Absent for `small` — nothing splits further.
   * @type {Record<string, string>}
   */
  splitInto: { large: 'medium', medium: 'small' },
  splitCount: 2,
};

export const WAVE = {
  baseCount: 4,
  increasePerWave: 2,
};

export const RULES = {
  lives: 3,
};

/** Collision layers for this game. Distinct bits so the masks below can be read at a glance. */
export const LAYER = {
  SHIP: 1 << 1,
  ASTEROID: 1 << 2,
  BULLET: 1 << 3,
};

/** Draw layers, low to high. */
export const DRAW_LAYER = {
  ENTITIES: 1,
  HUD: 10,
};

export const COLORS = {
  background: 0x05050a,
  ship: 0xe8e8f0,
  asteroid: 0x9d8df1,
  bullet: 0xffd166,
  hud: 0xe8e8f0,
  hudMuted: 0x8a8aa0,
};
