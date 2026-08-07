import { Transform } from '@novaforge/core';
import { TextLabel } from '@novaforge/renderer';
import { HudText, SESSION } from '../components.js';

/**
 * Keep HUD text pinned to the camera's visible corner.
 *
 * `examples/breakout` never needed this — its camera never moves, so a fixed world position is
 * already a fixed screen position. This game's camera follows the player, so the HUD's
 * `Transform` has to be re-projected onto the camera's current view every frame instead of set
 * once at spawn time.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function hudFollowCameraSystem(world) {
  const camera = world.getResource('camera');
  if (camera === undefined) return;

  const bounds = camera.visibleBounds();
  world.query([Transform, HudText]).each((_entity, transform, hud) => {
    transform.position.set(bounds.minX + hud.offsetX, bounds.minY + hud.offsetY);
  });
}

/**
 * Refresh the HUD labels from the session state. Same shape as `examples/breakout`'s `hudSystem`.
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
