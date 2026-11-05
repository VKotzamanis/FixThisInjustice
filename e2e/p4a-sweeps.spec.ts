// P4a sweeps over every view and the open overlays (docs/design/p4-design-brief.md 3.1, 3.3,
// 6, 7; audit F06, F10): computed contrast, the 12 px type floor, 16 px fields, and no running
// animation under reduced motion. One worker; each sweep prints what failed and where.
import { expect, test, type Page } from '@playwright/test';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { LABEL, PROFILE_ID, deleteLabel } from './support/constants';
import { contrastFailures, smallFields, smallText } from './support/sweeps';

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true });

async function openFromMore(page: Page, row: string): Promise<void> {
  await tab(page, LABEL.moreTab).click();
  await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
}

/** Each screen the sweeps visit, reached the way a user reaches it. */
const SCREENS: ReadonlyArray<readonly [string, (page: Page) => Promise<void>]> = [
  ['today', (p) => tab(p, LABEL.todayTab).click()],
  ['train (session, rest bar, undo toast)', async (p) => {
    await startFromToday(p);
    await logSet(p, 1, '60', '5');
    // The undo offer: a toast on screen over the rest bar and the set rows.
    await p.getByRole('button', { name: deleteLabel(1), exact: true }).click();
  }],
  ['targets', (p) => tab(p, LABEL.targetsTab).click()],
  ['log', (p) => tab(p, LABEL.logTab).click()],
  ['plan', (p) => openFromMore(p, LABEL.planRow)],
  ['atlas', (p) => openFromMore(p, LABEL.atlasRow)],
  ['settings', (p) => openFromMore(p, LABEL.settingsRow)],
  ['more sheet', (p) => tab(p, LABEL.moreTab).click()],
  ['palette', async (p) => {
    await tab(p, LABEL.moreTab).click();
    await p.getByRole('dialog').getByRole('button', { name: LABEL.findRow, exact: true }).click();
  }],
  // AM-4a-7 effect 2: the picker's title echoes on the black sheet; the sheet is an overlay.
  ['rest game sheet', async (p) => {
    await startFromToday(p);
    await logSet(p, 1, '60', '5');
    await p.getByRole('button', { name: 'Play a Game' }).click();
    await expect(p.locator('.rest-sheet .ll-echo').first()).toBeVisible();
  }],
];

/**
 * The programme's first week (from the e2e Monday), met 3 of 3, seen on the next Monday: Today's
 * week stamp (WeekStamp, metWeek; a week before the plan started is not graded) shows, so the
 * knockout sticker is swept. delta = completed - target = 0 [sessions].
 */
const NEXT_MONDAY = '2026-09-14';
const MET_WEEK = {
  profileId: PROFILE_ID,
  weekStart: MONDAY,
  weekEnd: '2026-09-13',
  target: 3, // [sessions/week]
  completed: 3, // [sessions]
  skipped: 0, // [sessions]
  paused: false,
  delta: 0, // [sessions]
  evaluatedAt: Date.UTC(2026, 8, 14, 5, 0), // [ms] epoch UTC, Mon 00:00 CDT
  missHandled: false,
};

async function launch(context: Parameters<typeof openApp>[0]): Promise<Page> {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  return openApp(context);
}

/** The next Monday with the first week met: Today shows the knockout week stamp. */
async function launchWithStamp(context: Parameters<typeof openApp>[0]): Promise<Page> {
  const doc = e2eDocument();
  doc.weeklyReviews = { [PROFILE_ID]: [MET_WEEK] };
  await seedDocument(context, doc);
  await setClock(context, chicago(NEXT_MONDAY, '18:00'));
  const page = await openApp(context);
  await expect(page.getByTestId('week-stamp')).toBeVisible();
  return page;
}

test('contrast and type floor on the knockout week stamp (AM-4a-7 effect 3; brief 3.1, 3.3)', async ({ context }) => {
  const page = await launchWithStamp(context);
  expect(await contrastFailures(page)).toEqual([]);
  expect(await smallText(page)).toEqual([]);
});

for (const [name, reach] of SCREENS) {
  test(`contrast >= 4.5:1 (3:1 large) on ${name} (brief 3.3, 7; F06)`, async ({ context }) => {
    const page = await launch(context);
    await reach(page);
    expect(await contrastFailures(page)).toEqual([]);
  });

  test(`no text under 12 px and no field under 16 px on ${name} (brief 3.1; F10)`, async ({ context }) => {
    const page = await launch(context);
    await reach(page);
    expect(await smallText(page)).toEqual([]);
    expect(await smallFields(page)).toEqual([]);
  });
}

test('reduced motion: no animation at all on any view after 1 s (brief 6)', async ({ context }) => {
  const page = await launch(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [name, reach] of SCREENS.slice(0, 7)) {
    await reach(page);
    await page.waitForTimeout(1_000); // [ms]
    const animations = await page.evaluate(() =>
      document.getAnimations().map((a) => (a instanceof CSSAnimation ? a.animationName : a.constructor.name)),
    );
    expect({ name, animations }).toEqual({ name, animations: [] });
  }
});
