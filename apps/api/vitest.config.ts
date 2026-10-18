import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    // Each integration worker starts a real replica set and performs memory-heavy Argon2 work.
    maxWorkers: 2,
  },
});
