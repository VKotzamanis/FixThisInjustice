// e2e/support/app.ts
//
// Browser-side helpers. The document is seeded by an init script BEFORE the app's own scripts
// run, guarded by a marker key, so a relaunch (a new page in the same context, which is how an
// installed app's cold start is simulated: sessionStorage is new, localStorage is kept) reads
// what the previous page wrote instead of the seed.
import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { AppState } from '../../src/domain/types';
import {
  E2E_BASE_URL,
  LABEL,
  SEEDED_MARKER_KEY,
  STORAGE_KEY,
  logLabel,
  loadLabel,
  repsLabel,
} from './constants';

/**
 * A wall-clock instant for a civil date and time in America/Chicago. Fixed offset -05:00 (CDT),
 * valid from 2026-03-08 to 2026-10-31; refuses any other month rather than silently shifting.
 */
export function chicago(date: string, time: string): Date {
  const month = Number(date.slice(5, 7));
  if (month < 4 || month > 10) throw new Error(`chicago(): ${date} may be outside CDT; add its offset`);
  return new Date(`${date}T${time}:00-05:00`);
}

export async function seedDocument(context: BrowserContext, doc: AppState): Promise<void> {
  await context.addInitScript(
    ({ key, marker, text }) => {
      if (window.localStorage.getItem(marker) !== null) return;
      window.localStorage.setItem(key, text);
      window.localStorage.setItem(marker, '1');
    },
    { key: STORAGE_KEY, marker: SEEDED_MARKER_KEY, text: JSON.stringify(doc) },
  );
}

const clocks = new WeakSet<BrowserContext>();

/**
 * Sets the context's wall clock (every page in it). The first call installs fake timers that keep
 * running from `at`; later calls jump the system time without firing timers, which is what a
 * phone that slept overnight looks like to the next launch.
 */
export async function setClock(context: BrowserContext, at: Date): Promise<void> {
  if (clocks.has(context)) {
    await context.clock.setSystemTime(at);
    return;
  }
  await context.clock.install({ time: at });
  clocks.add(context);
}

/** A cold launch: a new page at the app's URL, waited until the shell has rendered. */
export async function openApp(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(E2E_BASE_URL);
  await page.locator('main').waitFor();
  return page;
}

export async function readRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

export async function readDocument(page: Page): Promise<AppState> {
  const text = await readRaw(page);
  if (text === null) throw new Error(`no document under ${STORAGE_KEY}`);
  return JSON.parse(text) as AppState;
}

/**
 * Writes any debounced change now: the store flushes on `pagehide` (src/store/index.ts
 * startPersistence), so this dispatches one instead of sleeping past SAVE_DEBOUNCE_MS.
 */
export async function flushWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
}

/** Taps Start on Today and waits for the Train view's Finish control. */
export async function startFromToday(page: Page): Promise<void> {
  await page.getByRole('button', { name: LABEL.start }).click();
  await expect(page.getByRole('button', { name: LABEL.finish })).toBeVisible();
}

/**
 * Logs set `n` of the open card. The Log tap is dispatched rather than clicked: on iPhone-size
 * screens the coach/undo toast covers the next Log button (audit C08, fixed in P4), and a real
 * click would land on the toast. This spec family tests the store, not that overlap.
 */
export async function logSet(page: Page, n: number, load: string, reps: string): Promise<void> {
  await page.getByLabel(loadLabel(n), { exact: true }).fill(load);
  await page.getByLabel(repsLabel(n), { exact: true }).fill(reps);
  await page.getByRole('button', { name: logLabel(n), exact: true }).dispatchEvent('click');
}
