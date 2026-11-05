// AM-4a-9 (owner approval 2026-11-05): a rest that ends mounts the burn canvas on the rest bar's
// rest-over word once, and removes it (and its WebGL context) when the burn is over.
// The page clock is Playwright's (setClock installs it); the spec pauses it once the rest is over,
// so the burn's timers and animation frames advance only when this spec runs them.
import { expect, test, type Page } from '@playwright/test';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { LABEL } from './support/constants';

const STEP_MS = 5_000; // [ms] clock step while waiting for the rest to end (< the 10 s cue grace)
const MAX_REST_MS = 600_000; // [ms] upper bound on any prescribed rest

const canvas = (page: Page) => page.locator('.view-slot:not([hidden]) .rest-panel canvas.burn-canvas');

/** The request burnText.createBurn makes: false on a GPU-less runner, where words stay plain. */
const hasWebgl = (page: Page) =>
  page.evaluate(
    () =>
      document
        .createElement('canvas')
        .getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) !== null,
  );

test('a rest end burns REST OVER once, then the canvas is gone', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  // The same request burnText.createBurn makes: without it the word must stay plain, no canvas.
  const webgl = await page.evaluate(
    () =>
      document
        .createElement('canvas')
        .getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) !== null,
  );
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  // Set entry is over: the burn never starts while a field has focus.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const over = page.locator('.view-slot:not([hidden]) .rest-summary.rest-over');
  for (let waited = 0; waited < MAX_REST_MS && (await over.count()) === 0; waited += STEP_MS) {
    await page.clock.runFor(STEP_MS);
  }
  await expect(over).toHaveCount(1);
  await expect(page.locator('.view-slot:not([hidden]) .rest-over-word')).toBeVisible();
  // Freeze the page clock: installed, it keeps running in real time between calls, and on WebKit
  // one locator round trip is slow enough (~0.6 s measured) that the 1.2 s burn could be over
  // before a check ran. Paused, only runFor moves it, on every engine. The 200 ms lead keeps the
  // target ahead of the still-running clock. Then step 100 ms at a time until the burn starts:
  // its 1.5 s delay counts from the word's mount, which lands at an engine-dependent offset.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 200); // [ms] epoch
  if (webgl) {
    let stepped = 0; // [ms]
    while (stepped < 3_000 && (await canvas(page).count()) === 0) {
      await page.clock.runFor(100);
      stepped += 100;
    }
    await expect(canvas(page)).toHaveCount(1);
    await expect(page.locator('.view-slot:not([hidden]) .rest-over-word.is-burning')).toHaveCount(1);
  } else {
    await page.clock.runFor(3_000); // [ms] past the 1.5 s pulse delay and the 1.2 s burn
    // No WebGL (a GPU-less runner may lack it): the plain word stays and no canvas mounts.
    await expect(canvas(page)).toHaveCount(0);
  }
  await page.clock.runFor(1_400); // [ms] past the 1.2 s burn
  await expect(canvas(page)).toHaveCount(0);
  await expect(page.locator('.view-slot:not([hidden]) .rest-over-word')).toBeVisible();
});

// Owner answer to review item 8 (2026-11-05): the lime words on the black panels are the burn
// shader's still frame in lime accents. One shared WebGL context draws them; every word on the
// page is a plain 2D canvas copy, so the page holds no WebGL context per word.
test('panel words are lit still frames, each a 2D canvas, the words still named', async ({ context, browserName }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('button', { name: LABEL.todayTab, exact: true })).toBeVisible();
  const lit = page.locator('canvas.lit-canvas');
  if (!(await hasWebgl(page))) {
    await expect(lit).toHaveCount(0);
    return;
  }
  // Header title and every lime tab label (the current tab is ink on its pink sticker: plain).
  await expect(page.locator('.topbar-title .lit-word.is-lit canvas.lit-canvas')).toHaveCount(1);
  const tabs = await nav.getByRole('button').count();
  // The labels are set at 75 % width. WebKit's canvas has no fontStretch, so its frame would be
  // wider than the word: litText.widthMatches refuses it and the CSS text stays (no misdrawn word).
  const litTabs = browserName === 'webkit' ? 0 : tabs - 1;
  await expect(page.locator('.tabbar .tab:not([aria-current]) .lit-word.is-lit canvas.lit-canvas')).toHaveCount(litTabs);
  await expect(page.locator('.tabbar .tab-label')).toHaveCount(tabs);
  await expect(page.locator('.tabbar .tab[aria-current] canvas')).toHaveCount(0);
  // getContext('2d') is null on a canvas that holds a WebGL context.
  const kinds = await lit.evaluateAll((els) => els.map((c) => ((c as HTMLCanvasElement).getContext('2d') === null ? 'webgl' : '2d')));
  expect(new Set(kinds)).toEqual(new Set(['2d']));
  // The DOM word stays the accessible name, its colour the lime the sweep reads.
  await expect(nav.getByRole('button', { name: LABEL.todayTab, exact: true })).toBeVisible();
});

// Owner answer to review item 10 (2026-11-05): the counter is the bare number, named "Session n",
// and burns once, in one renderer, when a completed session advances it.
test('the session counter is the bare number and burns once on a completed session', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '18:00'));
  const page = await openApp(context);
  const headerNumber = page.locator('.topbar .session-number').first();
  await expect(headerNumber).toHaveText('1');
  await expect(page.locator('.topbar .ll-marquee-static')).toContainText('Session 1');
  await expect(page.locator('.view-slot:not([hidden]) .today-position').getByRole('img', { name: 'Session 1' })).toBeVisible();
  const webgl = await hasWebgl(page);
  await startFromToday(page);
  await logSet(page, 1, '60', '5');
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  // Paused clock (see the rest-over test): only runFor moves the burn's timers and frames.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 200); // [ms] epoch
  await page.getByRole('button', { name: LABEL.finish }).dispatchEvent('click');
  await page.getByRole('button', { name: LABEL.finishAnyway, exact: true }).dispatchEvent('click');
  await expect(headerNumber).toHaveText('2');
  const burning = page.locator('.session-number canvas.burn-canvas');
  if (webgl) {
    let stepped = 0; // [ms]
    while (stepped < 2_000 && (await burning.count()) === 0) {
      await page.clock.runFor(100);
      stepped += 100;
    }
    await expect(burning).toHaveCount(1);
  }
  await page.clock.runFor(1_400); // [ms] past the 1.2 s burn
  await expect(burning).toHaveCount(0);
  await expect(headerNumber).toHaveText('2');
});
