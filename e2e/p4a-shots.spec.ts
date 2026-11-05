// The P4a after-shots for the owner's side-by-side review (docs/design/p4-design-brief.md 10):
// the same names as the before-set in docs/private/design-2026-11-04/ (gitignored), written to
// its after/ folder. Runs only with P4A_SHOTS=1, so CI and the normal e2e run skip it.
import { test, type Page } from '@playwright/test';
import { LABEL } from './support/constants';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

const OUT = 'docs/private/design-2026-11-04/after';

test.skip(process.env.P4A_SHOTS !== '1', 'owner review shots: run with P4A_SHOTS=1');

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

test('after-shots', async ({ context }, info) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  const shot = async (name: string, fullPage = false): Promise<void> => {
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png`, fullPage });
  };
  await shot('today');
  await shot('today-full', true);
  await startFromToday(page);
  await shot('train-open');
  await logSet(page, 1, '60', '5');
  await shot('train-after-log');
  for (const [name, label] of [
    ['targets', LABEL.targetsTab],
    ['log', LABEL.logTab],
  ] as const) {
    await tab(page, label).click();
    await shot(name);
  }
  for (const [name, row] of [
    ['plan', LABEL.planRow],
    ['atlas', LABEL.atlasRow],
    ['settings', LABEL.settingsRow],
  ] as const) {
    await tab(page, LABEL.moreTab).click();
    await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
    await shot(name);
  }
  await tab(page, LABEL.moreTab).click();
  await shot('modal-more');
  await page.getByRole('dialog').getByRole('button', { name: LABEL.findRow, exact: true }).click();
  await shot('modal-palette');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.keyboard.press('Escape');
  await tab(page, LABEL.trainTab).click();
  await shot('w320-train-open');
});
