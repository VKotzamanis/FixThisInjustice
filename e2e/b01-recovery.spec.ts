// Audit B01 / B17 / B18: one unreadable record put the user back into first-run setup with every
// later write silently dropped.
import { expect, test } from '@playwright/test';
import { LABEL } from './support/constants';
import { chicago, flushWrites, openApp, readRaw, seedDocument, setClock } from './support/app';
import { MONDAY, e2eDocument, loggedSet } from './support/document';

test('B01: one invalid record opens the recovery screen, never intro or setup', async ({ context }) => {
  test.fail(); // removed by plan Task 17
  // RPE is recorded in 0.5 steps; 7.3 fails LoggedSetSchema and so the whole document.
  await seedDocument(context, e2eDocument({ sets: [loggedSet({ id: 'bad', rpe: 7.3 })] }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  const before = await readRaw(page);
  await expect(page.getByRole('heading', { name: LABEL.recoveryHeading })).toBeVisible();
  await expect(page.getByText(LABEL.writesPaused)).toBeVisible();
  await expect(page.locator('section.intro')).toHaveCount(0);
  await expect(page.locator('.wiz')).toHaveCount(0);
  await flushWrites(page);
  expect(await readRaw(page)).toBe(before);
});
