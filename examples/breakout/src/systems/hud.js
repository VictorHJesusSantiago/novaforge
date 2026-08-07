import { TextLabel } from '@novaforge/renderer';
import { HudText, SESSION } from '../components.js';

/**
 * Refresh the HUD labels from the session state.
 *
 * A system rather than DOM elements over the canvas: the HUD is part of the rendered frame, so
 * it participates in the same draw list, the same layer sorting, and eventually the same
 * screenshot. A DOM overlay would look identical and be absent from every one of those.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function hudSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined) return;

  world.query([HudText, TextLabel]).each((_entity, hud, label) => {
    switch (hud.field) {
      case 'score':
        label.text = `SCORE ${String(session.score).padStart(5, '0')}`;
        break;
      case 'lives':
        label.text = `LIVES ${'●'.repeat(Math.max(0, session.lives))}`;
        break;
      case 'message':
        label.text = session.message;
        break;
      default:
        break;
    }
  });
}
