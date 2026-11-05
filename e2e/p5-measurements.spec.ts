// Spec R9 / audit G02, G03 (and G01, Task 7): measurements on the phone.
import { expect, test } from '@playwright/test';
import { LABEL, PROFILE_ID, massLabel, postMassLabel, preMassLabel } from './support/constants';
import { chicago, flushWrites, logSet, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, TUESDAY, WEDNESDAY, bodyMassEntry, e2eDocument } from './support/document';

test('G02: a morning weigh-in on a rest day, from Today', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(TUESDAY, '07:30')); // Tuesday has no preferred slot
  const page = await openApp(context);
  await page.getByLabel(massLabel(), { exact: true }).fill('80,4');
  await page.getByRole('button', { name: LABEL.logBodyMass, exact: true }).click();
  await flushWrites(page);
  const masses = (await readDocument(page)).bodyMass[PROFILE_ID] ?? [];
  expect(masses).toHaveLength(1);
  expect(masses[0]).toMatchObject({ date: TUESDAY, massKg: 80.4, role: 'morning' }); // [kg]
});

test('G03: a typo weigh-in is corrected in place from the Log', async ({ context }) => {
  await seedDocument(
    context,
    e2eDocument({
      bodyMass: [
        bodyMassEntry({ id: 'm1', date: MONDAY, massKg: 80 }), // [kg]
        bodyMassEntry({ id: 'typo', date: TUESDAY, massKg: 8 }), // [kg] 80 typed without its 0
      ],
    }),
  );
  await setClock(context, chicago(WEDNESDAY, '07:30'));
  const page = await openApp(context);
  await page.getByRole('navigation').getByRole('button', { name: LABEL.logTab, exact: true }).click({ timeout: 10_000 });
  const row = page.getByTestId('mass-entry').filter({ hasText: TUESDAY });
  await row.getByRole('button', { name: LABEL.editEntry, exact: true }).click();
  // 80.2 is within 10 % of Monday's 80 (the reference excludes the typo), so no question is asked.
  await row.getByLabel(massLabel(), { exact: true }).fill('80.2');
  await row.getByRole('button', { name: LABEL.saveEntry, exact: true }).click();
  await flushWrites(page);
  const masses = (await readDocument(page)).bodyMass[PROFILE_ID] ?? [];
  expect(masses).toHaveLength(2);
  expect(masses.find((e) => e.id === 'typo')?.massKg).toBe(80.2); // [kg]
});

test('G01: a pre-session weigh-in after Start makes the 2 % fluid-loss flag fire', async ({ context }) => {
  await seedDocument(context, e2eDocument({ weighInOptIn: true }));
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await page.getByLabel(preMassLabel(), { exact: true }).fill('80');
  await page.getByRole('button', { name: LABEL.logBodyMass, exact: true }).click();
  // Before G01 the field stayed on screen: every mass it stored was "after Start".
  await expect(page.getByLabel(preMassLabel(), { exact: true })).toHaveCount(0);
  await logSet(page, 1, '60', '5');
  await page.getByRole('button', { name: LABEL.finish }).dispatchEvent('click');
  // Audit C12: 1 of 6 prescribed sets logged, so Finish asks once.
  await page.getByRole('button', { name: LABEL.finishAnyway, exact: true }).dispatchEvent('click');
  await page.getByLabel(postMassLabel(), { exact: true }).fill('77.5'); // [kg] 3.1 % below 80
  await page.getByRole('button', { name: LABEL.logBodyMass, exact: true }).click();
  await expect(page.getByText(LABEL.fluidLoss)).toBeVisible();
});
