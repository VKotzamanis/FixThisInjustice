// Owner O2: "If I skip a day it doesn't transfer the leg day to my next time visiting the gym."
import { expect, test } from '@playwright/test';
import { LABEL } from './support/constants';
import { chicago, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, TUESDAY, e2eDocument } from './support/document';

test('O2: Skip Today postpones the session to the next visit', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '17:00'));
  const monday = await openApp(context);
  await expect(monday.getByRole('heading', { level: 1, name: 'Lower A' })).toBeVisible();
  await monday.getByRole('button', { name: LABEL.skipToday }).click();
  await monday.getByRole('button', { name: LABEL.confirmSkip }).click();
  await monday.close();

  // Tuesday is not a preferred day: the next visit still trains the skipped session.
  await setClock(context, chicago(TUESDAY, '17:00'));
  const tuesday = await openApp(context);
  await startFromToday(tuesday);
  await expect(tuesday.getByRole('heading', { level: 2, name: 'Lower A' })).toBeVisible();
});
