import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'pwa.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: '../../.cache/playwright-pwa-results',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3200',
    locale: 'ar-EG',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node ../../tools/release/pwa-web.mjs',
    url: 'http://localhost:3200/install',
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
