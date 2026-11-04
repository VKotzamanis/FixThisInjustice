// playwright.config.ts
//
// Phone-browser end-to-end tests (spec R12). Chromium only: @playwright/test 1.63.0 bundles
// Chromium revision 1243, the one cached on the dev machine and installed by CI. "iphone13" is
// Chromium with the iPhone 13 viewport, touch and user agent; it is NOT WebKit.
import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT, E2E_TIMEZONE } from './e2e/support/constants';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1, // the 16 GB machine is shared with MATLAB (AGENTS.md)
  retries: 0,
  forbidOnly: process.env.CI !== undefined,
  reporter: [['list']],
  timeout: 60_000, // [ms] per test
  use: {
    baseURL: E2E_BASE_URL,
    timezoneId: E2E_TIMEZONE,
    locale: 'en-US',
    // The service worker would serve a cached build across runs; the specs test the fresh one.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'iphone13',
      use: { ...devices['iPhone 13'], browserName: 'chromium', timezoneId: E2E_TIMEZONE },
    },
    { name: 'pixel7', use: { ...devices['Pixel 7'], timezoneId: E2E_TIMEZONE } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${String(E2E_PORT)} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000, // [ms] tsc -b + vite build + preview start
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
