import { describe, expect, it } from 'vitest';
import {
  completeSession,
  isPaused,
  isTerminal,
  nextSession,
  pausePlan,
  resumePlan,
  skipSession,
  startSession,
  upsertAssignment,
} from './cursor';
/*
 * The module's own text, read through vite's ?raw loader, so the "no clock in this module"
 * claim is asserted rather than trusted. ?raw rather than node:fs because tsconfig.app.json
 * pins `types` to the vite client typings, under which node:fs has no declaration.
 */
import cursorSource from './cursor.ts?raw';
import {
  assignmentOn,
  cursorOf,
  DAY_MS,
  FRIDAY,
  MONDAY,
  NOW_MS,
  pausesOf,
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
import type { AppState, LocalDate, PlanPause, SessionAssignment } from '../types';

const THREE = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
const WEEKDAYS = [1, 3, 5] as const;

/* The fixtures stop at Sunday; the round-trip run continues past a pause into the next week. */
const NEXT_MONDAY: LocalDate = '2026-09-14';
const NEXT_TUESDAY: LocalDate = '2026-09-15';

function seed(nextSessionIndex = 0) {
  return seedState({ labels: THREE, weekdays: [...WEEKDAYS], nextSessionIndex });
}

/**
 * Every transition returns a document the schema still accepts, and parsing it back changes
 * nothing (security constraint 1: nothing enters the store unvalidated, so a transition that
 * produced an unparseable state would strand the user on the last known-good document).
 */
function expectValid(state: AppState): void {
  const parsed = parseState(state);
  if (!parsed.ok) throw new Error(`parseState rejected the transition result: ${parsed.error}`);
  expect(parsed.state).toEqual(state);
}

describe('isPaused', () => {
  const open: PlanPause = { id: 'x', from: WEDNESDAY, to: null, reason: null };
  const closed: PlanPause = { id: 'y', from: MONDAY, to: WEDNESDAY, reason: null };

  it('is false before the pause starts', () => {
    expect(isPaused([open], TUESDAY)).toBe(false);
  });

  it('is true on the first paused day', () => {
    expect(isPaused([open], WEDNESDAY)).toBe(true);
  });

  it('stays true for an open pause', () => {
    expect(isPaused([open], SUNDAY)).toBe(true);
  });

  it('treats `to` as exclusive: the resume day is active', () => {
    expect(isPaused([closed], TUESDAY)).toBe(true);
    expect(isPaused([closed], WEDNESDAY)).toBe(false);
  });

  it('is inclusive at `from` and exclusive at `to` for a one-day pause', () => {
    const oneDay: PlanPause = { id: 'z', from: TUESDAY, to: WEDNESDAY, reason: null };
    expect(isPaused([oneDay], MONDAY)).toBe(false);
    expect(isPaused([oneDay], TUESDAY)).toBe(true);
    expect(isPaused([oneDay], WEDNESDAY)).toBe(false);
  });

  it('is false with no pauses', () => {
    expect(isPaused([], MONDAY)).toBe(false);
  });
});

describe('nextSession', () => {
  it('returns the session at the cursor index', () => {
    const s = seed(2);
    const session = nextSession(planOf(s), cursorOf(s));
    expect(session?.id).toBe('s-3');
    expect(session?.label).toBe('Pull');
  });

  it('returns null past the last session', () => {
    const s = seed(6);
    expect(nextSession(planOf(s), cursorOf(s))).toBeNull();
  });

  it('returns null when the cursor belongs to another plan', () => {
    const s = seed(0);
    const cursor = { ...cursorOf(s), planId: 'other' };
    expect(nextSession(planOf(s), cursor)).toBeNull();
  });
});

describe('upsertAssignment', () => {
  const a: SessionAssignment = {
    date: WEDNESDAY,
    sessionId: 's-2',
    sourceIndex: 1,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    skipReason: null,
  };

  it('inserts in date order', () => {
    const later: SessionAssignment = { ...a, date: FRIDAY, sessionId: 's-3', sourceIndex: 2 };
    const list = upsertAssignment(upsertAssignment([], later), a);
    expect(list.map((x) => x.date)).toEqual([WEDNESDAY, FRIDAY]);
  });

  it('replaces the entry for the same date', () => {
    const list = upsertAssignment([a], { ...a, status: 'completed' });
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('completed');
  });

  /*
   * The postcondition is "the returned list is sorted by date", not "sorted when the input
   * already was". calendar.ts's assignToday writes through this function directly and a
   * document persisted by an older build can arrive in any order, so the replace branch sorts
   * too. The alternative — declaring the list unordered and making every consumer index by
   * date — was rejected because projectedCalendar and the Today view both read it in order.
   */
  it('returns a date-sorted list on replace, not only on insert', () => {
    const later: SessionAssignment = { ...a, date: FRIDAY, sessionId: 's-3', sourceIndex: 2 };
    const earlier: SessionAssignment = { ...a, date: MONDAY, sessionId: 's-1', sourceIndex: 0 };
    const unsorted = [later, earlier, a]; // FRIDAY, MONDAY, WEDNESDAY
    const list = upsertAssignment(unsorted, { ...earlier, status: 'completed' });
    expect(list.map((x) => x.date)).toEqual([MONDAY, WEDNESDAY, FRIDAY]);
    expect(list.find((x) => x.date === MONDAY)?.status).toBe('completed');
    expect(unsorted.map((x) => x.date)).toEqual([FRIDAY, MONDAY, WEDNESDAY]); // input untouched
  });
});

describe('isTerminal', () => {
  const base: SessionAssignment = {
    date: MONDAY,
    sessionId: 's-1',
    sourceIndex: 0,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    skipReason: null,
  };
  it('is true only for completed and skipped', () => {
    expect(isTerminal(base)).toBe(false);
    expect(isTerminal({ ...base, status: 'in-progress' })).toBe(false);
    expect(isTerminal({ ...base, status: 'completed' })).toBe(true);
    expect(isTerminal({ ...base, status: 'skipped' })).toBe(true);
  });
});

describe('startSession', () => {
  it('materialises the cursor’s session as in-progress and does not advance', () => {
    const next = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const a = assignmentOn(next, MONDAY);
    expect(a?.sessionId).toBe('s-1');
    expect(a?.sourceIndex).toBe(0);
    expect(a?.status).toBe('in-progress');
    expect(a?.startedAt).toBe(NOW_MS);
    expect(cursorOf(next).nextSessionIndex).toBe(0);
    expectValid(next);
  });

  it('keeps the first startedAt when started twice', () => {
    const once = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const twice = startSession(once, PROFILE_ID, MONDAY, NOW_MS + 60_000); // [ms]
    expect(assignmentOn(twice, MONDAY)?.startedAt).toBe(NOW_MS);
  });

  /*
   * Starting twice changes nothing observable. The assertion is value equality rather than
   * referential identity because the transition rebuilds the assignment record before
   * comparing; the contract is "no state change", not "no allocation".
   */
  it('is a no-op when the same day is started twice', () => {
    const once = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const twice = startSession(once, PROFILE_ID, MONDAY, NOW_MS + 60_000); // [ms]
    expect(twice).toEqual(once);
    expect(cursorOf(twice).nextSessionIndex).toBe(0);
  });

  it('is a no-op on a terminal day', () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const after = startSession(done, PROFILE_ID, MONDAY, NOW_MS + 1000); // [ms]
    expect(after).toBe(done);
  });

  it('is a no-op with no cursor', () => {
    const s = seed(0);
    const stripped = { ...s, cursors: {} };
    expect(startSession(stripped, PROFILE_ID, MONDAY, NOW_MS)).toBe(stripped);
  });

  it('is a no-op once the plan is finished', () => {
    const finished = seed(6);
    expect(startSession(finished, PROFILE_ID, MONDAY, NOW_MS)).toBe(finished);
  });
});

describe('completeSession', () => {
  it('marks the day completed and advances the cursor by exactly one', () => {
    const next = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const a = assignmentOn(next, MONDAY);
    expect(a?.status).toBe('completed');
    expect(a?.completedAt).toBe(NOW_MS);
    expect(a?.sessionId).toBe('s-1');
    expect(cursorOf(next).nextSessionIndex).toBe(1);
    expect(cursorOf(next).completedOn).toBeNull();
    expectValid(next);
  });

  /*
   * The Today view can complete a day the user never pressed Start on, so there is no
   * assignment yet. The transition materialises one from the cursor rather than refusing.
   */
  it('materialises the assignment from the cursor when the day has none', () => {
    const before = seed(2);
    expect(assignmentOn(before, WEDNESDAY)).toBeNull();
    const next = completeSession(before, PROFILE_ID, WEDNESDAY, NOW_MS);
    const a = assignmentOn(next, WEDNESDAY);
    expect(a?.sessionId).toBe('s-3');
    expect(a?.sourceIndex).toBe(2);
    expect(a?.status).toBe('completed');
    expect(a?.startedAt).toBeNull();
    expect(cursorOf(next).nextSessionIndex).toBe(3);
  });

  it('completes an in-progress day without losing startedAt', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const done = completeSession(started, PROFILE_ID, MONDAY, NOW_MS + 3_600_000); // [ms]
    expect(assignmentOn(done, MONDAY)?.startedAt).toBe(NOW_MS);
    expect(cursorOf(done).nextSessionIndex).toBe(1);
  });

  it('is a no-op when the day is already completed (never advances twice)', () => {
    const once = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const twice = completeSession(once, PROFILE_ID, MONDAY, NOW_MS + 1000); // [ms]
    expect(twice).toBe(once);
    expect(cursorOf(twice).nextSessionIndex).toBe(1);
  });

  it('is a no-op on a day already skipped', () => {
    const skipped = skipSession(seed(0), PROFILE_ID, MONDAY, null);
    expect(completeSession(skipped, PROFILE_ID, MONDAY, NOW_MS)).toBe(skipped);
  });

  it('sets completedOn when the index passes the last session', () => {
    const next = completeSession(seed(5), PROFILE_ID, FRIDAY, NOW_MS);
    expect(cursorOf(next).nextSessionIndex).toBe(6);
    expect(cursorOf(next).completedOn).toBe(FRIDAY);
    expectValid(next);
  });

  it('is a no-op once the plan is finished', () => {
    const finished = completeSession(seed(5), PROFILE_ID, FRIDAY, NOW_MS);
    const after = completeSession(finished, PROFILE_ID, SUNDAY, NOW_MS);
    expect(after).toBe(finished);
  });

  it('does not mutate the input state', () => {
    const before = seed(0);
    completeSession(before, PROFILE_ID, MONDAY, NOW_MS);
    expect(cursorOf(before).nextSessionIndex).toBe(0);
    expect(before.assignments[PROFILE_ID]).toEqual([]);
  });
});

describe('skipSession', () => {
  it('marks the day skipped, records the reason, and advances by one', () => {
    const next = skipSession(seed(0), PROFILE_ID, MONDAY, 'illness');
    const a = assignmentOn(next, MONDAY);
    expect(a?.status).toBe('skipped');
    expect(a?.skipReason).toBe('illness');
    expect(a?.completedAt).toBeNull();
    expect(cursorOf(next).nextSessionIndex).toBe(1);
    expectValid(next);
  });

  it('accepts a null reason', () => {
    const next = skipSession(seed(0), PROFILE_ID, MONDAY, null);
    expect(assignmentOn(next, MONDAY)?.skipReason).toBeNull();
  });

  it('is a no-op on an already skipped day', () => {
    const once = skipSession(seed(0), PROFILE_ID, MONDAY, null);
    expect(skipSession(once, PROFILE_ID, MONDAY, 'changed my mind')).toBe(once);
  });

  it('is a no-op on a day already completed', () => {
    const done = completeSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(skipSession(done, PROFILE_ID, MONDAY, null)).toBe(done);
  });

  it('sets completedOn when skipping the last session', () => {
    const next = skipSession(seed(5), PROFILE_ID, FRIDAY, null);
    expect(cursorOf(next).completedOn).toBe(FRIDAY);
    expectValid(next);
  });

  it('does not mutate the input state', () => {
    const before = seed(0);
    skipSession(before, PROFILE_ID, MONDAY, 'illness');
    expect(cursorOf(before).nextSessionIndex).toBe(0);
    expect(before.assignments[PROFILE_ID]).toEqual([]);
  });
});

describe('pausePlan / resumePlan', () => {
  it('opens a pause with a null end', () => {
    const next = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, 'travel');
    expect(pausesOf(next)).toHaveLength(1);
    expect(pausesOf(next)[0]?.from).toBe(WEDNESDAY);
    expect(pausesOf(next)[0]?.to).toBeNull();
    expect(pausesOf(next)[0]?.reason).toBe('travel');
    expectValid(next);
  });

  it('is a no-op when a pause is already open', () => {
    const once = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, null);
    expect(pausePlan(once, PROFILE_ID, FRIDAY, null)).toBe(once);
  });

  it('closes the open pause with `to`', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, MONDAY, null);
    const resumed = resumePlan(paused, PROFILE_ID, WEDNESDAY);
    expect(pausesOf(resumed)[0]?.to).toBe(WEDNESDAY);
    expect(isPaused(pausesOf(resumed), WEDNESDAY)).toBe(false);
    expect(isPaused(pausesOf(resumed), TUESDAY)).toBe(true);
    expectValid(resumed);
  });

  it('is a no-op when nothing is paused', () => {
    const s = seed(0);
    expect(resumePlan(s, PROFILE_ID, MONDAY)).toBe(s);
  });

  it('clamps a resume date earlier than the pause start to a zero-length pause', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, null);
    const resumed = resumePlan(paused, PROFILE_ID, MONDAY);
    expect(pausesOf(resumed)[0]?.to).toBe(WEDNESDAY);
    expect(isPaused(pausesOf(resumed), WEDNESDAY)).toBe(false);
  });

  /*
   * [from, from) contains no days: a user who pauses and resumes on the same day was never
   * paused. resumePlan records that rather than refusing it, so a mistaken pause is undone by
   * resuming on the day it started.
   */
  it('records a same-day resume as an empty pause', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, WEDNESDAY, 'travel');
    const resumed = resumePlan(paused, PROFILE_ID, WEDNESDAY);
    expect(pausesOf(resumed)[0]?.from).toBe(WEDNESDAY);
    expect(pausesOf(resumed)[0]?.to).toBe(WEDNESDAY);
    expect(isPaused(pausesOf(resumed), TUESDAY)).toBe(false);
    expect(isPaused(pausesOf(resumed), WEDNESDAY)).toBe(false);
    expectValid(resumed);
  });

  it('allows a second pause after the first is closed', () => {
    const first = resumePlan(pausePlan(seed(0), PROFILE_ID, MONDAY, null), PROFILE_ID, WEDNESDAY);
    const second = pausePlan(first, PROFILE_ID, FRIDAY, null);
    expect(pausesOf(second)).toHaveLength(2);
    expectValid(second);
  });

  it('does not pause or resume the plan itself: the cursor is untouched', () => {
    const paused = pausePlan(seed(2), PROFILE_ID, WEDNESDAY, null);
    const resumed = resumePlan(paused, PROFILE_ID, FRIDAY);
    expect(cursorOf(paused).nextSessionIndex).toBe(2);
    expect(cursorOf(resumed).nextSessionIndex).toBe(2);
  });
});

describe('schema round-trip', () => {
  it('every transition leaves a state parseState accepts unchanged', () => {
    const seeded = seed(0);
    expectValid(seeded);
    const started = startSession(seeded, PROFILE_ID, MONDAY, NOW_MS);
    expectValid(started);
    const completed = completeSession(started, PROFILE_ID, MONDAY, NOW_MS + 3_600_000); // [ms]
    expectValid(completed);
    const skipped = skipSession(completed, PROFILE_ID, WEDNESDAY, 'illness');
    expectValid(skipped);
    const paused = pausePlan(skipped, PROFILE_ID, FRIDAY, 'travel');
    expectValid(paused);
    const resumed = resumePlan(paused, PROFILE_ID, SUNDAY);
    expectValid(resumed);
    /*
     * Two sessions are already closed out (one completed, one skipped); four days with no
     * assignment yet close the remaining four, so the cursor ends one past the last session.
     * None of the four may fall inside [FRIDAY, SUNDAY): a paused day materialises nothing, so
     * the run continues into the following week rather than through the pause.
     */
    let state = resumed;
    expect(cursorOf(state).nextSessionIndex).toBe(2);
    const days = [THURSDAY, SUNDAY, NEXT_MONDAY, NEXT_TUESDAY];
    for (const [i, date] of days.entries()) {
      state = completeSession(state, PROFILE_ID, date, NOW_MS + (i + 1) * DAY_MS); // [ms]
      expectValid(state);
    }
    expect(cursorOf(state).nextSessionIndex).toBe(6);
    expect(cursorOf(state).completedOn).toBe(NEXT_TUESDAY);
  });
});

describe('invariant: the cursor is attendance-driven, not clock-driven (code review A11)', () => {
  /*
   * Chained, not re-derived: one state is carried through 60 days of clock and calendar
   * advance. The earlier version rebuilt the state from the same seed on every iteration,
   * which could only ever prove that a single call is pure.
   */
  it('60 days pass with no completion and the cursor does not move', () => {
    let state = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    for (const day of [1, 7, 30, 60]) {
      // The same open Monday, re-entered on a later calendar day: the clock moves, the plan does not.
      state = startSession(state, PROFILE_ID, MONDAY, NOW_MS + day * DAY_MS); // [ms]
      expect(cursorOf(state).nextSessionIndex).toBe(0);
      expect(cursorOf(state).completedOn).toBeNull();
      expect(assignmentOn(state, MONDAY)?.startedAt).toBe(NOW_MS); // first start wins
    }
    expect(nextSession(planOf(state), cursorOf(state))?.id).toBe('s-1');
    // Attendance, and only attendance, moves it: 60 elapsed days plus one session is one step.
    const done = completeSession(state, PROFILE_ID, MONDAY, NOW_MS + 60 * DAY_MS); // [ms]
    expect(cursorOf(done).nextSessionIndex).toBe(1);
    expectValid(done);
  });

  /*
   * The behavioural test above cannot see a clock read on a branch it does not take, so the
   * ban is also asserted against the module's own source text.
   */
  it('reads no clock: the module names no Date and no today helper', () => {
    for (const banned of ['Date.now', 'todayLocal', 'new Date']) {
      expect(cursorSource).not.toContain(banned);
    }
  });
});

describe('invariant: the cursor never runs past the last session', () => {
  const REST: LocalDate[] = [TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY];

  /*
   * The reviewer's sequence. Monday is started and left in progress, the six other days of the
   * week are closed out — which exhausts the six-session plan on Sunday — and the stale Monday
   * is closed out last.
   *
   * Tuesday-Sunday are seeded as `planned` rather than materialised one call at a time because
   * the single-open-assignment rule now refuses to open a second day while Monday is in
   * progress. They carry exactly the sessionId and sourceIndex the cursor would have handed
   * them (Tuesday at index 0, ... Sunday at index 5), so Monday and Tuesday both point at s-1:
   * that duplication is the corrupted shape the clamp has to survive. The clamp cannot lean on
   * the single-open rule for its safety, because calendar.ts's assignToday writes assignments
   * through upsertAssignment directly and a document persisted by an older build can already
   * hold several open days.
   */
  function staleMondayWeek(): AppState {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const planned: SessionAssignment[] = REST.map((date, i) => ({
      date,
      sessionId: `s-${i + 1}`,
      sourceIndex: i, // [sessions] offset, as the cursor stood when the day was opened
      status: 'planned',
      startedAt: null,
      completedAt: null,
      skipReason: null,
    }));
    let state: AppState = {
      ...started,
      assignments: { [PROFILE_ID]: [...(started.assignments[PROFILE_ID] ?? []), ...planned] },
    };
    for (const [i, date] of REST.entries()) {
      state = completeSession(state, PROFILE_ID, date, NOW_MS + (i + 1) * DAY_MS); // [ms]
    }
    return state;
  }

  it('reaches the end of the plan with Monday still open', () => {
    const week = staleMondayWeek();
    expect(planOf(week).sessions).toHaveLength(6);
    expect(cursorOf(week).nextSessionIndex).toBe(6);
    expect(cursorOf(week).completedOn).toBe(SUNDAY);
    expect(assignmentOn(week, MONDAY)?.status).toBe('in-progress');
  });

  it('completing the stale Monday leaves the index at 6 of 6 and completedOn unchanged', () => {
    const after = completeSession(staleMondayWeek(), PROFILE_ID, MONDAY, NOW_MS + 7 * DAY_MS); // [ms]
    expect(cursorOf(after).nextSessionIndex).toBe(6); // 6 of 6, never 7
    expect(cursorOf(after).completedOn).toBe(SUNDAY); // stamped once, by the session that finished the plan
    expect(assignmentOn(after, MONDAY)?.status).toBe('completed'); // the day still closes out
    expectValid(after);
  });

  it('skipping the stale Monday clamps the same way', () => {
    const after = skipSession(staleMondayWeek(), PROFILE_ID, MONDAY, 'never went back to it');
    expect(cursorOf(after).nextSessionIndex).toBe(6);
    expect(cursorOf(after).completedOn).toBe(SUNDAY);
    expect(assignmentOn(after, MONDAY)?.status).toBe('skipped');
    expectValid(after);
  });
});

describe('invariant: at most one open assignment per profile', () => {
  const OPEN_ON_MONDAY = `a session is already in progress on ${MONDAY}`;

  it('refuses to start a second day while Monday is in progress', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(() => startSession(started, PROFILE_ID, TUESDAY, NOW_MS + DAY_MS)).toThrow(
      `startSession: ${OPEN_ON_MONDAY}`,
    );
  });

  it('refuses to complete a fresh day while Monday is in progress', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(() => completeSession(started, PROFILE_ID, TUESDAY, NOW_MS + DAY_MS)).toThrow(
      `completeSession: ${OPEN_ON_MONDAY}`,
    );
  });

  it('refuses to skip a fresh day while Monday is in progress', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(() => skipSession(started, PROFILE_ID, TUESDAY, 'busy')).toThrow(
      `skipSession: ${OPEN_ON_MONDAY}`,
    );
  });

  /* Open means non-terminal, not in-progress: a planned day nobody pressed Start on counts. */
  it('counts a planned, never-started day as open', () => {
    const seeded = seed(0);
    const planned: SessionAssignment = {
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'planned',
      startedAt: null,
      completedAt: null,
      skipReason: null,
    };
    const state: AppState = { ...seeded, assignments: { [PROFILE_ID]: [planned] } };
    expect(() => startSession(state, PROFILE_ID, TUESDAY, NOW_MS + DAY_MS)).toThrow(
      OPEN_ON_MONDAY,
    );
  });

  it('lets the open day be completed, and then the next day starts', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const done = completeSession(started, PROFILE_ID, MONDAY, NOW_MS + 3_600_000); // [ms]
    const next = startSession(done, PROFILE_ID, TUESDAY, NOW_MS + DAY_MS); // [ms]
    expect(assignmentOn(next, TUESDAY)?.status).toBe('in-progress');
    expect(assignmentOn(next, TUESDAY)?.sourceIndex).toBe(1);
    expect(cursorOf(next).nextSessionIndex).toBe(1); // start does not advance; the complete did
    expectValid(next);
  });

  it('lets the open day be skipped, and then the next day starts', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const skipped = skipSession(started, PROFILE_ID, MONDAY, 'illness');
    const next = startSession(skipped, PROFILE_ID, TUESDAY, NOW_MS + DAY_MS); // [ms]
    expect(assignmentOn(next, TUESDAY)?.status).toBe('in-progress');
    expect(cursorOf(next).nextSessionIndex).toBe(1);
    expectValid(next);
  });

  /* Re-entering the day that is already open is not a second assignment. */
  it('still allows the open day itself to be restarted', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    expect(() => startSession(started, PROFILE_ID, MONDAY, NOW_MS + 60_000)).not.toThrow(); // [ms]
  });
});

describe('invariant: a paused day materialises nothing', () => {
  it('refuses to start a day inside a pause', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, MONDAY, 'travel');
    expect(() => startSession(paused, PROFILE_ID, MONDAY, NOW_MS)).toThrow(
      `startSession: the plan is paused on ${MONDAY}`,
    );
  });

  it('refuses to complete a fresh day inside a pause', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, MONDAY, 'travel');
    expect(() => completeSession(paused, PROFILE_ID, MONDAY, NOW_MS)).toThrow(
      `completeSession: the plan is paused on ${MONDAY}`,
    );
  });

  it('refuses to skip a fresh day inside a pause', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, MONDAY, 'travel');
    expect(() => skipSession(paused, PROFILE_ID, MONDAY, 'away')).toThrow(
      `skipSession: the plan is paused on ${MONDAY}`,
    );
  });

  it('completes a session that was already in progress when the pause began', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const paused = pausePlan(started, PROFILE_ID, MONDAY, 'illness');
    const done = completeSession(paused, PROFILE_ID, MONDAY, NOW_MS + 3_600_000); // [ms]
    expect(assignmentOn(done, MONDAY)?.status).toBe('completed');
    expect(cursorOf(done).nextSessionIndex).toBe(1);
    expectValid(done);
  });

  it('skips a session that was already in progress when the pause began', () => {
    const started = startSession(seed(0), PROFILE_ID, MONDAY, NOW_MS);
    const paused = pausePlan(started, PROFILE_ID, MONDAY, 'illness');
    const skipped = skipSession(paused, PROFILE_ID, MONDAY, 'illness');
    expect(assignmentOn(skipped, MONDAY)?.status).toBe('skipped');
    expect(cursorOf(skipped).nextSessionIndex).toBe(1);
    expectValid(skipped);
  });

  it('materialises again on the first day after the pause', () => {
    const paused = pausePlan(seed(0), PROFILE_ID, MONDAY, 'travel');
    const resumed = resumePlan(paused, PROFILE_ID, TUESDAY); // half-open [MONDAY, TUESDAY)
    const next = startSession(resumed, PROFILE_ID, TUESDAY, NOW_MS + DAY_MS); // [ms]
    expect(assignmentOn(next, TUESDAY)?.status).toBe('in-progress');
    expect(cursorOf(next).nextSessionIndex).toBe(0);
    expectValid(next);
  });

  /* A finished plan has nothing to materialise, so the pause has nothing to refuse. */
  it('is still a no-op, not a throw, once the plan is finished', () => {
    const paused = pausePlan(seed(6), PROFILE_ID, MONDAY, 'travel');
    expect(startSession(paused, PROFILE_ID, MONDAY, NOW_MS)).toBe(paused);
  });
});
