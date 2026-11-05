// P3 D03: a programme set up on Wednesday is graded on the days it spanned (Wednesday and
// Friday), not on the full Mon/Wed/Fri quota; the days before it are outside the programme.
import { expect, test } from '@playwright/test';
import { LABEL } from './support/constants';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock } from './support/app';
import { MONDAY, TUESDAY, WEDNESDAY, e2eDocument, reviewDraft } from './support/document';

const NEXT_MONDAY = '2026-09-14';

test('P3: setup on Wednesday asks 2 sessions of its first week, not 3', async ({ context }) => {
  // A first-run document parked on Review: Mon/Wed/Fri 18:00, quota 3 (REVIEW_DAYS).
  await seedDocument(context, e2eDocument({ profile: false, setupDraft: reviewDraft() }));
  await setClock(context, chicago(WEDNESDAY, '10:00'));
  const page = await openApp(context);
  await page.getByLabel(LABEL.looksGood, { exact: true }).check({ timeout: 10_000 });
  await page.locator('.wiz-nav button').last().click({ timeout: 10_000 });

  await page
    .getByRole('navigation')
    .getByRole('button', { name: LABEL.logTab, exact: true })
    .click({ timeout: 10_000 });
  const cell = (date: string) => page.locator(`.compliance-cell[data-date="${date}"]`);
  await expect(cell(MONDAY)).toHaveAttribute('data-mark', 'blank');
  await expect(cell(TUESDAY)).toHaveAttribute('data-mark', 'blank');
  await expect(cell(WEDNESDAY)).toHaveAttribute('data-mark', 'planned');
  await expect(page.locator('.compliance-week').first()).toHaveText(`${MONDAY} 0/2`);
  await flushWrites(page);
  await page.close();

  await setClock(context, chicago(NEXT_MONDAY, '10:00'));
  const next = await openApp(context);
  await expect
    .poll(async () => {
      await flushWrites(next);
      const doc = await readDocument(next);
      return doc.weeklyReviews[doc.activeProfileId ?? ''] ?? [];
    })
    .toEqual([expect.objectContaining({ weekStart: MONDAY, target: 2, completed: 0, delta: -2 })]);
});
