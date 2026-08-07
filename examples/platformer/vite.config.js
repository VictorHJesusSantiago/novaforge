import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * The engine packages are plain ESM with no build step, so they are aliased straight to source.
 * Same convention as `examples/breakout/vite.config.js`, extended with `@novaforge/animation`
 * (see `examples/editor/vite.config.js` for that alias — breakout does not need it).
 */
const pkg = (name) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.js`, import.meta.url));

export default defineConfig({
  // Relative, not absolute — this build also ships nested under docs-site's `dist/play/platformer/`
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
      '@novaforge/animation': pkg('animation'),
    },
  },
  server: {
    port: 5181,
    open: true,
  },
});
