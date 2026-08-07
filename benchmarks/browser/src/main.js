import { DrawList, Camera2D, Canvas2DRenderer, WebGL2Renderer, TextureCache } from '@novaforge/renderer';

/**
 * Real, in-browser Canvas2D-vs-WebGL2 numbers (Milestone 6). This is intentionally simple: for
 * a fixed number of sprites, build the exact same `DrawList` once, then hand it to each backend
 * repeatedly and time how long `submit()` takes. Both backends see identical input — same
 * commands, same sort order, same camera — so the only variable is the backend itself, which is
 * the whole point of Invariant R1 (both consume the identical draw list).
 *
 * Runs headless via Playwright (`benchmarks/run-browser.mjs`); there is no interactivity here,
 * only measurement.
 */

const SPRITE_COUNTS = [500, 2000, 8000];
const WARMUP_FRAMES = 20;
const MEASURED_FRAMES = 120;
const TEXTURE_COUNT = 8; // several textures, so batching by texture-run is actually exercised

/** @returns {HTMLCanvasElement} a small solid-colour texture. */
function makeTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 32, 32);
  return canvas;
}

/**
 * @param {DrawList} drawList
 * @param {number} count
 * @param {string[]} textureIds
 */
function buildScene(drawList, count, textureIds) {
  drawList.clear();
  const columns = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i += 1) {
    const texture = textureIds[i % textureIds.length];
    drawList.sprite({
      texture,
      x: (i % columns) * 24,
      y: Math.floor(i / columns) * 24,
      width: 20,
      height: 20,
      rotation: (i % 360) * (Math.PI / 180),
      layer: 0,
      z: 0,
    });
  }
  drawList.sort();
}

/**
 * @param {import('@novaforge/renderer').Renderer} renderer
 * @param {DrawList} drawList
 * @param {Camera2D} camera
 * @param {number} frames
 * @returns {{ fps: number, avgFrameMs: number, drawCalls: number }}
 */
function measure(renderer, drawList, camera, frames) {
  for (let i = 0; i < WARMUP_FRAMES; i += 1) {
    renderer.beginFrame();
    renderer.submit(drawList, camera);
    renderer.endFrame();
  }

  const start = performance.now();
  let drawCalls = 0;
  for (let i = 0; i < frames; i += 1) {
    renderer.beginFrame();
    renderer.submit(drawList, camera);
    renderer.endFrame();
    drawCalls = renderer.drawCalls;
  }
  const elapsed = performance.now() - start;
  const avgFrameMs = elapsed / frames;
  return { fps: 1000 / avgFrameMs, avgFrameMs, drawCalls };
}

async function run() {
  const textures = new TextureCache();
  const textureIds = [];
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];
  for (let i = 0; i < TEXTURE_COUNT; i += 1) {
    const id = `tex-${i}`;
    textures.set(id, makeTexture(colors[i]));
    textureIds.push(id);
  }

  const camera = new Camera2D({ viewportWidth: 1280, viewportHeight: 720 });
  const drawList = new DrawList();

  const canvas2dEl = /** @type {HTMLCanvasElement} */ (document.getElementById('canvas2d'));
  const webgl2El = /** @type {HTMLCanvasElement} */ (document.getElementById('webgl2'));
  const canvas2d = new Canvas2DRenderer(canvas2dEl, { textures });
  const webgl2 = new WebGL2Renderer(webgl2El, { textures });

  /** @type {Record<string, unknown>} */
  const results = {
    userAgent: navigator.userAgent,
    capturedAt: new Date().toISOString(),
    warmupFrames: WARMUP_FRAMES,
    measuredFrames: MEASURED_FRAMES,
    runs: [],
  };

  for (const count of SPRITE_COUNTS) {
    buildScene(drawList, count, textureIds);

    const canvas2dResult = measure(canvas2d, drawList, camera, MEASURED_FRAMES);
    const webgl2Result = measure(webgl2, drawList, camera, MEASURED_FRAMES);

    results.runs.push({
      sprites: count,
      canvas2d: canvas2dResult,
      webgl2: webgl2Result,
      webgl2SpeedupVsCanvas2d: canvas2dResult.avgFrameMs / webgl2Result.avgFrameMs,
    });
  }

  document.getElementById('output').textContent = JSON.stringify(results, null, 2);
  window.__BENCH_RESULTS__ = results;
  window.__BENCH_DONE__ = true;
}

run().catch((error) => {
  document.getElementById('output').textContent = `error: ${error.stack}`;
  window.__BENCH_ERROR__ = String(error.stack ?? error);
  window.__BENCH_DONE__ = true;
});
