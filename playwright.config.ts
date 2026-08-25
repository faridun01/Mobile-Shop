import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // These tests exercise one real, shared Postgres-backed backend rather than
  // per-test isolated fixtures — several flows (sales, expenses, purchases) all
  // mutate the same global owner-profit rows, so parallel workers race each
  // other's "before/after" assertions. Running serially trades speed for
  // determinism, which is the right trade-off against a shared live backend.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
