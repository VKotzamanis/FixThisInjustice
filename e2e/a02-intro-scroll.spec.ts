// Audit A02: on a short screen the acknowledgement's Next sits below the fold and nothing scrolls,
// so first run cannot be completed.
import { expect, test, type BrowserContext } from '@playwright/test';
import { chicago, openApp, seedDocument, setClock } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

test.use({ reducedMotion: 'reduce' }); // the intro then types every slide at once

async function reachAndPassAcknowledgement(context: BrowserContext): Promise<void> {
  await seedDocument(context, e2eDocument({ profile: false, introSeen: false }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  const modal = page.locator('.intro-modal');
  for (let i = 0; i < 8 && !(await modal.isVisible()); i += 1) {
    await page.locator('section.intro').click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(250); // [ms] > INTRO_FADE_OUT_MS (180)
  }
  await expect(modal).toBeVisible();
  // A02 is "the button sits below the fold and nothing scrolls": the whole control must be
  // reachable on screen, not merely clickable at a 12 px sliver (iPhone landscape).
  const next = page.locator('.intro-acknowledgement-continue');
  await next.scrollIntoViewIfNeeded({ timeout: 5_000 });
  const box = await next.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box !== null && viewport !== null) {
    expect(box.y).toBeGreaterThanOrEqual(0); // [px]
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height); // [px]
  }
  await page.locator('.intro-acknowledgement input').check({ timeout: 5_000 });
  await next.click({ timeout: 5_000 });
  await expect(modal).toHaveCount(0);
}

test.describe('320 x 568 portrait', () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test('A02: the acknowledgement can be completed', async ({ context }) => {
    test.fail(); // removed by plan Task 16
    await reachAndPassAcknowledgement(context);
  });
});

test.describe('iPhone landscape 750 x 342', () => {
  test.use({ viewport: { width: 750, height: 342 } });
  test('A02: the acknowledgement can be completed', async ({ context }) => {
    test.fail(); // removed by plan Task 16
    await reachAndPassAcknowledgement(context);
  });
});
