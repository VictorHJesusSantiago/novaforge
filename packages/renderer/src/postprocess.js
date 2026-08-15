import { RenderTarget } from './render-target.js';
import { computePostProcessPlan, fullscreenQuadVertices } from './postprocess-plan.js';

const QUAD_VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUV;

out vec2 vUV;

void main() {
  vUV = aUV;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Every built-in fragment shader receives the same two uniforms — `uTexture` (the previous
 * pass's output) and `uTexel` (`1 / size` of that texture, for effects that sample neighbours) —
 * plus whatever the effect itself declares. Keeping the interface identical means `PostProcessChain`
 * never needs to know which effect it is running.
 */
const EFFECTS = {
  /** Desaturate toward luminance, `uAmount` 0 (none) to 1 (full grayscale). */
  grayscale: `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform float uAmount;
out vec4 outColor;
void main() {
  vec4 c = texture(uTexture, vUV);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  outColor = vec4(mix(c.rgb, vec3(luma), uAmount), c.a);
}
`,

  /** Darken toward the frame edges. `uRadius` where falloff starts, `uSoftness` how gradual. */
  vignette: `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform float uRadius;
uniform float uSoftness;
out vec4 outColor;
void main() {
  vec4 c = texture(uTexture, vUV);
  float d = distance(vUV, vec2(0.5));
  float falloff = 1.0 - smoothstep(uRadius, uRadius + uSoftness, d);
  outColor = vec4(c.rgb * falloff, c.a);
}
`,

  /**
   * A single-direction box blur; two passes (one `uDirection` of `(1,0)`, one `(0,1)`) make a
   * separable Gaussian-ish blur, which is the standard way to keep a screen-space blur affordable
   * — an NxN kernel run separably is `2N` texture samples per pixel instead of `N^2`.
   */
  blur: `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;
out vec4 outColor;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  const int TAPS = 4;
  for (int i = -TAPS; i <= TAPS; i++) {
    float weight = float(TAPS + 1 - abs(i));
    vec2 offset = uTexel * uDirection * float(i) * uRadius;
    sum += texture(uTexture, vUV + offset) * weight;
    total += weight;
  }
  outColor = sum / total;
}
`,

  /** Splits the red/blue channels apart along `uDirection`, scaled by `uAmount`. */
  chromaticAberration: `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uAmount;
out vec4 outColor;
void main() {
  vec2 offset = uTexel * uDirection * uAmount;
  float r = texture(uTexture, vUV + offset).r;
  float g = texture(uTexture, vUV).g;
  float b = texture(uTexture, vUV - offset).b;
  float a = texture(uTexture, vUV).a;
  outColor = vec4(r, g, b, a);
}
`,
};

/** Names of the built-in effects `PostProcessChain` accepts by string. */
export const POSTPROCESS_EFFECTS = Object.keys(EFFECTS);

/**
 * A chain of full-screen shader passes applied to the rendered scene before it reaches the
 * screen (Milestone 6's "render targets and a post-processing chain"). `WebGL2Renderer` renders
 * into an off-screen `RenderTarget` instead of the backbuffer whenever a chain is attached, then
 * hands that texture to `chain.run(...)`.
 *
 * The pass order and which of the two ping-pong buffers each pass reads/writes is decided by
 * `computePostProcessPlan` (`postprocess-plan.js`), not recomputed here — this class is GL glue
 * over that plan, kept deliberately untested per this package's established split between pure
 * logic and browser glue (see `webgl2-batch.js`'s doc for the same reasoning applied to the base
 * renderer).
 */
export class PostProcessChain {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {Array<{ effect: string, uniforms?: Record<string, number | [number, number]> }>} passes
   *   `effect` must be one of `POSTPROCESS_EFFECTS`; empty array is valid — `run()` then just
   *   blits the scene texture through unchanged
   */
  constructor(gl, passes) {
    /** @type {WebGL2RenderingContext} @private */
    this._gl = gl;
    /** @type {Array<{ effect: string, uniforms: Record<string, number | [number, number]> }>} */
    this.passes = passes.map((p) => ({ effect: p.effect, uniforms: p.uniforms ?? {} }));

    /** @type {WebGLVertexArrayObject} @private */
    this._vao = /** @type {WebGLVertexArrayObject} */ (gl.createVertexArray());
    /** @type {WebGLBuffer} @private */
    this._vbo = /** @type {WebGLBuffer} */ (gl.createBuffer());
    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, fullscreenQuadVertices(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
    gl.bindVertexArray(null);

    /** One compiled program per distinct effect used, shared across passes using the same effect. */
    const programs = new Map();
    for (const effectName of new Set(this.passes.map((p) => p.effect))) {
      const source = EFFECTS[/** @type {keyof typeof EFFECTS} */ (effectName)];
      if (source === undefined) {
        throw new Error(
          `PostProcessChain: unknown effect "${effectName}", expected one of ${POSTPROCESS_EFFECTS.join(', ')}`,
        );
      }
      programs.set(effectName, createProgram(gl, QUAD_VERTEX_SOURCE, source));
    }
    /** @type {Map<string, WebGLProgram>} @private */
    this._programs = programs;

    /** @type {[RenderTarget, RenderTarget] | null} @private set on first {@link resize} */
    this._pingPong = null;

    /** @type {WebGLProgram | undefined} @private the pass-through program used by {@link _blit} */
    this._blitProgram = undefined;
  }

  /**
   * @param {number} width pixels
   * @param {number} height pixels
   * @returns {void}
   */
  resize(width, height) {
    if (this._pingPong === null) {
      this._pingPong = [
        new RenderTarget(this._gl, width, height),
        new RenderTarget(this._gl, width, height),
      ];
    } else {
      this._pingPong[0].resize(width, height);
      this._pingPong[1].resize(width, height);
    }
  }

  /**
   * Run every pass, reading from `sceneTexture` and writing the final result to the default
   * framebuffer (the visible canvas). Ping-pongs through the two intermediate targets per the
   * plan from `computePostProcessPlan` — see that function's doc for why two buffers suffice for
   * any chain length.
   * @param {WebGLTexture} sceneTexture the renderer's off-screen scene render
   * @param {number} sceneWidth
   * @param {number} sceneHeight
   * @returns {void}
   */
  run(sceneTexture, sceneWidth, sceneHeight) {
    const gl = this._gl;
    if (this.passes.length === 0) {
      this._blit(sceneTexture, null, sceneWidth, sceneHeight);
      return;
    }

    if (this._pingPong === null) this.resize(sceneWidth, sceneHeight);
    const [a, b] = /** @type {[RenderTarget, RenderTarget]} */ (this._pingPong);
    /** @type {Record<0 | 1, RenderTarget>} */
    const targets = { 0: a, 1: b };
    const plan = computePostProcessPlan(this.passes.length);

    gl.bindVertexArray(this._vao);

    for (let i = 0; i < plan.length; i += 1) {
      const { input, output } = plan[i];
      const pass = this.passes[i];
      const program = /** @type {WebGLProgram} */ (this._programs.get(pass.effect));

      const inputTexture = input === 'scene' ? sceneTexture : targets[/** @type {0 | 1} */ (input)].texture;
      const outputFramebuffer =
        output === 'output' ? null : targets[/** @type {0 | 1} */ (output)].framebuffer;

      gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
      gl.viewport(0, 0, sceneWidth, sceneHeight);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'uTexel'), 1 / sceneWidth, 1 / sceneHeight);
      for (const [name, value] of Object.entries(pass.uniforms)) {
        const location = gl.getUniformLocation(program, name);
        if (Array.isArray(value)) gl.uniform2f(location, value[0], value[1]);
        else gl.uniform1f(location, value);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
  }

  /**
   * Copy a texture to a framebuffer unchanged, via a trivial pass-through program — used when
   * the chain has zero configured passes, so `WebGL2Renderer` can always render into a scene
   * target and call `chain.run(...)` unconditionally rather than branching on "is there a chain."
   * @param {WebGLTexture} texture
   * @param {WebGLFramebuffer | null} framebuffer
   * @param {number} width
   * @param {number} height
   * @private
   */
  _blit(texture, framebuffer, width, height) {
    const gl = this._gl;
    if (this._blitProgram === undefined) {
      this._blitProgram = createProgram(gl, QUAD_VERTEX_SOURCE, EFFECTS.grayscale);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this._blitProgram);
    gl.bindVertexArray(this._vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(this._blitProgram, 'uTexture'), 0);
    gl.uniform1f(gl.getUniformLocation(this._blitProgram, 'uAmount'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  /** @returns {void} */
  dispose() {
    const gl = this._gl;
    for (const program of this._programs.values()) gl.deleteProgram(program);
    if (this._blitProgram !== undefined) gl.deleteProgram(this._blitProgram);
    gl.deleteBuffer(this._vbo);
    gl.deleteVertexArray(this._vao);
    if (this._pingPong !== null) {
      this._pingPong[0].dispose();
      this._pingPong[1].dispose();
    }
  }
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
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`PostProcessChain: program failed to link: ${log}`);
  }
  return program;
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
    throw new Error(`PostProcessChain: shader failed to compile: ${log}`);
  }
  return shader;
}
