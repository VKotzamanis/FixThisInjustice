// Spec R7 (audit E01, E09): a new deploy reaches a resumed app with no session open and no tap,
// without a banner, and the first page after install is controlled (clients.claim).
//
// A deploy is simulated by appending a comment to dist/sw.js: the browser compares the worker
// script byte for byte, and `vite preview` serves dist/ from disk per request (sirv `dev: true`,
// node_modules/vite/dist/node/chunks/node.js). The file is restored in `finally`.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openApp, seedDocument } from './support/app';
import { e2eDocument } from './support/document';

test.use({ serviceWorkers: 'allow' });

test('R7: a new worker applies itself on resume when no session is open', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  const page = await openApp(context);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // E09: claimed on activate, so this first page is controlled without a reload.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.evaluate(() => {
    Reflect.set(window, '__beforeUpdate', true);
  });
  const swPath = 'dist/sw.js';
  const original = readFileSync(swPath, 'utf8');
  try {
    writeFileSync(swPath, `${original}\n// e2e: a new deploy\n`);
    // A resume: the controller checks on visibilitychange (Playwright pages stay 'visible').
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Applied: the page reloaded onto the new worker, so the marker is gone.
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__beforeUpdate') === true).catch(() => true), {
        timeout: 30_000, // [ms]
      })
      .toBe(false);
    await expect(page.locator('.banner.update')).toHaveCount(0);
  } finally {
    writeFileSync(swPath, original);
  }
});
