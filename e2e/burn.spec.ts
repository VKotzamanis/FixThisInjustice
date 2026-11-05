// AM-4a-9 (owner approval 2026-11-05): a rest that ends mounts the burn canvas on the rest bar's
// rest-over word once, and removes it (and its WebGL context) when the burn is over.
// The page clock is Playwright's (setClock installs it); the spec pauses it once the rest is over,
// so the burn's timers and animation frames advance only when this spec runs them.
import { expect, test, type Page } from '@playwright/test';
import { chicago, logSet, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

const STEP_MS = 5_000; // [ms] clock step while waiting for the rest to end (< the 10 s cue grace)
const MAX_REST_MS = 600_000; // [ms] upper bound on any prescribed rest

const canvas = (page: Page) => page.locator('.view-slot:not([hidden]) .rest-panel canvas.burn-canvas');

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
