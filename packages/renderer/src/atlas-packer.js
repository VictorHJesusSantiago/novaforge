import { TextureAtlas } from './atlas.js';

/**
 * Packing loose images into one atlas texture — the half of "texture atlas support" that was
 * still missing: `TextureAtlas` *consumes* a packed layout (a TexturePacker JSON file, or a
 * regular grid); this is what *produces* one from a set of differently-sized images with no
 * pre-existing layout at all.
 *
 * Split the same way every other piece of geometry in this codebase is: {@link packRects} is
 * pure — ids and sizes in, placements out — and fully unit tested with no canvas involved;
 * {@link packTextures} is the thin, deliberately-untested browser layer that decodes that
 * layout onto a real `<canvas>`.
 */

/**
 * @typedef {object} PackedRect
 * @property {string} id
 * @property {number} width
 * @property {number} height
 *
 * @typedef {object} PackResult
 * @property {number} width the atlas width — always exactly `maxWidth`, so every packed atlas
 *   from the same call site is byte-for-byte reproducible regardless of which rects happened to
 *   be packed
 * @property {number} height the atlas height — the minimum needed to fit everything
 * @property {Map<string, { x: number, y: number, width: number, height: number }>} placements
 */

/**
 * Shelf packing: sort tallest-first, then lay rects left to right, starting a new row ("shelf")
 * whenever the current one would overflow `maxWidth`. Not space-optimal — a true bin-packer
 * (guillotine, maxrects) would pack tighter — but it is O(n log n), simple enough to read in one
 * sitting, and close enough to optimal for the sprite-sheet-sized batches (tens to a few hundred
 * images) this engine's assets actually come in.
 *
 * @param {PackedRect[]} rects
 * @param {object} [options]
 * @param {number} [options.maxWidth] the atlas width every packed rect must fit within
 * @param {number} [options.padding] pixels of empty space kept around every rect, so bilinear
 *   filtering at a texture's edge does not sample a neighbouring sprite's pixels ("bleeding")
 * @returns {PackResult}
 * @throws {RangeError} if a rect is wider than `maxWidth` (it could never fit on any shelf) or
 *   if two rects share an id (an atlas cannot have two frames with the same name).
 */
export function packRects(rects, options = {}) {
  const maxWidth = options.maxWidth ?? 1024;
  const padding = options.padding ?? 1;

  if (rects.length === 0) {
    return { width: 0, height: 0, placements: new Map() };
  }

  const seen = new Set();
  for (const rect of rects) {
    if (seen.has(rect.id)) {
      throw new RangeError(`packRects: duplicate id "${rect.id}"`);
    }
    seen.add(rect.id);
  }

  const sorted = [...rects].sort((a, b) => b.height - a.height);

  /** @type {Map<string, { x: number, y: number, width: number, height: number }>} */
  const placements = new Map();

  let cursorX = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  for (const rect of sorted) {
    const paddedWidth = rect.width + padding;
    if (paddedWidth > maxWidth) {
      throw new RangeError(
        `packRects: "${rect.id}" is ${rect.width}px wide, which does not fit within maxWidth ${maxWidth}`,
      );
    }

    if (cursorX > 0 && cursorX + paddedWidth > maxWidth) {
      shelfY += shelfHeight;
      cursorX = 0;
      shelfHeight = 0;
    }

    placements.set(rect.id, { x: cursorX, y: shelfY, width: rect.width, height: rect.height });
    cursorX += paddedWidth;
    shelfHeight = Math.max(shelfHeight, rect.height + padding);
  }

  return { width: maxWidth, height: shelfY + shelfHeight, placements };
}

/**
 * @returns {number} the fraction of the atlas's area actually covered by rects, for judging how
 *   much a packing wasted. `1` is perfect; shelf packing typically lands around 0.6–0.85
 *   depending on how uniform the input sizes are.
 * @param {PackResult} result
 * @param {PackedRect[]} rects the same rects that were passed to {@link packRects}
 */
export function packingEfficiency(result, rects) {
  if (result.width === 0 || result.height === 0) return 0;
  const used = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  return used / (result.width * result.height);
}

/**
 * Pack a set of already-decoded images onto one canvas and build the `TextureAtlas` describing
 * it — the browser-only half. Not unit tested at this layer for the same reason
 * `Canvas2DRenderer`'s draw methods are not: it is a thin, direct translation of already-tested
 * geometry (`packRects`) onto a real canvas, and verifying that translation needs a real 2D
 * context that Node does not have.
 *
 * @param {string} textureId the id the packed canvas will be registered under, e.g. via
 *   `textureCache.set(textureId, canvas)`
 * @param {Array<{ id: string, image: CanvasImageSource & { width: number, height: number } }>} images
 * @param {object} [options]
 * @param {number} [options.maxWidth]
 * @param {number} [options.padding]
 * @returns {{ canvas: HTMLCanvasElement, atlas: TextureAtlas, efficiency: number }}
 */
export function packTextures(textureId, images, options = {}) {
  const rects = images.map(({ id, image }) => ({ id, width: image.width, height: image.height }));
  const result = packRects(rects, options);

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext('2d');

  /** @type {Record<string, { x: number, y: number, width: number, height: number }>} */
  const frames = {};
  for (const { id, image } of images) {
    const placement = /** @type {{ x: number, y: number, width: number, height: number }} */ (
      result.placements.get(id)
    );
    frames[id] = placement;
    ctx?.drawImage(/** @type {CanvasImageSource} */ (image), placement.x, placement.y);
  }

  return {
    canvas,
    atlas: new TextureAtlas(textureId, frames),
    efficiency: packingEfficiency(result, rects),
  };
}
