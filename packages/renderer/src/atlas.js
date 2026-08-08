/**
 * Sprite atlases.
 *
 * An atlas is a texture plus a named lookup of sub-rectangles within it. It exists so that a
 * `Sprite`'s `source` field — a plain `{x, y, width, height}` already understood by
 * {@link import('./draw-list.js').DrawList#sprite} — can be looked up by a human-readable frame
 * name instead of hand-computed pixel offsets, and so an {@link import('./animation.js').Animation}
 * can be defined as a list of names rather than a list of rectangles.
 *
 * The manifest format is deliberately the common "TexturePacker JSON (array)" shape, because it
 * is what every free atlas packer already exports — this is a consumer, not a new format.
 *
 * ```json
 * {
 *   "frames": {
 *     "walk_0": { "frame": { "x": 0, "y": 0, "w": 16, "h": 16 } },
 *     "walk_1": { "frame": { "x": 16, "y": 0, "w": 16, "h": 16 } }
 *   }
 * }
 * ```
 */
export class TextureAtlas {
  /**
   * @param {string} texture the texture id this atlas indexes into
   * @param {Record<string, { x: number, y: number, width: number, height: number }>} frames
   */
  constructor(texture, frames) {
    /** @type {string} */
    this.texture = texture;

    /** @type {Map<string, { x: number, y: number, width: number, height: number }>} */
    this.frames = new Map(Object.entries(frames));
  }

  /**
   * Parse a TexturePacker-style JSON manifest.
   *
   * @param {string} texture the texture id this atlas indexes into
   * @param {any} manifest parsed JSON, `{ frames: { name: { frame: {x,y,w,h} } } }` — typed
   *   `any` deliberately: this is externally sourced data whose shape is validated below at
   *   runtime, not something a static type can vouch for.
   * @returns {TextureAtlas}
   * @throws {Error} if the manifest has no `frames` object — a malformed atlas file should fail
   *   at load time, not produce an atlas that silently has zero frames.
   */
  static fromJSON(texture, manifest) {
    if (manifest === null || typeof manifest !== 'object' || typeof manifest.frames !== 'object') {
      throw new Error('TextureAtlas.fromJSON: manifest is missing a "frames" object');
    }

    /** @type {Record<string, { x: number, y: number, width: number, height: number }>} */
    const frames = {};
    for (const [name, entry] of Object.entries(manifest.frames)) {
      const rect = /** @type {any} */ (entry).frame;
      if (rect === undefined) {
        throw new Error(`TextureAtlas.fromJSON: frame "${name}" is missing a "frame" rect`);
      }
      frames[name] = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
    }

    return new TextureAtlas(texture, frames);
  }

  /**
   * Build an atlas over a regular pixel grid — the common case for a hand-drawn sprite sheet
   * that was never run through a packer. Frames are named `row_column` from the top-left.
   *
   * @param {string} texture
   * @param {object} options
   * @param {number} options.frameWidth
   * @param {number} options.frameHeight
   * @param {number} options.columns
   * @param {number} options.rows
   * @param {number} [options.marginX] gap between columns
   * @param {number} [options.marginY] gap between rows
   * @param {number} [options.offsetX] top-left of the grid within the texture
   * @param {number} [options.offsetY]
   * @returns {TextureAtlas}
   */
  static fromGrid(texture, options) {
    const {
      frameWidth,
      frameHeight,
      columns,
      rows,
      marginX = 0,
      marginY = 0,
      offsetX = 0,
      offsetY = 0,
    } = options;

    /** @type {Record<string, { x: number, y: number, width: number, height: number }>} */
    const frames = {};
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        frames[`${row}_${column}`] = {
          x: offsetX + column * (frameWidth + marginX),
          y: offsetY + row * (frameHeight + marginY),
          width: frameWidth,
          height: frameHeight,
        };
      }
    }
    return new TextureAtlas(texture, frames);
  }

  /**
   * @param {string} name
   * @returns {{ x: number, y: number, width: number, height: number } | undefined}
   */
  frame(name) {
    return this.frames.get(name);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.frames.has(name);
  }

  /** @returns {string[]} every frame name, in insertion order. */
  frameNames() {
    return Array.from(this.frames.keys());
  }

  /** @returns {number} */
  get frameCount() {
    return this.frames.size;
  }
}

/**
 * A registry of atlases by id, so a `Sprite`'s frame can be resolved as `(atlasId, frameName)`
 * without every system that draws sprites needing a direct reference to the atlas.
 */
export class AtlasRegistry {
  constructor() {
    /** @type {Map<string, TextureAtlas>} @private */
    this._atlases = new Map();
  }

  /**
   * @param {string} id
   * @param {TextureAtlas} atlas
   * @returns {void}
   */
  register(id, atlas) {
    this._atlases.set(id, atlas);
  }

  /**
   * @param {string} id
   * @returns {TextureAtlas | undefined}
   */
  get(id) {
    return this._atlases.get(id);
  }

  /**
   * Resolve a frame directly to a source rect, the shape `DrawList.sprite` wants.
   * @param {string} atlasId
   * @param {string} frameName
   * @returns {{ x: number, y: number, width: number, height: number } | null}
   */
  resolve(atlasId, frameName) {
    return this._atlases.get(atlasId)?.frame(frameName) ?? null;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._atlases.has(id);
  }

  /** @returns {void} */
  clear() {
    this._atlases.clear();
  }
}
