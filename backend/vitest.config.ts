import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests by default; the integration suite needs Docker, so it's
    // opt-in via `pnpm test:integration` (which sets VITEST_INTEGRATION=1).
    include: process.env.VITEST_INTEGRATION
      ? ['test/integration/**/*.test.ts']
      : ['test/*.test.ts'],
    testTimeout: process.env.VITEST_INTEGRATION ? 180_000 : 10_000,
    hookTimeout: process.env.VITEST_INTEGRATION ? 180_000 : 10_000,
  },
});
