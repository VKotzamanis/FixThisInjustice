// src/domain/schedule/calendar.test.ts
//
// Projection and reshuffle tests. Every date is a fixture LocalDate; no test reads a clock,
// so the suite is deterministic in any process time zone.
//
// Deviations from the P3 plan's literal Step 1 block, recorded here because the plan's test
// code predates the amended §6.4 contract ("remainingLabelsThisWeek returns exactly the
// labels assignToday can honour"):
//
//   1. assignToday THROWS RangeError when the label is not among the labels
//      remainingLabelsThisWeek reports for that day; the plan returned the same state
//      reference. A silent no-op is indistinguishable from a successful reshuffle at the call
//      site, and the two functions are now exact duals.
//   2. remainingLabelsThisWeek returns [] on a day whose assignment is already terminal,
//      because assignToday can honour nothing there. The plan reported the week's labels and
//      then refused them.
//
// Retained from the plan against the launching brief's paraphrase: the reorder is a
// transposition ("a swap is not a rotation", P3 "Contract decisions this plan pins down"
// item 4 and its worked example), not a splice-and-shift.

import { describe, expect, it } from 'vitest';
import { assignToday, projectedCalendar, remainingLabelsThisWeek } from './calendar';
import { completeSession, pausePlan, resumePlan, skipSession, startSession } from './cursor';
import {
  assignmentOn,
  cursorOf,
  FRIDAY,
  labelMultiset,
  labelsOf,
  MONDAY,
  NOW_MS,
  planOf,
  PROFILE_ID,
  SATURDAY,
  seedState,
  SUNDAY,
  THURSDAY,
  TUESDAY,
  WEDNESDAY,
} from '../../test/scheduleFixtures';
import { parseState } from '../schema';
import type { AppState } from '../types';

// Availability: Monday, Wednesday, Friday at 07:00. Plan labels run Push / Legs / Pull twice.
const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
const MWF = [1, 3, 5] as const;

function seed(nextSessionIndex = 0): AppState {
  return seedState({ labels: LABELS, weekdays: [...MWF], nextSessionIndex });
}

/**
 * The result of every transition is still a document the schema accepts, and parsing it back
 * changes nothing (security constraint 1: nothing enters the store unvalidated).
 */
function expectValid(state: AppState): void {
  const parsed = parseState(state);
  if (!parsed.ok) throw new Error(`parseState rejected the transition result: ${parsed.error}`);
  expect(parsed.state).toEqual(state);
}

/** plan.sessions[i].ordinal === i + 1 for every i (master §5, P3 contract decision 4). */
function expectOrdinalInvariant(state: AppState): void {
  planOf(state).sessions.forEach((s, i) => {
    expect(s.ordinal).toBe(i + 1);
  });
}

describe('projectedCalendar', () => {
  it('returns one entry per requested day, starting at `from`', () => {
    const days = projectedCalendar(seed(), PROFILE_ID, MONDAY, 7); // [d]
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      MONDAY,
      TUESDAY,
      WEDNESDAY,
      THURSDAY,
      FRIDAY,
      SATURDAY,
      SUNDAY,
    ]);
  });

  it('returns an empty array for a non-positive day count', () => {
    expect(projectedCalendar(seed(), PROFILE_ID, MONDAY, 0)).toEqual([]);
    expect(projectedCalendar(seed(), PROFILE_ID, MONDAY, -3)).toEqual([]);
  });

  it('refuses a day count that is not a whole number', () => {
    // Infinity would loop forever and 2.5 would silently mean 3; both are caller bugs.
    expect(() => projectedCalendar(seed(), PROFILE_ID, MONDAY, 2.5)).toThrow(RangeError);
    expect(() => projectedCalendar(seed(), PROFILE_ID, MONDAY, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  it("attaches the availability slot for the day's ISO weekday", () => {
    const days = projectedCalendar(seed(), PROFILE_ID, MONDAY, 3);
    expect(days[0]?.slot?.startTime).toBe('07:00');
    expect(days[1]?.slot).toBeNull();
    expect(days[2]?.slot?.weekday).toBe(3);
  });

  it('takes one slot per weekday: the first declared wins', () => {
    const base = seed();
    const duplicated: AppState = {
      ...base,
      availability: {
        [PROFILE_ID]: {
          slots: [
            { weekday: 1, startTime: '07:00', expectedDurationS: 3600 }, // [s]
            { weekday: 1, startTime: '18:00', expectedDurationS: 3600 }, // [s] same weekday
          ],
          weeklySessionTarget: 1, // [sessions/week]
        },
      },
    };
    expectValid(duplicated);
    const days = projectedCalendar(duplicated, PROFILE_ID, MONDAY, 3);
    expect(days[0]?.slot?.startTime).toBe('07:00');
    // The duplicate must not consume a second session: Monday is one training day.
    expect(days[0]?.projectedSession?.id).toBe('s-1');
    expect(days[1]?.projectedSession).toBeNull();
  });

  it('projects nothing on a day with no slot', () => {
    const days = projectedCalendar(seed(), PROFILE_ID, MONDAY, 2);
    expect(days[1]?.slot).toBeNull();
    expect(days[1]?.projectedSession).toBeNull();
  });

  it('walks the cursor forward over slot days only', () => {
    const days = projectedCalendar(seed(0), PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe('s-1'); // Mon
    expect(days[2]?.projectedSession?.id).toBe('s-2'); // Wed
    expect(days[4]?.projectedSession?.id).toBe('s-3'); // Fri
    expect(days[5]?.projectedSession).toBeNull(); // Sat
  });

  it("starts from the cursor's current index, not from zero", () => {
    const days = projectedCalendar(seed(2), PROFILE_ID, MONDAY, 5);
    expect(days[0]?.projectedSession?.id).toBe('s-3');
    expect(days[2]?.projectedSession?.id).toBe('s-4');
  });

  it('stops projecting once the plan is exhausted', () => {
    const days = projectedCalendar(seed(5), PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe('s-6');
    expect(days[2]?.projectedSession).toBeNull();
  });

  it('projects nothing on a paused day and does not consume a session', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, null);
    const days = projectedCalendar(paused, PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe('s-1'); // Mon, before the pause
    expect(days[2]?.paused).toBe(true);
    expect(days[2]?.projectedSession).toBeNull(); // Wed consumed nothing
    expect(days[4]?.paused).toBe(true);
    expect(days[4]?.projectedSession).toBeNull(); // Fri still paused
  });

  it('skips only the paused days when the pause sits mid-week', () => {
    const open = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, 'travel');
    const closed = resumePlan(open, PROFILE_ID, THURSDAY); // half-open [Wed, Thu)
    const days = projectedCalendar(closed, PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe('s-1'); // Mon
    expect(days[2]?.paused).toBe(true);
    expect(days[2]?.projectedSession).toBeNull(); // Wed paused, consumes nothing
    expect(days[4]?.paused).toBe(false);
    expect(days[4]?.projectedSession?.id).toBe('s-2'); // Fri resumes at s-2
  });

  it('resumes the walk at the same index after a closed pause', () => {
    const open = pausePlan(seed(0), PROFILE_ID, TUESDAY, null);
    const resumed = resumePlan(open, PROFILE_ID, FRIDAY); // half-open [Tue, Fri)
    const days = projectedCalendar(resumed, PROFILE_ID, MONDAY, 7);
    expect(days[0]?.projectedSession?.id).toBe('s-1'); // Mon
    expect(days[2]?.projectedSession).toBeNull(); // Wed paused
    expect(days[4]?.projectedSession?.id).toBe('s-2'); // Fri resumes at s-2
  });

  it('honours an existing non-terminal assignment and consumes one session for it', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    const days = projectedCalendar(started, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.assignment?.status).toBe('in-progress');
    expect(days[0]?.projectedSession?.id).toBe('s-1');
    expect(days[2]?.projectedSession?.id).toBe('s-2');
  });

  it('does not double-count a terminal assignment, because the cursor already moved', () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    const days = projectedCalendar(done, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.assignment?.status).toBe('completed');
    expect(days[0]?.projectedSession?.id).toBe('s-1');
    expect(days[2]?.projectedSession?.id).toBe('s-2'); // Wed, not s-3
  });

  it('keeps a skipped day visible with the session it was going to be', () => {
    const skipped = skipSession(seed(0), PROFILE_ID, MONDAY, 'illness');
    const days = projectedCalendar(skipped, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.assignment?.status).toBe('skipped');
    expect(days[0]?.projectedSession?.id).toBe('s-1');
    expect(days[2]?.projectedSession?.id).toBe('s-2');
  });

  it('reports slots and pauses but no sessions when there is no plan', () => {
    const s = seed(0);
    const noPlan: AppState = { ...s, plans: {}, cursors: {} };
    const days = projectedCalendar(noPlan, PROFILE_ID, MONDAY, 3);
    expect(days[0]?.slot?.startTime).toBe('07:00');
    expect(days[0]?.projectedSession).toBeNull();
  });

  it('returns bare days for an unknown profile', () => {
    const days = projectedCalendar(seed(0), 'nobody', MONDAY, 2);
    expect(days).toHaveLength(2);
    expect(days[0]?.slot).toBeNull();
    expect(days[0]?.projectedSession).toBeNull();
    expect(days[0]?.assignment).toBeNull();
  });

  it('is pure: 60 days of projection move nothing (master §7 P3 gate)', () => {
    const before = seed(0);
    const snapshot = structuredClone(before);
    const days = projectedCalendar(before, PROFILE_ID, MONDAY, 60); // [d]
    expect(days).toHaveLength(60);
    expect(before).toEqual(snapshot);
    expect(cursorOf(before).nextSessionIndex).toBe(0);
  });

  it('is deterministic: the same arguments give the same calendar', () => {
    const s = seed(1);
    expect(projectedCalendar(s, PROFILE_ID, MONDAY, 14)).toEqual(
      projectedCalendar(s, PROFILE_ID, MONDAY, 14),
    );
  });
});

describe('remainingLabelsThisWeek', () => {
  it("lists the distinct labels of the week's remaining sessions, in order", () => {
    expect(remainingLabelsThisWeek(seed(0), PROFILE_ID, MONDAY)).toEqual(['Push', 'Legs', 'Pull']);
  });

  it('shrinks as the week is consumed', () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    expect(remainingLabelsThisWeek(done, PROFILE_ID, WEDNESDAY)).toEqual(['Legs', 'Pull']);
  });

  it('is empty once the plan is finished', () => {
    expect(remainingLabelsThisWeek(seed(6), PROFILE_ID, MONDAY)).toEqual([]);
  });

  it('is empty on a day that is already closed out', () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    expect(remainingLabelsThisWeek(done, PROFILE_ID, MONDAY)).toEqual([]);
  });

  it('is empty for an unknown profile', () => {
    expect(remainingLabelsThisWeek(seed(0), 'nobody', MONDAY)).toEqual([]);
  });

  it('counts a non-slot day as trainable, so today is always offered a choice', () => {
    expect(remainingLabelsThisWeek(seed(0), PROFILE_ID, TUESDAY)).toEqual(['Push', 'Legs', 'Pull']);
  });

  it('offers fewer labels than the plan holds when the week has fewer slots left', () => {
    // Thursday: the window is Thursday itself plus Friday, so the third label is out of reach.
    expect(remainingLabelsThisWeek(seed(0), PROFILE_ID, THURSDAY)).toEqual(['Push', 'Legs']);
  });

  it('drops the labels a mid-week pause makes unreachable', () => {
    const open = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, 'travel');
    const closed = resumePlan(open, PROFILE_ID, THURSDAY); // Wednesday alone is paused
    expect(remainingLabelsThisWeek(closed, PROFILE_ID, MONDAY)).toEqual(['Push', 'Legs']);
  });

  it('is exactly the set assignToday honours (master §6.4)', () => {
    const s = seed(0);
    for (const date of [MONDAY, TUESDAY, THURSDAY, FRIDAY, SUNDAY]) {
      const allowed = remainingLabelsThisWeek(s, PROFILE_ID, date);
      for (const label of ['Push', 'Legs', 'Pull', 'Cardio']) {
        if (allowed.includes(label)) {
          expect(() => assignToday(s, PROFILE_ID, date, label)).not.toThrow();
        } else {
          expect(() => assignToday(s, PROFILE_ID, date, label)).toThrow(RangeError);
        }
      }
    }
  });
});

describe('assignToday', () => {
  it("swaps the picked label into today's position", () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, 'Legs');
    expect(labelsOf(planOf(next))).toEqual(['Legs', 'Push', 'Pull', 'Push', 'Legs', 'Pull']);
    expect(assignmentOn(next, MONDAY)?.sessionId).toBe('s-2');
    expect(assignmentOn(next, MONDAY)?.sourceIndex).toBe(0);
    expect(assignmentOn(next, MONDAY)?.status).toBe('planned');
    expectValid(next);
  });

  it('makes the next slot day project the session it displaced', () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, 'Legs');
    const days = projectedCalendar(next, PROFILE_ID, MONDAY, 5);
    expect(days[0]?.projectedSession?.label).toBe('Legs');
    expect(days[2]?.projectedSession?.label).toBe('Push'); // Wednesday
  });

  it('is a swap, not a rotation: a non-adjacent pick leaves the middle session in place', () => {
    const s = seedState({ labels: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'], weekdays: [...MWF] });
    const next = assignToday(s, PROFILE_ID, MONDAY, 'Legs');
    expect(labelsOf(planOf(next)).slice(0, 3)).toEqual(['Legs', 'Pull', 'Push']);
    const days = projectedCalendar(next, PROFILE_ID, MONDAY, 5);
    expect(days[2]?.projectedSession?.label).toBe('Pull'); // Wednesday
    expect(days[4]?.projectedSession?.label).toBe('Push'); // Friday
  });

  it('preserves the multiset of labels in the week window and in the plan', () => {
    const before = seed(0);
    const after = assignToday(before, PROFILE_ID, MONDAY, 'Pull');
    expect(labelMultiset(planOf(after), 0, 2)).toEqual(labelMultiset(planOf(before), 0, 2));
    expect(labelMultiset(planOf(after), 0, 5)).toEqual(labelMultiset(planOf(before), 0, 5));
  });

  it('keeps the positional ordinal invariant after every reachable swap', () => {
    for (const date of [MONDAY, TUESDAY, WEDNESDAY]) {
      const s = seed(0);
      for (const label of remainingLabelsThisWeek(s, PROFILE_ID, date)) {
        const next = assignToday(s, PROFILE_ID, date, label);
        expectOrdinalInvariant(next);
        expectValid(next);
      }
    }
  });

  it('does not mutate the state it was given', () => {
    const before = seed(0);
    const snapshot = structuredClone(before);
    assignToday(before, PROFILE_ID, MONDAY, 'Pull');
    expect(before).toEqual(snapshot);
  });

  it('is deterministic: the same pick twice gives the same document', () => {
    const s = seed(0);
    expect(assignToday(s, PROFILE_ID, MONDAY, 'Pull')).toEqual(
      assignToday(s, PROFILE_ID, MONDAY, 'Pull'),
    );
  });

  it('refuses to reach past the end of the current ISO week', () => {
    // Friday: the window is Friday alone, so only Friday's own label is reachable.
    const s = seed(0);
    expect(remainingLabelsThisWeek(s, PROFILE_ID, FRIDAY)).toEqual(['Push']);
    expect(() => assignToday(s, PROFILE_ID, FRIDAY, 'Pull')).toThrow(RangeError); // next week
  });

  it('refuses a label that is not in the plan at all', () => {
    expect(() => assignToday(seed(0), PROFILE_ID, MONDAY, 'Cardio')).toThrow(RangeError);
  });

  it("materialises today's assignment when the pick is already today's projection", () => {
    const s = seed(0);
    const next = assignToday(s, PROFILE_ID, MONDAY, 'Push');
    expect(labelsOf(planOf(next))).toEqual(labelsOf(planOf(s)));
    expect(assignmentOn(next, MONDAY)?.sessionId).toBe('s-1');
    expect(assignmentOn(next, MONDAY)?.sourceIndex).toBe(0);
  });

  it('replaces an earlier pick on the same day', () => {
    const once = assignToday(seed(0), PROFILE_ID, MONDAY, 'Legs');
    const twice = assignToday(once, PROFILE_ID, MONDAY, 'Pull');
    expect(assignmentOn(twice, MONDAY)?.sessionId).toBe('s-3');
    expect(labelMultiset(planOf(twice), 0, 2)).toEqual(['Legs', 'Pull', 'Push']);
    expectOrdinalInvariant(twice);
  });

  it('keeps an in-progress day in progress', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    const next = assignToday(started, PROFILE_ID, MONDAY, 'Legs');
    expect(assignmentOn(next, MONDAY)?.status).toBe('in-progress');
    expect(assignmentOn(next, MONDAY)?.startedAt).toBe(NOW_MS); // [ms] epoch, UTC
  });

  it('refuses a completed day, which is a record rather than a choice', () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    expect(() => assignToday(done, PROFILE_ID, MONDAY, 'Pull')).toThrow(RangeError);
  });

  it('refuses a skipped day', () => {
    const skipped = skipSession(seed(0), PROFILE_ID, MONDAY, 'illness');
    expect(() => assignToday(skipped, PROFILE_ID, MONDAY, 'Legs')).toThrow(RangeError);
  });

  it('refuses once the plan is finished', () => {
    expect(() => assignToday(seed(6), PROFILE_ID, MONDAY, 'Push')).toThrow(RangeError);
  });

  it('refuses an unknown profile', () => {
    expect(() => assignToday(seed(0), 'nobody', MONDAY, 'Push')).toThrow(RangeError);
  });

  it('does not move the cursor', () => {
    const next = assignToday(seed(0), PROFILE_ID, MONDAY, 'Legs');
    expect(cursorOf(next).nextSessionIndex).toBe(0);
  });
});
