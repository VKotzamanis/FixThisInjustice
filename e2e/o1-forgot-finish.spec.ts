// Owner O1 / audit C01, D01: "If I forget to log the day at the end of the workout the whole
// system bugs and I'm unable to continue."
import { expect, test } from '@playwright/test';
import { PROFILE_ID } from './support/constants';
import { chicago, flushWrites, logSet, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, WEDNESDAY, e2eDocument } from './support/document';

test('O1: a session left open overnight never blocks the next one', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const monday = await openApp(context);
  await startFromToday(monday);
  await logSet(monday, 1, '60', '5');
  await monday.close(); // relaunch: Finish was never tapped

  await setClock(context, chicago(WEDNESDAY, '18:00'));
  const wednesday = await openApp(context);
  await startFromToday(wednesday);
  // Monday was closed with its set, so the cursor moved on to session 2.
  await expect(wednesday.getByRole('heading', { level: 2, name: 'Upper A' })).toBeVisible();
  await flushWrites(wednesday);
  const rows = (await readDocument(wednesday)).assignments[PROFILE_ID] ?? [];
  expect(rows.find((a) => a.date === MONDAY)?.status).toBe('completed');
  expect(rows.find((a) => a.date === WEDNESDAY)?.status).toBe('in-progress');
});
