import { CONTACT_BEGIN } from '@novaforge/physics';
import { AUDIO_RESOURCE } from '@novaforge/audio';
import { Ball, Brick, SESSION } from '../components.js';

/**
 * Destroy bricks the ball hits, and score them.
 *
 * Reads `CONTACT_BEGIN` from the buffered event channel, which means the destruction happens on
 * the frame *after* the contact. That one frame of latency is invisible at 60 Hz and is the
 * price of the buffering that stops system order from deciding which events a system sees
 * (SPEC §6). Reacting synchronously would mean destroying an entity in the middle of the
 * physics step that is still iterating over it.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function brickSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined) return;

  const contacts = world.events.read(CONTACT_BEGIN);
  if (contacts.length === 0) return;

  const audio = world.getResource(AUDIO_RESOURCE);
  let destroyed = 0;

  for (const contact of contacts) {
    const brick = resolveBrick(world, contact.a, contact.b);
    if (brick === null) continue;

    const data = world.get(brick, Brick);
    if (data === undefined) continue;

    session.score += data.points;
    world.destroy(brick);
    destroyed += 1;
  }

  if (destroyed > 0) {
    audio?.play('brick');
  }
}

/**
 * @param {import('@novaforge/core').World} world
 * @param {number} a
 * @param {number} b
 * @returns {number | null} the brick of a ball-brick pair, or `null` for any other pair.
 */
function resolveBrick(world, a, b) {
  if (world.has(a, Brick) && world.has(b, Ball)) return a;
  if (world.has(b, Brick) && world.has(a, Ball)) return b;
  return null;
}

/**
 * Declare victory once every brick is gone.
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function winConditionSystem(world) {
  const session = world.getResource(SESSION);
  if (session === undefined || session.outcome !== 'playing') return;

  if (world.query([Brick]).isEmpty()) {
    session.outcome = 'won';
    session.message = 'Cleared! — press Space to play again';
  }
}
