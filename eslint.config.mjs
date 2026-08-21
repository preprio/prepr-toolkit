import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';

// Scoped to `packages/*` — the published surface. The examples are consumer
// demos with their own generated GraphQL code and framework conventions;
// linting them here would mostly police codegen output.
//
// The rule set is deliberately small: it exists to enforce the rules the source
// already has `eslint-disable` comments for (react-hooks/exhaustive-deps,
// react/no-danger, no-var), which until now silenced nothing because no config
// existed.
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

      // The codebase leans on inferred return types for locals and on `any` in
      // a few deliberate structural-typing spots; neither is worth churning.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
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
    files: ['packages/**/scripts/*.mjs', '*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
);
