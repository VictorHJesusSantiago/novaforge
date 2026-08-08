import { Renderer } from './renderer.js';
import { DrawKind } from './draw-list.js';
import { toCssColor } from './color.js';

/**
 * The Canvas2D backend (ADR-0003).
 *
 * Deliberately unambitious: one `drawImage` or one path per command, no batching, no shaders.
 * Its job is to make Milestones 2 through 5 possible without the risk of a WebGL2 renderer
 * blocking everything else, and to prove the draw list abstraction by being the first of two
 * implementations rather than the only one.
 *
 * It does not use `ctx.filter`, arbitrary clip paths, or composite modes, even where Canvas2D
 * would make them free — anything not expressible in the draw list is off limits (Invariant R1).
 */
export class Canvas2DRenderer extends Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {import('./texture-cache.js').TextureCache} [options.textures]
   * @param {number} [options.backgroundColor] packed 0xRRGGBB
   * @param {number} [options.pixelRatio] defaults to the device ratio, capped at 2
   * @param {boolean} [options.smoothing] false gives crisp pixel art
   */
  constructor(canvas, options = {}) {
    super();

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Canvas2DRenderer: could not acquire a 2d context');
    }

    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {CanvasRenderingContext2D} */
    this.ctx = context;

    /** @type {import('./texture-cache.js').TextureCache | null} */
    this.textures = options.textures ?? null;

    /** @type {number} */
    this.backgroundColor = options.backgroundColor ?? 0x101014;

    /**
     * Capped at 2: beyond that the fill-rate cost grows quadratically for a difference almost
     * nobody can see, and a 3x phone display will happily tank the frame rate.
     * @type {number}
     */
    this.pixelRatio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2);

    /** @type {boolean} */
    this.smoothing = options.smoothing ?? true;

    this.resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
  }

  /**
   * @param {number} width CSS pixels
   * @param {number} height CSS pixels
   * @returns {void}
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    // The backing store is in device pixels; the CSS size stays in layout pixels. Setting only
    // one of the two is the reason canvases so often look blurry.
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.imageSmoothingEnabled = this.smoothing;
  }

  /** @returns {void} */
  beginFrame() {
    const ctx = this.ctx;
    this.drawCalls = 0;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = toCssColor(this.backgroundColor);
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * @param {import('./draw-list.js').DrawList} drawList
   * @param {import('./camera.js').Camera2D} camera
   * @returns {void}
   */
  submit(drawList, camera) {
    const ctx = this.ctx;

    ctx.save();
    // Camera transform, applied once for the whole list rather than per command.
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.rotate(-camera.rotation);
    ctx.translate(-camera.position.x, -camera.position.y);

    for (const command of drawList) {
      switch (command.kind) {
        case DrawKind.SPRITE:
          this._drawSprite(command);
          break;
        case DrawKind.RECT:
          this._drawRect(command);
          break;
        case DrawKind.CIRCLE:
          this._drawCircle(command);
          break;
        case DrawKind.LINE:
          this._drawLine(command);
          break;
        case DrawKind.TEXT:
          this._drawText(command);
          break;
        default:
          break;
      }
      this.drawCalls += 1;
    }

    ctx.restore();
  }

  /** @returns {void} */
  endFrame() {
    // Canvas2D presents implicitly at the end of the task; nothing to flush.
  }

  /**
   * @param {any} c
   * @private
   */
  _drawSprite(c) {
    const image = this.textures?.get(c.texture);
    if (image === null || image === undefined) return;

    const ctx = this.ctx;
    const width = c.width * c.scaleX;
    const height = c.height * c.scaleY;
    const offsetX = -width * c.anchorX;
    const offsetY = -height * c.anchorY;

    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.translate(c.x, c.y);
    if (c.rotation !== 0) ctx.rotate(c.rotation);

    if (c.sourceWidth > 0 && c.sourceHeight > 0) {
      ctx.drawImage(
        image,
        c.sourceX,
        c.sourceY,
        c.sourceWidth,
        c.sourceHeight,
        offsetX,
        offsetY,
        width,
        height,
      );
    } else {
      ctx.drawImage(image, offsetX, offsetY, width, height);
    }

    ctx.restore();
  }

  /**
   * @param {any} c
   * @private
   */
  _drawRect(c) {
    const ctx = this.ctx;
    const offsetX = -c.width * c.anchorX;
    const offsetY = -c.height * c.anchorY;

    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.translate(c.x, c.y);
    if (c.rotation !== 0) ctx.rotate(c.rotation);

    if (c.filled) {
      ctx.fillStyle = toCssColor(c.tint);
      ctx.fillRect(offsetX, offsetY, c.width, c.height);
    } else {
      ctx.strokeStyle = toCssColor(c.tint);
      ctx.lineWidth = c.lineWidth;
      ctx.strokeRect(offsetX, offsetY, c.width, c.height);
    }

    ctx.restore();
  }

  /**
   * @param {any} c
   * @private
   */
  _drawCircle(c) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);

    if (c.filled) {
      ctx.fillStyle = toCssColor(c.tint);
      ctx.fill();
    } else {
      ctx.strokeStyle = toCssColor(c.tint);
      ctx.lineWidth = c.lineWidth;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * @param {any} c
   * @private
   */
  _drawLine(c) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.strokeStyle = toCssColor(c.tint);
    ctx.lineWidth = c.lineWidth;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x2, c.y2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * @param {any} c
   * @private
   */
  _drawText(c) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = toCssColor(c.tint);
    ctx.font = c.font;
    ctx.textAlign = c.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, c.x, c.y);
    ctx.restore();
  }
}
