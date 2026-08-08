#!/usr/bin/env node
import { build } from 'vite';
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Proves dead-code elimination actually happens across the engine — Milestone 8's "tree-shaken
 * engine build" is a claim about what a *consumer's* bundler does with these packages, not
 * something this repo can do to itself, so the only honest way to verify it is to act like a
 * consumer: bundle a tiny app that imports one thing from one package, and check the output for
 * tokens that should only be present if a sibling package's code leaked in.
 *
 * Two scenarios, both real bundler runs (esbuild via Vite, not a hand-rolled static-analysis
 * check that could drift from what bundlers actually do):
 *
 * 1. **From source** (`@novaforge/core`'s own `src/index.js`, aliased the same way
 *    `vitest.config.js` and every example's `vite.config.js` already do) — this is exactly how
 *    the example apps consume the engine per ADR-0005, so it is the scenario that matters most.
 * 2. **From the built `dist/`** (`scripts/build-packages.mjs`'s output) — proves the *published*
 *    artifact tree-shakes too, for a consumer outside this monorepo who installs the package
 *    rather than aliasing straight to source.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

/** Tokens that must never appear when only `@novaforge/core` is imported. */
const FORBIDDEN_TOKENS = [
  'WebGL2Renderer', // @novaforge/renderer
  'groupByTexture', // @novaforge/renderer (webgl2-batch.js)
  'Quadtree', // @novaforge/physics
  'resolveContact', // @novaforge/physics
  'AudioMixer', // @novaforge/audio
  'Gamepad', // @novaforge/input
  'TimelinePlayer', // @novaforge/animation
];

/** @type {Record<string, string>} */
const SOURCE_ALIASES = {
  '@novaforge/math': join(root, 'packages/math/src/index.js'),
  '@novaforge/core': join(root, 'packages/core/src/index.js'),
  '@novaforge/renderer': join(root, 'packages/renderer/src/index.js'),
  '@novaforge/physics': join(root, 'packages/physics/src/index.js'),
  '@novaforge/input': join(root, 'packages/input/src/index.js'),
  '@novaforge/audio': join(root, 'packages/audio/src/index.js'),
  '@novaforge/animation': join(root, 'packages/animation/src/index.js'),
};

/** @type {Record<string, string>} */
const DIST_ALIASES = {
  '@novaforge/math': join(root, 'packages/math/dist/index.js'),
  '@novaforge/core': join(root, 'packages/core/dist/index.js'),
  '@novaforge/renderer': join(root, 'packages/renderer/dist/index.js'),
  '@novaforge/physics': join(root, 'packages/physics/dist/index.js'),
  '@novaforge/input': join(root, 'packages/input/dist/index.js'),
  '@novaforge/audio': join(root, 'packages/audio/dist/index.js'),
  '@novaforge/animation': join(root, 'packages/animation/dist/index.js'),
};

const ENTRY_SOURCE = `
import { World, Transform } from '@novaforge/core';
const world = new World();
const e = world.createEntity();
world.add(e, Transform);
console.log(world.entityCount);
`;

/**
 * @param {string} label
 * @param {Record<string, string>} aliases
 * @returns {Promise<{ label: string, bytes: number, foundTokens: string[] }>}
 */
async function bundleAndCheck(label, aliases) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'novaforge-treeshake-'));
  const entryPath = join(tmpDir, 'entry.js');
  writeFileSync(entryPath, ENTRY_SOURCE);

  await build({
    root: tmpDir,
    logLevel: 'warn',
    configFile: false,
    resolve: { alias: aliases },
    build: {
      outDir: join(tmpDir, 'out'),
      lib: { entry: entryPath, formats: ['es'], fileName: () => 'bundle.js' },
      minify: false, // unminified so FORBIDDEN_TOKENS (real identifier names) survive if present
      write: true,
    },
  });

  const bundle = readFileSync(join(tmpDir, 'out', 'bundle.js'), 'utf8');
  const foundTokens = FORBIDDEN_TOKENS.filter((token) => bundle.includes(token));
  rmSync(tmpDir, { recursive: true, force: true });

  return { label, bytes: Buffer.byteLength(bundle), foundTokens };
}

async function main() {
  const results = [
    await bundleAndCheck('from source (src/index.js, the example apps\' path)', SOURCE_ALIASES),
    await bundleAndCheck('from dist/ (the published-package path)', DIST_ALIASES),
  ];

  let ok = true;
  for (const result of results) {
    if (result.foundTokens.length > 0) {
      ok = false;
      console.error(
        `FAIL  ${result.label}: bundle (${result.bytes} bytes) leaked sibling-package code: ${result.foundTokens.join(', ')}`,
      );
    } else {
      console.log(
        `OK    ${result.label}: importing only World+Transform from @novaforge/core produced a ` +
          `${result.bytes}-byte bundle with none of renderer/physics/audio/input/animation's code in it`,
      );
    }
  }

  if (!ok) {
    console.error('\ntree-shaking verification failed — a package boundary is leaking.');
    process.exitCode = 1;
  } else {
    console.log('\ntree-shaking verified: unused @novaforge/* packages are fully eliminated.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
