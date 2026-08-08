import { MAGENTA, toCssColor } from './color.js';

/**
 * Loads and caches images by asset id.
 *
 * Textures are addressed by **id**, never by URL, at the point of use (SPEC §11). A sprite
 * component says `texture: 'player'`; the mapping from `'player'` to `assets/player.png` lives
 * in a manifest. That indirection is what will let the editor swap a file on disk without
 * touching a single component.
 *
 * Invariant A1: a missing texture resolves to a magenta placeholder and logs once. A game that
 * dies on a typo'd filename cannot be edited live.
 */
export class TextureCache {
  constructor() {
    /**
     * @type {Map<string, CanvasImageSource>}
     * @private
     */
    this._textures = new Map();

    /**
     * In-flight loads, so two sprites requesting the same texture on the same frame share one
     * network request.
     * @type {Map<string, Promise<CanvasImageSource>>}
     * @private
     */
    this._loading = new Map();

    /** @type {Set<string>} @private */
    this._warned = new Set();

    /** @type {CanvasImageSource | null} @private */
    this._placeholder = null;
  }

  /** @returns {number} how many textures are resident. */
  get size() {
    return this._textures.size;
  }

  /**
   * Load a texture and register it under `id`.
   *
   * A failed load resolves rather than rejects, storing the placeholder. One broken asset path
   * must not fail the whole `Promise.all` of a scene's preload.
   *
   * @param {string} id
   * @param {string} url
   * @returns {Promise<CanvasImageSource>}
   */
  load(id, url) {
    const existing = this._textures.get(id);
    if (existing !== undefined) return Promise.resolve(existing);

    const inFlight = this._loading.get(id);
    if (inFlight !== undefined) return inFlight;

    const promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this._textures.set(id, image);
        this._loading.delete(id);
        resolve(image);
      };
      image.onerror = () => {
        console.warn(`TextureCache: failed to load "${id}" from ${url}; using the placeholder`);
        const placeholder = this.placeholder();
        this._textures.set(id, placeholder);
        this._loading.delete(id);
        resolve(placeholder);
      };
      image.src = url;
    });

    this._loading.set(id, promise);
    return promise;
  }

  /**
   * Load a whole manifest at once.
   * @param {Record<string, string>} manifest id to URL
   * @returns {Promise<void>}
   */
  async loadAll(manifest) {
    await Promise.all(Object.entries(manifest).map(([id, url]) => this.load(id, url)));
  }

  /**
   * Register an already-constructed image — a generated texture, a canvas, an atlas page.
   * @param {string} id
   * @param {CanvasImageSource} image
   * @returns {void}
   */
  set(id, image) {
    this._textures.set(id, image);
  }

  /**
   * @param {string} id
   * @returns {CanvasImageSource | null} the texture, or the placeholder if it is missing.
   *   Never throws: this is called once per sprite per frame, and a throw here would take
   *   down the frame over a typo.
   */
  get(id) {
    const texture = this._textures.get(id);
    if (texture !== undefined) return texture;

    if (!this._warned.has(id)) {
      this._warned.add(id);
      console.warn(`TextureCache: "${id}" was never loaded; drawing the placeholder`);
    }
    return this.placeholder();
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._textures.has(id);
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  unload(id) {
    return this._textures.delete(id);
  }

  /** Drop every texture. */
  clear() {
    this._textures.clear();
    this._warned.clear();
  }

  /**
   * The missing-texture placeholder: a magenta and black checkerboard, built once and shared.
   *
   * Magenta because nothing in a real game is ever this colour by accident, and a checkerboard
   * because a flat fill can be mistaken for an intentional coloured rectangle.
   *
   * @returns {CanvasImageSource}
   */
  placeholder() {
    if (this._placeholder !== null) return this._placeholder;

    const size = 32;
    const canvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : /** @type {any} */ (new globalThis.OffscreenCanvas(size, size));
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      ctx.fillStyle = toCssColor(MAGENTA);
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size / 2, size / 2);
      ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
    }

    this._placeholder = canvas;
    return canvas;
  }
}
