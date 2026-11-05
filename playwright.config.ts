// playwright.config.ts
//
// Phone-browser end-to-end tests (spec R12). @playwright/test 1.63.0 bundles Chromium revision
// 1243 and WebKit revision 2359. "iphone13" is Chromium with the iPhone 13 viewport, touch and
// user agent; it is NOT WebKit. "webkit-iphone13" is WebKit (the iOS engine family, not iOS
// Safari itself) on the same device profile, for the shell, Train, burn, sheet, Replace and sweep
// specs.
// CI installs both engines (.github/workflows/ci.yml). On a host Playwright does not support
// (Fedora), WebKit needs the Ubuntu 24.04 ICU 74 and libjpeg 8 libraries next to it.
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
    {
      name: 'webkit-iphone13',
      // devices['iPhone 13'] defaults to defaultBrowserType 'webkit'.
      use: { ...devices['iPhone 13'], timezoneId: E2E_TIMEZONE },
      testMatch: [
        'p4a-shell.spec.ts',
        'p4a-sweeps.spec.ts',
        'p4a-shots.spec.ts',
        'burn.spec.ts',
        'p6-rest-sheet.spec.ts',
        'replace.spec.ts',
        'hero-number.spec.ts',
        'drink-reminder.spec.ts',
      ],
    },
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
