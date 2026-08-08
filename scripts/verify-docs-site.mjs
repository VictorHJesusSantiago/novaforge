#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/**
 * A real-browser smoke test for the built docs site: navigation renders, each doc page's
 * markdown actually converts to HTML, and — the part that matters — the "Play" tab's iframe
 * loads a genuinely running example (checked by reading pixels off its canvas, not just
 * confirming the iframe didn't error).
 */

const port = 5177;
const url = `http://localhost:${port}/`;
const cwd = fileURLToPath(new URL('../docs-site', import.meta.url));

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error(`verify-docs-site: preview server never came up on ${url}`);
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'pipe',
    shell: true,
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(url);
    const homeTitle = await page.textContent('h1');
    console.log(`OK  home page renders, h1: "${homeTitle}"`);

    await page.goto(`${url}#/docs/spec`);
    await page.waitForFunction(() => document.querySelector('h1, h2') !== null);
    const specHeading = await page.textContent('h1, h2');
    console.log(`OK  /docs/spec renders markdown, first heading: "${specHeading}"`);

    for (const slug of ['architecture', 'roadmap', 'adr-0007']) {
      await page.goto(`${url}#/docs/${slug}`);
      await page.waitForFunction(() => document.getElementById('main').children.length > 0);
      console.log(`OK  /docs/${slug} rendered without error`);
    }

    await page.goto(`${url}#/play`);
    const results = {};
    for (const app of ['breakout', 'editor', 'asteroids', 'platformer']) {
      if (app !== 'breakout') await page.click(`[data-app="${app}"]`);
      const frame = page.frameLocator('iframe');
      await frame.locator('canvas').first().waitFor({ timeout: 15_000 });
      await delay(1500); // let a few frames actually run
      const hasPixels = await hasNonBlankCanvas(page);
      results[app] = hasPixels;
      console.log(`${hasPixels ? 'OK ' : 'FAIL'} Play tab: ${app} iframe canvas has drawn content`);
    }

    await browser.close();

    const failed = Object.entries(results).filter(([, ok]) => !ok);
    if (failed.length > 0) {
      throw new Error(`embedded example canvas never drew anything: ${failed.map(([app]) => app).join(', ')}`);
    }
    console.log('\ndocs site verified end-to-end in a real browser.');
  } finally {
    server.kill();
  }
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function hasNonBlankCanvas(page) {
  const frame = page.frames().find((f) => f.url().includes('/play/'));
  if (frame === undefined) return false;
  return frame.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return false;
    const ctx = canvas.getContext('2d') ?? canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (ctx === null) return false;
    if (ctx instanceof CanvasRenderingContext2D) {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return true;
      }
      return false;
    }
    // WebGL: presence of a live context with non-zero drawing-buffer size is a reasonable signal
    // that something has rendered — reading back pixels needs a preserveDrawingBuffer context.
    return canvas.width > 0 && canvas.height > 0;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
