import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Transform } from '@novaforge/core';
import { RigidBody } from '@novaforge/physics';
import { Game } from '@novaforge/runtime';
import { PlayScene } from '../scenes/play-scene.js';
import { PauseScene } from '../scenes/pause-scene.js';
import { Ball, Brick, Paddle, SESSION } from '../components.js';
import { PLAYFIELD, BRICKS, BALL, RULES } from '../config.js';

/**
 * Gameplay tests, run headlessly at a simulated 60 Hz.
 *
 * The game runs the real engine — real SAT collisions, the real impulse solver, the real
 * scheduler — with only the canvas absent. So these assertions are about the game *and* about
 * every layer underneath it: a regression in the narrowphase shows up here as a ball tunnelling
 * through a wall, which is a far more legible failure than a unit test on a manifold.
 */

/** @type {Game} */ let game;
/** @type {number} */ let now;

beforeEach(async () => {
  game = new Game({ gravity: { x: 0, y: 0 } });
  game.resize(PLAYFIELD.width, PLAYFIELD.height);
  game.scenes.register('play', PlayScene).register('pause', PauseScene);
  await game.scenes.change('play');

  now = 0;
  game.frame(now);
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

/** @returns {any} the ball's Transform. */
function ballTransform() {
  const found = game.world.query([Transform, Ball]).first();
  if (found === null) throw new Error('no ball in the world');
  return found[1];
}

/** @returns {any} the ball's RigidBody. */
function ballBody() {
  const found = game.world.query([RigidBody, Ball]).first();
  if (found === null) throw new Error('no ball in the world');
  return found[1];
}

describe('level setup', () => {
  it('builds the full brick wall', () => {
    expect(game.world.query([Brick]).count()).toBe(BRICKS.columns * BRICKS.rows);
  });

  it('creates exactly one paddle and one ball', () => {
    expect(game.world.query([Paddle]).count()).toBe(1);
    expect(game.world.query([Ball]).count()).toBe(1);
  });

  it('starts with a full complement of lives and no score', () => {
    const session = game.world.getResource(SESSION);
    expect(session.lives).toBe(RULES.lives);
    expect(session.score).toBe(0);
    expect(session.outcome).toBe('playing');
  });

  it('parks the ball on the paddle until it is launched', () => {
    advance(30);
    expect(ballBody().velocity.lengthSquared()).toBe(0);
    expect(ballTransform().position.y).toBeLessThan(PLAYFIELD.height);
  });
});

describe('paddle control', () => {
  it('moves right and left with the action axis', () => {
    const paddle = game.world.query([Transform, Paddle]).first();
    if (paddle === null) throw new Error('no paddle');
    const startX = paddle[1].position.x;

    game.input.pushKeyDown('ArrowRight');
    advance(20);
    expect(paddle[1].position.x).toBeGreaterThan(startX);

    game.input.pushKeyUp('ArrowRight');
    game.input.pushKeyDown('ArrowLeft');
    advance(40);
    expect(paddle[1].position.x).toBeLessThan(startX);
  });

  it('stays inside the walls when held against them', () => {
    game.input.pushKeyDown('ArrowLeft');
    advance(300);

    const paddle = game.world.query([Transform, Paddle]).first();
    if (paddle === null) throw new Error('no paddle');
    expect(paddle[1].position.x).toBeGreaterThan(PLAYFIELD.wallThickness);
  });

  it('carries the ball with it before launch', () => {
    game.input.pushKeyDown('ArrowRight');
    advance(20);

    const paddle = game.world.query([Transform, Paddle]).first();
    if (paddle === null) throw new Error('no paddle');
    expect(ballTransform().position.x).toBeCloseTo(paddle[1].position.x, 0);
  });
});

describe('launching', () => {
  it('sends the ball upward on the launch action', () => {
    tap('Space');
    const velocity = ballBody().velocity;
    expect(velocity.length()).toBeCloseTo(BALL.speed, 0);
    expect(velocity.y).toBeLessThan(0);
  });

  it('detaches the ball so it stops tracking the paddle', () => {
    tap('Space');
    const startX = ballTransform().position.x;

    game.input.pushKeyDown('ArrowRight');
    advance(20);

    const paddle = game.world.query([Transform, Paddle]).first();
    if (paddle === null) throw new Error('no paddle');
    expect(Math.abs(ballTransform().position.x - startX)).toBeLessThan(200);
    expect(ballTransform().position.x).not.toBeCloseTo(paddle[1].position.x, 0);
  });
});

describe('ball physics', () => {
  it('holds its nominal speed on every frame it is in play', () => {
    tap('Space');

    let framesInPlay = 0;
    for (let i = 0; i < 600; i += 1) {
      advance(1);
      const ball = game.world.query([Ball]).first();
      if (ball === null || ball[1].attached) continue;
      framesInPlay += 1;
      expect(ballBody().velocity.length()).toBeCloseTo(BALL.speed, 0);
    }

    expect(framesInPlay).toBeGreaterThan(60);
  });

  it('never leaves the playfield through a wall', () => {
    tap('Space');

    for (let i = 0; i < 900; i += 1) {
      advance(1);
      const position = ballTransform().position;
      expect(position.x).toBeGreaterThan(0);
      expect(position.x).toBeLessThan(PLAYFIELD.width);
      expect(position.y).toBeGreaterThan(0);
    }
  });

  it('refuses to settle into a near-horizontal path', () => {
    tap('Space');
    const body = ballBody();
    body.velocity.set(BALL.speed, 0.01);

    advance(10);

    const speed = body.velocity.length();
    expect(Math.abs(body.velocity.y) / speed).toBeGreaterThanOrEqual(BALL.minVerticalRatio - 1e-6);
  });

  it('bounces off the top wall rather than passing through it', () => {
    tap('Space');
    const body = ballBody();
    ballTransform().position.set(PLAYFIELD.width / 2, 100);
    body.velocity.set(0, -BALL.speed);

    let bounced = false;
    for (let i = 0; i < 120; i += 1) {
      advance(1);
      if (body.velocity.y > 0) bounced = true;
    }

    expect(bounced).toBe(true);
    expect(ballTransform().position.y).toBeGreaterThan(PLAYFIELD.wallThickness);
  });
});

describe('bricks', () => {
  it('destroys bricks and scores them over a rally', () => {
    const initial = game.world.query([Brick]).count();
    tap('Space');
    advance(1200);

    const remaining = game.world.query([Brick]).count();
    const session = game.world.getResource(SESSION);

    expect(remaining).toBeLessThan(initial);
    expect(session.score).toBeGreaterThan(0);
  });

  it('scores the brick that was actually hit', () => {
    const session = game.world.getResource(SESSION);
    tap('Space');

    let destroyedAt = -1;
    const before = game.world.query([Brick]).count();
    for (let i = 0; i < 1200 && destroyedAt < 0; i += 1) {
      advance(1);
      if (game.world.query([Brick]).count() < before) destroyedAt = i;
    }

    expect(destroyedAt).toBeGreaterThanOrEqual(0);
    expect(session.score).toBeGreaterThanOrEqual(Math.min(...BRICKS.points));
    expect(session.score).toBeLessThanOrEqual(Math.max(...BRICKS.points) * 2);
  });
});

describe('losing a life', () => {
  it('costs a life when the ball reaches the death zone', () => {
    const session = game.world.getResource(SESSION);
    tap('Space');

    ballTransform().position.set(60, PLAYFIELD.height - 120);
    ballBody().velocity.set(0, BALL.speed);

    advance(120);

    expect(session.lives).toBe(RULES.lives - 1);
  });

  it('reattaches the ball to the paddle after a life is lost', () => {
    tap('Space');
    ballTransform().position.set(60, PLAYFIELD.height - 120);
    ballBody().velocity.set(0, BALL.speed);
    advance(120);

    const ball = game.world.query([Ball]).first();
    expect(ball?.[1].attached).toBe(true);
  });

  it('ends the run when the last life goes', () => {
    const session = game.world.getResource(SESSION);
    session.lives = 1;

    tap('Space');
    ballTransform().position.set(60, PLAYFIELD.height - 120);
    ballBody().velocity.set(0, BALL.speed);
    advance(120);

    expect(session.outcome).toBe('lost');
    expect(session.message).toMatch(/Game over/);
  });

  it('restarts on the launch action after a game over', () => {
    const session = game.world.getResource(SESSION);
    session.lives = 1;

    tap('Space');
    ballTransform().position.set(60, PLAYFIELD.height - 120);
    ballBody().velocity.set(0, BALL.speed);
    advance(120);
    expect(session.outcome).toBe('lost');

    tap('Space');

    expect(session.outcome).toBe('playing');
    expect(session.lives).toBe(RULES.lives);
    expect(session.score).toBe(0);
    expect(game.world.query([Brick]).count()).toBe(BRICKS.columns * BRICKS.rows);
  });
});

describe('winning', () => {
  it('declares victory once the last brick goes', () => {
    const session = game.world.getResource(SESSION);
    for (const [entity] of game.world.query([Brick])) {
      game.world.destroy(entity);
    }

    advance(3);

    expect(session.outcome).toBe('won');
    expect(session.message).toMatch(/Cleared/);
  });
});

describe('pausing', () => {
  it('pushes the pause scene without tearing down the level', async () => {
    const bricks = game.world.query([Brick]).count();

    tap('Escape');
    await Promise.resolve();

    expect(game.scenes.depth).toBe(2);
    expect(game.scenes.active?.name).toBe('pause');
    expect(game.world.query([Brick]).count()).toBe(bricks);
  });

  it('freezes the simulation while paused', async () => {
    tap('Space');
    advance(10);

    tap('Escape');
    await Promise.resolve();
    advance(2);

    const before = ballTransform().position.clone();
    advance(60);

    expect(ballTransform().position.x).toBeCloseTo(before.x, 5);
    expect(ballTransform().position.y).toBeCloseTo(before.y, 5);
  });

  it('resumes the simulation on pop', async () => {
    tap('Space');
    tap('Escape');
    await Promise.resolve();
    advance(2);

    await game.scenes.pop();
    advance(2);

    const before = ballTransform().position.clone();
    advance(30);

    expect(ballTransform().position.distanceTo(before)).toBeGreaterThan(1);
  });
});

describe('draw output', () => {
  it('emits a command per visible entity, sorted into draw order', () => {
    advance(1);

    const commands = game.drawList.toArray();
    expect(commands.length).toBeGreaterThan(BRICKS.columns * BRICKS.rows);

    for (let i = 1; i < commands.length; i += 1) {
      expect(commands[i].layer).toBeGreaterThanOrEqual(commands[i - 1].layer);
    }
  });

  it('draws the HUD above the playfield', () => {
    advance(1);
    const commands = game.drawList.toArray();
    const hud = commands.filter((c) => typeof c.text === 'string' && c.text.length > 0);
    expect(hud.length).toBeGreaterThan(0);
    for (const label of hud) {
      expect(label.layer).toBeGreaterThan(0);
    }
  });

  it('shows the score in the HUD', () => {
    advance(1);
    const texts = game.drawList.toArray().map((c) => c.text ?? '');
    expect(texts.some((t) => t.startsWith('SCORE'))).toBe(true);
    expect(texts.some((t) => t.startsWith('LIVES'))).toBe(true);
  });
});
