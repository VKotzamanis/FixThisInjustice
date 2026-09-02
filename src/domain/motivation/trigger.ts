import { compareLocalDate } from '../dates';
import type { AppState, WeeklyReview } from '../types';

/**
 * The most recent closed week that still deserves the motivation popup, or null.
 *
 * A week qualifies when all four hold:
 *   delta < 0        — sessions completed fell short of the weekly target
 *                      (delta = completed − target, in sessions; negative = sessions missed)
 *   paused === false — a week overlapping a PlanPause is not a miss (master plan §6.4)
 *   missHandled === false — the popup has not already been answered for this week
 *   weekStart !== motivation.lastShownForWeek — this week was not the one last shown
 *
 * The last two conditions are deliberately redundant: markMotivationShown sets both,
 * so either one alone is enough to stop the popup reappearing on the next app open.
 */
export function pendingMotivation(
  state: Pick<AppState, 'weeklyReviews' | 'motivation'>,
  profileId: string,
): WeeklyReview | null {
  const reviews = state.weeklyReviews[profileId];
  if (reviews === undefined) return null;

  const lastShownForWeek = state.motivation[profileId]?.lastShownForWeek ?? null;

  let candidate: WeeklyReview | null = null;
  for (const review of reviews) {
    if (review.delta >= 0) continue;
    if (review.paused) continue;
    if (review.missHandled) continue;
    if (lastShownForWeek !== null && review.weekStart === lastShownForWeek) continue;
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
