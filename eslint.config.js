import js from '@eslint/js';
import globals from 'globals';

// Correctness-only lint: catch undefined variables, unused code, and
// load-order mistakes. No style rules, so it never fights the existing
// formatting. Run with `npm run lint`; the pre-merge gate is build + lint.
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'eslint.config.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
];
