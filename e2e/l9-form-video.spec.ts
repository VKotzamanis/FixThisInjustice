// e2e/l9-form-video.spec.ts
//
// ROADMAP L9 (audit E05). Opening Form Reference on an exercise that carries a clip id frames
// YouTube's privacy-enhanced player with that id. Only the frame's attributes are asserted: every
// request to the player host is aborted, so nothing is fetched from YouTube during the test.
import { expect, test } from '@playwright/test';
import { chicago, openApp, seedDocument, setClock, startFromToday } from './support/app';
import { FORM_VIDEO, LABEL } from './support/constants';
import { MONDAY, e2eDocument } from './support/document';

test('Form Reference frames the curated clip from youtube-nocookie, with no autoplay', async ({ context }) => {
  const playerRequests: string[] = [];
  await context.route('https://www.youtube-nocookie.com/**', async (route) => {
    playerRequests.push(route.request().url());
    await route.abort();
  });
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '17:00'));
  const page = await openApp(context);
  await startFromToday(page);

  // Nothing is framed before the tap (docs/ARCHITECTURE.md, Privacy).
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(playerRequests).toEqual([]);

  await page.getByRole('button', { name: LABEL.formReference, exact: true }).first().click({ timeout: 10_000 });
  const frame = page.getByRole('dialog').locator('iframe');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', FORM_VIDEO.embedSrc);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(await frame.getAttribute('allow')).not.toContain('autoplay');
});
