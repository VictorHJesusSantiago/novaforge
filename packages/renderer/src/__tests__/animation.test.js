import { describe, it, expect, beforeEach } from 'vitest';
import { World, Transform } from '@novaforge/core';
import { AtlasRegistry, TextureAtlas } from '../atlas.js';
import * as components from '../components.js';
import {
  defineClip,
  play,
  Animator,
  animationSystem,
  installAnimationSystem,
} from '../animation.js';

const { Sprite } = components;

/** @returns {import('../atlas.js').TextureAtlas} a 4-frame walk atlas. */
function walkAtlas() {
  return TextureAtlas.fromGrid('hero', { frameWidth: 16, frameHeight: 16, columns: 4, rows: 1 });
}

/** @type {World} */ let world;
/** @type {AtlasRegistry} */ let registry;

beforeEach(() => {
  world = new World();
  registry = new AtlasRegistry();
  registry.register('hero', walkAtlas());
  installAnimationSystem(world, registry, Sprite);
});

describe('defineClip', () => {
  it('applies default fps and loop', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1']);
    expect(clip.fps).toBe(12);
    expect(clip.loop).toBe(true);
  });

  it('accepts overrides', () => {
    const clip = defineClip('walk', 'hero', ['0_0'], { fps: 4, loop: false });
    expect(clip.fps).toBe(4);
    expect(clip.loop).toBe(false);
  });

  // An animation with nothing to show is always a mistake; fail at definition time.
  it('rejects an empty frame list', () => {
    expect(() => defineClip('empty', 'hero', [])).toThrow(RangeError);
  });
});

describe('play', () => {
  it('starts a clip from frame 0', () => {
    const animator = Animator.factory();
    play(animator, defineClip('walk', 'hero', ['0_0', '0_1']));
    expect(animator.frameIndex).toBe(0);
    expect(animator.elapsed).toBe(0);
  });

  // Called every frame while a direction is held; must not restart the animation each time.
  it('is a no-op when the same clip is already playing', () => {
    const animator = Animator.factory();
    const clip = defineClip('walk', 'hero', ['0_0', '0_1', '0_2'], { fps: 10 });
    play(animator, clip);
    animator.frameIndex = 2;
    animator.elapsed = 0.03;

    play(animator, clip);

    expect(animator.frameIndex).toBe(2);
    expect(animator.elapsed).toBe(0.03);
  });

  it('restarts a finished non-looping clip even without force', () => {
    const animator = Animator.factory();
    const clip = defineClip('hit', 'hero', ['0_0'], { loop: false });
    animator.clip = clip;
    animator.finished = true;
    animator.frameIndex = 0;

    play(animator, clip);

    expect(animator.finished).toBe(false);
  });

  it('force restarts even an identical, unfinished clip', () => {
    const animator = Animator.factory();
    const clip = defineClip('walk', 'hero', ['0_0', '0_1']);
    play(animator, clip);
    animator.frameIndex = 1;

    play(animator, clip, { force: true });

    expect(animator.frameIndex).toBe(0);
  });

  it('switches cleanly to a different clip', () => {
    const animator = Animator.factory();
    const walk = defineClip('walk', 'hero', ['0_0', '0_1']);
    const jump = defineClip('jump', 'hero', ['0_2']);
    play(animator, walk);
    animator.frameIndex = 1;

    play(animator, jump);

    expect(animator.clip).toBe(jump);
    expect(animator.frameIndex).toBe(0);
  });
});

describe('animationSystem', () => {
  /** @returns {number} an entity with an Animator and a Sprite. */
  function spawnAnimated(clip) {
    const entity = world.spawn([Transform], [Sprite, { texture: 'placeholder' }], [Animator]);
    play(world.get(entity, Animator), clip);
    return entity;
  }

  it('advances the frame index at the clip fps', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1', '0_2', '0_3'], { fps: 10 });
    const entity = spawnAnimated(clip);

    animationSystem(world, 0.1); // exactly one frame at 10fps

    expect(world.get(entity, Animator)?.frameIndex).toBe(1);
  });

  it('writes the resolved atlas rect onto the sprite', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1'], { fps: 10 });
    const entity = spawnAnimated(clip);

    animationSystem(world, 0.1);

    const sprite = world.get(entity, Sprite);
    expect(sprite?.source).toEqual(registry.resolve('hero', '0_1'));
    expect(sprite?.texture).toBe('hero');
  });

  it('loops back to frame 0 past the last frame', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1'], { fps: 10, loop: true });
    const entity = spawnAnimated(clip);

    animationSystem(world, 0.25); // two and a half frames

    expect(world.get(entity, Animator)?.frameIndex).toBe(0);
  });

  it('holds the last frame and sets finished on a non-looping clip', () => {
    const clip = defineClip('hit', 'hero', ['0_0', '0_1'], { fps: 10, loop: false });
    const entity = spawnAnimated(clip);

    animationSystem(world, 0.5);

    const animator = world.get(entity, Animator);
    expect(animator?.frameIndex).toBe(1);
    expect(animator?.finished).toBe(true);
  });

  it('does not advance a finished clip further', () => {
    const clip = defineClip('hit', 'hero', ['0_0', '0_1'], { fps: 10, loop: false });
    const entity = spawnAnimated(clip);
    animationSystem(world, 1);
    const frameAtFinish = world.get(entity, Animator)?.frameIndex;

    animationSystem(world, 1);

    expect(world.get(entity, Animator)?.frameIndex).toBe(frameAtFinish);
  });

  it('does not advance while speed is 0', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1'], { fps: 10 });
    const entity = spawnAnimated(clip);
    const animator = world.get(entity, Animator);
    if (animator) animator.speed = 0;

    animationSystem(world, 1);

    expect(animator?.frameIndex).toBe(0);
  });

  it('honours speed as a multiplier', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1', '0_2'], { fps: 10 });
    const entity = spawnAnimated(clip);
    const animator = world.get(entity, Animator);
    if (animator) animator.speed = 2;

    animationSystem(world, 0.1); // 0.1 * 2 = 0.2s = 2 frames at 10fps

    expect(animator?.frameIndex).toBe(2);
  });

  // A stalled tab or an editor step can produce a very large dt; the animation must catch up
  // to the correct frame rather than staying one frame behind forever.
  it('catches up correctly after a very large dt', () => {
    const clip = defineClip('walk', 'hero', ['0_0', '0_1', '0_2', '0_3'], { fps: 10, loop: true });
    const entity = spawnAnimated(clip);

    animationSystem(world, 1.0); // 10 frames at 10fps; 10 mod 4 = 2

    expect(world.get(entity, Animator)?.frameIndex).toBe(2);
  });

  it('ignores an entity with no clip assigned', () => {
    const entity = world.spawn([Transform], [Sprite], [Animator]);
    expect(() => animationSystem(world, 1)).not.toThrow();
    expect(world.get(entity, Animator)?.frameIndex).toBe(0);
  });

  it('does nothing when the required resources are absent', () => {
    const bare = new World();
    bare.spawn([Transform], [Sprite], [Animator]);
    expect(() => animationSystem(bare, 1)).not.toThrow();
  });
});

describe('installAnimationSystem', () => {
  it('registers the system in update, ahead of anything reading the sprite', () => {
    const fresh = new World();
    const handle = installAnimationSystem(fresh, registry, Sprite);
    expect(typeof handle).toBe('number');

    const entry = fresh.scheduler.systemsIn('update').find((s) => s.handle === handle);
    expect(entry?.name).toBe('animation');
    expect(entry?.order).toBeLessThan(0);
  });
});
