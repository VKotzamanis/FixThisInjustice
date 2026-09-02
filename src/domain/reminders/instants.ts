// src/domain/reminders/instants.ts
//
// The client owns all reminder scheduling. This module turns the projected calendar (P3) into
// the flat list of push instants the Worker stores and fires; the Worker never learns what a
// session is.
//
// Pure and clock-free: `now` is an argument, so the same five arguments always give the same
// list. No Date object and no toISOString appears here — every wall-clock conversion goes
// through src/domain/dates.ts, which is the only module that owns that arithmetic.
//
// Units: `at` and `now` are epoch milliseconds, UTC. `leadMinutes` is minutes before the
// slot's start time. `days` is whole calendar days.

import { MAX_HORIZON_MS, MAX_INSTANTS } from '../../config/reminders';
import { instantOf } from '../dates';
import { projectedCalendar } from '../schedule/calendar';
import { isTerminal } from '../schedule/cursor';
import type { AppState, EpochMs, LocalDate, ReminderInstant } from '../types';

/** [ms/min] */
const MS_PER_MINUTE = 60_000;

/**
 * Concrete push instants for the next `days` days, master plan §6.6.
 *
 * For every projected calendar day that has an availability slot, is not paused, is not
 * already completed or skipped, and carries a projected session: one "day-of" instant at
 * ReminderSettings.dayOfTime and one instant `leadMinutes` before the slot's start time.
 *
 * Two clamps, both against `now`:
 *   - an instant at or before `now` is dropped, so a day whose 08:00 reminder has passed
 *     still keeps its 16:00 and 17:00 leads;
 *   - an instant after `now + MAX_HORIZON_MS` is dropped. The bound is in ELAPSED
 *     MILLISECONDS, not calendar days: 21 calendar days spanning a daylight-saving fall-back
 *     are 21 d + 1 h of elapsed time, and the Worker rejects the whole upload with 400 if any
 *     single instant sits outside its own 21-day window.
 *
 * Wall-clock times are converted through dates.ts, so a DST transition inside the window moves
 * the epoch value and leaves the local time alone: 18:00 stays 18:00 on both sides of it.
 *
 * @param from  first LocalDate of the window, in the profile's zone.
 * @param days  [d] whole calendar days; 0 or negative gives an empty list.
 * @param now   [ms] epoch, UTC. Supplied by the caller; this module never reads a clock.
 * @returns instants sorted ascending by `at`, at most MAX_INSTANTS of them. Empty when the
 *          profile, its cursor, its plan or its settings are missing, or reminders are off.
 */
export function computeReminderInstants(
  state: AppState,
  profileId: string,
  from: LocalDate,
  days: number,
  now: EpochMs,
): ReminderInstant[] {
  const profile = state.profiles[profileId];
  const settings = state.reminderSettings[profileId];
  const cursor = state.cursors[profileId];
  if (profile === undefined || settings === undefined || cursor === undefined) return [];
  if (!settings.enabled) return [];
  const plan = state.plans[cursor.planId];
  if (plan === undefined) return [];

  const timezone = profile.timezone;
  const totalSessions = plan.sessions.length; // [sessions]
  // Longest lead first, so a day's instants come out in the order the user meets them and a
  // duplicate entry in settings cannot produce two instants sharing one key.
  const leads = [...new Set(settings.leadMinutes)].sort((a, b) => b - a); // [min]
  const horizonEnd = now + MAX_HORIZON_MS; // [ms] epoch, UTC

  const instants: ReminderInstant[] = [];
  for (const day of projectedCalendar(state, profileId, from, days)) {
    if (day.paused || day.slot === null || day.projectedSession === null) continue;
    // A finished day needs no reminder: the session was logged or deliberately skipped.
    if (day.assignment !== null && isTerminal(day.assignment)) continue;

    const session = day.projectedSession;
    const slot = day.slot;
    // Copy contract (master plan §3): the connector is a comma. Master §6.6's draft body used
    // an em dash, which that contract bans; the wording is otherwise unchanged.
    const title = `${session.label} today`;
    const body = `${session.name} at ${slot.startTime}, session ${session.ordinal} of ${totalSessions}`;

    const dayOfAt = instantOf(day.date, settings.dayOfTime, timezone); // [ms] epoch, UTC
    if (dayOfAt > now && dayOfAt <= horizonEnd) {
      instants.push({ key: `${day.date}:day-of:0`, at: dayOfAt, title, body });
    }

    const slotAt = instantOf(day.date, slot.startTime, timezone); // [ms] epoch, UTC
    for (const lead of leads) {
      const at = slotAt - lead * MS_PER_MINUTE; // [ms] epoch, UTC
      if (at <= now || at > horizonEnd) continue;
      instants.push({ key: `${day.date}:lead:${lead}`, at, title, body });
    }
  }

  // Ties are broken by key so the order is total, which is what makes the list, and every
  // assertion over it, reproducible.
  instants.sort((a, b) => (a.at === b.at ? a.key.localeCompare(b.key) : a.at - b.at));
  return instants.slice(0, MAX_INSTANTS);
}

/**
 * Order-independent 32-bit FNV-1a digest of a schedule, as eight lowercase hex characters.
 *
 * Algorithm: every instant is serialised as `key|at|title|body`; the lines are sorted and
 * joined with newlines, which removes any dependence on argument order; FNV-1a then folds the
 * result to 32 bits (offset basis 0x811c9dc5, prime 0x01000193, Math.imul for the wrap).
 *
 * It is a change detector, not a security primitive, and it is deliberately non-cryptographic:
 * the value never leaves the device except as an equality check against the copy the Worker
 * last acknowledged. A collision costs one delayed re-upload, until the six-hour staleness
 * rule in SYNC_MAX_AGE_MS forces one anyway.
 */
export function scheduleHash(instants: ReminderInstant[]): string {
  const canonical = instants
    .map((i) => `${i.key}|${i.at}|${i.title}|${i.body}`)
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
