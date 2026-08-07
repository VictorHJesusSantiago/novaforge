import { Transform } from '@novaforge/core';
import { RigidBody, TRIGGER_ENTER } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Ship, Asteroid, SESSION } from '../components.js';
import { SHIP, RULES } from '../config.js';
import { createBullet } from '../factories.js';

/**
 * Build the ship control system, closing over the scene so a fired shot can be spawned through
 * `scene.spawn` (tracked for teardown) rather than `world.spawn` directly — see breakout's
 * `makeRestartSystem` for the same closure-over-scene pattern.
 *
 * Runs in `fixedUpdate`, before the physics step, so thrust set this step is what the integrator
 * actually integrates — the same reasoning as breakout's `paddleSystem`.
 *
 * Rotation is *not* driven through `RigidBody.angularVelocity`. The ship's `fixedRotation` is
 * true (see `createShip`), so the integrator never touches `Transform.rotation` at all; this
 * system writes it directly instead. The alternative — real torque — buys nothing here, since an
 * arcade ship's turn rate is not supposed to have inertia.
 *
 * @param {import('@novaforge/runtime').Scene} scene
 * @returns {(world: import('@novaforge/core').World, dt: number) => void}
 */
export function makeShipControlSystem(scene) {
  return function shipControlSystem(world, dt) {
    const input = world.getResource(INPUT_RESOURCE);
    if (input === undefined) return;

    const found = world.query([Transform, RigidBody, Ship]).first();
    if (found === null) return;
    const [_entity, transform, body, ship] = found;

    transform.rotation += input.actions.axis('turn') * SHIP.rotateSpeed * dt;

    if (input.actions.isDown('thrust')) {
      const facing = { x: Math.cos(transform.rotation), y: Math.sin(transform.rotation) };
      body.velocity.addScaledSelf(facing, SHIP.thrustAccel * dt);
      const clamped = body.velocity.clampLength(SHIP.maxSpeed);
      body.velocity.set(clamped.x, clamped.y);
    }

    if (ship.fireCooldown > 0) {
      ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
    }

    if (input.actions.pressed('fire') && ship.fireCooldown <= 0) {
      const noseX = transform.position.x + Math.cos(transform.rotation) * SHIP.radius;
      const noseY = transform.position.y + Math.sin(transform.rotation) * SHIP.radius;
      createBullet(scene, { x: noseX, y: noseY, rotation: transform.rotation });
      ship.fireCooldown = SHIP.fireCooldown;
      world.getResource(AUDIO_RESOURCE)?.play('shoot');
    }
  };
}

/**
 * Build the ship status system, closing over the scene's respawn callback — the reset itself
 * (position, velocity, invulnerability) is scene state the scene already owns, so this system
 * only decides *when* to call it.
 *
 * Driven by the buffered `TRIGGER_ENTER` channel rather than polling distance-to-nearest-asteroid
 * every frame, for the same reason breakout's `ballLossSystem` reads `TRIGGER_ENTER` for the
 * death zone: the rule lives in one place, keyed off the actual physics overlap.
 *
 * @param {() => void} resetShip
 * @returns {(world: import('@novaforge/core').World, dt: number) => void}
 */
export function makeShipStatusSystem(resetShip) {
  return function shipStatusSystem(world, dt) {
    const session = world.getResource(SESSION);
    if (session === undefined) return;

    const found = world.query([Transform, RigidBody, Ship]).first();
    if (found === null) return;
    const [entity, _transform, body, ship] = found;

    if (ship.invulnerable > 0) {
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    }

    if (session.outcome !== 'playing') return;

    const events = world.events.read(TRIGGER_ENTER);
    let hit = false;
    for (const event of events) {
      if (event.trigger === entity && ship.invulnerable <= 0 && world.has(event.other, Asteroid)) {
        hit = true;
      }
    }
    if (!hit) return;

    session.lives -= 1;
    world.getResource(AUDIO_RESOURCE)?.play('explosion');

    if (session.lives <= 0) {
      session.outcome = 'lost';
      session.message = 'Game over — press Space to restart';
      body.velocity.set(0, 0);
      return;
    }

    resetShip();
  };
}

/**
 * Build the restart system, closing over the full-run reset (ship, bullets, wave) that belongs
 * to the scene — see breakout's `makeRestartSystem` for the same shape.
 *
 * @param {() => void} restart
 * @returns {(world: import('@novaforge/core').World) => void}
 */
export function makeRestartSystem(restart) {
  return function restartSystem(/** @type {import('@novaforge/core').World} */ world) {
    const session = world.getResource(SESSION);
    const input = world.getResource(INPUT_RESOURCE);
    if (session === undefined || input === undefined) return;
    if (session.outcome === 'playing') return;

    if (input.actions.pressed('fire')) {
      session.score = 0;
      session.lives = RULES.lives;
      session.wave = 1;
      session.outcome = 'playing';
      session.message = '';
      restart();
    }
  };
}
