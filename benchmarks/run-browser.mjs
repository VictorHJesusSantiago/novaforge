#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/**
 * Drives `benchmarks/browser` in a real, headless Chromium via Playwright and captures its
 * Canvas2D-vs-WebGL2 timings — the one item on the roadmap that specifically needs a browser
 * rather than Node, so it lives as its own script instead of folding into `benchmarks/run.js`.
 *
 * Caveat, stated plainly rather than left implicit: this is *software* rendering. Headless
 * Chromium's WebGL2 context runs on SwiftShader (a CPU rasteriser), not a real GPU driver, in
 * this environment — there is no GPU to hand it. The numbers below are therefore a genuine,
 * reproducible, in-browser measurement of the two code paths, not a claim about GPU speedup you
 * would see on real hardware. What *is* portable from software to GPU rendering is draw-call
 * count (an actual property of the batching code, not of the rasteriser) and the qualitative
 * shape of the result — WebGL2 batches many same-texture sprites into few draw calls where
 * Canvas2D issues one `drawImage` each, so WebGL2's advantage should only grow on a real GPU
 * where per-draw-call overhead dominates even more. Re-run this script on a machine with a real
 * browser and GPU for hardware numbers.
 */

const port = 5178;
const url = `http://localhost:${port}/`;
const browserDir = fileURLToPath(new URL('./browser', import.meta.url));

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error(`benchmarks/run-browser: dev server never came up on ${url}`);
}

async function main() {
  const server = spawn('npx', ['vite'], {
    cwd: browserDir,
    stdio: 'pipe',
    shell: true,
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__BENCH_DONE__ === true, { timeout: 60_000 });

    const error = await page.evaluate(() => window.__BENCH_ERROR__ ?? null);
    if (error) throw new Error(`benchmark page threw: ${error}`);

    const results = await page.evaluate(() => window.__BENCH_RESULTS__);
    await browser.close();

    const outPath = fileURLToPath(new URL('./browser-results.json', import.meta.url));
    writeFileSync(outPath, JSON.stringify(results, null, 2));

    console.log(`\nCanvas2D vs WebGL2 — ${results.userAgent}`);
    console.log(`captured ${results.capturedAt}, ${results.measuredFrames} measured frames per run\n`);
    for (const run of results.runs) {
      console.log(
        `${String(run.sprites).padStart(6)} sprites  ` +
          `canvas2d ${run.canvas2d.fps.toFixed(1).padStart(6)} fps (${run.canvas2d.avgFrameMs.toFixed(3)} ms, ${run.canvas2d.drawCalls} draw calls)  ` +
          `webgl2 ${run.webgl2.fps.toFixed(1).padStart(6)} fps (${run.webgl2.avgFrameMs.toFixed(3)} ms, ${run.webgl2.drawCalls} draw calls)  ` +
          `webgl2/canvas2d frame-time ratio ${run.webgl2SpeedupVsCanvas2d.toFixed(2)}x`,
      );
    }
    console.log(`\nFull results written to ${outPath}`);
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
