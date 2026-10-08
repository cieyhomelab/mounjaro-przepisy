import { defineConfig, devices } from '@playwright/test';

// Run through scripts/test-e2e.sh, which starts the stack in Docker Compose.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  // One server, one database, one clock: tests reset them, so they must not run concurrently.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
