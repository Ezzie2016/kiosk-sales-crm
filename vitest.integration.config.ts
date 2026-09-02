import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Config for the Phase 1 verification harness — see docs/qa/PHASE-1-QA-CHECKLIST.md.
 * Run with `npm run test:integration`. It talks to a live (non-prod) Supabase
 * project and is NOT part of `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/verification/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    retry: 0,
  },
});
