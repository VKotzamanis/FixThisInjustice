// P4b platform checks that only a real browser can make (spec R7/R8, audit E06, E11, E15).
import { expect, test } from '@playwright/test';
import { openApp, seedDocument } from './support/app';
import { e2eDocument } from './support/document';

test('E11: a cold load raises no CSP violation', async ({ context }) => {
  await context.addInitScript(() => {
    const seen: string[] = [];
    Reflect.set(window, '__cspViolations', seen);
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await seedDocument(context, e2eDocument());
  const page = await openApp(context);
  await page.waitForTimeout(1_000); // [ms] let late scripts run
  expect(await page.evaluate(() => Reflect.get(window, '__cspViolations') as string[])).toEqual([]);
});

test('E06: the build stamp is its own file and the service worker does not precache it', async ({ page }) => {
  const info = await page.request.get('build-info.json');
  expect(info.ok()).toBe(true);
  expect(await info.json()).toMatchObject({ commit: expect.stringMatching(/^([0-9a-f]{7}|local)$/) });
  const sw = await page.request.get('sw.js');
  expect(await sw.text()).not.toContain('build-info.json');
});
