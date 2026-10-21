import { defineConfig } from 'vitest/config';

// End-to-end suites build and start real framework apps, so they are slow and
// kept out of `pnpm test`. Run them with `pnpm test:e2e`.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
