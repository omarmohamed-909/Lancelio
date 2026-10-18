import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  timeout: 40_000,
  expect: { timeout: 10_000 },
  outputDir: '../../.cache/playwright-results',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'ar-EG',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.E2E_CHROMIUM_CHANNEL,
      },
    },
    {
      name: 'firefox',
      grep: /responsive audit/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      grep: /responsive audit/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 3100 --hostname localhost',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:5100/api/v1',
      E2E_ISOLATED_BUILD: '1',
    },
  },
});
