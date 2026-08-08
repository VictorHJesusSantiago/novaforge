/**
 * The pure, DOM-free half of the post-processing chain (Milestone 6): deciding, for a chain of
 * N passes, which texture each pass reads from and which framebuffer it writes to. Kept apart
 * from `PostProcessChain` (`postprocess.js`) for the same reason `webgl2-batch.js` is kept apart
 * from `WebGL2Renderer` — this is the part a bug actually lives in (read from the texture you're
 * about to write into and every driver either errors or gives you undefined pixels), and it is
 * fully testable with no GL context at all.
 *
 * Ping-ponging between exactly two intermediate targets, indices `0` and `1`, is enough for any
 * chain length: a pass never needs more than "the thing the previous pass just wrote," so two
 * buffers alternating is sufficient regardless of how many passes run.
 */

/**
 * @typedef {'scene' | 0 | 1 | 'output'} PostProcessSlot
 * `'scene'` is the renderer's off-screen scene target (the untouched, pre-effects render).
 * `0`/`1` are the two ping-pong intermediate targets. `'output'` is the default framebuffer
 * (the visible canvas) — only ever a write target, never read from.
 */

/**
 * @typedef {{ input: PostProcessSlot, output: PostProcessSlot }} PostProcessStep
 */

/**
 * @param {number} passCount must be >= 1
 * @returns {PostProcessStep[]} one step per pass, in the order the passes run
 */
export function computePostProcessPlan(passCount) {
  if (!Number.isInteger(passCount) || passCount < 1) {
    throw new Error(`computePostProcessPlan: passCount must be a positive integer, got ${passCount}`);
  }

  /** @type {PostProcessStep[]} */
  const steps = [];
  for (let i = 0; i < passCount; i += 1) {
    const input = i === 0 ? 'scene' : /** @type {0 | 1} */ ((i - 1) % 2);
    const output = i === passCount - 1 ? 'output' : /** @type {0 | 1} */ (i % 2);
    steps.push({ input, output });
  }
  return steps;
}

/**
 * Six vertices (two triangles), position and UV interleaved, covering clip space `[-1, 1]` with
 * UV `[0, 1]` — the quad every post-process fragment shader runs across. A pure array so it can
 * be asserted on directly; the GL glue just uploads it once and never touches it again.
 * @returns {Float32Array}
 */
export function fullscreenQuadVertices() {
  // x, y, u, v
  return new Float32Array([
    -1, -1, 0, 0,
    1, -1, 1, 0,
    1, 1, 1, 1,
    -1, -1, 0, 0,
    1, 1, 1, 1,
    -1, 1, 0, 1,
  ]);
}
