// Spec R13 (P2): two instances on one origin, a renderer crash mid-write, a corrupted record.
import { expect, test } from '@playwright/test';
import { LABEL, deleteLabel } from './support/constants';
import {
  chicago,
  corruptRecord,
  crashRenderer,
  flushWrites,
  logSet,
  openApp,
  readDocument,
  readRecords,
  seedDocument,
  setClock,
  startFromToday,
  openSettings,
} from './support/app';
import { MONDAY, e2eDocument, loggedSet } from './support/document';

// No trace in this file: its screencast keeps CDP calls in flight, and a reply that lands after a
// killed renderer's session is gone trips an internal assert in Playwright 1.63's CRSession
// (coreBundle.js _onMessage): B08 failed 4 of 16 runs that way, for a reason that is not the app's.
test.use({ trace: 'off' });

test('B03: a second page shows the first page\'s write without a relaunch, and neither overwrites the other', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const a = await openApp(context);
  const b = await openApp(context);
  await startFromToday(a);
  await logSet(a, 1, '60', '5');
  await flushWrites(a);
  // B never reloaded: the announced revision made it re-read the records.
  await b.getByRole('navigation').getByRole('button', { name: LABEL.trainTab, exact: true }).click({ timeout: 10_000 });
  await expect(b.getByRole('button', { name: deleteLabel(1), exact: true })).toBeVisible();
  await b.getByRole('navigation').getByRole('button', { name: LABEL.logTab, exact: true }).click({ timeout: 10_000 });
  await flushWrites(b);
  const doc = await readDocument(b);
  expect(Object.values(doc.sets)).toHaveLength(1);
  expect(doc.ui.lastView).toBe('log');
});

test('B08: a renderer crash 100 ms after a tap keeps it; a crash mid-write leaves every record readable', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  await new Promise((resolve) => setTimeout(resolve, 100)); // [ms] < the old 250 ms debounce
  await crashRenderer(context, page);

  const second = await openApp(context);
  expect(Object.values((await readDocument(second)).sets)).toHaveLength(1);
  // The relaunch lands on Today with the open session offered for resume; Train shows it.
  await second.getByRole('navigation').getByRole('button', { name: LABEL.trainTab, exact: true }).click({ timeout: 10_000 });
  await logSet(second, 2, '60', '5');
  await crashRenderer(context, second); // no wait: inside the commit

  const third = await openApp(context);
  const sets = Object.values((await readDocument(third)).sets);
  // One transaction per action: set 2 is wholly there or wholly absent, set 1 always there.
  expect(sets.length === 1 || sets.length === 2).toBe(true);
  await openSettings(third);
  await expect(third.getByRole('heading', { name: LABEL.unreadableHeading })).toHaveCount(0);
});

test('a record corrupted on disk is quarantined, listed, and left as it is by later writes', async ({ context }) => {
  await seedDocument(context, e2eDocument({ sets: [loggedSet({ id: 'good' })] }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const first = await openApp(context);
  await flushWrites(first);
  await corruptRecord(first, 'sets', 'good', { rpe: 7.3 });
  await first.close();

  const page = await openApp(context);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: LABEL.unreadableHeading })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: LABEL.logTab, exact: true }).click({ timeout: 10_000 });
  await flushWrites(page);
  expect((await readRecords(page)).stores.sets?.good).toMatchObject({ id: 'good', rpe: 7.3 });
  expect((await readDocument(page)).ui.lastView).toBe('log');
});
