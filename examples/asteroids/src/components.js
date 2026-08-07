import { defineComponent } from '@novaforge/core';

/**
 * Game-specific components.
 *
 * Note how small these are. All the spatial and physical state lives in the engine's
 * `Transform`, `RigidBody` and `Collider`; these carry only what is genuinely about *asteroids*.
 * That split is what the ECS is for.
 */

/**
 * The player's ship. `invulnerable` counts down after a respawn; `fireCooldown` counts down
 * between shots. Both live here rather than as separate one-field components because nothing
 * ever queries for one without the other — this *is* "the ship's status".
 */
export const Ship = defineComponent(
  'Ship',
  () => ({ invulnerable: 0, fireCooldown: 0 }),
  {
    invulnerable: { type: 'number', min: 0, step: 0.1 },
    fireCooldown: { type: 'number', min: 0, step: 0.01 },
  },
);

/** A fired shot. `life` counts down to despawn a miss instead of letting it wrap forever. */
export const Bullet = defineComponent(
  'Bullet',
  () => ({ life: 1 }),
  { life: { type: 'number', min: 0, step: 0.01 } },
);

/** A destructible rock. `size` drives its radius, points, and what it splits into on death. */
export const Asteroid = defineComponent(
  'Asteroid',
  () => ({ /** @type {'large'|'medium'|'small'} */ size: 'large' }),
  { size: { type: 'enum', options: ['large', 'medium', 'small'] } },
);

/**
 * Marks an entity that wraps at the playfield edges instead of leaving it. `margin` is how far
 * past the edge the entity must travel before it teleports — its own radius, so it fully
 * disappears on one side before reappearing on the other rather than popping while still visible.
 */
export const Wrappable = defineComponent(
  'Wrappable',
  () => ({ margin: 16 }),
  { margin: { type: 'number', min: 0 } },
);

/** A HUD text element, refreshed each frame from the session state. */
export const HudText = defineComponent(
  'HudText',
  () => ({ /** @type {'score'|'lives'|'wave'|'message'} */ field: 'score' }),
  { field: { type: 'enum', options: ['score', 'lives', 'wave', 'message'] } },
);

/**
 * The run's state.
 *
 * A world resource rather than a component, because it is genuinely singular — see breakout's
 * `SESSION` for the same reasoning.
 */
/**
 * @param {number} lives
 * @returns {{ score: number, lives: number, wave: number, outcome: 'playing'|'lost', message: string }}
 */
export function createSession(lives) {
  return {
    score: 0,
    lives,
    wave: 1,
    /** @type {'playing'|'lost'} */
    outcome: 'playing',
    message: '',
  };
}

/** Resource key for {@link createSession}'s value. */
export const SESSION = 'asteroids:session';
