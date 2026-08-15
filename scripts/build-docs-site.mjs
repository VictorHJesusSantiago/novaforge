#!/usr/bin/env node
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, rmSync } from 'node:fs';

/**
 * Builds every example app and the docs site, then nests the examples' builds inside the docs
 * site's output so `docs-site`'s "Play" tab can embed them by relative iframe `src` with no
 * server-side glue (Milestone 8's documentation site, "with runnable examples" — these are the
 * runnable examples, actually running, not a screen recording of them).
 */

const root = fileURLToPath(new URL('..', import.meta.url));

/** Must match `docs-site/src/main.js`'s `PLAY_APPS` ids. */
const EXAMPLE_APPS = ['breakout', 'editor', 'asteroids', 'platformer'];

async function buildApp(relativeDir) {
  await build({ root: `${root}${relativeDir}`, logLevel: 'warn' });
}

async function main() {
  const available = EXAMPLE_APPS.filter((app) => existsSync(`${root}examples/${app}/index.html`));
  const skipped = EXAMPLE_APPS.filter((app) => !available.includes(app));
  if (skipped.length > 0) {
    process.stdout.write(`skipping (not present yet): ${skipped.join(', ')}\n`);
  }

  for (const app of available) {
    process.stdout.write(`building examples/${app}...\n`);
    await buildApp(`examples/${app}`);
  }

  process.stdout.write('building docs-site...\n');
  await buildApp('docs-site');

  const playDir = `${root}docs-site/dist/play`;
  for (const app of available) {
    cpSync(`${root}examples/${app}/dist`, `${playDir}/${app}`, { recursive: true });
  }

  process.stdout.write(`\ndocs site built to docs-site/dist/ (examples under ./play/)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
