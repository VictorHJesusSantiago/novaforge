/**
 * Every tunable number in one file.
 *
 * Not a style preference: this is what the editor's inspector will eventually edit, and having
 * the values scattered through the systems would mean finding them all first.
 */

export const PLAYFIELD = {
  width: 800,
  height: 600,
  wallThickness: 40,
};

export const PADDLE = {
  width: 110,
  height: 16,
  y: 550,
  speed: 620,
  /** How much of the paddle's own motion is imparted to the ball on contact. */
  english: 0.35,
};

export const BALL = {
  radius: 8,
  /** The ball travels at exactly this speed forever — see `normaliseBallSpeed`. */
  speed: 380,
  /**
   * The launch angle is randomised within this cone either side of straight up, so that two
   * runs of the same level do not play out identically.
   */
  launchSpreadRadians: 0.6,
  /**
   * Minimum share of the ball's speed that must be vertical.
   *
   * A ball trapped in a near-horizontal path ping-pongs between the side walls forever and the
   * player can do nothing about it. Every breakout ever written needs this nudge.
   */
  minVerticalRatio: 0.25,
};

export const BRICKS = {
  columns: 11,
  rows: 6,
  width: 62,
  height: 24,
  gapX: 6,
  gapY: 6,
  originY: 90,
  /** Row colours, top to bottom. */
  colors: [0xef476f, 0xf78c6b, 0xffd166, 0x83d483, 0x4cc9f0, 0x9d8df1],
  /** Points per row, top to bottom — the top rows are harder to reach. */
  points: [70, 50, 40, 30, 20, 10],
};

export const RULES = {
  lives: 3,
};

/** Collision layers for this game. Distinct bits so the masks below can be read at a glance. */
export const LAYER = {
  WALL: 1 << 1,
  PADDLE: 1 << 2,
  BALL: 1 << 3,
  BRICK: 1 << 4,
  DEATH_ZONE: 1 << 5,
};

/** Draw layers, low to high. */
export const DRAW_LAYER = {
  PLAYFIELD: 0,
  ENTITIES: 1,
  HUD: 10,
};

export const COLORS = {
  background: 0x0b0b10,
  wall: 0x2a2a3a,
  paddle: 0xe8e8f0,
  ball: 0xffd166,
  hud: 0xe8e8f0,
  hudMuted: 0x8a8aa0,
};
