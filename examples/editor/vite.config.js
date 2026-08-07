import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** Same no-build-step-in-the-engine aliasing as the breakout example's config. */
const pkg = (name) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.js`, import.meta.url));

export default defineConfig({
  // Relative, not absolute — this build also ships nested under docs-site's `dist/play/editor/`
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
      '@novaforge/editor': pkg('editor'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});
