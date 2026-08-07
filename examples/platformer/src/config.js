/**
 * Every tunable number in one file.
 *
 * Not a style preference: this is what the editor's inspector will eventually edit, and having
 * the values scattered through the systems would mean finding them all first. Convention copied
 * straight from `examples/breakout/src/config.js`.
 */

/** The camera's viewport. The level itself is much wider — see `level.js`. */
export const VIEWPORT = {
  width: 960,
  height: 540,
};

export const TILE = {
  size: 32,
};

export const PLAYER = {
  width: 22,
  height: 38,
  /** Horizontal top speed, arcade-style: set directly, not accelerated toward. */
  moveSpeed: 220,
  /** Initial upward speed on jump. */
  jumpSpeed: 620,
  /**
   * Thickness of the sensor box checked just below the feet each step. Thin enough not to
   * register a ground contact while airborne next to a wall, thick enough not to miss a step
   * at 60 Hz between "still touching" and "just left".
   */
  groundSensorThickness: 6,
  /** How far in from each edge the ground sensor is inset, so grazing a wall's corner is not "grounded". */
  groundSensorInset: 3,
};

/** Falls straight down faster than the engine default (980) — a floaty platformer feels wrong. */
export const GRAVITY = { x: 0, y: 1600 };

export const RULES = {
  lives: 3,
};

/** Points awarded per coin. */
export const COIN_VALUE = 100;

/** Collision layers for this game. Distinct bits so the masks below can be read at a glance. */
export const LAYER = {
  GROUND: 1 << 1,
  PLAYER: 1 << 2,
  HAZARD: 1 << 3,
  GOAL: 1 << 4,
  COIN: 1 << 5,
};

/** Draw layers, low to high. */
export const DRAW_LAYER = {
  LEVEL: 0,
  ENTITIES: 1,
  HUD: 10,
};

export const COLORS = {
  background: 0x0b0b10,
  ground: 0x3a3a52,
  player: 0xe8e8f0,
  playerAirborne: 0xffd166,
  goal: 0x83d483,
  goalPole: 0x5a5a72,
  coin: 0xffd166,
  hud: 0xe8e8f0,
  hudMuted: 0x8a8aa0,
};

/** The atlas id and single tile frame `main.js` registers for the tilemap's solid ground tiles. */
export const TILE_ATLAS = 'tiles';
export const TILE_FRAME_GROUND = '0_0';
