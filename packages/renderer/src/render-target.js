/**
 * An off-screen colour target: a texture plus the framebuffer that renders into it. Two things
 * use this — `WebGL2Renderer` renders the scene into one instead of the backbuffer whenever a
 * post-process chain is attached, and `PostProcessChain` (`postprocess.js`) uses a pair of them
 * to ping-pong between passes. Deliberately untested GL glue, same as the rest of this file's
 * siblings (`webgl2-renderer.js`, `texture-cache.js`'s upload path) — see `postprocess-plan.js`
 * for the part of this feature that *is* tested.
 */
export class RenderTarget {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} width pixels
   * @param {number} height pixels
   */
  constructor(gl, width, height) {
    /** @type {WebGL2RenderingContext} @private */
    this._gl = gl;
    /** @type {number} */
    this.width = width;
    /** @type {number} */
    this.height = height;

    /** @type {WebGLTexture} */
    this.texture = /** @type {WebGLTexture} */ (gl.createTexture());
    /** @type {WebGLFramebuffer} */
    this.framebuffer = /** @type {WebGLFramebuffer} */ (gl.createFramebuffer());

    this._allocate(width, height);
  }

  /**
   * @param {number} width
   * @param {number} height
   * @private
   */
  _allocate(width, height) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Resize in place — reallocates the texture storage, keeping the same GL object identities so
   * nothing holding a reference to `.texture`/`.framebuffer` needs to be told about a resize.
   * @param {number} width
   * @param {number} height
   * @returns {void}
   */
  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this._allocate(width, height);
  }

  /** @returns {void} */
  dispose() {
    const gl = this._gl;
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.framebuffer);
  }
}
