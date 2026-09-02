import { addDays, compareLocalDate, instantOf } from '../dates';
import type { AppState, EpochMs, LocalDate, TimeZone, WeeklyReview } from '../types';

/**
 * How far back the popup reaches, measured from the instant a missed week closed to `now`.
 *
 * Why a bound exists at all: `closeWeeks` back-fills every week from `weekStart(cursor.startedOn)
 * forward, up to MAX_WEEKS_EVALUATED = 520 of them, so a plan back-dated by years arrives with a
 * queue of unhandled misses. Without a window the modal is shown once per app open until each of
 * those weeks has been dismissed individually, which is a fault report, not motivation.
 *
 * 14 days is a product decision, not a measured quantity: it is two review cycles, long enough
 * that a week missed while the user was away is still raised on their return, short enough that
 * the popup always refers to a week the user can remember.
 */
export const MOTIVATION_MISS_WINDOW_DAYS = 14; // [days]

/**
 * The same window as an elapsed duration on the timeline. Elapsed, not calendar: a DST
 * transition inside the window moves the boundary by one hour, which a policy threshold this
 * coarse does not care about, and measuring in epoch milliseconds keeps the comparison in one
 * unit end to end.
 */
const MOTIVATION_MISS_WINDOW_MS = MOTIVATION_MISS_WINDOW_DAYS * 86_400_000; // [ms] = [days] * [ms/day]

/**
 * The instant a week ends: midnight opening the day after its Sunday, in the profile's own
 * zone. The week boundary is a civil-date question, so it is answered in the profile's zone
 * and nowhere else (the rule `weekly.ts` states for `closeWeeks`); this is the one place the
 * civil date becomes an instant, and it goes through `instantOf`, never `toISOString`.
 */
function weekCloseInstant(weekEnd: LocalDate, timezone: TimeZone): EpochMs {
  return instantOf(addDays(weekEnd, 1), '00:00', timezone); // [d] -> [ms] epoch, UTC
}

/**
 * The most recent closed week that still deserves the motivation popup, or null.
 *
 * A week qualifies when all five hold:
 *   delta < 0        — sessions completed fell short of the weekly target
 *                      (delta = completed − target, in sessions; negative = sessions missed)
 *   paused === false — a week overlapping a PlanPause is not a miss (master plan §6.4)
 *   missHandled === false — the popup has not already been answered for this week
 *   weekStart !== motivation.lastShownForWeek — this week was not the one last shown
 *   now − weekClose < MOTIVATION_MISS_WINDOW_DAYS — the week closed recently enough to matter
 *                      (master plan §10.5; the window is half-open, so an age of exactly one
 *                      window is outside it)
 *
 * The fourth condition is deliberately redundant with the third: markMotivationShown sets both,
 * so either one alone is enough to stop the popup reappearing on the next app open.
 *
 * This function only reads. A miss that falls outside the window keeps `missHandled === false`;
 * deciding what to do with that backlog belongs to the store action, not to the selector.
 *
 * `now` is epoch milliseconds, UTC. It is a required argument rather than a `Date.now()` default
 * so the caller's single clock reading is the one the whole open sequence uses.
 */
export function pendingMotivation(
  state: Pick<AppState, 'weeklyReviews' | 'motivation' | 'profiles'>,
  profileId: string,
  now: EpochMs,
): WeeklyReview | null {
  // No profile means no timezone, so no week can be placed on the timeline. It also means no
  // running programme, which is the same answer `closeWeeks` gives.
  const profile = state.profiles[profileId];
  if (profile === undefined) return null;
  const reviews = state.weeklyReviews[profileId];
  if (reviews === undefined) return null;

  const lastShownForWeek = state.motivation[profileId]?.lastShownForWeek ?? null;
  const cutoff = now - MOTIVATION_MISS_WINDOW_MS; // [ms] epoch, UTC: the oldest close still offered

  let candidate: WeeklyReview | null = null;
  for (const review of reviews) {
    if (review.delta >= 0) continue;
    if (review.paused) continue;
    if (review.missHandled) continue;
    if (lastShownForWeek !== null && review.weekStart === lastShownForWeek) continue;
    if (weekCloseInstant(review.weekEnd, profile.timezone) <= cutoff) continue;
    if (candidate === null || compareLocalDate(review.weekStart, candidate.weekStart) === 1) {
      candidate = review;
    }
  }
  return candidate;
}

/**
 * One clinical sentence naming the week and what was completed against the target.
 * Counts are sessions. The shortfall itself is arithmetic the user cannot act on,
 * so it is not stated (copy contract R9); the modal heading already says the target
 * was missed.
 */
export function describeMiss(review: WeeklyReview): string {
  return review.completed === 0
    ? `Week of ${review.weekStart}: no sessions completed.`
    : `Week of ${review.weekStart}: ${review.completed} of ${review.target} sessions completed.`;
}
