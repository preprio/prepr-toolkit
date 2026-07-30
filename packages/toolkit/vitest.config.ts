import { defineConfig } from 'vitest/config';

// CSS is compiled to `*.generated.ts` by `scripts/compile-css.mjs` (run via
// the `pretest`/`prebuild` npm hooks), so tests import ordinary TypeScript —
// no `.css` transform needed here. See that script for the rationale.
export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
});
