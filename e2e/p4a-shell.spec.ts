// P4a shell and Train acceptances that need layout (docs/design/p4-design-brief.md 2.1-2.5,
// 4.1, 4.2, 5.2; audit F01, F02, F05, F07, F09, C05, C08). Chromium emulation: safe-area insets,
// the iOS keyboard and Android back in an installed app are device checks (plan Task 18).
import { expect, test, type Page } from '@playwright/test';
import { LABEL, deleteLabel, loadLabel, logLabel } from './support/constants';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { hitsItself, rectOf } from './support/sweeps';

const PHONE_WIDTHS = [320, 390, 412] as const; // [px]

/** A returning user on a planned Monday evening, opened cold. */
async function launch(context: Parameters<typeof openApp>[0]): Promise<Page> {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  return openApp(context);
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function openFromMore(page: Page, row: string): Promise<void> {
  await tab(page, LABEL.moreTab).click();
  await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
}

test('header: one 44 px line at every phone width, the title never cut to a letter (2.1, F07)', async ({ context }) => {
  const page = await launch(context);
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 700 });
    const header = await rectOf(page, '.topbar');
    expect(header?.height).toBe(44); // [px] no safe-area inset in Chromium
    for (const go of [
      () => tab(page, LABEL.todayTab).click(),
      () => tab(page, LABEL.trainTab).click(),
      () => tab(page, LABEL.targetsTab).click(),
      () => tab(page, LABEL.logTab).click(),
      () => openFromMore(page, LABEL.planRow),
      () => openFromMore(page, LABEL.atlasRow),
      () => openFromMore(page, LABEL.settingsRow),
    ]) {
      await go();
      const fits = await page.evaluate(() => {
        const t = document.querySelector('.topbar-title');
        return t !== null && t.scrollWidth <= t.clientWidth;
      });
      expect(fits).toBe(true);
    }
  }
});

test('tab bar: five slots, 64 x 56 px or more at 320 px, no clipped label, always at the bottom (2.2, F05)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 320, height: 640 });
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('.tabbar .tab')].map((b) => {
      const r = b.getBoundingClientRect();
      const label = b.querySelector('.tab-label');
      return { w: r.width, h: r.height, clipped: label === null || label.scrollWidth > label.clientWidth };
    }),
  );
  expect(tabs).toHaveLength(5);
  for (const t of tabs) {
    expect(t.w).toBeGreaterThanOrEqual(64);
    expect(t.h).toBeGreaterThanOrEqual(56);
    expect(t.clipped).toBe(false);
  }
  await openFromMore(page, LABEL.settingsRow);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const bar = await rectOf(page, '.tabbar');
  const inner = await page.evaluate(() => innerHeight);
  expect(bar?.bottom).toBe(inner);
});

test('one gutter: content is the viewport minus 32 px (2.3)', async ({ context }) => {
  const page = await launch(context);
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 700 });
    const content = await page.evaluate(() => {
      const v = document.querySelector('.view-slot:not([hidden]) .view');
      if (v === null) return -1;
      const s = getComputedStyle(v);
      return v.getBoundingClientRect().width - Number.parseFloat(s.paddingLeft) - Number.parseFloat(s.paddingRight);
    });
    expect(content).toBe(width - 32);
  }
});

test('footer only on Settings, its link 44 px tall (2.4)', async ({ context }) => {
  const page = await launch(context);
  expect(await page.locator('.view-slot:not([hidden]) .site-footer').count()).toBe(0);
  await openFromMore(page, LABEL.settingsRow);
  const link = await rectOf(page, '.view-slot:not([hidden]) .site-footer a');
  expect(link?.height).toBeGreaterThanOrEqual(44);
});

test('Back closes the More sheet first, then returns to the previous view, and never leaves the app (R6, F01)', async ({ context }) => {
  const page = await launch(context);
  await tab(page, LABEL.logTab).click();
  await tab(page, LABEL.moreTab).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).toContain('#/log');
  await page.goBack();
  expect(page.url()).toContain('#/today');
  await expect(tab(page, LABEL.todayTab)).toHaveAttribute('aria-current', 'page');
});

test('Start from Today scrolled 600 px opens Train at the top (2.5, F09)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.evaluate(() => {
    window.scrollTo(0, 600);
  });
  await page.getByRole('button', { name: LABEL.start }).click({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: LABEL.finish })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a typed set value survives a tab switch (2.5, F02)', async ({ context }) => {
  const page = await launch(context);
  await startFromToday(page);
  await page.getByLabel(loadLabel(1), { exact: true }).fill('62.5');
  await tab(page, LABEL.logTab).click();
  await tab(page, LABEL.trainTab).click();
  await expect(page.getByLabel(loadLabel(1), { exact: true })).toHaveValue('62.5');
});

test('Today: Start is fully visible above the tab bar at 320 x 640 and 390 x 664 (4.1)', async ({ context }) => {
  const page = await launch(context);
  for (const [width, height] of [
    [320, 640],
    [390, 664],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const start = await rectOf(page, '.view-slot:not([hidden]) .today-start');
    const bar = await rectOf(page, '.tabbar');
    const header = await rectOf(page, '.topbar');
    expect(start).not.toBeNull();
    expect(start?.top ?? 0).toBeGreaterThanOrEqual(header?.bottom ?? 0);
    expect(start?.bottom ?? Infinity).toBeLessThanOrEqual(bar?.top ?? 0);
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('.view-slot:not([hidden]) .today-controls > button')].map((b) => b.getBoundingClientRect().height),
    );
    for (const h of controls) expect(h).toBeGreaterThanOrEqual(44);
  }
});

test('Train: rest bar always in view, Log reachable under a toast, one active row near the top (4.2, C05, C08)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 390, height: 664 });
  await startFromToday(page);
  // (c) second session (warm-up dismissed in the seed): the active row's top in the upper half.
  const row = await rectOf(page, '.view-slot:not([hidden]) .ex-card.open .set-row.active');
  expect(row?.top ?? Infinity).toBeLessThanOrEqual(664 / 2);
  // (d) one Log button per open card; (e) every target in the active row >= 44 x 44.
  expect(await page.locator('.view-slot:not([hidden]) .ex-card.open .set-row.active .is-primary').count()).toBe(1);
  const targets = await page.evaluate(() =>
    [...document.querySelectorAll('.view-slot:not([hidden]) .set-row.active button, .view-slot:not([hidden]) .set-row.active input')].map((e) => {
      const r = e.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }),
  );
  for (const side of targets) expect(side).toBeGreaterThanOrEqual(44);

  await logSet(page, 1, '60', '5');
  // (a) the remaining rest is in the viewport at the top and at the bottom of the page.
  for (const y of [0, 100_000]) {
    await page.evaluate((top) => {
      window.scrollTo(0, top);
    }, y);
    const bar = await rectOf(page, '.view-slot:not([hidden]) .rest-panel');
    expect(bar).not.toBeNull();
    expect(bar?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(bar?.bottom ?? Infinity).toBeLessThanOrEqual(664);
  }
  // (b) with a toast showing (the undo offer), the active Log button takes its own tap.
  await page.getByRole('button', { name: deleteLabel(1), exact: true }).click();
  await expect(page.getByRole('button', { name: LABEL.undo, exact: true })).toBeVisible();
  const toast = await rectOf(page, '[data-testid="toast"]');
  expect(toast?.bottom ?? Infinity).toBeLessThanOrEqual(44 + 8 + 96); // [px] header + gap + cap
  await page.getByRole('button', { name: logLabel(1), exact: true }).scrollIntoViewIfNeeded();
  expect(await hitsItself(page, '.view-slot:not([hidden]) .set-row.active .is-primary')).toBe(true);
});

test('rest bar at 320 px: one row, no clipped label (4.2 f)', async ({ context }) => {
  const page = await launch(context);
  await page.setViewportSize({ width: 320, height: 640 });
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  const bar = await page.evaluate(() => {
    const sign = document.querySelector('.view-slot:not([hidden]) .rest-summary');
    if (sign === null) return null;
    const buttons = [...sign.querySelectorAll('button')].map((b) => b.scrollWidth <= b.clientWidth);
    return { height: sign.getBoundingClientRect().height, unclipped: buttons.every(Boolean) };
  });
  expect(bar?.height).toBeLessThanOrEqual(56); // [px] --restbar-h, border included
  expect(bar?.unclipped).toBe(true);
});

test('ticker keeps >= 120 px beside the compact brand on every view (ruling R-HDR, AM-4a-1)', async ({ context }) => {
  const page = await launch(context);
  for (const width of [320, 360, 390, 412] as const) {
    await page.setViewportSize({ width, height: 700 });
    const widths: number[] = []; // [px] the ticker window on each view
    for (const go of [
      () => tab(page, LABEL.todayTab).click(),
      () => tab(page, LABEL.trainTab).click(),
      () => tab(page, LABEL.targetsTab).click(),
      () => tab(page, LABEL.logTab).click(),
      () => openFromMore(page, LABEL.planRow),
      () => openFromMore(page, LABEL.atlasRow),
      () => openFromMore(page, LABEL.settingsRow),
    ]) {
      await go();
      const ticker = await rectOf(page, '.topbar .ll-marquee');
      expect(ticker).not.toBeNull();
      widths.push(ticker?.width ?? 0);
    }
    const brand = await page.evaluate(() => {
      const shortForm = document.querySelector('.topbar .brand-short');
      return shortForm !== null && getComputedStyle(shortForm).display !== 'none';
    });
    console.log(`R-HDR ticker ${JSON.stringify({ width, compactBrand: brand, minTickerPx: Math.min(...widths) })}`);
    expect(brand).toBe(width < 420); // ruling R1: 412 px is compact too
    // Ruling R1 (2026-11-05): the 120 px floor holds at every phone width, 412 px included.
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(120); // [px]
  }
});
