// e2e/support/app.ts
//
// Browser-side helpers. The document is seeded into fti.v3 by an init script BEFORE the app's own
// scripts run, guarded by a marker key; the app's first boot imports it into IndexedDB `fti`
// (spec R13). A relaunch (a new page in the same context, which is how an installed app's cold
// start is simulated: sessionStorage is new, localStorage and IndexedDB are kept) reads the
// records the previous page wrote, never the seed again.
import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { AppState } from '../../src/domain/types';
import {
  E2E_BASE_URL,
  LABEL,
  RECORD_APP_STORE,
  RECORD_DB_NAME,
  RECORD_MAP_STORES,
  RECORD_META_KEY,
  RECORD_SINGLETONS,
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

/** Every record in the page's IndexedDB `fti`, by store then key, and the meta record. */
export async function readRecords(page: Page): Promise<{ meta: unknown; stores: Record<string, Record<string, unknown>> }> {
  const stores = await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
    });
    const out: Record<string, Record<string, unknown>> = {};
    const names = Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i) ?? '');
    for (const store of names) {
      const os = db.transaction(store, 'readonly').objectStore(store);
      const read = <T,>(request: IDBRequest<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            reject(request.error ?? new Error('read failed'));
          };
        });
      const [keys, values] = await Promise.all([read(os.getAllKeys()), read(os.getAll())]);
      // Every record key the app writes is a string (src/store/db/records.ts); anything else is shown as JSON.
      out[store] = Object.fromEntries(
        keys.map((key, i): [string, unknown] => [typeof key === 'string' ? key : JSON.stringify(key), values[i]]),
      );
    }
    db.close();
    return out;
  }, RECORD_DB_NAME);
  return { meta: stores[RECORD_APP_STORE]?.[RECORD_META_KEY] ?? null, stores };
}

/** The stored records as one RAW document (unvalidated), for assertions. Throws before an import. */
export async function readDocument(page: Page): Promise<AppState> {
  const { meta, stores } = await readRecords(page);
  if (meta === null) throw new Error(`no records in IndexedDB ${RECORD_DB_NAME}`);
  const doc: Record<string, unknown> = { schemaVersion: Reflect.get(meta as object, 'schemaVersion') };
  for (const store of RECORD_MAP_STORES) doc[store] = stores[store] ?? {};
  for (const key of RECORD_SINGLETONS) doc[key] = stores[RECORD_APP_STORE]?.[key] ?? null;
  return doc as unknown as AppState;
}

/** [commits] The stored revision, 0 before anything is written. */
async function revisionOf(page: Page): Promise<number> {
  const { meta } = await readRecords(page);
  const revision: unknown = typeof meta === 'object' && meta !== null ? Reflect.get(meta, 'revision') : 0;
  return typeof revision === 'number' ? revision : 0;
}

/**
 * Waits until every commit has landed: spec R13 commits each action at once (no debounce), so
 * this polls the revision until two reads 150 ms apart agree (at most 7.5 s). Node's timer, so
 * the page's fake clock does not affect it.
 */
export async function flushWrites(page: Page): Promise<void> {
  let last = -1;
  for (let i = 0; i < 50; i += 1) {
    const revision = await revisionOf(page);
    if (revision === last) return;
    last = revision;
    await new Promise((resolve) => setTimeout(resolve, 150)); // [ms]
  }
  throw new Error('writes did not settle within 7.5 s');
}

/**
 * A renderer crash: SIGKILL to every renderer process of the context's browser, then waits for
 * the page's crash event. CDP Page.crash is not used: with Playwright 1.63 / Chromium 153 it
 * drops the whole browser connection, so no relaunch could follow. Call it with ONE page open
 * (every renderer is killed).
 */
export async function crashRenderer(context: BrowserContext, page: Page): Promise<void> {
  const browser = context.browser();
  if (browser === null) throw new Error('crashRenderer needs a launched browser, not a persistent context');
  const crashed = page.waitForEvent('crash', { timeout: 10_000 }); // [ms]
  const cdp = await browser.newBrowserCDPSession();
  const info = (await cdp.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; id: number }[] };
  const renderers = info.processInfo.filter((p) => p.type === 'renderer').map((p) => p.id);
  if (renderers.length === 0) throw new Error('no renderer process to crash; check SystemInfo.getProcessInfo');
  for (const pid of renderers) process.kill(pid, 'SIGKILL');
  await crashed;
  // The next page must not be handed a killed spare renderer: wait until the browser has reaped
  // every killed process (at most 5 s, Node's timer, so the page clock does not affect it).
  for (let i = 0; ; i += 1) {
    const now = (await cdp.send('SystemInfo.getProcessInfo')) as { processInfo: { id: number }[] };
    if (!now.processInfo.some((p) => renderers.includes(p.id))) break;
    if (i >= 50) throw new Error('killed renderers still listed after 5 s');
    await new Promise((resolve) => setTimeout(resolve, 100)); // [ms]
  }
  await cdp.detach().catch(() => undefined);
  await page.close().catch(() => undefined);
}

/** Rewrites one stored record behind the app's back, as disk corruption or a newer build would. */
export async function corruptRecord(page: Page, store: string, key: string, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    async ({ name, store: s, key: k, patch: p }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('open failed'));
        };
      });
      const tx = db.transaction(s, 'readwrite');
      const os = tx.objectStore(s);
      const get = os.get(k);
      get.onsuccess = () => {
        os.put({ ...(get.result as Record<string, unknown>), ...p }, k);
      };
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('write failed'));
        };
      });
      db.close();
    },
    { name: RECORD_DB_NAME, store, key, patch },
  );
}

/**
 * Opens Today, taps Start and waits for the Train view's Finish control. A relaunch reopens the
 * last view (`ui.lastView`), which after a session is Train, so Today is selected first.
 */
export async function startFromToday(page: Page): Promise<void> {
  // Action timeouts below the 60 s test timeout: a missing control must FAIL (status 'failed'),
  // not time the test out ('timedOut'), or a test.fail() repro spec reports an unexpected result.
  await page.getByRole('navigation').getByRole('button', { name: LABEL.todayTab, exact: true }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: LABEL.start }).click({ timeout: 10_000 });
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
