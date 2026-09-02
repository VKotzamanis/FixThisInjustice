// src/ui/format/weekDelta.ts
//
// One reader for the sign of a closed week's stored delta, and the copy key that names it.
//
// WHY THIS IS A MODULE AND NOT THREE BRANCHES. Three components render a verdict on the same
// WeeklyReview: TodayView's ticker line, WeekStamp (a met week) and Intervention (a missed week
// whose popup has been answered). Each carried its own mapping, and two of them carried only
// the half they expected to see -- WeekStamp tested `delta === 0` and assumed the rest was
// positive, Intervention named `status.weekDeltaNegative` outright. That is three places to
// edit when the convention changes and two of them silently correct only while their caller's
// guard holds.
//
// `delta = completed - target` [sessions/week] is written once, by src/domain/schedule/weekly.ts,
// and only read here. Nothing in this module recomputes it from the two counts: a sign derived a
// second time is a second definition of "met the target".

import type { CopyKey } from '../../content/copy';
import type { WeeklyReview } from '../../domain/types';

/**
 * The copy key that states the outcome of a closed week.
 *
 * The three rows differ in words alone and each carries the SAME two counts as slots
 * (`{completed}`, `{target}`), so every caller fills them the same way through
 * `FORMAT.withSlots` and no skin can change the number a user reads.
 *
 * A WEEK THE PLAN WAS PAUSED IN IS NOT DESCRIBED BY ANY OF THE THREE, and this function does
 * not check for one. Such a week carries delta = 0 by construction (weekly.ts), so it would map
 * to "target met" over a week in which nothing was scheduled and nothing was missed. The
 * `paused` guard belongs to the caller's own predicate -- `metWeek` in WeekStamp.tsx,
 * `handledMiss` in Intervention.tsx, the ticker's own test in TodayView.tsx -- because each of
 * those has a second condition to combine it with, and a guard here would let a caller drop its
 * own and still look correct.
 *
 * @param review the stored review. Only `delta` [sessions/week] is read.
 */
export function weekDeltaKey(review: WeeklyReview): CopyKey {
  if (review.delta < 0) return 'status.weekDeltaNegative';
  return review.delta === 0 ? 'status.weekDeltaZero' : 'status.weekDeltaPositive';
}
