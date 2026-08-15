import { WHITE } from './color.js';

/**
 * Command kinds. Numeric rather than string so the sort comparator stays integer-only.
 * @readonly
 * @enum {number}
 */
export const DrawKind = {
  SPRITE: 0,
  RECT: 1,
  CIRCLE: 2,
  LINE: 3,
  TEXT: 4,
};

/**
 * The buffer between the simulation and the screen (SPEC §8).
 *
 * Render systems append commands; a backend consumes them. Two design points carry the weight:
 *
 * **Sort key `(layer, z, textureId)`.** Texture comes last so that runs of the same texture end
 * up adjacent, which is what lets the future WebGL2 backend collapse them into one batched draw
 * call. Sorting by texture *first* would be faster to batch but would break layering, which is
 * not negotiable in a 2D engine.
 *
 * **Command pooling.** The list is cleared and refilled every frame. Rather than allocating a
 * fresh object per sprite — thousands per frame, straight into the nursery — commands are
 * reused in place and only the tail grows.
 */
export class DrawList {
  constructor() {
    /**
     * Pooled command objects. `_length` is the live count; entries beyond it are stale and must
     * never be read.
     * @type {any[]}
     * @private
     */
    this._pool = [];

    /** @type {number} @private */
    this._length = 0;

    /**
     * Texture name to dense integer id, so the sort comparator compares numbers rather than
     * strings.
     * @type {Map<string, number>}
     * @private
     */
    this._textureIds = new Map();

    /** @type {number} @private */
    this._nextTextureId = 1;

    /** Commands discarded by the camera cull this frame — shown in the debug overlay. */
    this.culled = 0;
  }

  /** @returns {number} live command count. */
  get length() {
    return this._length;
  }

  /**
   * @param {string} name
   * @returns {number} a stable integer id for a texture name.
   * @private
   */
  _textureId(name) {
    if (name === '') return 0;
    let id = this._textureIds.get(name);
    if (id === undefined) {
      id = this._nextTextureId;
      this._nextTextureId += 1;
      this._textureIds.set(name, id);
    }
    return id;
  }

  /**
   * Take the next pooled command, growing the pool only when the frame is busier than any
   * previous one.
   * @returns {any}
   * @private
   */
  _next() {
    let command = this._pool[this._length];
    if (command === undefined) {
      command = {
        kind: DrawKind.SPRITE,
        layer: 0,
        z: 0,
        textureId: 0,
        texture: '',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        width: 0,
        height: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: 0,
        sourceHeight: 0,
        tint: WHITE,
        alpha: 1,
        filled: true,
        lineWidth: 1,
        radius: 0,
        x2: 0,
        y2: 0,
        text: '',
        font: '16px sans-serif',
        align: 'center',
      };
      this._pool[this._length] = command;
    }
    this._length += 1;
    return command;
  }

  /**
   * Append a textured sprite.
   * @param {object} options
   * @param {string} options.texture asset id
   * @param {number} options.x world x
   * @param {number} options.y world y
   * @param {number} options.width
   * @param {number} options.height
   * @param {number} [options.rotation] radians
   * @param {number} [options.scaleX]
   * @param {number} [options.scaleY]
   * @param {number} [options.anchorX] 0 = left edge, 0.5 = centre, 1 = right edge
   * @param {number} [options.anchorY]
   * @param {number} [options.layer]
   * @param {number} [options.z]
   * @param {number} [options.tint] packed 0xRRGGBB
   * @param {number} [options.alpha]
   * @param {{ x: number, y: number, width: number, height: number } | null} [options.source]
   *   sub-rectangle of the texture, for atlases and sprite sheets
   * @returns {void}
   */
  sprite(options) {
    const c = this._next();
    c.kind = DrawKind.SPRITE;
    c.texture = options.texture;
    c.textureId = this._textureId(options.texture);
    c.x = options.x;
    c.y = options.y;
    c.width = options.width;
    c.height = options.height;
    c.rotation = options.rotation ?? 0;
    c.scaleX = options.scaleX ?? 1;
    c.scaleY = options.scaleY ?? 1;
    c.anchorX = options.anchorX ?? 0.5;
    c.anchorY = options.anchorY ?? 0.5;
    c.layer = options.layer ?? 0;
    c.z = options.z ?? 0;
    c.tint = options.tint ?? WHITE;
    c.alpha = options.alpha ?? 1;

    const source = options.source ?? null;
    if (source === null) {
      c.sourceWidth = 0;
      c.sourceHeight = 0;
      c.sourceX = 0;
      c.sourceY = 0;
    } else {
      c.sourceX = source.x;
      c.sourceY = source.y;
      c.sourceWidth = source.width;
      c.sourceHeight = source.height;
    }
  }

  /**
   * Append an untextured rectangle.
   * @param {object} options
   * @param {number} options.x
   * @param {number} options.y
   * @param {number} options.width
   * @param {number} options.height
   * @param {number} [options.rotation]
   * @param {number} [options.anchorX]
   * @param {number} [options.anchorY]
   * @param {number} [options.layer]
   * @param {number} [options.z]
   * @param {number} [options.tint]
   * @param {number} [options.alpha]
   * @param {boolean} [options.filled]
   * @param {number} [options.lineWidth]
   * @returns {void}
   */
  rect(options) {
    const c = this._next();
    c.kind = DrawKind.RECT;
    c.textureId = 0;
    c.texture = '';
    c.x = options.x;
    c.y = options.y;
    c.width = options.width;
    c.height = options.height;
    c.rotation = options.rotation ?? 0;
    c.anchorX = options.anchorX ?? 0.5;
    c.anchorY = options.anchorY ?? 0.5;
    c.layer = options.layer ?? 0;
    c.z = options.z ?? 0;
    c.tint = options.tint ?? WHITE;
    c.alpha = options.alpha ?? 1;
    c.filled = options.filled ?? true;
    c.lineWidth = options.lineWidth ?? 1;
  }

  /**
   * @param {object} options
   * @param {number} options.x
   * @param {number} options.y
   * @param {number} options.radius
   * @param {number} [options.layer]
   * @param {number} [options.z]
   * @param {number} [options.tint]
   * @param {number} [options.alpha]
   * @param {boolean} [options.filled]
   * @param {number} [options.lineWidth]
   * @returns {void}
   */
  circle(options) {
    const c = this._next();
    c.kind = DrawKind.CIRCLE;
    c.textureId = 0;
    c.texture = '';
    c.x = options.x;
    c.y = options.y;
    c.radius = options.radius;
    c.layer = options.layer ?? 0;
    c.z = options.z ?? 0;
    c.tint = options.tint ?? WHITE;
    c.alpha = options.alpha ?? 1;
    c.filled = options.filled ?? true;
    c.lineWidth = options.lineWidth ?? 1;
  }

  /**
   * @param {object} options
   * @param {number} options.x
   * @param {number} options.y
   * @param {number} options.x2
   * @param {number} options.y2
   * @param {number} [options.layer]
   * @param {number} [options.z]
   * @param {number} [options.tint]
   * @param {number} [options.alpha]
   * @param {number} [options.lineWidth]
   * @returns {void}
   */
  line(options) {
    const c = this._next();
    c.kind = DrawKind.LINE;
    c.textureId = 0;
    c.texture = '';
    c.x = options.x;
    c.y = options.y;
    c.x2 = options.x2;
    c.y2 = options.y2;
    c.layer = options.layer ?? 0;
    c.z = options.z ?? 0;
    c.tint = options.tint ?? WHITE;
    c.alpha = options.alpha ?? 1;
    c.lineWidth = options.lineWidth ?? 1;
  }

  /**
   * @param {object} options
   * @param {string} options.text
   * @param {number} options.x
   * @param {number} options.y
   * @param {string} [options.font] CSS font shorthand
   * @param {'left'|'center'|'right'} [options.align]
   * @param {number} [options.layer]
   * @param {number} [options.z]
   * @param {number} [options.tint]
   * @param {number} [options.alpha]
   * @returns {void}
   */
  text(options) {
    const c = this._next();
    c.kind = DrawKind.TEXT;
    c.textureId = 0;
    c.texture = '';
    c.text = options.text;
    c.x = options.x;
    c.y = options.y;
    c.font = options.font ?? '16px sans-serif';
    c.align = options.align ?? 'center';
    c.layer = options.layer ?? 0;
    c.z = options.z ?? 0;
    c.tint = options.tint ?? WHITE;
    c.alpha = options.alpha ?? 1;
  }

  /**
   * Sort into draw order: layer, then z, then texture.
   *
   * The live commands are extracted, sorted, and written back, so the pooled objects beyond
   * `_length` stay where they are and the pool does not churn.
   * @returns {void}
   */
  sort() {
    if (this._length < 2) return;
    const live = this._pool.slice(0, this._length);
    live.sort(compareCommands);
    for (let i = 0; i < this._length; i += 1) {
      this._pool[i] = live[i];
    }
  }

  /**
   * Drop every command whose position falls outside `bounds`.
   *
   * Deliberately conservative: it tests the command's origin expanded by its size, not its true
   * rotated bounds. A rotated sprite can therefore survive slightly past the edge, which costs
   * one wasted draw. The opposite error — culling something still visible — produces sprites
   * popping out at the screen edge, which is far worse.
   *
   * @param {import('@novaforge/math').AABB} bounds world-space visible region
   * @returns {number} how many commands were discarded.
   */
  cull(bounds) {
    let write = 0;
    let dropped = 0;
    for (let read = 0; read < this._length; read += 1) {
      const c = this._pool[read];
      if (isVisible(c, bounds)) {
        if (write !== read) {
          const temp = this._pool[write];
          this._pool[write] = c;
          this._pool[read] = temp;
        }
        write += 1;
      } else {
        dropped += 1;
      }
    }
    this._length = write;
    this.culled = dropped;
    return dropped;
  }

  /**
   * Reset for the next frame. Keeps the pool and the texture id table.
   * @returns {void}
   */
  clear() {
    this._length = 0;
    this.culled = 0;
  }

  /**
   * @param {number} index
   * @returns {any} the command at `index`.
   * @throws {RangeError} past the live length — reading a stale pooled command silently draws
   *   last frame's sprite, which is a genuinely confusing bug.
   */
  at(index) {
    if (index < 0 || index >= this._length) {
      throw new RangeError(`DrawList.at: ${index} is outside 0..${this._length - 1}`);
    }
    return this._pool[index];
  }

  /** @returns {IterableIterator<any>} the live commands, in current order. */
  *[Symbol.iterator]() {
    for (let i = 0; i < this._length; i += 1) {
      yield this._pool[i];
    }
  }

  /** @returns {any[]} a plain array copy of the live commands. For tests and debugging. */
  toArray() {
    return this._pool.slice(0, this._length);
  }

  /**
   * @returns {{ commands: number, culled: number, pooled: number, textures: number }}
   */
  stats() {
    return {
      commands: this._length,
      culled: this.culled,
      pooled: this._pool.length,
      textures: this._textureIds.size,
    };
  }
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function compareCommands(a, b) {
  if (a.layer !== b.layer) return a.layer - b.layer;
  if (a.z !== b.z) return a.z - b.z;
  return a.textureId - b.textureId;
}

/**
 * @param {any} c
 * @param {import('@novaforge/math').AABB} bounds
 * @returns {boolean}
 */
function isVisible(c, bounds) {
  let halfW;
  let halfH;
  switch (c.kind) {
    case DrawKind.CIRCLE:
      halfW = c.radius;
      halfH = c.radius;
      break;
    case DrawKind.LINE:
      return (
        Math.min(c.x, c.x2) <= bounds.maxX &&
        Math.max(c.x, c.x2) >= bounds.minX &&
        Math.min(c.y, c.y2) <= bounds.maxY &&
        Math.max(c.y, c.y2) >= bounds.minY
      );
    case DrawKind.TEXT:
      // A generous fixed margin is the pragmatic choice.
      halfW = 256;
      halfH = 64;
      break;
    default:
      halfW = (Math.abs(c.width * c.scaleX) / 2) * Math.SQRT2;
      halfH = (Math.abs(c.height * c.scaleY) / 2) * Math.SQRT2;
  }
  return (
    c.x + halfW >= bounds.minX &&
    c.x - halfW <= bounds.maxX &&
    c.y + halfH >= bounds.minY &&
    c.y - halfH <= bounds.maxY
  );
}
