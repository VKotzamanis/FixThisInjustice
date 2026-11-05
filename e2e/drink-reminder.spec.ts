// Owner, 2026-11-05: "I want the drinks to be a reminder the way it was, like a button that
// appears below games. it doesn't have to log them". Lead's rulings D1-D3:
//  - the in-session reminder (hydrationCue's 20 min cadence, "Drink to thirst") is ONE button
//    under the docked rest bar while a rest runs with no game sheet open, never in the list;
//  - a tap hides it until the next cadence mark and writes NO fluid record;
//  - Today has no Fluid (Beverages) card.
// The in-sheet placement (below the game) is not built: see the report (sheet geometry).
import { expect, test } from '@playwright/test';
import { chicago, flushWrites, logSet, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { PROFILE_ID } from './support/constants';

const CADENCE_MS = 20 * 60_000; // [ms] SESSION_CHECK_INTERVAL_MS, src/domain/training/hydration.ts
const REMINDER = 'hydrate or diedrate'; // limelight advice.drinkToThirst

test('the drink reminder appears under the rest bar on the cadence; a tap hides it and logs nothing', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  const panel = page.locator('.view-slot:not([hidden]) .rest-panel');
  const reminder = panel.getByRole('button', { name: REMINDER, exact: true });
  await expect(panel.locator('.rest-summary')).toBeVisible();
  await expect(reminder).toHaveCount(0);
  await page.clock.fastForward(CADENCE_MS + 2_000); // [ms] one cadence past the session start
  await expect(reminder).toBeVisible();
  // Under the bar, full width, a 44 px target, and nowhere in the exercise list.
  const [bar, button] = [await panel.locator('.rest-summary').boundingBox(), await reminder.boundingBox()];
  expect((button?.y ?? 0) + 0.5).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0));
  expect(button?.height ?? 0).toBeGreaterThanOrEqual(43.9); // [px]
  await expect(page.locator('.view-slot:not([hidden]) .ex-stack').getByText(REMINDER)).toHaveCount(0);
  await reminder.click();
  await expect(reminder).toHaveCount(0);
  await flushWrites(page);
  expect((await readDocument(page)).hydration[PROFILE_ID] ?? []).toEqual([]);
  // Back on the next cadence mark after the tap.
  await page.clock.fastForward(CADENCE_MS + 2_000); // [ms]
  await expect(reminder).toBeVisible();
});

test('Today has no Fluid (Beverages) card', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  const today = page.locator('.view-slot:not([hidden])');
  await expect(today.locator('.today-hero h1')).toBeVisible();
  await expect(today.getByRole('heading', { name: 'Fluid (Beverages)' })).toHaveCount(0);
  await expect(today.getByTestId('fluid-bar')).toHaveCount(0);
});
