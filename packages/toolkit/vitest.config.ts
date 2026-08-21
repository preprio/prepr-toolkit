import { defineConfig } from 'vitest/config';

// CSS is compiled to `*.generated.ts` by `scripts/compile-css.mjs` (run via
// the `pretest`/`prebuild` npm hooks), so tests import ordinary TypeScript —
// no `.css` transform needed here. See that script for the rationale.
// happy-dom is the default because most of the package is browser code (the
// toolbar element, stega, the iframe bridge). It is the WRONG default for the
// server-side modules: happy-dom's `Headers` accepts values the real runtime
// (undici/workerd) rejects outright, so header-validation bugs pass silently
// under it — that is how a crash on a crafted URL shipped in 0.2.0-beta.5.
//
// Server-side suites therefore opt into the real runtime with a per-file
// `// @vitest-environment node` docblock. Add one to any new test that exercises
// middleware, the server helpers or a framework wrapper.
export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
});
