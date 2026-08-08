import { Renderer } from './renderer.js';
import { DrawKind } from './draw-list.js';
import {
  ATTRIBUTE_STRIDE,
  worldToClipMatrix,
  buildBatchVertices,
  groupByTexture,
} from './webgl2-batch.js';
import { channels } from './color.js';
import { RenderTarget } from './render-target.js';
import { PostProcessChain } from './postprocess.js';

const VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;
layout(location = 3) in float aShapeMode;

uniform mat3 uWorldToClip;

out vec2 vUV;
out vec4 vColor;
flat out float vShapeMode;

void main() {
  vec3 clip = uWorldToClip * vec3(aPosition, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vUV = aUV;
  vColor = aColor;
  vShapeMode = aShapeMode;
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision mediump float;

in vec2 vUV;
in vec4 vColor;
flat in float vShapeMode;

uniform sampler2D uTexture;

out vec4 outColor;

void main() {
  // shapeMode 1 is a circle: UV spans [0,1] across the quad, so [-1,1] from the centre is the
  // unit disc. Discarding outside it is what turns a textured quad into a circle with no extra
  // geometry and no separate shader program.
  if (vShapeMode > 0.5) {
    vec2 centred = vUV * 2.0 - 1.0;
    if (dot(centred, centred) > 1.0) discard;
  }

  outColor = texture(uTexture, vUV) * vColor;
  if (outColor.a <= 0.0) discard;
}
`;

/**
 * The WebGL2 backend (ADR-0003, Milestone 6).
 *
 * Consumes the identical `DrawList` the Canvas2D backend does — same commands, same sort order —
 * and is what proves the draw-list abstraction is real rather than decorative (Invariant R1).
 * Where Canvas2D issues one `drawImage` per command, this backend issues **one draw call per
 * run of same-texture commands**, because the draw list is already sorted with texture as the
 * last sort key (SPEC §8): consecutive commands sharing a texture are already adjacent, so
 * batching them is a linear scan, not a re-sort.
 *
 * **Scope, stated plainly.** Sprites, rects, circles and lines are rasterised through one shader
 * — a textured quad, with circles cut out via a fragment-shader distance test (see
 * `webgl2-batch.js`). `TEXT` commands are not: a real glyph pipeline (font atlas, metrics,
 * kerning) is a project on its own, and forcing one in here to reach "WebGL renders everything"
 * would be exactly the kind of feature Invariant R1 exists to prevent — the temptation to give
 * one backend a capability the other cannot express is real, but this cuts the other way: it is
 * Canvas2D's simplicity that let text ship in Milestone 2, and vector-drawn WebGL2 text is not
 * worth blocking Milestone 6 on. Instead, an optional **overlay canvas** — a second, transparent
 * `<canvas>` stacked on top via CSS — draws text through the ordinary 2D API. This is a standard
 * technique (it is how most WebGL 2D games and editors handle text) and it is opt-in: omit
 * `textOverlay` and text commands are simply skipped, silently, the same way a missing texture
 * degrades rather than crashes (Invariant A1's spirit, applied to a missing capability instead
 * of a missing asset).
 */
export class WebGL2Renderer extends Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {import('./texture-cache.js').TextureCache} [options.textures]
   * @param {number} [options.backgroundColor] packed 0xRRGGBB
   * @param {number} [options.pixelRatio]
   * @param {CanvasRenderingContext2D | null} [options.textOverlay] a 2D context from a second
   *   canvas, CSS-stacked over `canvas`, used only for `TEXT` commands. See the class doc.
   * @param {Array<{ effect: string, uniforms?: Record<string, number | [number, number]> }>} [options.postProcess]
   *   a chain of full-screen effects (`postprocess.js`'s `POSTPROCESS_EFFECTS`) run on the
   *   finished frame before it reaches the canvas. Omit for the old, direct-to-backbuffer path
   *   with no extra off-screen render — this is opt-in because an unused render target is a real
   *   cost (Milestone 6's "render targets and a post-processing chain").
   */
  constructor(canvas, options = {}) {
    super();

    const gl = canvas.getContext('webgl2');
    if (gl === null) {
      throw new Error('WebGL2Renderer: could not acquire a webgl2 context');
    }

    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {WebGL2RenderingContext} */
    this.gl = gl;

    /** @type {import('./texture-cache.js').TextureCache | null} */
    this.textures = options.textures ?? null;

    /** @type {number} */
    this.backgroundColor = options.backgroundColor ?? 0x101014;

    /** @type {CanvasRenderingContext2D | null} */
    this.textOverlay = options.textOverlay ?? null;

    /** @type {boolean} @private */
    this._warnedNoOverlay = false;

    /** @type {number} */
    this.pixelRatio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2);

    /** @type {WebGLProgram} @private */
    this._program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);

    /** @type {WebGLVertexArrayObject} @private */
    this._vao = /** @type {WebGLVertexArrayObject} */ (gl.createVertexArray());
    /** @type {WebGLBuffer} @private */
    this._vbo = /** @type {WebGLBuffer} */ (gl.createBuffer());

    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    const stride = ATTRIBUTE_STRIDE * 4; // 4 bytes per float
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0); // position
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4); // uv
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * 4); // color
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8 * 4); // shapeMode
    gl.bindVertexArray(null);

    /** @type {WebGLUniformLocation | null} @private */
    this._worldToClipLocation = gl.getUniformLocation(this._program, 'uWorldToClip');
    /** @type {WebGLUniformLocation | null} @private */
    this._textureLocation = gl.getUniformLocation(this._program, 'uTexture');

    /**
     * A 1x1 opaque white texture, bound for untextured commands (rects, circles, lines) so
     * they run through the same `texture(uTexture, uv) * vColor` shader path as sprites —
     * one shader, not two.
     * @type {WebGLTexture} @private
     */
    this._whiteTexture = createSolidTexture(gl, 255, 255, 255, 255);

    /**
     * GL textures uploaded for each asset texture id, keyed by the id `DrawList` assigns.
     * Rebuilt lazily as sprites reference new textures; never evicted here — the texture cache
     * owns the source images' lifetime, this is a thin GPU-side mirror.
     * @type {Map<number, { texture: WebGLTexture, width: number, height: number }>}
     * @private
     */
    this._gpuTextures = new Map();

    /**
     * The off-screen target the scene renders into when post-processing is active, and the
     * chain that consumes it. Both `null` when `options.postProcess` is omitted — `submit()`
     * branches on that, not on an empty array, so passing `[]` explicitly still allocates the
     * scene target (useful for toggling effects on and off at runtime without reallocating).
     * @type {RenderTarget | null} @private
     */
    this._sceneTarget = null;
    /** @type {PostProcessChain | null} @private */
    this._postProcess =
      options.postProcess === undefined ? null : new PostProcessChain(gl, options.postProcess);
    if (this._postProcess !== null) {
      this._sceneTarget = new RenderTarget(gl, canvas.width || 1, canvas.height || 1);
    }

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
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    this._sceneTarget?.resize(this.canvas.width, this.canvas.height);
    this._postProcess?.resize(this.canvas.width, this.canvas.height);

    if (this.textOverlay !== null) {
      const overlayCanvas = this.textOverlay.canvas;
      overlayCanvas.width = Math.round(width * this.pixelRatio);
      overlayCanvas.height = Math.round(height * this.pixelRatio);
      overlayCanvas.style.width = `${width}px`;
      overlayCanvas.style.height = `${height}px`;
    }
  }

  /** @returns {void} */
  beginFrame() {
    const gl = this.gl;
    this.drawCalls = 0;

    // Render into the off-screen scene target when post-processing is active, so the chain has
    // an untouched frame to read from; otherwise draw straight to the backbuffer as before.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._sceneTarget?.framebuffer ?? null);

    const { r, g, b } = channels(this.backgroundColor);
    gl.clearColor(r / 255, g / 255, b / 255, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.textOverlay !== null) {
      this.textOverlay.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      this.textOverlay.clearRect(0, 0, this.width, this.height);
    }
  }

  /**
   * @param {import('./draw-list.js').DrawList} drawList
   * @param {import('./camera.js').Camera2D} camera
   * @returns {void}
   */
  submit(drawList, camera) {
    const gl = this.gl;
    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);

    const worldToClip = worldToClipMatrix(camera, this.width, this.height);
    gl.uniformMatrix3fv(this._worldToClipLocation, false, worldToClip.m);
    gl.uniform1i(this._textureLocation, 0);
    gl.activeTexture(gl.TEXTURE0);

    const runs = groupByTexture(drawList);
    for (const run of runs) {
      const gpuTexture = this._resolveTexture(run.textureId, run.texture);
      gl.bindTexture(gl.TEXTURE_2D, gpuTexture?.texture ?? this._whiteTexture);

      const vertices = buildBatchVertices(run.commands, gpuTexture);
      if (vertices.length === 0) continue;

      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / ATTRIBUTE_STRIDE);
      this.drawCalls += 1;
    }

    gl.bindVertexArray(null);

    this._submitText(drawList);
  }

  /**
   * @param {import('./draw-list.js').DrawList} drawList
   * @private
   */
  _submitText(drawList) {
    let hasText = false;
    for (const command of drawList) {
      if (command.kind === DrawKind.TEXT) {
        hasText = true;
        break;
      }
    }
    if (!hasText) return;

    if (this.textOverlay === null) {
      if (!this._warnedNoOverlay) {
        this._warnedNoOverlay = true;
        console.warn(
          'WebGL2Renderer: the scene has TextLabel entities but no textOverlay was configured; ' +
            'text will not be drawn. Pass a second, CSS-stacked canvas as options.textOverlay.',
        );
      }
      return;
    }

    const ctx = this.textOverlay;
    for (const command of drawList) {
      if (command.kind !== DrawKind.TEXT) continue;
      ctx.save();
      ctx.globalAlpha = command.alpha;
      ctx.fillStyle = toCss(command.tint);
      ctx.font = command.font;
      ctx.textAlign = command.align;
      ctx.textBaseline = 'middle';
      ctx.fillText(command.text, command.x, command.y);
      ctx.restore();
    }
  }

  /** @returns {void} */
  endFrame() {
    if (this._postProcess === null || this._sceneTarget === null) return;
    // Runs the configured effect chain, reading the just-rendered scene texture and writing the
    // result to the backbuffer — the one step that has to happen after `submit()`, since it's
    // the scene texture's contents it depends on.
    this._postProcess.run(this._sceneTarget.texture, this.canvas.width, this.canvas.height);
  }

  /**
   * @param {number} textureId
   * @param {string} textureName
   * @returns {{ texture: WebGLTexture, width: number, height: number } | undefined}
   * @private
   */
  _resolveTexture(textureId, textureName) {
    if (textureId === 0) return undefined; // untextured command; the white pixel is used

    const cached = this._gpuTextures.get(textureId);
    if (cached !== undefined) return cached;

    const image = this.textures?.get(textureName);
    if (image === null || image === undefined) return undefined;

    const uploaded = uploadTexture(this.gl, /** @type {any} */ (image));
    this._gpuTextures.set(textureId, uploaded);
    return uploaded;
  }

  /** @returns {void} */
  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this._program);
    gl.deleteBuffer(this._vbo);
    gl.deleteVertexArray(this._vao);
    gl.deleteTexture(this._whiteTexture);
    for (const { texture } of this._gpuTextures.values()) gl.deleteTexture(texture);
    this._gpuTextures.clear();
    this._sceneTarget?.dispose();
    this._postProcess?.dispose();
  }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} source
 * @param {number} type
 * @returns {WebGLShader}
 */
function compileShader(gl, source, type) {
  const shader = /** @type {WebGLShader} */ (gl.createShader(type));
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL2Renderer: shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} vertexSource
 * @param {string} fragmentSource
 * @returns {WebGLProgram}
 */
function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);

  const program = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // Shaders are flagged for deletion but stay alive until the program using them is deleted —
  // this just means the caller does not have to track and delete them separately.
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL2Renderer: program failed to link: ${log}`);
  }

  return program;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @param {number} a 0-255
 * @returns {WebGLTexture}
 */
function createSolidTexture(gl, r, g, b, a) {
  const texture = /** @type {WebGLTexture} */ (gl.createTexture());
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([r, g, b, a]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {TexImageSource & { width: number, height: number }} image
 * @returns {{ texture: WebGLTexture, width: number, height: number }}
 */
function uploadTexture(gl, image) {
  const texture = /** @type {WebGLTexture} */ (gl.createTexture());
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { texture, width: image.width, height: image.height };
}

/**
 * @param {number} packedColor
 * @returns {string}
 */
function toCss(packedColor) {
  return `#${packedColor.toString(16).padStart(6, '0')}`;
}
