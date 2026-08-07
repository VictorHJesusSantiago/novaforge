import { defineComponent, defineTag } from '@novaforge/core';

/**
 * Game-specific components.
 *
 * As small as `examples/breakout`'s — everything spatial and physical lives in the engine's
 * `Transform`, `RigidBody` and `Collider`. What is left here is genuinely about *this* game.
 */

/** The player character. */
export const Player = defineTag('Player');

/**
 * Per-frame movement state that a spatial query (not an event) has to recompute, so it needs
 * somewhere to live between frames. See `systems/player.js`'s `groundCheckSystem` for why a
 * direct sensor query was chosen over the buffered contact events.
 */
export const PlayerState = defineComponent(
  'PlayerState',
  () => ({ grounded: false }),
  { grounded: { type: 'boolean' } },
);

/** The trigger below the level that costs a life — falling off a platform or into the gap. */
export const Hazard = defineTag('Hazard');

/** The flag the player must reach to win. */
export const Goal = defineTag('Goal');

/** A collectible worth `COIN_VALUE` points. */
export const Coin = defineTag('Coin');

/**
 * A HUD text element, refreshed each frame from the session state.
 *
 * Unlike `examples/breakout` — whose camera never moves, so a fixed world position is a fixed
 * screen position — this game's camera follows the player. `offsetX`/`offsetY` are therefore
 * screen-space, relative to the camera's top-left visible corner; `systems/hud.js`'s
 * `hudFollowCameraSystem` re-projects them onto the `Transform` every frame.
 */
export const HudText = defineComponent(
  'HudText',
  () => ({
    /** @type {'score'|'lives'|'message'} */ field: 'score',
    offsetX: 0,
    offsetY: 0,
  }),
  {
    field: { type: 'enum', options: ['score', 'lives', 'message'] },
    offsetX: { type: 'number' },
    offsetY: { type: 'number' },
  },
);

/**
 * The run's state.
 *
 * A world resource rather than a component — see `examples/breakout`'s `components.js` for the
 * same reasoning: there is no query that ever wants to iterate "the one score".
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
export const SESSION = 'platformer:session';
