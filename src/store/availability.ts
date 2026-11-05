// src/store/availability.ts
//
// The Settings availability editor's write (audit D05, D16), as a pure transition. Calendar
// only: the plan, the cursor and every logged row are untouched; only the preferred days, their
// start times and the weekly target change.
import { closeWeeks } from '../domain/schedule/weekly';
import type { AppState, Availability, EpochMs } from '../domain/types';
import { applySetAvailability } from './setup';

/**
 * D16: every week that has already ended is graded first, under the availability it ran with,
 * so the new target and days can never regrade it (a review is never recomputed once stored).
 * Then the new availability is parsed with the loader's schema and stored (spec R5). Throws,
 * writing nothing, on a refusal: an unknown profile, a cleared start time, a target above the
 * number of days.
 *
 * @param now [ms] epoch, UTC: the instant closeWeeks reads the profile's civil today from.
 */
export function applyUpdateAvailability(
  s: AppState,
  profileId: string,
  a: Availability,
  now: EpochMs,
): AppState {
  const graded = closeWeeks(s, profileId, now);
  return applySetAvailability(graded, profileId, a, 'updateAvailability');
}
