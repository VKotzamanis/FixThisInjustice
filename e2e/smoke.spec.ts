import { expect, test } from '@playwright/test';
import { chicago, openApp, seedDocument, setClock } from './support/app';
import { MONDAY, e2eDocument } from './support/document';

test('opens on Today with the seeded profile and the Monday session', async ({ context }) => {
  await seedDocument(context, e2eDocument());
  await setClock(context, chicago(MONDAY, '17:00'));
  const page = await openApp(context);
  await expect(page.getByRole('heading', { level: 1, name: 'Lower A' })).toBeVisible();
});
