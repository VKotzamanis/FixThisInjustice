// P3 D05: training days, times and the weekly target can change after setup, from Settings,
// and only the calendar changes: the plan and the cursor stay as they were.
import { expect, test } from '@playwright/test';
import { LABEL, PROFILE_ID } from './support/constants';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock } from './support/app';
import { MONDAY, PLAN_ID, e2eDocument } from './support/document';

test('P3: Training Days moves Friday to Tuesday 07:30 at 2 a week, plan untouched', async ({ context }) => {
  const seeded = e2eDocument(); // Mon/Wed/Fri 18:00, quota 3
  await seedDocument(context, seeded);
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: LABEL.settingsTab, exact: true })
    .click({ timeout: 10_000 });

  await page.locator('#avail-day-5').uncheck({ timeout: 10_000 }); // Friday off
  await page.locator('#avail-day-2').check(); // Tuesday on
  await page.locator('#avail-start-2').fill('07:30');
  await page.locator('#avail-target').selectOption('2');
  await page.locator('#avail-save').click();
  await flushWrites(page);

  const doc = await readDocument(page);
  expect(doc.availability[PROFILE_ID]).toEqual({
    slots: [
      { weekday: 1, startTime: '18:00', expectedDurationS: 3600 }, // [s]
      { weekday: 2, startTime: '07:30', expectedDurationS: 3600 }, // [s] inherits the first slot's
      { weekday: 3, startTime: '18:00', expectedDurationS: 3600 }, // [s]
    ],
    weeklySessionTarget: 2, // [sessions/week]
  });
  expect(doc.cursors[PROFILE_ID]).toEqual(seeded.cursors[PROFILE_ID]);
  expect(Object.keys(doc.plans)).toEqual([PLAN_ID]);

  // The forecast follows: Monday and Tuesday carry this week's two sessions, Friday rests.
  await page
    .getByRole('navigation')
    .getByRole('button', { name: LABEL.todayTab, exact: true })
    .click({ timeout: 10_000 });
  const strip = page.getByTestId('strip-day');
  await expect(strip.nth(1)).toHaveAttribute('data-status', 'planned'); // Tuesday
  await expect(strip.nth(2)).toHaveAttribute('data-status', 'rest'); // Wednesday: quota met
  await expect(strip.nth(4)).toHaveAttribute('data-status', 'rest'); // Friday
});
