import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * The engine packages are plain ESM with no build step, so they are aliased straight to source.
 * Editing `packages/core/src/world.js` hot-reloads the running game — which is the whole
 * argument for the no-build-step decision in ADR-0005.
 */
const pkg = (name) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.js`, import.meta.url));

export default defineConfig({
  // Relative, not absolute — this build also ships nested under docs-site's `dist/play/breakout/`
  // (see `scripts/build-docs-site.mjs`), where an absolute `/assets/...` base would 404.
  base: './',
  resolve: {
    alias: {
      '@novaforge/math': pkg('math'),
      '@novaforge/core': pkg('core'),
      '@novaforge/renderer': pkg('renderer'),
      '@novaforge/physics': pkg('physics'),
      '@novaforge/input': pkg('input'),
      '@novaforge/audio': pkg('audio'),
      '@novaforge/runtime': pkg('runtime'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
