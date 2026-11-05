// Owner report on 4a27393 (2026-11-05, from his phone): "the placement of the beverages, the
// numbers that glow appear very small and out of place". Lead's rulings:
//  1. The lit/burning session number renders only at display size, one hero numeral per screen
//     (Today: the session heading row; Train: beside the session title). Its size is the
//     rest-over burn word's, read from the one token both rules use (--burn-word-size).
//  2. No canvas inside any marquee or ticker: the banner items are plain text.
//  3. The Fluid progress line never wraps at 320/360/390/412 px; the totals take their own line.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { chicago, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { LABEL, PROFILE_ID } from './support/constants';

const WIDTHS = [320, 360, 390, 412] as const; // [px] CSS viewport widths of the phones in use

/** [px] The size --burn-word-size resolves to on this page; throws if the token is missing. */
async function burnWordSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const token = getComputedStyle(document.documentElement).getPropertyValue('--burn-word-size').trim();
    if (token === '') throw new Error('--burn-word-size is not defined in tokens.css');
    const probe = document.createElement('span');
    probe.style.fontSize = 'var(--burn-word-size)';
    document.body.append(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return px;
  });
}

/** [px] font-size of every laid-out .session-number word on the page (hidden views excluded). */
async function renderedNumberSizes(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.session-number')]
      .filter((el) => el.closest('[hidden]') === null && el.getClientRects().length > 0)
      .map((el) => parseFloat(getComputedStyle(el.querySelector('.session-number-word') ?? el).fontSize)),
  );
}

async function expectOneHeroNumber(page: Page, name: string): Promise<void> {
  const sizes = await renderedNumberSizes(page);
  const want = await burnWordSize(page);
  expect({ count: sizes.length, sizes }).toEqual({ count: 1, sizes: [want] });
  await expect(page.locator('.view-slot:not([hidden])').getByRole('img', { name, exact: true })).toBeVisible();
}

async function expectPlainMarquees(page: Page): Promise<void> {
  await expect(page.locator('.ll-marquee canvas')).toHaveCount(0);
  await expect(page.locator('.ll-marquee .session-number')).toHaveCount(0);
}

/** [line boxes] How many lines `el` takes: its height over a one-line copy of itself. */
async function lineBoxes(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const one = node.cloneNode(false) as HTMLElement;
    one.textContent = '[';
    node.after(one);
    const single = one.getBoundingClientRect().height; // [px]
    one.remove();
    return Math.round(node.getBoundingClientRect().height / single);
  });
}

test('Today: one hero session number at the burn word size, plain marquees', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await expect(page.locator('.view-slot:not([hidden]) .today-hero h1')).toBeVisible();
  await expectOneHeroNumber(page, 'Session 1');
  // It sits in the heading row, not on a line of its own under the summary.
  await expect(page.locator('.view-slot:not([hidden]) .today-heading-row .session-number')).toHaveCount(1);
  await expect(page.locator('.today-position')).toHaveCount(0);
  await expectPlainMarquees(page);
  // The banners still say where the plan stands, as text.
  await expect(page.locator('.topbar .ll-marquee-track')).toContainText('Session 1');
  await expect(page.locator('.view-slot:not([hidden]) .ll-marquee-track')).toContainText('Session 1');
  // A text line on the strip must be readable: its colour is not the strip's ground (it was ink
  // on the black panel, hidden only while the counter's own plate was the line).
  const pair = await page.locator('.view-slot:not([hidden]) .ll-marquee-text').first().evaluate((el) => ({
    text: getComputedStyle(el).color,
    ground: getComputedStyle(el.closest('.ll-marquee-strip') ?? el).backgroundColor,
  }));
  expect(pair.text).not.toBe(pair.ground);
});

test('Train: one hero session number beside the title, plain marquees', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await startFromToday(page);
  await expectOneHeroNumber(page, 'Session 1');
  await expect(page.locator('.view-slot:not([hidden]) .train-title-row .session-number')).toHaveCount(1);
  await expectPlainMarquees(page);
});

test('Fluid: the progress bar is one line at every phone width, the totals under it', async ({ context }) => {
  const doc = e2eDocument();
  const profile = doc.profiles[PROFILE_ID];
  if (profile === undefined) throw new Error('e2eDocument() has no profile; check e2e/support/document.ts');
  // The owner's case: US units, 900 mL of 3000 mL = "30.4 fl oz / 101.4 fl oz".
  doc.profiles[PROFILE_ID] = { ...profile, units: 'imperial' };
  doc.hydration[PROFILE_ID] = [{ profileId: PROFILE_ID, date: MONDAY, volumeML: 900, marks: [] }]; // [mL]
  await seedDocument(context, doc);
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  const bar = page.locator('.view-slot:not([hidden])').getByTestId('fluid-bar');
  const totals = page.locator('.view-slot:not([hidden])').getByTestId('fluid-progress');
  await expect(totals).toHaveText('30.4 fl oz / 101.4 fl oz');
  const line = bar.locator('xpath=..');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    expect({ width, lines: await lineBoxes(line) }).toEqual({ width, lines: 1 });
    expect({ width, lines: await lineBoxes(totals.locator('xpath=..')) }).toEqual({ width, lines: 1 });
    // The totals are under the bar, not beside it.
    const [b, t] = [await bar.boundingBox(), await totals.boundingBox()];
    expect((t?.y ?? 0) >= (b?.y ?? 0) + (b?.height ?? 0) - 1).toBe(true);
  }
});

// The other AsciiBar users (Targets: energy and protein) wrapped at 320 px too [measured 2.05
// line boxes before this change], so they take the same split.
test('Targets: the energy and protein bars are one line at every phone width', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  await page.getByRole('navigation').getByRole('button', { name: LABEL.targetsTab, exact: true }).click({ timeout: 10_000 });
  const view = page.locator('.view-slot:not([hidden])');
  for (const id of ['kcal-bar', 'protein-bar']) await expect(view.getByTestId(id)).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ['kcal', 'protein']) {
      const bar = view.getByTestId(`${id}-bar`).locator('xpath=..');
      const totals = view.getByTestId(`${id}-progress`).locator('xpath=..');
      expect({ width, id, lines: await lineBoxes(bar) }).toEqual({ width, id, lines: 1 });
      expect({ width, id, lines: await lineBoxes(totals) }).toEqual({ width, id, lines: 1 });
    }
  }
});
