import { TRIGGER_ENTER } from '@novaforge/physics';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Coin, Player, SESSION } from '../components.js';
import { COIN_VALUE } from '../config.js';

/**
 * Collect coins on trigger overlap. Deferred destruction (`world.destroy`, not
 * `destroyImmediate`) for the same reason `examples/breakout`'s `brickSystem` uses it: this runs
 * mid-frame, and other systems this frame may still be iterating the coin's entity.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function coinSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined) return;

  const events = world.events.read(TRIGGER_ENTER);
  if (events.length === 0) return;

  const audio = world.getResource(AUDIO_RESOURCE);
  let collected = 0;

  for (const event of events) {
    if (!world.has(event.trigger, Coin) || !world.has(event.other, Player)) continue;
    if (!world.isAlive(event.trigger)) continue; // already collected by an earlier event this frame

    session.score += COIN_VALUE;
    world.destroy(event.trigger);
    collected += 1;
  }

  if (collected > 0) audio?.play('coin');
}
