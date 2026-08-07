import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** Same no-build-step-in-the-engine aliasing as the example apps' configs. */
const pkg = (name) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.js`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@novaforge/math': pkg('math'),
      '@novaforge/core': pkg('core'),
      '@novaforge/renderer': pkg('renderer'),
    },
  },
  server: {
    port: 5178,
    strictPort: true,
  },
});
