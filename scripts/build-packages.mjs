#!/usr/bin/env node
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Produces a minified, tree-shakeable `dist/index.js` for every engine package (Milestone 8's
 * "asset bundling / tree-shaken engine build"). This is a real, separate artifact from the
 * plain-source `src/` the monorepo itself runs on — ADR-0005 keeps the *engine's own* dev loop
 * source-only, on purpose, so editing `packages/core/src/world.js` hot-reloads a running example
 * with no build step. `dist/` exists for the other side of that: publishing a package to npm (or
 * dropping it on a CDN) for someone who is *not* in this monorepo, where shipping raw,
 * un-minified source with no sourcemap-friendly bundling would be a worse default.
 *
 * Cross-package imports (`@novaforge/core` from inside `@novaforge/renderer`) are left external,
 * not inlined — each package's `dist/index.js` still imports its siblings by bare specifier, the
 * same way `src/index.js` does. A consumer's own bundler resolves those and tree-shakes across
 * the whole graph; see `scripts/verify-treeshaking.mjs` for the automated proof that actually
 * happens, and this script's own `README` note below for why *this* script doesn't attempt to
 * verify it (it only produces the artifact).
 */

const PACKAGES = [
  'math',
  'core',
  'renderer',
  'physics',
  'input',
  'audio',
  'animation',
  'runtime',
  'editor',
];

async function buildPackage(name) {
  const root = fileURLToPath(new URL(`../packages/${name}/`, import.meta.url));
  const entry = `${root}src/index.js`;

  await build({
    root,
    logLevel: 'warn',
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      lib: {
        entry,
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: (id) => id.startsWith('@novaforge/'),
      },
      minify: 'esbuild',
      sourcemap: true,
      target: 'es2022',
    },
  });

  // A package with a stylesheet export (only @novaforge/editor today) ships it unbundled and
  // unminified, copied as-is — CSS has no dead-code-elimination story here worth building one for.
  const stylePath = `${root}src/style.css`;
  if (existsSync(stylePath)) {
    writeFileSync(`${root}dist/style.css`, readFileSync(stylePath));
  }
}

async function main() {
  for (const name of PACKAGES) {
    process.stdout.write(`building @novaforge/${name}...\n`);
    await buildPackage(name);
  }
  process.stdout.write(`\nbuilt ${PACKAGES.length} packages to packages/*/dist/\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
