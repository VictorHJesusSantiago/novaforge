import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Transform } from '@novaforge/core';
import { RigidBody, Collider } from '@novaforge/physics';
import { AnimationController } from '@novaforge/animation';
import { Game } from '@novaforge/runtime';
import { PlayScene } from '../scenes/play-scene.js';
import { PauseScene } from '../scenes/pause-scene.js';
import { Player, PlayerState, Coin, SESSION } from '../components.js';
import { GRAVITY, RULES, PLAYER, COIN_VALUE, VIEWPORT, LAYER } from '../config.js';
import { LEVEL_GRID, PLAYER_START, GOAL_POSITION, COIN_POSITIONS, TILE_GROUND, LEVEL_PIXEL_HEIGHT } from '../level.js';

/**
 * Gameplay tests, run headlessly at a simulated 60 Hz.
 *
 * Same reasoning as `examples/breakout`'s own gameplay test: the real engine runs underneath —
 * real SAT collisions, the real impulse solver, the real tilemap-derived colliders, the real
 * animation state machine — with only the canvas absent, so a regression anywhere in that stack
 * shows up here as a player falling through a platform, which is a far more legible failure than
 * a unit test on a manifold.
 */

/** @type {Game} */ let game;
/** @type {number} */ let now;

beforeEach(async () => {
  game = new Game({ gravity: GRAVITY });
  game.resize(VIEWPORT.width, VIEWPORT.height);
  game.scenes.register('play', PlayScene).register('pause', PauseScene);
  await game.scenes.change('play');

  now = 0;
  game.frame(now); // prime the clock
});

afterEach(async () => {
  await game.destroy();
});

/** @param {number} count */
function advance(count) {
  for (let i = 0; i < count; i += 1) {
    now += 1000 / 60;
    game.frame(now);
  }
}

/** @param {string} code */
function tap(code) {
  game.input.pushKeyDown(code);
  advance(1);
  game.input.pushKeyUp(code);
  advance(1);
}

/** @returns {[number, any, any, any, any]} `[entity, transform, body, state, playerTag]`. */
function playerTuple() {
  const found = game.world.query([Transform, RigidBody, PlayerState, Player]).first();
  if (found === null) throw new Error('no player in the world');
  return /** @type {any} */ (found);
}

/** @returns {any} the player's AnimationController. */
function playerAnimation() {
  const found = game.world.query([AnimationController, Player]).first();
  if (found === null) throw new Error('no player animation controller');
  return found[1];
}

/** @returns {number} total solid cells in the hand-authored level grid. */
function solidTileCount() {
  let count = 0;
  for (const row of LEVEL_GRID) for (const cell of row) if (cell === TILE_GROUND) count += 1;
  return count;
}

describe('level setup', () => {
  it('creates exactly one player', () => {
    expect(game.world.query([Player]).count()).toBe(1);
  });

  it('spawns the player resting at the configured start position', () => {
    const [, transform] = playerTuple();
    expect(transform.position.x).toBeCloseTo(PLAYER_START.x, 0);
    expect(transform.position.y).toBeCloseTo(PLAYER_START.y, 0);
  });

  it('starts with a full complement of lives, no score, and a playing outcome', () => {
    const session = game.world.getResource(SESSION);
    expect(session.lives).toBe(RULES.lives);
    expect(session.score).toBe(0);
    expect(session.outcome).toBe('playing');
  });

  it('places all three coins from the level data', () => {
    expect(game.world.query([Coin]).count()).toBe(COIN_POSITIONS.length);
  });

  // The interesting assertion in this file for the tilemap collider generation: far fewer
  // colliders than solid tiles, proving the row-run merge actually merged something rather than
  // emitting one box per cell.
  it('merges contiguous solid tiles into far fewer ground colliders than there are tiles', () => {
    let groundColliders = 0;
    game.world.query([Collider]).each((_entity, collider) => {
      if ((collider.layer & LAYER.GROUND) !== 0) groundColliders += 1;
    });

    expect(groundColliders).toBeGreaterThan(0);
    expect(groundColliders).toBeLessThan(solidTileCount());
  });
});

describe('movement', () => {
  it('moves right and left with the action axis', () => {
    const startX = playerTuple()[1].position.x;

    game.input.pushKeyDown('ArrowRight');
    advance(20);
    expect(playerTuple()[1].position.x).toBeGreaterThan(startX);

    game.input.pushKeyUp('ArrowRight');
    game.input.pushKeyDown('ArrowLeft');
    advance(40);
    expect(playerTuple()[1].position.x).toBeLessThan(startX);
  });

  // The bug this guards against is a player tunnelling through a wall, or the solver failing to
  // stop lateral motion once contact begins.
  it('stops horizontal movement when walking into a solid tile', () => {
    // The goal rise (level.js, columns 34-39) has a flush vertical face at x = 34 * 32 = 1088.
    // Start well clear of it, at floor height, and run straight into it.
    const [, transform, body] = playerTuple();
    transform.position.set(900, PLAYER_START.y);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);

    game.input.pushKeyDown('ArrowRight');
    advance(90);

    const stoppedAt = playerTuple()[1].position.x;
    // Unobstructed at `moveSpeed` for 1.5s the player would reach ~1230; resting against the
    // wall's face (1088) with a little solver slop is nowhere near that, and nowhere near the
    // far side of the six-tile-wide wall (1280) either — either bound would mean it tunnelled.
    expect(stoppedAt).toBeLessThan(1088 + 20);
    expect(stoppedAt).toBeGreaterThan(1088 - PLAYER.width);

    // Confirm it is actually resting against the wall, not merely slow: continuing to hold the
    // same input for many more frames should not advance it meaningfully further.
    advance(60);
    expect(playerTuple()[1].position.x).toBeLessThan(stoppedAt + 5);
  });
});

describe('jumping', () => {
  it('is grounded at rest before any input', () => {
    advance(10);
    expect(playerTuple()[3].grounded).toBe(true);
  });

  it('gains upward velocity on the jump action while grounded', () => {
    advance(5); // settle onto the floor first
    tap('Space');
    // In screen space -y is up (Vec2.up()) — a jump is a negative y velocity.
    expect(playerTuple()[2].velocity.y).toBeLessThan(0);
  });

  it('lands back on solid ground after a jump', () => {
    advance(5);
    tap('Space');
    advance(90);

    const [, transform, body, state] = playerTuple();
    expect(state.grounded).toBe(true);
    expect(Math.abs(body.velocity.y)).toBeLessThan(1);
    // A resting dynamic body under constant gravity settles a couple of pixels into the
    // ground — each step's positional correction only removes a fraction of that step's
    // penetration (`resolver.js`'s `applyPositionalCorrection`), so gravity and correction
    // reach equilibrium slightly below the surface rather than exactly on it. What matters
    // here is that the player came back down onto the floor, not through it.
    expect(Math.abs(transform.position.y - PLAYER_START.y)).toBeLessThan(5);
  });

  // The bug this guards against: `groundCheckSystem`'s one-step-stale broadphase read still
  // showing "touching ground" the instant after `playerControlSystem` already granted the jump,
  // which would let a second `jump` press one frame later grant a free second jump mid-air.
  it('does not grant a second jump from a held or repeated jump press while airborne', () => {
    advance(5);
    tap('Space');
    const afterFirstJump = playerTuple()[2].velocity.y;
    expect(afterFirstJump).toBeLessThan(0);

    advance(3); // still well short of landing
    expect(playerTuple()[3].grounded).toBe(false);

    tap('Space'); // a second, illegitimate press while airborne
    const afterSecondPress = playerTuple()[2].velocity.y;

    // A genuine second jump would reset velocity close to -PLAYER.jumpSpeed again. Gravity has
    // only been acting for a handful of frames, so the honest trajectory is still well short of
    // that — anything near -jumpSpeed again means the guard failed.
    expect(afterSecondPress).toBeGreaterThan(-PLAYER.jumpSpeed + 50);
  });
});

describe('collectibles', () => {
  it('collects a coin on overlap and adds its value to the score', () => {
    const initialCoins = game.world.query([Coin]).count();
    const [, transform, body] = playerTuple();
    transform.position.set(COIN_POSITIONS[0].x, COIN_POSITIONS[0].y);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);

    advance(5);

    const session = game.world.getResource(SESSION);
    expect(session.score).toBe(COIN_VALUE);
    expect(game.world.query([Coin]).count()).toBe(initialCoins - 1);
  });
});

describe('hazards', () => {
  it('costs a life and respawns the player at the start after falling into the gap', () => {
    const session = game.world.getResource(SESSION);
    const [, transform, body] = playerTuple();

    // Column 15 sits inside the three-tile gap (columns 14-16) with nothing solid below it.
    transform.position.set(15 * 32 + 16, 200);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);

    advance(150); // long enough to fall clear through the level and into the hazard trigger

    expect(session.lives).toBe(RULES.lives - 1);
    const [, respawned] = playerTuple();
    expect(respawned.position.x).toBeCloseTo(PLAYER_START.x, 0);
    expect(Math.abs(respawned.position.y - PLAYER_START.y)).toBeLessThan(5);
  });

  it('ends the run when the last life is lost', () => {
    const session = game.world.getResource(SESSION);
    session.lives = 1;

    const [, transform, body] = playerTuple();
    transform.position.set(15 * 32 + 16, 200);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);

    advance(150);

    expect(session.outcome).toBe('lost');
    expect(session.message).toMatch(/Game over/);
  });

  it('restarts on the jump action after a game over', () => {
    const session = game.world.getResource(SESSION);
    session.lives = 1;

    const [, transform, body] = playerTuple();
    transform.position.set(15 * 32 + 16, 200);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);
    advance(150);
    expect(session.outcome).toBe('lost');

    tap('Space');

    expect(session.outcome).toBe('playing');
    expect(session.lives).toBe(RULES.lives);
    expect(session.score).toBe(0);
    expect(game.world.query([Coin]).count()).toBe(COIN_POSITIONS.length);
    const [, respawned] = playerTuple();
    expect(respawned.position.x).toBeCloseTo(PLAYER_START.x, 0);
  });
});

describe('goal', () => {
  it('declares victory when the player reaches the goal', () => {
    const session = game.world.getResource(SESSION);
    const [, transform, body] = playerTuple();
    transform.position.set(GOAL_POSITION.x, GOAL_POSITION.y);
    transform.previousPosition.copyFrom(transform.position);
    body.velocity.set(0, 0);

    advance(5);

    expect(session.outcome).toBe('won');
    expect(session.message).toMatch(/made it/i);
  });
});

describe('animation state machine', () => {
  it('settles into the idle state once grounded and at rest', () => {
    // `createPlayer` calls `enterStateMachine` synchronously, so the controller starts in
    // `idle` before a single system has run — but the very first `groundCheckSystem` pass
    // reads a broadphase tree that has not been built yet (no `physicsStep` has run), so the
    // machine legitimately passes through `jump` for a frame before landing. That one-step
    // cold start is the same lag the `jumping` tests' "grounded at rest" case exercises, and
    // is exactly why this asserts on the settled state rather than the very first frame.
    advance(5);
    expect(playerAnimation().current).toBe('idle');
  });

  it('transitions to run while moving on the ground', () => {
    advance(5); // settle
    game.input.pushKeyDown('ArrowRight');
    advance(15);

    expect(playerAnimation().current).toBe('run');
  });

  it('transitions to jump while airborne', () => {
    advance(5);
    tap('Space');
    advance(2);

    expect(playerAnimation().current).toBe('jump');
  });

  it('returns to idle after landing and coming to rest', () => {
    advance(5);
    tap('Space');
    advance(90);

    expect(playerAnimation().current).toBe('idle');
  });
});

describe('camera', () => {
  it('follows the player horizontally once past the left edge of its bounds', () => {
    const camera = game.camera;
    const before = camera.position.x;

    playerTuple()[1].position.x = 700;
    advance(30);

    expect(camera.position.x).toBeGreaterThan(before);
  });

  it('keeps the camera locked vertically — the whole level fits the viewport already', () => {
    playerTuple()[1].position.x = 700;
    advance(30);

    expect(game.camera.position.y).toBeCloseTo(LEVEL_PIXEL_HEIGHT / 2, 5);
  });
});

describe('pausing', () => {
  it('pushes the pause scene without tearing down the level', async () => {
    const coins = game.world.query([Coin]).count();

    tap('Escape');
    await Promise.resolve();

    expect(game.scenes.depth).toBe(2);
    expect(game.scenes.active?.name).toBe('pause');
    expect(game.world.query([Coin]).count()).toBe(coins);
  });

  it('freezes the simulation while paused', async () => {
    advance(5);
    tap('Space'); // send the player airborne so a frozen clock is actually observable
    advance(5);

    tap('Escape');
    await Promise.resolve();
    advance(2);

    const before = playerTuple()[1].position.clone();
    advance(30);

    expect(playerTuple()[1].position.y).toBeCloseTo(before.y, 5);
  });

  it('resumes the simulation on pop', async () => {
    advance(5);
    tap('Space'); // airborne, so gravity has visible work left to do after resuming
    tap('Escape');
    await Promise.resolve();
    advance(2);

    await game.scenes.pop();
    advance(2);

    const before = playerTuple()[1].position.clone();
    advance(30);

    expect(playerTuple()[1].position.distanceTo(before)).toBeGreaterThan(1);
  });
});

describe('draw output', () => {
  it('emits a command per visible entity, sorted into draw order', () => {
    advance(1);

    const commands = game.drawList.toArray();
    expect(commands.length).toBeGreaterThan(0);

    for (let i = 1; i < commands.length; i += 1) {
      expect(commands[i].layer).toBeGreaterThanOrEqual(commands[i - 1].layer);
    }
  });

  it('shows the score and lives HUD text', () => {
    advance(1);
    const texts = game.drawList.toArray().map((c) => c.text ?? '');
    expect(texts.some((t) => t.startsWith('SCORE'))).toBe(true);
    expect(texts.some((t) => t.startsWith('LIVES'))).toBe(true);
  });
});
