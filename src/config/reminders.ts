// src/config/reminders.ts
//
// Build-time reminder configuration and the numeric limits the Worker enforces (master plan
// §6.6). Nothing here reads a clock or touches the network; the constants are the client's
// copy of the Worker's contract, so a client that stays inside them never earns a 400.
//
// Units: every *_MS constant is elapsed milliseconds; *_DAYS is whole calendar days;
// LEAD_MINUTE_CHOICES is minutes before a slot's start time.

import type { ReminderSettings } from '../domain/types';

function readEnv(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * VITE_REMINDER_API as a usable origin, or the empty string when the build must not talk to a
 * Worker at all (P5 Task 5 review, item 2).
 *
 * Accepted: a bare `https:` origin; and `http://localhost` or `http://127.0.0.1`, with an
 * optional port, only when `dev` is true, so `vite dev` can reach `wrangler dev` while a
 * deployed bundle can never carry a cleartext destination. Everything else is refused,
 * including a `javascript:` or `data:` URL, credentials in the userinfo (URL.origin drops
 * those silently, so they are checked before the origin is read), a wildcard host, and any
 * path, query or fragment.
 *
 * Trailing slashes are trimmed rather than refused. The build-time gate in
 * build/cspPlugin.ts already rejects a trailing slash outright (`raw !== url.origin`), so any
 * value that reaches this function has passed that check; the trim is a runtime safety net for
 * a bundle built by some other path, and it is what keeps `${base}/v1/...` from producing a
 * double slash.
 *
 * Pure: it reads no environment and writes no console. The single warning for a rejected
 * value is emitted once, at module scope, below.
 *
 * @param raw the raw environment value, or undefined when the build had no variable.
 * @param dev import.meta.env.DEV at the call site.
 * @returns the origin with no trailing slash, or '' when the value must not be used.
 */
export function resolveReminderApiBase(raw: string | undefined, dev: boolean): string {
  const value = readEnv(raw);
  if (value === null) return '';
  // Checked before parsing: '*' is not a forbidden host code point, so 'https://*.workers.dev'
  // parses cleanly and would otherwise reach fetch as a literal host name.
  if (value.includes('*')) return '';

  const trimmed = value.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }

  if (url.username !== '' || url.password !== '') return '';
  if (url.pathname !== '/' && url.pathname !== '') return '';
  if (url.search !== '' || url.hash !== '') return '';

  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && isLoopback && dev) return url.origin;
  return '';
}

const RAW_REMINDER_API = import.meta.env.VITE_REMINDER_API;
const RESOLVED_REMINDER_API = resolveReminderApiBase(RAW_REMINDER_API, import.meta.env.DEV);

// One warning, and only when a value was actually supplied and refused: an unset variable is a
// legitimate build without reminders, which build/cspPlugin.ts already reports at build time.
// The value itself is never logged. It can be a full URL with a query or userinfo, and a
// console line survives in a support screenshot long after the URL has been rotated.
if (RESOLVED_REMINDER_API === '' && readEnv(RAW_REMINDER_API) !== null) {
  console.warn(
    '[fti] VITE_REMINDER_API is not an accepted origin, so reminders are disabled in this ' +
      'build. Expected a bare https origin. The value is not logged because it may carry ' +
      'credentials.',
  );
}

/**
 * Worker base URL with any trailing slashes removed, or null when the build had no variable or
 * carried one this module refuses.
 *
 * Deviation from the review's literal wording, recorded here: the review asked for `''` on a
 * rejected value, but `REMINDER_API_BASE` is `string | null` and
 * `src/domain/reminders/client.ts` gates every request on `REMINDER_API_BASE === null`.
 * Exporting `''` would either break that comparison at the type level or, worse, pass it at
 * runtime and turn every Worker call into a same-origin request to `/v1/devices/<id>`. The
 * refusal is therefore mapped to null, which is the value that already fails closed;
 * resolveReminderApiBase itself returns '' as the review specified.
 */
export const REMINDER_API_BASE: string | null =
  RESOLVED_REMINDER_API === '' ? null : RESOLVED_REMINDER_API;

export const VAPID_PUBLIC_KEY: string | null = readEnv(import.meta.env.VITE_VAPID_PUBLIC_KEY);

/** Reminders are only offerable when the build carried both variables. */
export const REMINDERS_CONFIGURED: boolean = REMINDER_API_BASE !== null && VAPID_PUBLIC_KEY !== null;

/** Master plan §6.6: the Worker accepts instants up to 21 days out. [d] whole calendar days. */
export const SCHEDULE_HORIZON_DAYS = 21;

/** Re-upload at least this often even when the schedule is unchanged. [ms] elapsed. */
export const SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Master plan §6.6: at most 200 reminders per device. [instants] */
export const MAX_INSTANTS = 200;

/**
 * Master plan §6.6: the Worker rejects any instant more than 21 days out with 400.
 * SCHEDULE_HORIZON_DAYS alone does not guarantee this — 21 calendar days spanning a
 * daylight-saving fall-back are 21 d + 1 h of elapsed time — so instants are clamped
 * against this value in milliseconds as well. [ms] elapsed.
 */
export const MAX_HORIZON_MS = 21 * 24 * 60 * 60 * 1000;

/** Lead times offered in the settings UI. [min] before the slot start. */
export const LEAD_MINUTE_CHOICES: readonly number[] = [120, 60, 30];

/** Master plan §5 defaults. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  dayOfTime: '08:00', // local wall clock in the profile's zone
  leadMinutes: [120], // [min]
};
