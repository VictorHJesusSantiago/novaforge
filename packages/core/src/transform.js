import { Vec2 } from '@novaforge/math';
import { defineComponent } from './component.js';

/**
 * Position, rotation and scale in world space.
 *
 * **Why this lives in `core` and not in `renderer`.** Both the renderer and the physics package
 * need it, and they are siblings — neither may import the other (SPEC §2). A component needed by
 * two siblings belongs to their common ancestor. The alternative, injecting the component type
 * into the physics world at construction, works but makes every call site carry a dependency
 * that the architecture already knows how to express.
 *
 * **Why `previous*` fields exist.** The simulation runs at a fixed 60 Hz while the display may
 * refresh at 144 Hz (ADR-0004). The render stage blends between the previous and current
 * transform by the clock's `alpha`; without these two fields every sprite judders on any refresh
 * rate that is not a multiple of the fixed step. They are maintained by
 * `syncPreviousTransform`, which must run first in `fixedUpdate`.
 */
export const Transform = defineComponent(
  'Transform',
  () => ({
    position: new Vec2(0, 0),
    rotation: 0,
    scale: new Vec2(1, 1),
    previousPosition: new Vec2(0, 0),
    previousRotation: 0,
  }),
  {
    position: { type: 'vec2' },
    rotation: { type: 'number', step: 0.01, label: 'Rotation (rad)' },
    scale: { type: 'vec2' },
  },
);
