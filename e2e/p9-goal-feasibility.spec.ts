// ROADMAP P9 (owner 2026-11-06): on the first login the Goal step's calendar must say which target
// date is realistic, not only colour the days, and must say why when no date can be banded.
import { expect, test, type Page } from '@playwright/test';
import { chicago, openApp, seedDocument, setClock } from './support/app';
import { MONDAY, e2eDocument } from './support/document';
import { addDays } from '../src/domain/dates';
import { earliestRealisticDays, recompositionEstimateWeeks } from '../src/domain/nutrition';

const CURRENT_KG = 90; // [kg] typed on the Body step
const TARGET_KG = 80; // [kg] typed on the Goal step

async function next(page: Page): Promise<void> {
  await page.locator('.wiz-nav button').last().click({ timeout: 10_000 });
}

/** First run to the Goal step; `bodyFatPct` null ticks Not Measured. */
async function toGoalStep(page: Page, massKg: number, bodyFatPct: number | null): Promise<void> {
  await next(page); // Units: kilograms is the default
  await next(page); // Time zone: the device zone
  await page.locator('#f-age').fill('30');
  await page.getByLabel('Male', { exact: true }).check();
  await page.locator('#f-mass').fill(String(massKg));
  await page.locator('#f-height-m').fill('1');
  await page.locator('#f-height-cm').fill('80');
  if (bodyFatPct === null) await page.getByLabel('Not Measured').check();
  else await page.locator('#f-bodyfat').fill(String(bodyFatPct));
  await next(page);
  await next(page); // Training: defaults
}

test('P9: first login, the Goal step states the earliest realistic date and opens on its month', async ({
  context,
}) => {
  // A first run: no profile, no draft. The intro is not the subject, so it is marked seen.
  await seedDocument(context, e2eDocument({ profile: false }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);

  await toGoalStep(page, CURRENT_KG, null); // Not Measured, so the target is a body mass
  await page.locator('#f-target-mass').fill(String(TARGET_KG));

  // R1: derived from the domain function, never restated here (AGENTS rule 2).
  const days = earliestRealisticDays({ goal: 'fat-loss', currentMassKg: CURRENT_KG, targetMassKg: TARGET_KG });
  expect(days).not.toBeNull();
  const earliest = addDays(MONDAY, days ?? 0);
  await expect(page.getByTestId('earliest-realistic')).toContainText(`Earliest realistic date: ${earliest}`);
  await expect(page.getByTestId('calendar-month')).toHaveText(earliest.slice(0, 7));
  const banded = page.locator(
    '.wiz-calendar-day.wiz-band-realistic, .wiz-calendar-day.wiz-band-improbable, .wiz-calendar-day.wiz-band-highly-improbable',
  );
  expect(await banded.count()).toBeGreaterThan(0);
  await expect(page.locator(`.wiz-calendar-day[aria-label^="${earliest}"]`)).toHaveClass(/wiz-band-realistic/);
  const useButton = page.getByRole('button', { name: 'Use This Date' });
  const box = await useButton.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44); // [px] tap-target floor

  // R2: recomposition cannot be banded; without body-fat values it says what the estimate needs,
  // before any date is picked.
  await page.getByLabel('Gain muscle', { exact: true }).check();
  await expect(page.getByTestId('recomposition-estimate')).toHaveText(
    'The estimate needs your current and target body-fat %.',
  );
  await expect(page.locator('.wiz-calendar-legend')).toHaveCount(0);
  await expect(page.getByTestId('earliest-realistic')).toHaveCount(0);

  // Back to fat loss: Use This Date writes the date, and the verdict reads Realistic.
  await page.getByLabel('Hold muscle', { exact: true }).check();
  await useButton.click();
  await expect(page.locator('#f-target-date')).toHaveValue(earliest);
  await expect(page.getByTestId('feasibility-verdict')).toContainText('Realistic');
});

test('P9: first login, recomposition shows an estimated date, marked but never banded', async ({ context }) => {
  await seedDocument(context, e2eDocument({ profile: false }));
  await setClock(context, chicago(MONDAY, '10:00'));
  const page = await openApp(context);
  await toGoalStep(page, 80, 25); // [kg], [%]
  await page.getByLabel('Gain muscle', { exact: true }).check();
  await page.locator('#f-target-bodyfat').fill('20'); // [%]

  const weeks = recompositionEstimateWeeks({ currentMassKg: 80, currentBodyFatFraction: 0.25, targetBodyFatFraction: 0.2 });
  expect(weeks).not.toBeNull();
  const estimate = addDays(MONDAY, Math.ceil((weeks ?? 0) * 7));
  const block = page.getByTestId('recomposition-estimate');
  await expect(block).toContainText(`Estimated date: ${estimate} (about ${String(Math.round(weeks ?? 0))} weeks)`);
  await expect(block).toContainText('Vargas-Molina 2026');
  await expect(block).not.toContainText(/Realistic|Improbable/);
  await expect(page.getByTestId('calendar-month')).toHaveText(estimate.slice(0, 7));
  const day = page.locator(`.wiz-calendar-day[aria-label="${estimate}"]`);
  await expect(day).toHaveClass(/wiz-calendar-estimate/);
  await expect(day).toHaveClass(/wiz-band-none/);
  await expect(page.locator('.wiz-calendar-estimate')).toHaveCount(1);
  await expect(page.locator('.wiz-calendar-legend')).toHaveCount(0);
  const useButton = page.getByRole('button', { name: 'Use This Date' });
  expect((await useButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44); // [px]
  await useButton.click();
  await expect(page.locator('#f-target-date')).toHaveValue(estimate);
});
