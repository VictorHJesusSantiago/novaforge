import { describe, it, expect, beforeEach } from 'vitest';
import { AssetManager } from '../asset-manager.js';

/** A texture cache stand-in that records what it was asked to do. */
function fakeTextures() {
  return {
    loaded: /** @type {string[]} */ ([]),
    unloaded: /** @type {string[]} */ ([]),
    async load(id, url) {
      this.loaded.push(`${id}=${url}`);
    },
    unload(id) {
      this.unloaded.push(id);
      return true;
    },
  };
}

/** An audio mixer stand-in. */
function fakeAudio() {
  return {
    loaded: /** @type {string[]} */ ([]),
    stopped: /** @type {string[]} */ ([]),
    async load(id, url) {
      this.loaded.push(`${id}=${url}`);
      return true;
    },
    stopAllOf(id) {
      this.stopped.push(id);
      return 1;
    },
  };
}

/** @type {ReturnType<typeof fakeTextures>} */ let textures;
/** @type {ReturnType<typeof fakeAudio>} */ let audio;
/** @type {AssetManager} */ let assets;

beforeEach(() => {
  textures = fakeTextures();
  audio = fakeAudio();
  assets = new AssetManager({ textures, audio });
});

describe('loading', () => {
  it('routes textures and sounds to their subsystems', async () => {
    await assets.loadManifest({
      textures: { player: 'player.png' },
      sounds: { jump: 'jump.ogg' },
    });

    expect(textures.loaded).toEqual(['player=player.png']);
    expect(audio.loaded).toEqual(['jump=jump.ogg']);
  });

  it('tracks what has been loaded', async () => {
    await assets.loadManifest({ textures: { a: 'a.png', b: 'b.png' } });
    expect(assets.has('a')).toBe(true);
    expect(assets.has('nope')).toBe(false);
    expect(assets.stats()).toEqual({ assets: 2, textures: 2, sounds: 0 });
  });

  it('accepts an empty manifest', async () => {
    await expect(assets.loadManifest({})).resolves.toBeUndefined();
  });
});

describe('base URL resolution', () => {
  it('prefixes relative URLs', async () => {
    const prefixed = new AssetManager({ textures, baseUrl: '/assets' });
    await prefixed.loadManifest({ textures: { a: 'sprites/a.png' } });
    expect(textures.loaded).toEqual(['a=/assets/sprites/a.png']);
  });

  it('leaves absolute URLs alone', async () => {
    const prefixed = new AssetManager({ textures, baseUrl: '/assets' });
    await prefixed.loadManifest({
      textures: { a: 'https://cdn.example.com/a.png', b: '/root.png' },
    });
    expect(textures.loaded).toContain('a=https://cdn.example.com/a.png');
    expect(textures.loaded).toContain('b=/root.png');
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const prefixed = new AssetManager({ textures, baseUrl: '/assets/' });
    await prefixed.loadManifest({ textures: { a: 'a.png' } });
    expect(textures.loaded).toEqual(['a=/assets/a.png']);
  });
});

describe('reference counting', () => {
  const manifest = { textures: { shared: 'shared.png' } };

  it('counts a reference per load', async () => {
    await assets.loadManifest(manifest);
    expect(assets.referencesTo('shared')).toBe(1);

    await assets.loadManifest(manifest);
    expect(assets.referencesTo('shared')).toBe(2);
  });

  it('does not unload while another reference remains', async () => {
    await assets.loadManifest(manifest);
    await assets.loadManifest(manifest);

    expect(assets.releaseManifest(manifest)).toBe(0);
    expect(textures.unloaded).toEqual([]);
    expect(assets.referencesTo('shared')).toBe(1);
  });

  it('unloads when the last reference goes', async () => {
    await assets.loadManifest(manifest);
    await assets.loadManifest(manifest);
    assets.releaseManifest(manifest);

    expect(assets.releaseManifest(manifest)).toBe(1);
    expect(textures.unloaded).toEqual(['shared']);
    expect(assets.has('shared')).toBe(false);
  });

  it('stops sounds when their last reference goes', async () => {
    const sounds = { sounds: { music: 'music.ogg' } };
    await assets.loadManifest(sounds);
    assets.releaseManifest(sounds);
    expect(audio.stopped).toEqual(['music']);
  });

  it('releasing something never loaded is a no-op', () => {
    expect(assets.releaseManifest({ textures: { ghost: 'ghost.png' } })).toBe(0);
  });

  it('does not let the count go negative', async () => {
    await assets.loadManifest(manifest);
    assets.releaseManifest(manifest);
    assets.releaseManifest(manifest);
    expect(assets.referencesTo('shared')).toBe(0);
  });
});

describe('clear', () => {
  it('unloads everything regardless of reference count', async () => {
    const manifest = { textures: { a: 'a.png' }, sounds: { b: 'b.ogg' } };
    await assets.loadManifest(manifest);
    await assets.loadManifest(manifest);

    assets.clear();

    expect(assets.stats().assets).toBe(0);
    expect(textures.unloaded).toEqual(['a']);
    expect(audio.stopped).toEqual(['b']);
  });
});

describe('missing subsystems', () => {
  it('tracks references with no subsystems attached', async () => {
    const bare = new AssetManager();
    await bare.loadManifest({ textures: { a: 'a.png' } });
    expect(bare.referencesTo('a')).toBe(1);
    expect(() => bare.releaseManifest({ textures: { a: 'a.png' } })).not.toThrow();
  });
});
