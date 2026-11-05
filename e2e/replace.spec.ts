// e2e/replace.spec.ts
//
// Owner request: "if at one day you have to do triceps at the cable machine and the machine is
// taken or you just dont feel like it you can place replace when you start the exercise and
// another tricep exercise would be recommended". Train -> Replace on the first card -> the
// recommended row -> one tap -> the card shows it -> a relaunch keeps it -> a logged set removes
// Replace. Then the sheet's layout at 320/360/390/412 px.
//
// Units: every length is CSS px.
import { expect, test, type Page } from '@playwright/test';
import { chicago, flushWrites, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

/** The seeded Monday session's first card (e2e/support/document.ts). */
const FIRST = 'Barbell back squat';

const replaceOf = (page: Page, name: string) =>
  page.locator('.view-slot:not([hidden])').getByRole('button', { name: `Replace ${name}`, exact: true });

test('Replace swaps the first card to the recommended exercise, survives a relaunch, and goes once a set is logged', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '17:00'));
  const page = await openApp(context);
  await startFromToday(page);

  await replaceOf(page, FIRST).click({ timeout: 10_000 });
  const dialog = page.getByRole('dialog', { name: `Replace ${FIRST}` });
  await expect(dialog).toBeVisible();
  const recommended = dialog.locator('.replace-row.is-recommended');
  await expect(recommended).toBeVisible();
  const name = (await recommended.locator('.replace-name').textContent()) ?? '';
  expect(name).not.toBe('');
  expect(name).not.toBe(FIRST);

  await recommended.click();
  await expect(dialog).toHaveCount(0);
  const firstTitle = page.locator('.view-slot:not([hidden]) .ex-card .ex-title').first();
  await expect(firstTitle).toContainText(name);
  await expect(replaceOf(page, name)).toBeVisible();
  await flushWrites(page);
  await page.close();

  // A cold relaunch reads the stored edits: the slot still holds the replacement.
  const again = await openApp(context);
  await expect(again.locator('.view-slot:not([hidden]) .ex-card .ex-title').first()).toContainText(name, {
    timeout: 10_000,
  });
  await logSet(again, 1, '20', '8');
  await expect(replaceOf(again, name)).toHaveCount(0);
});

for (const width of [320, 360, 390, 412]) {
  test(`the Replace sheet fits ${String(width)} px: no sideways scroll, 44 px rows, 12 px text floor`, async ({ context }) => {
    await seedDocument(context, e2eDocument());
    await setClock(context, chicago(MONDAY, '17:00'));
    const page = await openApp(context);
    await page.setViewportSize({ width, height: 664 });
    await startFromToday(page);

    const head = await page.evaluate(() => {
      const row = document.querySelector('.view-slot:not([hidden]) .ex-head-row.has-action');
      const button = row?.querySelector('.ex-replace');
      return row === null || row === undefined || button === null || button === undefined
        ? null
        : { rowW: row.getBoundingClientRect().width, buttonH: button.getBoundingClientRect().height };
    });
    expect(head).not.toBeNull();
    expect(head?.buttonH ?? 0).toBeGreaterThanOrEqual(43.9); // [px] 44 px target, subpixel slack

    await replaceOf(page, FIRST).click({ timeout: 10_000 });
    const dialog = page.getByRole('dialog', { name: `Replace ${FIRST}` });
    await expect(dialog).toBeVisible();
    await dialog.locator('details.replace-more > summary').click();
    const layout = await page.evaluate(() => {
      const sheet = document.querySelector('.replace-sheet');
      if (sheet === null) return null;
      const rows = [...sheet.querySelectorAll('.replace-row, details.replace-more > summary')];
      const texts = [...sheet.querySelectorAll('*')].filter((el) =>
        [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
      );
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        sheetOverflowX: sheet.scrollWidth > sheet.clientWidth,
        rowMinH: Math.min(...rows.map((r) => r.getBoundingClientRect().height)),
        fontMin: Math.min(...texts.map((el) => parseFloat(getComputedStyle(el).fontSize))),
        rows: rows.length,
      };
    });
    console.log(`Replace layout ${JSON.stringify({ width, ...layout })}`);
    expect(layout).not.toBeNull();
    expect(layout?.overflowX).toBe(false);
    expect(layout?.sheetOverflowX).toBe(false);
    expect(layout?.rows ?? 0).toBeGreaterThan(2);
    expect(layout?.rowMinH ?? 0).toBeGreaterThanOrEqual(43.9); // [px]
    expect(layout?.fontMin ?? 0).toBeGreaterThanOrEqual(12); // [px] text floor

    // The scrim closes it and changes nothing.
    await page.getByTestId('replace-sheet').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await expect(replaceOf(page, FIRST)).toBeVisible();
  });
}
