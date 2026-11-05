// P3 D03/D06: a missed preferred Monday reads "missed" on the Log grid (it used to read "Not
// planned"), the session trained on Wednesday counts, and the closed week is graded 1 of 3.
import { expect, test } from '@playwright/test';
import { LABEL, PROFILE_ID } from './support/constants';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, TUESDAY, WEDNESDAY, e2eDocument } from './support/document';

const FRIDAY = '2026-09-11';
const NEXT_MONDAY = '2026-09-14';

test('P3: a missed Monday reads missed, Wednesday counts, the week grades 1 of 3', async ({ context }) => {
  await seedDocument(context, e2eDocument()); // Mon/Wed/Fri 18:00, quota 3, from MONDAY
  await setClock(context, chicago(WEDNESDAY, '18:00'));
  const wednesday = await openApp(context);
  await startFromToday(wednesday);
  await wednesday.getByRole('button', { name: LABEL.finish }).click({ timeout: 10_000 });
  await flushWrites(wednesday);
  await wednesday.close();

  await setClock(context, chicago(FRIDAY, '10:00'));
  const friday = await openApp(context);
  await friday
    .getByRole('navigation')
    .getByRole('button', { name: LABEL.logTab, exact: true })
    .click({ timeout: 10_000 });
  const cell = (date: string) => friday.locator(`.compliance-cell[data-date="${date}"]`);
  await expect(cell(MONDAY)).toHaveAttribute('data-mark', 'missed');
  await expect(cell(TUESDAY)).toHaveAttribute('data-mark', 'none'); // not a preferred day
  await expect(cell(WEDNESDAY)).toHaveAttribute('data-mark', 'completed');
  await expect(cell(FRIDAY)).toHaveAttribute('data-mark', 'planned');
  await friday.close();

  await setClock(context, chicago(NEXT_MONDAY, '10:00'));
  const monday = await openApp(context);
  await expect
    .poll(async () => {
      await flushWrites(monday);
      return (await readDocument(monday)).weeklyReviews[PROFILE_ID] ?? [];
    })
    .toEqual([expect.objectContaining({ weekStart: MONDAY, target: 3, completed: 1, delta: -2 })]);
});
