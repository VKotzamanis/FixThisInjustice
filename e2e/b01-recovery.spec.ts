// Audit B01 / B17 / B18: one unreadable record put the user back into first-run setup with every
// later write silently dropped. Spec R13: one unreadable record is quarantined and listed; an
// unreadable profile still refuses the load.
import { expect, test } from '@playwright/test';
import { LABEL, PROFILE_ID } from './support/constants';
import { chicago, flushWrites, openApp, readRaw, readRecords, seedDocument, setClock, openSettings } from './support/app';
import { MONDAY, e2eDocument, loggedSet } from './support/document';

test('B01: one invalid record is quarantined and listed, and the app opens normally', async ({ context }) => {
  // RPE is recorded in 0.5 steps; 7.3 fails LoggedSetSchema, and only that record.
  await seedDocument(context, e2eDocument({ sets: [loggedSet({ id: 'bad', rpe: 7.3 })] }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  await expect(page.locator('section.intro')).toHaveCount(0);
  await expect(page.locator('.wiz')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: LABEL.recoveryHeading })).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: LABEL.unreadableHeading })).toBeVisible();
  await flushWrites(page);
  // Kept exactly as stored.
  expect((await readRecords(page)).stores.sets?.bad).toMatchObject({ id: 'bad', rpe: 7.3 });
});

test('B01: an invalid profile refuses the load: recovery screen, nothing written', async ({ context }) => {
  const doc = e2eDocument();
  const profile = doc.profiles[PROFILE_ID];
  if (profile === undefined) throw new Error('e2eDocument() has the e2e profile');
  // 81 characters: one over PROFILE_DISPLAY_NAME_MAX_CHARS. Every other record hangs off it.
  await seedDocument(context, { ...doc, profiles: { [PROFILE_ID]: { ...profile, displayName: 'A'.repeat(81) } } });
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  const before = await readRaw(page);
  await expect(page.getByRole('heading', { name: LABEL.recoveryHeading })).toBeVisible();
  await expect(page.getByText(LABEL.writesPaused)).toBeVisible();
  await expect(page.locator('section.intro')).toHaveCount(0);
  await expect(page.locator('.wiz')).toHaveCount(0);
  await flushWrites(page);
  expect(await readRaw(page)).toBe(before);
  expect((await readRecords(page)).meta).toBeNull();
});
