import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.js`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@novaforge/math': pkg('math'),
      '@novaforge/core': pkg('core'),
      '@novaforge/renderer': pkg('renderer'),
      '@novaforge/physics': pkg('physics'),
      '@novaforge/input': pkg('input'),
      '@novaforge/audio': pkg('audio'),
      '@novaforge/animation': pkg('animation'),
      '@novaforge/runtime': pkg('runtime'),
      '@novaforge/editor': pkg('editor'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/__tests__/**/*.test.js',
      'examples/*/src/**/__tests__/**/*.test.js',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.js'],
      exclude: ['**/__tests__/**', '**/index.js'],
    },
  },
});
