import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Transform } from '@novaforge/core';
import { RigidBody } from '@novaforge/physics';
import { Game } from '@novaforge/runtime';
import { PlayScene } from '../scenes/play-scene.js';
import { PauseScene } from '../scenes/pause-scene.js';
import { Ship, Asteroid, Bullet, SESSION } from '../components.js';
import { PLAYFIELD, WAVE, ASTEROID, SHIP, BULLET, RULES } from '../config.js';
import { createAsteroid } from '../factories.js';

/**
 * Gameplay tests, run headlessly at a simulated 60 Hz.
 *
 * As in breakout, this drives the real engine — real SAT collisions, the real trigger events,
 * the real scheduler — with only the canvas absent, so a regression in a lower layer shows up
 * here as a visible gameplay failure rather than as an isolated unit-test diff.
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

/** @returns {any} the ship's Transform. */
function shipTransform() {
  const found = game.world.query([Transform, Ship]).first();
  if (found === null) throw new Error('no ship in the world');
  return found[1];
}

/** @returns {any} the ship's RigidBody. */
function shipBody() {
  const found = game.world.query([RigidBody, Ship]).first();
  if (found === null) throw new Error('no ship in the world');
  return found[1];
}

/** @returns {any} the ship's Ship component. */
function shipStatus() {
  const found = game.world.query([Ship]).first();
  if (found === null) throw new Error('no ship in the world');
  return found[1];
}

describe('level setup', () => {
  it('spawns the wave-1 asteroid count, all large', () => {
    const asteroids = game.world.query([Asteroid]).entities();
    expect(asteroids.length).toBe(WAVE.baseCount);
    for (const entity of asteroids) {
      expect(game.world.get(entity, Asteroid).size).toBe('large');
    }
  });

  it('creates exactly one ship', () => {
    expect(game.world.query([Ship]).count()).toBe(1);
  });

  it('starts with a full complement of lives, no score, and wave 1', () => {
    const session = game.world.getResource(SESSION);
    expect(session.lives).toBe(RULES.lives);
    expect(session.score).toBe(0);
    expect(session.wave).toBe(1);
    expect(session.outcome).toBe('playing');
  });

  it('starts the ship centred, facing up, and at rest', () => {
    advance(1);
    const transform = shipTransform();
    expect(transform.position.x).toBeCloseTo(PLAYFIELD.width / 2, 5);
    expect(transform.position.y).toBeCloseTo(PLAYFIELD.height / 2, 5);
    expect(shipBody().velocity.lengthSquared()).toBe(0);
  });
});

describe('ship control', () => {
  it('turns with the turn axis without moving', () => {
    const startRotation = shipTransform().rotation;

    game.input.pushKeyDown('ArrowRight');
    advance(20);

    expect(shipTransform().rotation).toBeGreaterThan(startRotation);
    expect(shipBody().velocity.lengthSquared()).toBe(0);
  });

  it('turns the other way with the opposite key', () => {
    game.input.pushKeyDown('ArrowRight');
    advance(20);
    const afterRight = shipTransform().rotation;

    game.input.pushKeyUp('ArrowRight');
    game.input.pushKeyDown('ArrowLeft');
    advance(40);

    expect(shipTransform().rotation).toBeLessThan(afterRight);
  });

  it('accelerates forward while thrust is held', () => {
    game.input.pushKeyDown('KeyW');
    advance(30);

    expect(shipBody().velocity.length()).toBeGreaterThan(0);
    expect(shipBody().velocity.y).toBeLessThan(0);
  });

  it('never exceeds its configured maximum speed', () => {
    game.input.pushKeyDown('KeyW');
    advance(300);

    expect(shipBody().velocity.length()).toBeLessThanOrEqual(SHIP.maxSpeed + 1e-6);
  });

  it('coasts to a stop under drag once thrust is released', () => {
    game.input.pushKeyDown('KeyW');
    advance(30);
    game.input.pushKeyUp('KeyW');

    const speedAfterThrust = shipBody().velocity.length();
    advance(300);

    expect(shipBody().velocity.length()).toBeLessThan(speedAfterThrust);
  });
});

describe('firing', () => {
  it('spawns a bullet ahead of the ship on the fire action', () => {
    expect(game.world.query([Bullet]).count()).toBe(0);

    tap('Space');

    expect(game.world.query([Bullet]).count()).toBe(1);
  });

  it('gives the bullet the ship-facing velocity', () => {
    tap('Space');

    const found = game.world.query([RigidBody, Bullet]).first();
    if (found === null) throw new Error('no bullet');
    expect(found[1].velocity.length()).toBeCloseTo(BULLET.speed, 0);
    expect(found[1].velocity.y).toBeLessThan(0);
  });

  it('respects its fire cooldown instead of machine-gunning', () => {
    game.input.pushKeyDown('Space');
    advance(1);
    advance(10);

    expect(game.world.query([Bullet]).count()).toBe(1);
  });

  it('despawns an unspent bullet after its lifetime', () => {
    tap('Space');
    expect(game.world.query([Bullet]).count()).toBe(1);

    advance(Math.ceil(BULLET.lifetime * 60) + 5);

    expect(game.world.query([Bullet]).count()).toBe(0);
  });
});

describe('screen wrap', () => {
  it('wraps the ship from the right edge to the left', () => {
    const transform = shipTransform();
    transform.position.set(PLAYFIELD.width + SHIP.radius - 1, PLAYFIELD.height / 2);
    shipBody().velocity.set(200, 0);

    advance(5);

    expect(shipTransform().position.x).toBeLessThan(PLAYFIELD.width / 2);
  });

  it('wraps the ship from the top edge to the bottom', () => {
    const transform = shipTransform();
    transform.position.set(PLAYFIELD.width / 2, -SHIP.radius + 1);
    shipBody().velocity.set(0, -200);

    advance(5);

    expect(shipTransform().position.y).toBeGreaterThan(PLAYFIELD.height / 2);
  });

  it('keeps the ship on-screen in normal play — it never sits at a wrapped, off-field position', () => {
    game.input.pushKeyDown('KeyW');
    advance(600);

    const position = shipTransform().position;
    expect(position.x).toBeGreaterThanOrEqual(-SHIP.radius - 1);
    expect(position.x).toBeLessThanOrEqual(PLAYFIELD.width + SHIP.radius + 1);
    expect(position.y).toBeGreaterThanOrEqual(-SHIP.radius - 1);
    expect(position.y).toBeLessThanOrEqual(PLAYFIELD.height + SHIP.radius + 1);
  });
});

describe('destroying asteroids', () => {
  /** Fire straight at a specific point by placing the ship and aiming it there. */
  function shootAt(x, y) {
    const transform = shipTransform();
    const angle = Math.atan2(y - transform.position.y, x - transform.position.x);
    transform.rotation = angle;
    transform.previousRotation = angle;
    tap('Space');
  }

  it('splits a large asteroid into two mediums and scores it', () => {
    const found = game.world.query([Transform, Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    const [, targetTransform] = found;
    const target = { x: targetTransform.position.x, y: targetTransform.position.y };

    const session = game.world.getResource(SESSION);
    shipTransform().position.set(target.x, target.y - 200);
    shootAt(target.x, target.y);

    let scored = false;
    for (let i = 0; i < 180 && !scored; i += 1) {
      advance(1);
      if (session.score > 0) scored = true;
    }

    expect(scored).toBe(true);
    expect(session.score).toBe(ASTEROID.sizes.large.points);

    const mediums = game.world.query([Asteroid]).entities().filter(
      (e) => game.world.get(e, Asteroid).size === 'medium',
    );
    expect(mediums.length).toBe(ASTEROID.splitCount);
  });

  it('destroys a small asteroid outright, with no further split', () => {
    const found = game.world.query([Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    game.world.destroy(found[0]);
    advance(1);

    const world = game.world;
    const scene = /** @type {any} */ (game.scenes.active);
    const target = { x: 400, y: 200 };
    createAsteroid(scene, { size: 'small', x: target.x, y: target.y, velocity: { x: 0, y: 0 } });

    const session = world.getResource(SESSION);
    const scoreBefore = session.score;
    shipTransform().position.set(target.x, target.y - 200);
    shootAt(target.x, target.y);

    let destroyed = false;
    for (let i = 0; i < 180 && !destroyed; i += 1) {
      advance(1);
      if (world.query([Asteroid]).count() < WAVE.baseCount) destroyed = true;
    }

    expect(destroyed).toBe(true);
    expect(session.score).toBe(scoreBefore + ASTEROID.sizes.small.points);
  });
});

describe('losing a life', () => {
  it('costs a life when an asteroid touches the ship', () => {
    const session = game.world.getResource(SESSION);
    const found = game.world.query([Transform, Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    const [asteroidEntity, asteroidTransform] = found;

    asteroidTransform.position.set(PLAYFIELD.width / 2 - 100, PLAYFIELD.height / 2);
    const body = game.world.getOrThrow(asteroidEntity, RigidBody);
    body.velocity.set(400, 0);

    advance(60);

    expect(session.lives).toBe(RULES.lives - 1);
  });

  it('respawns the ship at centre, invulnerable, after a life is lost', () => {
    const found = game.world.query([Transform, Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    const [asteroidEntity, asteroidTransform] = found;
    asteroidTransform.position.set(PLAYFIELD.width / 2 - 100, PLAYFIELD.height / 2);
    game.world.getOrThrow(asteroidEntity, RigidBody).velocity.set(400, 0);

    advance(60);

    expect(shipTransform().position.x).toBeCloseTo(PLAYFIELD.width / 2, 0);
    expect(shipTransform().position.y).toBeCloseTo(PLAYFIELD.height / 2, 0);
    expect(shipStatus().invulnerable).toBeGreaterThan(0);
  });

  it('does not lose a second life to the same asteroid while invulnerable', () => {
    const session = game.world.getResource(SESSION);
    const found = game.world.query([Transform, Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    const [asteroidEntity, asteroidTransform] = found;
    asteroidTransform.position.set(PLAYFIELD.width / 2 - 100, PLAYFIELD.height / 2);
    const body = game.world.getOrThrow(asteroidEntity, RigidBody);
    body.velocity.set(400, 0);

    advance(60);
    expect(session.lives).toBe(RULES.lives - 1);

    body.velocity.set(0, 0);
    asteroidTransform.position.set(PLAYFIELD.width / 2, PLAYFIELD.height / 2);
    advance(90);

    expect(session.lives).toBe(RULES.lives - 1);
  });

  it('ends the run when the last life goes', () => {
    const session = game.world.getResource(SESSION);
    session.lives = 1;

    const found = game.world.query([Transform, Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    const [asteroidEntity, asteroidTransform] = found;
    asteroidTransform.position.set(PLAYFIELD.width / 2 - 100, PLAYFIELD.height / 2);
    game.world.getOrThrow(asteroidEntity, RigidBody).velocity.set(400, 0);

    advance(60);

    expect(session.outcome).toBe('lost');
    expect(session.message).toMatch(/Game over/);
  });

  it('restarts on the fire action after a game over', () => {
    const session = game.world.getResource(SESSION);
    session.lives = 1;
    session.score = 999;
    session.wave = 3;

    const found = game.world.query([Transform, Asteroid]).first();
    if (found === null) throw new Error('no asteroid');
    const [asteroidEntity, asteroidTransform] = found;
    asteroidTransform.position.set(PLAYFIELD.width / 2 - 100, PLAYFIELD.height / 2);
    game.world.getOrThrow(asteroidEntity, RigidBody).velocity.set(400, 0);
    advance(60);
    expect(session.outcome).toBe('lost');

    tap('Space');

    expect(session.outcome).toBe('playing');
    expect(session.lives).toBe(RULES.lives);
    expect(session.score).toBe(0);
    expect(session.wave).toBe(1);
    expect(game.world.query([Asteroid]).count()).toBe(WAVE.baseCount);
  });
});

describe('clearing a wave', () => {
  it('advances the wave and spawns a bigger one once every asteroid is gone', () => {
    const session = game.world.getResource(SESSION);
    expect(session.wave).toBe(1);

    for (const entity of game.world.query([Asteroid]).entities()) {
      game.world.destroy(entity);
    }

    advance(3);

    expect(session.wave).toBe(2);
    expect(session.message).toMatch(/Wave 2/);
    expect(game.world.query([Asteroid]).count()).toBe(WAVE.baseCount + WAVE.increasePerWave);
  });

  it('does not end the run — outcome stays "playing" across a wave clear', () => {
    const session = game.world.getResource(SESSION);
    for (const entity of game.world.query([Asteroid]).entities()) {
      game.world.destroy(entity);
    }

    advance(3);

    expect(session.outcome).toBe('playing');
  });
});

describe('pausing', () => {
  it('pushes the pause scene without tearing down the run', async () => {
    const asteroids = game.world.query([Asteroid]).count();

    tap('Escape');
    await Promise.resolve();

    expect(game.scenes.depth).toBe(2);
    expect(game.scenes.active?.name).toBe('pause');
    expect(game.world.query([Asteroid]).count()).toBe(asteroids);
  });

  it('freezes the simulation while paused', async () => {
    game.input.pushKeyDown('KeyW');
    advance(10);
    game.input.pushKeyUp('KeyW');

    tap('Escape');
    await Promise.resolve();
    advance(2);

    const before = shipTransform().position.clone();
    advance(60);

    expect(shipTransform().position.x).toBeCloseTo(before.x, 5);
    expect(shipTransform().position.y).toBeCloseTo(before.y, 5);
  });

  it('resumes the simulation on pop', async () => {
    game.input.pushKeyDown('KeyW');
    advance(10);
    game.input.pushKeyUp('KeyW');

    tap('Escape');
    await Promise.resolve();
    advance(2);

    await game.scenes.pop();
    advance(2);

    const before = shipTransform().position.clone();
    advance(30);

    expect(shipTransform().position.distanceTo(before)).toBeGreaterThan(1);
  });
});

describe('draw output', () => {
  it('emits a command per visible entity, sorted into draw order', () => {
    advance(1);

    const commands = game.drawList.toArray();
    expect(commands.length).toBeGreaterThan(WAVE.baseCount);

    for (let i = 1; i < commands.length; i += 1) {
      expect(commands[i].layer).toBeGreaterThanOrEqual(commands[i - 1].layer);
    }
  });

  it('shows score, lives, and wave in the HUD', () => {
    advance(1);
    const texts = game.drawList.toArray().map((c) => c.text ?? '');
    expect(texts.some((t) => t.startsWith('SCORE'))).toBe(true);
    expect(texts.some((t) => t.startsWith('LIVES'))).toBe(true);
    expect(texts.some((t) => t.startsWith('WAVE'))).toBe(true);
  });
});
