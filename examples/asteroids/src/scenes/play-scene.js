import { Scene } from '@novaforge/runtime';
import { Transform } from '@novaforge/core';
import { RigidBody } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { Rng, TAU, wrap as wrapValue } from '@novaforge/math';
import { Asteroid, Bullet, Ship, createSession, SESSION } from '../components.js';
import { PLAYFIELD, WAVE, ASTEROID, RULES, SHIP } from '../config.js';
import { createShip, createAsteroid, createHudText } from '../factories.js';
import { makeShipControlSystem, makeShipStatusSystem, makeRestartSystem } from '../systems/ship.js';
import { bulletLifeSystem, makeBulletAsteroidSystem, makeWaveSystem } from '../systems/asteroids.js';
import { wrapSystem } from '../systems/wrap.js';
import { hudSystem } from '../systems/hud.js';

/** Seeded so a recorded session replays identically (SPEC §1) — same reasoning as breakout's
 *  ball-launch RNG. */
const rng = new Rng(0xa57e0d1d);

/**
 * The game itself.
 *
 * Structured like breakout's `PlayScene`: a `preload`, a layout, and a list of systems with
 * explicit ordering. There is no update method and no game loop — the scene describes what
 * exists and what runs, and the runtime does the rest.
 */
export class PlayScene extends Scene {
  /** The ship entity, spawned once in `onEnter` and reused across respawns and restarts.
   *  @type {number} */
  _ship = 0;

  preload() {
    // Asteroids draws entirely with shape primitives, so it has no texture manifest. Sounds are
    // optional: the mixer falls back to silence for anything that fails to load (Invariant A1),
    // so the game is fully playable with the asset directory empty.
    return {
      sounds: {
        shoot: 'sounds/shoot.wav',
        explosion: 'sounds/explosion.wav',
      },
    };
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @param {import('@novaforge/runtime').Game} game
   */
  onEnter(world, game) {
    world.setResource(SESSION, createSession(RULES.lives));

    this._game = game;
    this._bindControls(world);
    this._ship = createShip(this);
    this._buildHud();
    this.rebuildWave();
    this._registerSystems();

    // The camera sits on the playfield centre and never moves; there is no scrolling here, the
    // wrap system is what stands in for an infinite world.
    game.camera.snapTo({ x: PLAYFIELD.width / 2, y: PLAYFIELD.height / 2 });
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @private
   */
  _bindControls(world) {
    const input = world.getResource(INPUT_RESOURCE);
    if (input === undefined) return;

    input.actions
      .define('fire', [{ key: 'Space' }, { mouse: 0 }, { gamepadButton: 0 }])
      .define('thrust', [{ key: 'KeyW' }, { key: 'ArrowUp' }, { gamepadButton: 7 }])
      .define('pause', [{ key: 'Escape' }])
      .define('debug', [{ key: 'F3' }])
      .defineAxis('turn', {
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
        gamepadAxis: 0,
      });
  }

  /** @private */
  _buildHud() {
    createHudText(this, { x: 20, y: 24, field: 'score', align: 'left' });
    createHudText(this, { x: PLAYFIELD.width - 20, y: 24, field: 'lives', align: 'right' });
    createHudText(this, { x: PLAYFIELD.width / 2, y: 24, field: 'wave', align: 'center' });
    createHudText(this, {
      x: PLAYFIELD.width / 2,
      y: PLAYFIELD.height / 2,
      field: 'message',
      align: 'center',
      font: '24px monospace',
    });
  }

  /**
   * Clear the asteroids and spawn a fresh wave, sized to `session.wave`. Called on entry, on
   * every wave clear, and on restart.
   * @returns {void}
   */
  rebuildWave() {
    const world = this.world;

    for (const [entity] of world.query([Asteroid])) {
      world.destroy(entity);
    }
    // Reclaim now rather than at the end of the frame: the new asteroids are about to spawn, and
    // a stray frame of the old and new sets overlapping would produce spurious contacts — same
    // reasoning as breakout's `rebuildLevel`.
    world.flushDestroyed();

    const session = world.getResource(SESSION);
    const count = WAVE.baseCount + (session.wave - 1) * WAVE.increasePerWave;
    const centerX = PLAYFIELD.width / 2;
    const centerY = PLAYFIELD.height / 2;
    // Spawned on a ring outside the playfield's own half-diagonal, so a fresh wave never appears
    // on top of the ship parked at centre.
    const spawnRadius = Math.max(PLAYFIELD.width, PLAYFIELD.height) * 0.55;

    for (let i = 0; i < count; i += 1) {
      const placementAngle = rng.range(0, TAU);
      const x = wrapValue(centerX + Math.cos(placementAngle) * spawnRadius, 0, PLAYFIELD.width);
      const y = wrapValue(centerY + Math.sin(placementAngle) * spawnRadius, 0, PLAYFIELD.height);

      const driftAngle = rng.range(0, TAU);
      const speed = ASTEROID.sizes.large.speed * rng.range(0.7, 1.3);
      createAsteroid(this, {
        size: 'large',
        x,
        y,
        velocity: { x: Math.cos(driftAngle) * speed, y: Math.sin(driftAngle) * speed },
      });
    }
  }

  /**
   * Put the ship back at centre, motionless, facing up, and briefly invulnerable. Used both after
   * a life is lost and on a full restart.
   * @returns {void}
   * @private
   */
  _resetShip() {
    const world = this.world;
    const transform = world.getOrThrow(this._ship, Transform);
    const body = world.getOrThrow(this._ship, RigidBody);
    const ship = world.getOrThrow(this._ship, Ship);

    transform.position.set(PLAYFIELD.width / 2, PLAYFIELD.height / 2);
    transform.previousPosition.copyFrom(transform.position);
    transform.rotation = -Math.PI / 2;
    transform.previousRotation = transform.rotation;
    body.velocity.set(0, 0);
    ship.invulnerable = SHIP.respawnInvulnerability;
    ship.fireCooldown = 0;
  }

  /**
   * Remove every live bullet. Used on restart so a game-over does not leave shots from the
   * previous run in flight into the next one.
   * @returns {void}
   * @private
   */
  _clearBullets() {
    const world = this.world;
    for (const [entity] of world.query([Bullet])) {
      world.destroy(entity);
    }
    world.flushDestroyed();
  }

  /** @private */
  _registerSystems() {
    // Ordering, as in breakout, is the interesting part of this file.
    //
    //   -1000  syncPreviousTransform   (engine)
    //     -20  shipControl             set velocity/rotation BEFORE the integrator runs
    //       0  physicsStep             (engine) integrates and resolves
    //      50  wrap                    correct positions the integrator just produced
    //      60  bulletLife              despawn expired shots after they have had their step
    this.addSystem('fixedUpdate', makeShipControlSystem(this), { order: -20, name: 'shipControl' });
    this.addSystem('fixedUpdate', wrapSystem, { order: 50, name: 'wrap' });
    this.addSystem('fixedUpdate', bulletLifeSystem, { order: 60, name: 'bulletLife' });

    this.addSystem('update', makeBulletAsteroidSystem(this, rng), { order: 0, name: 'bulletAsteroid' });
    this.addSystem('update', makeShipStatusSystem(() => this._resetShip()), {
      order: 10,
      name: 'shipStatus',
    });
    this.addSystem('update', makeWaveSystem(() => this.rebuildWave()), { order: 20, name: 'wave' });
    this.addSystem(
      'update',
      makeRestartSystem(() => {
        this._clearBullets();
        this._resetShip();
        this.rebuildWave();
      }),
      { order: 30, name: 'restart' },
    );
    this.addSystem('update', hudSystem, { order: 100, name: 'hud' });

    // Pushing rather than changing: the run stays resident underneath, so resuming costs nothing
    // and no state has to be saved — same reasoning as breakout's pause handling.
    this.addSystem(
      'update',
      (world) => {
        const input = world.getResource(INPUT_RESOURCE);
        const scenes = this._game?.scenes;
        if (scenes === undefined || scenes.isTransitioning) return;
        if (scenes.active !== this) return; // already paused; the pause scene owns Escape now
        if (input?.actions.pressed('pause')) void scenes.push('pause');
      },
      { order: -100, name: 'pauseInput' },
    );
  }
}
