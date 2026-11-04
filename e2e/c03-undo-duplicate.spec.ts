// Audit C03: delete set 1, log set 1 again, tap Undo: two "set 1" records, one hidden.
import { expect, test } from '@playwright/test';
import { LABEL, deleteLabel } from './support/constants';
import { chicago, flushWrites, logSet, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

test('C03: undo after delete and relog never duplicates a set', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  await page.getByRole('button', { name: deleteLabel(1), exact: true }).dispatchEvent('click');
  await logSet(page, 1, '60', '6');
  const undo = page.getByRole('button', { name: LABEL.undo, exact: true });
  if (await undo.isVisible()) await undo.click();
  await flushWrites(page);
  const firsts = Object.values((await readDocument(page)).sets).filter(
    (s) => s.exerciseId === 'barbell-back-squat' && s.setNumber === 1,
  );
  expect(firsts.map((s) => s.reps)).toEqual([6]); // [repetitions]
});
