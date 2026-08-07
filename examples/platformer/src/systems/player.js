import { Transform } from '@novaforge/core';
import { AABB, clamp } from '@novaforge/math';
import { RigidBody, Collider, PHYSICS_RESOURCE } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { Player, PlayerState } from '../components.js';
import { PLAYER, LAYER } from '../config.js';

/**
 * Decide whether the player is standing on solid ground, by directly querying the physics
 * broadphase for a thin sensor box under the feet.
 *
 * The obvious alternative is the buffered `CONTACT_BEGIN`/`CONTACT_END` events (SPEC's event
 * model, and what `examples/breakout`'s ball/brick systems both read). That was tried first and
 * rejected: those events are readable only the frame *after* they are emitted (`EventBus.emit`
 * writes to next frame's buffer), so a jump taken the instant the player leaves the ground would
 * still see a stale "grounded" contact and could double-jump. `PhysicsWorld.queryRegion` reads
 * the broadphase tree built by *this* step, with no such lag, which is what jump-input fairness
 * actually needs.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function groundCheckSystem(world) {
  const physics = world.getResource(PHYSICS_RESOURCE);
  if (physics === undefined) return;

  const halfWidth = PLAYER.width / 2 - PLAYER.groundSensorInset;

  world.query([Transform, Player, PlayerState]).each((entity, transform, _player, state) => {
    const feetY = transform.position.y + PLAYER.height / 2;
    const sensor = new AABB(
      transform.position.x - halfWidth,
      feetY,
      transform.position.x + halfWidth,
      feetY + PLAYER.groundSensorThickness,
    );

    let grounded = false;
    for (const other of physics.queryRegion(sensor)) {
      if (other === entity) continue;
      const collider = world.get(other, Collider);
      if (collider === undefined || collider.isTrigger) continue;
      if ((collider.layer & LAYER.GROUND) === 0) continue;
      grounded = true;
      break;
    }
    state.grounded = grounded;
  });
}

/**
 * Drive the player from input: horizontal velocity set directly (arcade control, like
 * `examples/breakout`'s paddle), and a vertical impulse on the jump action while grounded.
 *
 * Runs in `fixedUpdate`, before the physics step, for the same reason the paddle does: the
 * velocity this system sets is what the integrator and the solver actually use for this step,
 * not one step behind it.
 *
 * @param {import('@novaforge/core').World} world
 * @returns {void}
 */
export function playerControlSystem(world) {
  const input = world.getResource(INPUT_RESOURCE);
  if (input === undefined) return;

  const direction = clamp(input.actions.axis('moveX'), -1, 1);
  const jump = input.actions.pressed('jump');

  world.query([RigidBody, PlayerState, Player]).each((_entity, body, state) => {
    body.velocity.x = direction * PLAYER.moveSpeed;

    if (jump && state.grounded) {
      body.velocity.y = -PLAYER.jumpSpeed;
      // Cleared immediately rather than waiting for the next `groundCheckSystem` pass: that
      // pass reads the broadphase tree built by *this* step, which still shows the player
      // touching the ground they have not yet moved off — without this, a second `jump` press
      // one frame later would read `grounded: true` again and grant a free double jump.
      state.grounded = false;
    }
  });
}
