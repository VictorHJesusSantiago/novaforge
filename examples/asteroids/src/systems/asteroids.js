import { Transform } from '@novaforge/core';
import { TAU } from '@novaforge/math';
import { TRIGGER_ENTER } from '@novaforge/physics';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Bullet, Asteroid, SESSION } from '../components.js';
import { ASTEROID } from '../config.js';
import { createAsteroid } from '../factories.js';

/**
 * Count a bullet's fired shot down and despawn it on a miss.
 *
 * Without this, a bullet that never hits anything just keeps wrapping the playfield forever,
 * quietly accumulating live entities and trigger checks for the rest of the run.
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} dt
 * @returns {void}
 */
export function bulletLifeSystem(world, dt) {
  world.query([Bullet]).each((entity, bullet) => {
    bullet.life -= dt;
    if (bullet.life <= 0) world.destroy(entity);
  });
}

/**
 * Build the bullet/asteroid collision system, closing over the scene (split pieces are spawned
 * through `scene.spawn`, tracked for teardown) and a seeded `Rng` (so a recorded run replays
 * identically, per SPEC §1 — same reasoning as breakout's launch-angle RNG).
 *
 * Reads the buffered `TRIGGER_ENTER` channel, one frame after the physics step that produced the
 * overlap — see breakout's `brickSystem` for why that latency is the right trade, not a bug.
 *
 * @param {import('@novaforge/runtime').Scene} scene
 * @param {import('@novaforge/math').Rng} rng
 * @returns {(world: import('@novaforge/core').World) => void}
 */
export function makeBulletAsteroidSystem(scene, rng) {
  return function bulletAsteroidSystem(world) {
    const session = world.getResource(SESSION);
    if (session === undefined) return;

    const events = world.events.read(TRIGGER_ENTER);
    if (events.length === 0) return;

    const audio = world.getResource(AUDIO_RESOURCE);
    // A bullet can only appear as `trigger` in one contact per step (it is a point-ish shape),
    // but guard against processing it twice anyway — cheap, and it is exactly the kind of
    // invariant that is easy to accidentally break later.
    const handledBullets = new Set();
    let destroyedAny = false;

    for (const event of events) {
      const { trigger, other } = event;
      if (handledBullets.has(trigger)) continue;
      if (!world.has(trigger, Bullet) || !world.has(other, Asteroid)) continue;

      const asteroidData = world.get(other, Asteroid);
      if (asteroidData === undefined) continue; // already destroyed by an earlier event this frame
      handledBullets.add(trigger);

      session.score += ASTEROID.sizes[asteroidData.size].points;

      const nextSize = ASTEROID.splitInto[asteroidData.size];
      if (nextSize !== undefined) {
        const parentTransform = world.getOrThrow(other, Transform);
        for (let i = 0; i < ASTEROID.splitCount; i += 1) {
          const angle = rng.range(0, TAU);
          const speed = ASTEROID.sizes[nextSize].speed * rng.range(0.8, 1.2);
          createAsteroid(scene, {
            // `splitInto`'s values are genuinely always one of the three size names; the cast
            // is for the type checker, not a runtime assumption.
            size: /** @type {'large'|'medium'|'small'} */ (nextSize),
            x: parentTransform.position.x,
            y: parentTransform.position.y,
            velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          });
        }
      }

      // Deferred: both entities stop matching queries immediately, and storage is reclaimed at
      // the end of the frame once every system has had its turn.
      world.destroy(other);
      world.destroy(trigger);
      destroyedAny = true;
    }

    if (destroyedAny) audio?.play('explosion');
  };
}

/**
 * Build the wave-advance system, closing over the scene's wave rebuilder.
 *
 * Unlike breakout's `winConditionSystem` — which ends the game once every brick is gone —
 * clearing every asteroid does not end an Asteroids run. It starts the next, slightly harder,
 * wave: that escalation is the game's actual difficulty curve, so "you cleared it" and "game
 * over" have to stay distinct outcomes.
 *
 * @param {() => void} rebuildWave
 * @returns {(world: import('@novaforge/core').World) => void}
 */
export function makeWaveSystem(rebuildWave) {
  return function waveSystem(world) {
    const session = world.getResource(SESSION);
    if (session === undefined || session.outcome !== 'playing') return;
    if (!world.query([Asteroid]).isEmpty()) return;

    session.wave += 1;
    session.message = `Wave ${session.wave}`;
    rebuildWave();
  };
}
