import { defineComponent } from '@novaforge/core';

/**
 * Sprite-sheet (frame-by-frame) animation.
 *
 * A clip is plain data — a list of atlas frame names and a frame rate — so it can be shared by
 * every entity playing it and can round-trip through JSON for the editor's animation panel
 * (Milestone 7). The per-entity playback state (`Animator`) is what actually advances.
 */

/**
 * @typedef {object} AnimationClip
 * @property {string} name
 * @property {string} atlas atlas id, looked up in the `AtlasRegistry`
 * @property {string[]} frames frame names, in playback order
 * @property {number} fps
 * @property {boolean} loop
 */

/**
 * Define an animation clip.
 *
 * ```js
 * const walk = defineClip('walk', 'hero', ['walk_0', 'walk_1', 'walk_2', 'walk_3'], { fps: 8 });
 * ```
 *
 * @param {string} name
 * @param {string} atlas
 * @param {string[]} frames
 * @param {{ fps?: number, loop?: boolean }} [options]
 * @returns {AnimationClip}
 * @throws {RangeError} for an empty frame list — an animation with nothing to show is always a
 *   mistake, and failing at definition time is far easier to trace than a blank sprite at runtime.
 */
export function defineClip(name, atlas, frames, options = {}) {
  if (frames.length === 0) {
    throw new RangeError(`defineClip: "${name}" has no frames`);
  }
  return {
    name,
    atlas,
    frames,
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
  };
}

/**
 * Per-entity animation playback state.
 *
 * Holds a *reference* to the current clip rather than duplicating its frames, so retargeting a
 * clip (editing it in place, which the editor's animation panel will eventually do) updates
 * every entity playing it without a resync step.
 */
export const Animator = defineComponent(
  'Animator',
  () => ({
    /** @type {AnimationClip | null} */
    clip: null,
    /** Seconds into the current frame. */
    elapsed: 0,
    /** Index into `clip.frames`. */
    frameIndex: 0,
    /** Multiplies `clip.fps`; 0 pauses without losing position. */
    speed: 1,
    /** True once a non-looping clip has reached its last frame. */
    finished: false,
  }),
  {
    speed: { type: 'number', step: 0.1 },
    finished: { type: 'boolean' },
  },
);

/**
 * Switch an animator to a new clip, resetting playback.
 *
 * Re-entering the same clip is a no-op by default — a system calling `play(animator, walkClip)`
 * every frame while the player holds a direction must not restart the animation on every call.
 *
 * @param {any} animator an Animator instance
 * @param {AnimationClip} clip
 * @param {{ force?: boolean }} [options] `force` restarts even if `clip` is already playing
 * @returns {void}
 */
export function play(animator, clip, options = {}) {
  if (!options.force && animator.clip === clip && !animator.finished) return;
  animator.clip = clip;
  animator.elapsed = 0;
  animator.frameIndex = 0;
  animator.finished = false;
}

/**
 * Advance every animator by `dt` and write the resolved frame onto its `Sprite`.
 *
 * Runs in `update`, not `fixedUpdate`: animation is a presentational concern with no effect on
 * simulation state, and ties to the real frame rate the way camera smoothing does (SPEC §6).
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} dt seconds
 * @returns {void}
 */
export function animationSystem(world, dt) {
  const registry = world.getResource(ATLAS_REGISTRY_RESOURCE);
  const SpriteType = world.getResource(SPRITE_COMPONENT_RESOURCE);
  if (registry === undefined || SpriteType === undefined) return;

  world.query([Animator, SpriteType]).each((_entity, animator, sprite) => {
    const clip = animator.clip;
    if (clip === null || animator.finished || animator.speed === 0) return;

    animator.elapsed += dt * animator.speed;
    const frameDuration = 1 / clip.fps;

    while (animator.elapsed >= frameDuration) {
      animator.elapsed -= frameDuration;
      animator.frameIndex += 1;

      if (animator.frameIndex >= clip.frames.length) {
        if (clip.loop) {
          animator.frameIndex = 0;
        } else {
          animator.frameIndex = clip.frames.length - 1;
          animator.finished = true;
          animator.elapsed = 0;
          break;
        }
      }
    }

    const frameName = clip.frames[animator.frameIndex];
    const rect = registry.resolve(clip.atlas, frameName);
    if (rect !== null) {
      sprite.texture = registry.get(clip.atlas)?.texture ?? sprite.texture;
      sprite.source = rect;
    }
  });
}

/** Resource key for the world's {@link import('./atlas.js').AtlasRegistry}. */
export const ATLAS_REGISTRY_RESOURCE = 'atlasRegistry';

/**
 * Resource key for the `Sprite` component type.
 *
 * The animation system needs to write `sprite.source` and `sprite.texture`, but `Sprite` is
 * defined in this same package (`components.js`) — importing it directly here would work, but
 * going through a resource keeps this module usable if a game ever swaps in its own sprite
 * component with the same shape. `installAnimationSystem` wires the default in automatically.
 */
export const SPRITE_COMPONENT_RESOURCE = 'spriteComponentType';

/**
 * Install the animation system and its resources on a world.
 * @param {import('@novaforge/core').World} world
 * @param {import('./atlas.js').AtlasRegistry} registry
 * @param {any} SpriteComponentType defaults to this package's `Sprite`
 * @returns {number} the system handle
 */
export function installAnimationSystem(world, registry, SpriteComponentType) {
  world.setResource(ATLAS_REGISTRY_RESOURCE, registry);
  world.setResource(SPRITE_COMPONENT_RESOURCE, SpriteComponentType);
  return world.addSystem('update', animationSystem, { order: -10, name: 'animation' });
}
