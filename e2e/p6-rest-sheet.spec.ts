// e2e/p6-rest-sheet.spec.ts
//
// P6 (plan D1, D2; audit C14). With Rest Word open in the bottom sheet after set 1: every QWERTY
// key is >= 24 px wide and >= 44 px tall with no horizontal page scroll (320-412 px), and at
// 390 x 664 (iPhone 13 Safari) the sheet keeps to its 472 px cap without scrolling inside; at
// every width the next set's row and its Log button sit wholly above it once scrolled under the
// 44 px top bar (P4a AM-4a-5).
//
// Units: every length is CSS px.
import { expect, test, type Page } from '@playwright/test';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

interface Layout {
  keyMinW: number; // [px]
  keyMinH: number; // [px]
  overflowX: boolean;
  topbarH: number; // [px]
  rowH: number; // [px] the next unlogged set row
  logBottom: number | null; // [px] from the viewport top
  sheetTop: number; // [px] from the viewport top
  sheetH: number; // [px]
  sheetInnerScroll: number; // [px] scrollHeight - clientHeight of the sheet
}

async function openRestWord(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play a Game' }).click();
  await page.getByRole('button', { name: 'Rest Word' }).click();
  await expect(page.getByRole('heading', { name: 'Rest Word' })).toBeVisible();
}

/** Scrolls the next unlogged row to just under the sticky top bar, then measures. */
async function measure(page: Page): Promise<Layout> {
  const layout = await page.evaluate((): Layout | null => {
    const keys = [...document.querySelectorAll('.rest-word-key')].map((key) => key.getBoundingClientRect());
    const row = document.querySelector('.set-row:not(.done)');
    const bar = document.querySelector('.topbar');
    const sheet = document.querySelector('.rest-sheet');
    if (row === null || bar === null || sheet === null || keys.length === 0) return null;
    window.scrollBy(0, row.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
    const r = row.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    const buttons = [...row.querySelectorAll('button')];
    const log = buttons[buttons.length - 1];
    return {
      keyMinW: Math.min(...keys.map((k) => k.width)),
      keyMinH: Math.min(...keys.map((k) => k.height)),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      topbarH: bar.getBoundingClientRect().height,
      rowH: r.height,
      logBottom: log === undefined ? null : log.getBoundingClientRect().bottom,
      sheetTop: s.top,
      sheetH: s.height,
      sheetInnerScroll: sheet.scrollHeight - sheet.clientHeight,
    };
  });
  if (layout === null) throw new Error('the sheet, the top bar or the next set row is missing');
  return layout;
}

for (const width of [320, 360, 390, 412]) {
  test.describe(`rest-game sheet at ${String(width)} x 664`, () => {
    test.use({ viewport: { width, height: 664 } });

    test('keys fit, nothing scrolls sideways, and the next set stays above the sheet', async ({ context }) => {
      // P4a Task 8 (AM-4a-5): the header is one 44 px row with the ticker inside it (it was 85 px),
      // so header + one set row fits above the sheet at every width, not only 390.
      await seedDocument(context, e2eDocument());
      await setClock(context, chicago(MONDAY, '17:00'));
      const page = await openApp(context);
      await startFromToday(page);
      await logSet(page, 1, '60', '8');
      await openRestWord(page);
      const layout = await measure(page);
      console.log(`P6 layout ${JSON.stringify({ width, ...layout })}`);

      expect(layout.keyMinW).toBeGreaterThanOrEqual(24); // [px] WCAG 2.2 SC 2.5.8
      expect(layout.keyMinH).toBeGreaterThanOrEqual(43.9); // [px] 44 px target, subpixel slack
      expect(layout.overflowX).toBe(false);
      if (width === 390) {
        expect(layout.sheetH).toBeLessThanOrEqual(472.5); // [px] 664 - 192
        expect(layout.sheetInnerScroll).toBeLessThanOrEqual(1); // [px]
      }
      expect(layout.topbarH).toBeLessThanOrEqual(44.5); // [px] --header-h, no inset in Chromium
      expect(layout.topbarH + layout.rowH).toBeLessThanOrEqual(layout.sheetTop + 0.5); // [px]
      expect(layout.logBottom).not.toBeNull();
      expect(layout.logBottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(layout.sheetTop + 0.5); // [px]
    });
  });
}

// Spec R6 on both engines: Back closes the open rest-game sheet first and leaves the view on
// Train; only the next Back leaves Train.
test('Back closes the rest-game sheet before it leaves Train (R6)', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '17:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await logSet(page, 1, '60', '8');
  await openRestWord(page);
  expect(page.url()).toContain('#/train');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Rest Word' })).toHaveCount(0);
  expect(page.url()).toContain('#/train');
  await page.goBack();
  await expect.poll(() => page.url()).not.toContain('#/train');
  expect(page.url()).toContain('#/today');
});
