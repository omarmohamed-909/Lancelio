import { defineConfig, devices } from '@playwright/test';

process.env.E2E_WEB_ORIGIN = 'https://localhost:3443';
process.env.E2E_SECURE_COOKIES = 'true';

export default defineConfig({
  testDir: './tests',
  testMatch: 'auth.spec.ts',
  grep: /REL-001/,
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: '../../.cache/playwright-release-results',
  reporter: 'list',
  use: {
    baseURL: 'https://localhost:3443',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node ../../tools/release/production-web.mjs',
    url: 'https://localhost:3443/login',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
