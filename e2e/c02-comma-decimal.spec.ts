// Audit C02 / A03: type="number" drops the comma, so 62,5 was stored as 625.
import { expect, test } from '@playwright/test';
import { loadLabel, logLabel, repsLabel } from './support/constants';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

test.use({ locale: 'de-DE' });

test('C02: 62,5 typed with a decimal comma is stored as 62.5 kg', async ({ context }) => {
  test.fail(); // removed by plan Task 13
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  const load = page.getByLabel(loadLabel(1), { exact: true });
  await load.click();
  await load.pressSequentially('62,5'); // key by key, as a phone keypad types
  await page.getByLabel(repsLabel(1), { exact: true }).fill('5');
  await page.getByRole('button', { name: logLabel(1), exact: true }).dispatchEvent('click');
  await flushWrites(page);
  const loads = Object.values((await readDocument(page)).sets).map((s) => s.loadKg); // [kg]
  expect(loads).toEqual([62.5]);
});
