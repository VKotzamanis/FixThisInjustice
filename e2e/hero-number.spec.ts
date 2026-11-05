// Owner report on 4a27393 (2026-11-05, from his phone): "the placement of the beverages, the
// numbers that glow appear very small and out of place". Lead's rulings:
//  1. The lit/burning session number renders only at display size, one hero numeral per screen
//     (Today: the session heading row; Train: beside the session title). Its size is the
//     rest-over burn word's, read from the one token both rules use (--burn-word-size).
//  2. No canvas inside any marquee or ticker: the banner items are plain text.
import { expect, test, type Page } from '@playwright/test';
import { chicago, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

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
