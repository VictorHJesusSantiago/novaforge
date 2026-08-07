export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Image: 'readonly',
        AudioContext: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        globalThis: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        location: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        // `_` and `_name` are the conventional throwaway in this codebase, for both
        // parameters and destructured bindings.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-undef': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
    },
  },
];
