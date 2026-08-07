import { defineComponent, defineTag } from '@novaforge/core';

/**
 * Game-specific components.
 *
 * Note how small these are. All the spatial and physical state lives in the engine's
 * `Transform`, `RigidBody` and `Collider`; these carry only what is genuinely about *breakout*.
 * That split is what the ECS is for.
 */

/** The player's paddle. */
export const Paddle = defineTag('Paddle');

/** The ball. `attached` means it is sitting on the paddle waiting to be launched. */
export const Ball = defineComponent(
  'Ball',
  () => ({ attached: true }),
  { attached: { type: 'boolean' } },
);

/** A destructible brick. */
export const Brick = defineComponent(
  'Brick',
  () => ({ points: 10, row: 0 }),
  {
    points: { type: 'number', min: 0, step: 5 },
    row: { type: 'number', min: 0, step: 1 },
  },
);

/** The region below the paddle that costs a life. */
export const DeathZone = defineTag('DeathZone');

/** A HUD text element, refreshed each frame from the session state. */
export const HudText = defineComponent(
  'HudText',
  () => ({ /** @type {'score'|'lives'|'message'} */ field: 'score' }),
  { field: { type: 'enum', options: ['score', 'lives', 'message'] } },
);

/**
 * The run's state.
 *
 * A world resource rather than a component, because it is genuinely singular. Modelling it as a
 * component on a "game manager" entity is a common ECS habit and it buys nothing — there is no
 * query that wants to iterate the one score.
 */
/**
 * @param {number} lives
 * @returns {{ score: number, lives: number, outcome: 'playing'|'won'|'lost', message: string }}
 */
export function createSession(lives) {
  return {
    score: 0,
    lives,
    /** @type {'playing'|'won'|'lost'} */
    outcome: 'playing',
    message: '',
  };
}

/** Resource key for {@link createSession}'s value. */
export const SESSION = 'breakout:session';
