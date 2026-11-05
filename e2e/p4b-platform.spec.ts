// P4b platform checks that only a real browser can make (spec R7/R8, audit E06, E11, E15).
import { expect, test } from '@playwright/test';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock } from './support/app';
import { LABEL } from './support/constants';
import { MONDAY, e2eDocument } from './support/document';

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

test('E15: with sounds on, a launch asks the network for no sound file that does not ship', async ({ context }) => {
  const doc = e2eDocument();
  doc.ui.sounds = true;
  await seedDocument(context, doc);
  // The programme's first day: no closed week, so no missed-week popup covers the page (P3's
  // weekly close offers one for any miss within 14 days of the real clock).
  await setClock(context, chicago(MONDAY, '10:00'));
  const sfxRequests: string[] = [];
  context.on('request', (request) => {
    if (request.url().includes('/sfx/')) sfxRequests.push(request.url());
  });
  const page = await openApp(context);
  await page.locator('main').click({ position: { x: 5, y: 5 } }); // the first gesture unlocks audio
  await page.waitForTimeout(1_000); // [ms]
  expect(sfxRequests).toEqual([]);
});

test('R8: the install card shows in a browser tab after setup and stays dismissed', async ({ context }) => {
  await seedDocument(context, e2eDocument({ installCard: true }));
  // The programme's first day, as E15: on the real clock the missed-week dialog covers the card.
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  const card = page.locator('section.install-card');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: LABEL.dismiss }).click();
  await expect(card).toHaveCount(0);
  await flushWrites(page);
  expect((await readDocument(page)).ui.installNudgeDismissed).toBe(true);
  const again = await openApp(context);
  await expect(again.locator('section.install-card')).toHaveCount(0);
});
