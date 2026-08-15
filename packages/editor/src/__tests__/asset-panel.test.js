/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextureCache } from '@novaforge/renderer';
import { AssetPanel } from '../asset-panel.js';

/**
 * jsdom does not implement real image decoding or Blob object URLs, so both are stubbed for
 * this file: `Image` fires `onload` on the next microtask instead of actually decoding bytes,
 * and `URL.createObjectURL`/`revokeObjectURL` become simple counted stand-ins. What is under
 * test is the panel's own logic — which id it loads a file under, that it calls
 * `TextureCache.set`, that it revokes the *previous* URL and not the new one — none of which
 * depends on real image bytes.
 */

let nextUrl = 0;
/** @type {ReturnType<typeof vi.fn>} */ let createObjectURL;
/** @type {ReturnType<typeof vi.fn>} */ let revokeObjectURL;
/** @type {typeof Image} */ let realImage;

beforeEach(() => {
  nextUrl = 0;
  createObjectURL = vi.fn(() => `blob:fake-${nextUrl++}`);
  revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

  realImage = globalThis.Image;
  /** @type {any} */
  class FakeImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
    }

    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.Image = realImage;
});

/** @param {string} name @returns {File} */
function imageFile(name) {
  return new File(['fake-bytes'], name, { type: 'image/png' });
}

describe('loadFile', () => {
  it('registers the decoded image under the given id', async () => {
    const textures = new TextureCache();
    const panel = new AssetPanel(document.createElement('div'), textures);

    await panel.loadFile('hero', imageFile('hero.png'));

    expect(textures.has('hero')).toBe(true);
  });

  it('creates an object URL for the file', async () => {
    const textures = new TextureCache();
    const panel = new AssetPanel(document.createElement('div'), textures);

    await panel.loadFile('hero', imageFile('hero.png'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('reloading the same id overwrites the resident texture', async () => {
    const textures = new TextureCache();
    const panel = new AssetPanel(document.createElement('div'), textures);

    await panel.loadFile('hero', imageFile('hero-v1.png'));
    const first = textures.get('hero');
    await panel.loadFile('hero', imageFile('hero-v2.png'));
    const second = textures.get('hero');

    expect(second).not.toBe(first);
  });

  it('revokes the previous object URL on reload, not the new one', async () => {
    const textures = new TextureCache();
    const panel = new AssetPanel(document.createElement('div'), textures);

    await panel.loadFile('hero', imageFile('v1.png'));
    const firstUrl = createObjectURL.mock.results[0].value;
    await panel.loadFile('hero', imageFile('v2.png'));

    expect(revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does not revoke anything on a first load', async () => {
    const textures = new TextureCache();
    const panel = new AssetPanel(document.createElement('div'), textures);
    await panel.loadFile('hero', imageFile('hero.png'));
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('drop handling', () => {
  /** @param {File[]} files @returns {DragEvent} */
  function dropEvent(files) {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    return /** @type {DragEvent} */ (event);
  }

  it('loads every dropped image, ided by filename without extension', async () => {
    const textures = new TextureCache();
    const container = document.createElement('div');
    new AssetPanel(container, textures);

    container.dispatchEvent(dropEvent([imageFile('player.png'), imageFile('enemy.png')]));
    await flushMicrotasks();

    expect(textures.has('player')).toBe(true);
    expect(textures.has('enemy')).toBe(true);
  });

  it('ignores non-image files in the drop', async () => {
    const textures = new TextureCache();
    const container = document.createElement('div');
    new AssetPanel(container, textures);

    const textFile = new File(['{}'], 'data.json', { type: 'application/json' });
    container.dispatchEvent(dropEvent([textFile]));
    await flushMicrotasks();

    expect(textures.has('data')).toBe(false);
  });

  it('prevents the browser default (navigating to the file) on drop and dragover', () => {
    const container = document.createElement('div');
    new AssetPanel(container, new TextureCache());

    const drop = dropEvent([]);
    const preventDefault = vi.spyOn(drop, 'preventDefault');
    container.dispatchEvent(drop);
    expect(preventDefault).toHaveBeenCalled();
  });
});

describe('refresh', () => {
  it('lists every loaded asset id', async () => {
    const textures = new TextureCache();
    const container = document.createElement('div');
    const panel = new AssetPanel(container, textures);

    await panel.loadFile('hero', imageFile('hero.png'));

    const labels = Array.from(container.querySelectorAll('.nf-asset-panel__item span')).map((s) => s.textContent);
    expect(labels).toEqual(['hero']);
  });
});

/** A minimal AudioMixer stand-in recording what it was asked to load and play. */
function fakeAudio(loadResult = true) {
  return {
    loaded: /** @type {string[]} */ ([]),
    played: /** @type {string[]} */ ([]),
    async load(id, _url) {
      this.loaded.push(id);
      return loadResult;
    },
    play(id) {
      this.played.push(id);
    },
  };
}

/** @param {string} name @returns {File} */
function soundFile(name) {
  return new File(['fake-bytes'], name, { type: 'audio/wav' });
}

describe('sound files', () => {
  it('routes an audio file to the mixer, not the texture cache', async () => {
    const textures = new TextureCache();
    const audio = fakeAudio();
    const panel = new AssetPanel(document.createElement('div'), textures, /** @type {any} */ (audio));

    await panel.loadFile('jump', soundFile('jump.wav'));

    expect(audio.loaded).toEqual(['jump']);
    expect(textures.has('jump')).toBe(false);
  });

  it('throws when no AudioMixer is attached', async () => {
    const panel = new AssetPanel(document.createElement('div'), new TextureCache(), null);
    await expect(panel.loadFile('jump', soundFile('jump.wav'))).rejects.toThrow(/AudioMixer/);
  });

  it('throws when no TextureCache is attached', async () => {
    const panel = new AssetPanel(document.createElement('div'), null, /** @type {any} */ (fakeAudio()));
    await expect(panel.loadFile('hero', imageFile('hero.png'))).rejects.toThrow(/TextureCache/);
  });

  it('rejects when the mixer fails to decode the sound', async () => {
    const audio = fakeAudio(false);
    const panel = new AssetPanel(document.createElement('div'), new TextureCache(), /** @type {any} */ (audio));
    await expect(panel.loadFile('bad', soundFile('bad.wav'))).rejects.toThrow(/decode/);
  });

  it('renders a play-preview button for a loaded sound', async () => {
    const audio = fakeAudio();
    const container = document.createElement('div');
    const panel = new AssetPanel(container, new TextureCache(), /** @type {any} */ (audio));
    await panel.loadFile('jump', soundFile('jump.wav'));

    const button = /** @type {HTMLButtonElement} */ (container.querySelector('.nf-asset-panel__sound-icon'));
    expect(button).not.toBeNull();
    button.click();
    expect(audio.played).toEqual(['jump']);
  });

  it('drop handling accepts both image and audio files together', async () => {
    const textures = new TextureCache();
    const audio = fakeAudio();
    const container = document.createElement('div');
    new AssetPanel(container, textures, /** @type {any} */ (audio));

    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [imageFile('hero.png'), soundFile('jump.wav')] },
    });
    container.dispatchEvent(event);
    await flushMicrotasks();

    expect(textures.has('hero')).toBe(true);
    expect(audio.loaded).toEqual(['jump']);
  });
});

describe('dispose', () => {
  it('revokes every remaining object URL', async () => {
    const textures = new TextureCache();
    const container = document.createElement('div');
    const panel = new AssetPanel(container, textures);
    await panel.loadFile('hero', imageFile('hero.png'));

    panel.dispose();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

/** Wait for pending microtasks (the fake Image's onload) to settle. */
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
