// Audit A01 / B02: setup could write a document the loader refuses (an 81-character name, a
// cleared start time); the next launch then showed the intro and setup again and saved nothing.
import { expect, test, type BrowserContext } from '@playwright/test';
import { LABEL } from './support/constants';
import { chicago, openApp, seedDocument, setClock } from './support/app';
import { MONDAY, REVIEW_DAYS, e2eDocument, reviewDraft } from './support/document';
import type { SetupDraft } from '../src/domain/types';

// `force` on the Looks Good checkbox: with an 81-character name the review layout lets wizard
// text overlap the checkbox input (separate layout defect, logged for P3); a user taps the label.
async function confirmThenRelaunch(context: BrowserContext, draft: SetupDraft) {
  await seedDocument(context, e2eDocument({ profile: false, setupDraft: draft }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  await page.getByLabel(LABEL.looksGood, { exact: true }).check({ timeout: 10_000, force: true });
  const confirm = page.locator('.wiz-nav button').last();
  if (await confirm.isEnabled()) await confirm.click({ force: true }); // same overlap as above
  await page.reload();
  await page.locator('main').waitFor();
  // Whatever happened, the next launch is not a first run and not a refused document.
  await expect(page.locator('section.intro')).toHaveCount(0);
  await expect(page.getByText('INVALID DATA')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: LABEL.recoveryHeading })).toHaveCount(0);
  return page;
}

test('A01: an over-long name cannot be confirmed', async ({ context }) => {
  const page = await confirmThenRelaunch(context, reviewDraft({ displayName: 'A'.repeat(81) }));
  await page.getByLabel(LABEL.looksGood, { exact: true }).check({ timeout: 10_000, force: true });
  await expect(page.locator('.wiz-nav button').last()).toBeDisabled();
});

test('A01: a cleared start time cannot be confirmed', async ({ context }) => {
  const days = { ...REVIEW_DAYS, 1: { enabled: true, startTime: '', durationMin: '60' } };
  const page = await confirmThenRelaunch(context, reviewDraft({ days }));
  await page.getByLabel(LABEL.looksGood, { exact: true }).check({ timeout: 10_000, force: true });
  await expect(page.locator('.wiz-nav button').last()).toBeDisabled();
});
