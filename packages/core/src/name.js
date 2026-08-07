import { defineComponent } from './component.js';

/**
 * A human-readable label for an entity.
 *
 * Purely cosmetic — nothing in the simulation reads it — which is exactly why it lives in
 * `core` rather than in the editor package: it is useful the moment there is more than one
 * entity to tell apart in a log line or a debug overlay, with or without the editor attached.
 * The editor's scene tree falls back to `Entity #<index>` when it is absent, so adding it to a
 * scene is opt-in, not a requirement every entity has to pay for.
 */
export const Name = defineComponent(
  'Name',
  () => ({ value: '' }),
  { value: { type: 'string' } },
);
