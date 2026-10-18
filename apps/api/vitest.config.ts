import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each integration worker starts a real replica set and performs memory-heavy Argon2 work.
    maxWorkers: 2,
  },
});
