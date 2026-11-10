import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Scoped to `packages/*` — the published surface. The examples are consumer
// demos with their own generated GraphQL code and framework conventions;
// linting them here would mostly police codegen output.
//
// The rule set is deliberately small: correctness only. Formatting belongs to
// Prettier.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.generated.ts',
      'examples/**',
      // Build output and scratch checkouts — thousands of findings in bundled
      // vendor code that is not ours to fix.
      '**/.next/**',
      '**/.nuxt/**',
      '**/.svelte-kit/**',
      '**/.astro/**',
      '**/.output/**',
      '**/.turbo/**',
      '**/.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['packages/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      // The toolbar UI is Preact JSX, not React, but the plugin's rules are
      // framework-agnostic enough for the two we care about.
      react: { version: 'detect', pragma: 'h' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-danger': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Type-aware rules for the shipped source: a dropped promise here is an
  // unhandled rejection on a consumer's page or server.
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: ['packages/**/*.test.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Tests declare `var` globals for cross-module mock wiring, and reach into
  // internals that the public types intentionally hide.
  {
    files: ['packages/**/*.test.{ts,tsx}'],
    rules: {
      'no-var': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Build scripts are plain Node ESM, so they need Node's globals declared.
  {
    files: ['**/scripts/*.mjs', '*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },

  // Formatting is Prettier's job — last, so it switches off every stylistic
  // rule the configs above might carry.
  prettier,
);
