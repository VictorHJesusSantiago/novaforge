import { TRIGGER_ENTER } from '@novaforge/physics';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Goal, Player, SESSION } from '../components.js';

/**
 * Declare victory when the player touches the goal flag.
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function goalSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined || session.outcome !== 'playing') return;

  const events = world.events.read(TRIGGER_ENTER);
  if (events.length === 0) return;

  for (const event of events) {
    if (world.has(event.trigger, Goal) && world.has(event.other, Player)) {
      session.outcome = 'won';
      session.message = 'You made it! — press Space to play again';
      world.getResource(AUDIO_RESOURCE)?.play('goal');
      return;
    }
  }
}
