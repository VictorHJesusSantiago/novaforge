/** Resource key under which the world's `AssetManager` is registered. */
export const ASSETS_RESOURCE = 'assets';

/**
 * Reference-counted asset loading (SPEC §11).
 *
 * Assets are addressed by **id**; the manifest maps id to URL. Nothing in gameplay code ever
 * names a file path, which is what will let the editor hot-swap a texture at runtime.
 *
 * Reference counting rather than "unload everything on scene change": two levels that share a
 * tileset should not re-decode it on every transition, and a scene that unloads a shared asset
 * out from under another is a class of bug that only appears once a second scene exists.
 */
export class AssetManager {
  /**
   * @param {object} [options]
   * @param {import('@novaforge/renderer').TextureCache} [options.textures]
   * @param {import('@novaforge/audio').AudioMixer} [options.audio]
   * @param {string} [options.baseUrl] prefixed onto every relative URL in a manifest
   */
  constructor(options = {}) {
    /** @type {any} */
    this.textures = options.textures ?? null;

    /** @type {any} */
    this.audio = options.audio ?? null;

    /** @type {string} */
    this.baseUrl = options.baseUrl ?? '';

    /**
     * id -> live references.
     * @type {Map<string, number>}
     * @private
     */
    this._refs = new Map();

    /**
     * id -> kind, so release knows which subsystem owns it.
     * @type {Map<string, 'texture'|'sound'>}
     * @private
     */
    this._kinds = new Map();

    /** @type {number} */
    this.loadedCount = 0;
  }

  /**
   * Load a manifest, taking a reference on each asset.
   *
   * @param {{ textures?: Record<string, string>, sounds?: Record<string, string> }} manifest
   * @returns {Promise<void>}
   */
  async loadManifest(manifest) {
    /** @type {Promise<unknown>[]} */
    const pending = [];

    for (const [id, url] of Object.entries(manifest.textures ?? {})) {
      this._retain(id, 'texture');
      if (this.textures !== null) pending.push(this.textures.load(id, this._resolve(url)));
    }

    for (const [id, url] of Object.entries(manifest.sounds ?? {})) {
      this._retain(id, 'sound');
      if (this.audio !== null) pending.push(this.audio.load(id, this._resolve(url)));
    }

    await Promise.all(pending);
    this.loadedCount = this._refs.size;
  }

  /**
   * Drop one reference per asset in a manifest, unloading anything that reaches zero.
   * @param {{ textures?: Record<string, string>, sounds?: Record<string, string> }} manifest
   * @returns {number} how many assets were actually unloaded.
   */
  releaseManifest(manifest) {
    let unloaded = 0;
    for (const id of Object.keys(manifest.textures ?? {})) {
      if (this._release(id)) unloaded += 1;
    }
    for (const id of Object.keys(manifest.sounds ?? {})) {
      if (this._release(id)) unloaded += 1;
    }
    this.loadedCount = this._refs.size;
    return unloaded;
  }

  /**
   * @param {string} id
   * @returns {number} live references, 0 if unknown.
   */
  referencesTo(id) {
    return this._refs.get(id) ?? 0;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._refs.has(id);
  }

  /**
   * @param {string} id
   * @param {'texture'|'sound'} kind
   * @private
   */
  _retain(id, kind) {
    this._refs.set(id, (this._refs.get(id) ?? 0) + 1);
    this._kinds.set(id, kind);
  }

  /**
   * @param {string} id
   * @returns {boolean} true if this call unloaded the asset.
   * @private
   */
  _release(id) {
    const count = this._refs.get(id);
    if (count === undefined) return false;

    if (count > 1) {
      this._refs.set(id, count - 1);
      return false;
    }

    this._refs.delete(id);
    const kind = this._kinds.get(id);
    this._kinds.delete(id);

    if (kind === 'texture') this.textures?.unload(id);
    else if (kind === 'sound') this.audio?.stopAllOf(id);

    return true;
  }

  /**
   * @param {string} url
   * @returns {string}
   * @private
   */
  _resolve(url) {
    if (this.baseUrl === '' || /^(https?:)?\/\//.test(url) || url.startsWith('/')) return url;
    return `${this.baseUrl.replace(/\/$/, '')}/${url}`;
  }

  /** Drop every reference and unload everything. @returns {void} */
  clear() {
    for (const id of Array.from(this._refs.keys())) {
      this._refs.set(id, 1);
      this._release(id);
    }
    this._refs.clear();
    this._kinds.clear();
    this.loadedCount = 0;
  }

  /** @returns {{ assets: number, textures: number, sounds: number }} */
  stats() {
    let textures = 0;
    let sounds = 0;
    for (const kind of this._kinds.values()) {
      if (kind === 'texture') textures += 1;
      else sounds += 1;
    }
    return { assets: this._refs.size, textures, sounds };
  }
}
