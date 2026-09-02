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

/** Worker base URL with any trailing slashes removed, or null when the build had no var. */
export const REMINDER_API_BASE: string | null = (() => {
  const base = readEnv(import.meta.env.VITE_REMINDER_API);
  return base === null ? null : base.replace(/\/+$/, '');
})();

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
