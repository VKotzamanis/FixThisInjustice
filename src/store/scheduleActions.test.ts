import { describe, expect, it, vi } from 'vitest';
import {
  createScheduleActions,
  isDomainMinted,
  refusesLabel,
  refusesTransition,
  type ScheduleActions,
} from './scheduleActions';
import {
  DAY_MS,
  MONDAY,
  NOW_MS,
  PLAN_ID,
  PREV_MONDAY,
  PROFILE_ID,
  TUESDAY,
  TZ_ATHENS,
  WEDNESDAY,
  seedState,
} from '../test/scheduleFixtures';
import { parseState } from '../domain/schema';
import { projectedCalendar } from '../domain/schedule/calendar';
import type { AppState } from '../domain/types';

/*
 * A throw the schedule domain never mints, injected at the seam the slice calls. This is the
 * reviewer's probe: the classifier used to ask only whether the STATE was one the domain may
 * refuse in, so any unrelated failure that happened to arrive while a gate was closed was
 * swallowed into the refusal banner and its stack was lost.
 *
 * The flag is armed inside one test and disarmed in its finally, so every other test in this
 * file runs the real transition; the rest of the module — isPaused and isTerminal, which the
 * classifiers use, and upsertAssignment, which calendar.ts uses — is passed through untouched.
 */
const novelThrow = vi.hoisted(() => ({ armed: false }));

vi.mock('../domain/schedule/cursor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/schedule/cursor')>();
  return {
    ...actual,
    startSession: (...args: Parameters<typeof actual.startSession>) => {
      if (novelThrow.armed) throw new TypeError('NOVEL: a failure the domain never mints');
      return actual.startSession(...args);
    },
  };
});

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
const MWF = [1, 3, 5] as const;

interface Harness {
  actions: ScheduleActions;
  read(): AppState;
  /** The non-persisted refusal message the slice last handed to the store. */
  error(): string | null;
}

function harness(initial: AppState): Harness {
  let state = initial;
  let actionError: string | null = null;
  const actions = createScheduleActions({
    set: (updater) => {
      state = updater(state);
    },
    setActionError: (message) => {
      actionError = message;
    },
  });
  return { actions, read: () => state, error: () => actionError };
}

function seed(): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    startedOn: PREV_MONDAY,
    timezone: TZ_ATHENS,
  });
}

/**
 * Master plan §3: the store is the only writer of the persisted document, and every document
 * it writes must survive the loader. An action that produces a state the schema rejects is a
 * change the user would lose at the next reload, so each action's result is parsed here rather
 * than only at the persistence boundary.
 */
function expectStorable(state: AppState): void {
  const parsed = parseState(state);
  expect(parsed.ok ? null : parsed.error).toBeNull();
}

describe('createScheduleActions', () => {
  it('startSession writes an in-progress assignment', () => {
    const h = harness(seed());
    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);
    const a = h.read().assignments[PROFILE_ID]?.[0];
    expect(a?.status).toBe('in-progress');
    expect(a?.startedAt).toBe(NOW_MS);
    expectStorable(h.read());
  });

  it('completeSession advances the cursor', () => {
    const h = harness(seed());
    h.actions.completeSession(PROFILE_ID, MONDAY, NOW_MS);
    expect(h.read().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
    expectStorable(h.read());
  });

  it('skipSession records the reason and advances the cursor', () => {
    const h = harness(seed());
    h.actions.skipSession(PROFILE_ID, MONDAY, 'illness');
    expect(h.read().assignments[PROFILE_ID]?.[0]?.skipReason).toBe('illness');
    expect(h.read().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
    expectStorable(h.read());
  });

  it('pausePlan then resumePlan closes the pause', () => {
    const h = harness(seed());
    h.actions.pausePlan(PROFILE_ID, MONDAY, 'travel');
    expect(h.read().pauses[PROFILE_ID]?.[0]?.to).toBeNull();
    expectStorable(h.read());
    h.actions.resumePlan(PROFILE_ID, WEDNESDAY);
    expect(h.read().pauses[PROFILE_ID]?.[0]?.to).toBe(WEDNESDAY);
    expectStorable(h.read());
  });

  it('assignToday swaps the label into the slot for today', () => {
    const h = harness(seed());
    h.actions.assignToday(PROFILE_ID, MONDAY, 'Legs');
    expect(h.read().assignments[PROFILE_ID]?.[0]?.sessionId).toBe('s-2');
    expect(h.read().plans['plan-1']?.sessions[0]?.label).toBe('Legs');
    expectStorable(h.read());
  });

  it('closeWeeks writes the review of the finished week', () => {
    const h = harness(seed());
    h.actions.closeWeeks(PROFILE_ID, NOW_MS);
    expect(h.read().weeklyReviews[PROFILE_ID]).toHaveLength(1);
    expectStorable(h.read());
  });

  it('setUi patches ui preferences without dropping the others', () => {
    const h = harness(seed());
    h.actions.setUi({ lastView: 'train' });
    expect(h.read().ui.lastView).toBe('train');
    expect(h.read().ui.bootSeen).toBe(true);
    expect(h.read().ui.density).toBe('normal');
    expectStorable(h.read());
  });

  /*
   * P3 Task 5 adds the dismiss control the refusal banner needs. Without it the only way to
   * clear a refusal is to make another attempt succeed, which on a paused plan is exactly the
   * thing the domain is refusing.
   */
  it('clearActionError clears a refusal without touching the document', () => {
    const h = harness(seed());
    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);
    h.actions.startSession(PROFILE_ID, TUESDAY, NOW_MS); // a second open day: refused
    expect(h.error()).toContain('a session is already in progress');
    const before = h.read();

    h.actions.clearActionError();

    expect(h.error()).toBeNull();
    expect(h.read()).toBe(before); // identity: dismissing a message is not a state change
    expectStorable(h.read());
  });
});

/*
 * Refusals (master plan §6.4 as amended). cursor.ts and calendar.ts THROW on an illegal
 * transition. The slice classifies the throw: a documented refusal becomes a message on the
 * non-persisted status slice and leaves the document untouched; anything else is a defect and
 * propagates. These tests pin both halves of that split.
 */
describe('refused transitions', () => {
  it('refuses a second open assignment, leaves the state alone and reports why', () => {
    const h = harness(seed());
    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);
    const before = h.read();

    h.actions.startSession(PROFILE_ID, TUESDAY, NOW_MS + DAY_MS);

    expect(h.read()).toBe(before); // identity: not one field was rewritten
    expect(h.error()).toBe(`startSession: a session is already in progress on ${MONDAY}`);
  });

  it('refuses a transition on a paused day', () => {
    const h = harness(seed());
    h.actions.pausePlan(PROFILE_ID, MONDAY, 'travel');
    const before = h.read();

    h.actions.completeSession(PROFILE_ID, WEDNESDAY, NOW_MS + 2 * DAY_MS);

    expect(h.read()).toBe(before);
    expect(h.error()).toBe(`completeSession: the plan is paused on ${WEDNESDAY}`);
  });

  it('refuses a label that is not remaining this week', () => {
    const h = harness(seed());
    const before = h.read();

    h.actions.assignToday(PROFILE_ID, MONDAY, 'Cardio');

    expect(h.read()).toBe(before);
    expect(h.error()).toMatch(/^assignToday: "Cardio" is not among the sessions remaining/);
  });

  /*
   * assignToday grew gates of its own (calendar.ts gateReason: paused, already started,
   * another day open, not the next session day) after this slice was written. The classifier
   * still covers every one of them, because remainingLabelsThisWeek is built on the same gate
   * and returns nothing when any of them closes. This test is what keeps the two in step: if
   * the two ever diverge, the throw reaches the caller and this fails loudly.
   */
  it('reports the pick-today gates in the domain wording rather than throwing', () => {
    const h = harness(seed());
    h.actions.pausePlan(PROFILE_ID, MONDAY, 'travel');
    const before = h.read();

    h.actions.assignToday(PROFILE_ID, WEDNESDAY, 'Legs');

    expect(h.read()).toBe(before);
    expect(h.error()).toBe(`assignToday: the plan is paused on ${WEDNESDAY}`);
  });

  it('reports a day that is not the next session day', () => {
    const h = harness(seed());
    const before = h.read();

    // TUESDAY carries no availability slot, so the projection never serves a session on it.
    h.actions.assignToday(PROFILE_ID, TUESDAY, 'Legs');

    expect(h.read()).toBe(before);
    expect(h.error()).toBe(`assignToday: ${TUESDAY} is not the next session day`);
  });

  it('clears the message on the next action that succeeds', () => {
    const h = harness(seed());
    h.actions.assignToday(PROFILE_ID, MONDAY, 'Cardio');
    expect(h.error()).not.toBeNull();

    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);

    expect(h.error()).toBeNull();
  });

  it('closeWeeks does not touch the message: it is a background catch-up, not an attempt', () => {
    const h = harness(seed());
    h.actions.assignToday(PROFILE_ID, MONDAY, 'Cardio');
    const refusal = h.error();

    h.actions.closeWeeks(PROFILE_ID, NOW_MS);

    expect(h.error()).toBe(refusal);
  });
});

/*
 * The classifiers decide whether a throw that already happened was a refusal the user can act
 * on or a defect. They are tested directly because the shipped domain has no reachable defect
 * path through these six actions: every documented throw in cursor.ts and calendar.ts is one
 * of the refusals below. A future gate the classifier does not know about therefore reaches
 * the caller as a rethrow, which is the safe direction.
 */
describe('throw classification', () => {
  it('sees no refusal in a state where the domain has no gate to close', () => {
    expect(refusesTransition(seed(), PROFILE_ID, MONDAY)).toBe(false);
  });

  it('sees the pause gate', () => {
    const paused = {
      ...seed(),
      pauses: { [PROFILE_ID]: [{ id: 'pz', from: MONDAY, to: null, reason: null }] },
    };
    expect(refusesTransition(paused, PROFILE_ID, WEDNESDAY)).toBe(true);
  });

  it('does not see a gate on a day that already has an assignment', () => {
    const h = harness(seed());
    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);
    // MONDAY is the open day, so MONDAY itself is still free to complete or skip.
    expect(refusesTransition(h.read(), PROFILE_ID, MONDAY)).toBe(false);
    expect(refusesTransition(h.read(), PROFILE_ID, TUESDAY)).toBe(true);
  });

  it('sees a label the week no longer offers', () => {
    expect(refusesLabel(seed(), PROFILE_ID, MONDAY, 'Legs')).toBe(false);
    expect(refusesLabel(seed(), PROFILE_ID, MONDAY, 'Cardio')).toBe(true);
  });
});

/*
 * Master plan §7, P3 gate, through the store slice rather than through cursor.ts alone: the
 * cursor is attendance-driven, so 60 days of clock with no completion must leave it where it
 * was. closeWeeks is the one action that reads the clock, and projectedCalendar is the one
 * derivation that walks forward, so both are exercised.
 */
describe('the cursor does not move with the clock', () => {
  it('60 days of closeWeeks and projection leave nextSessionIndex unchanged', () => {
    const h = harness(seed());
    const before = h.read().cursors[PROFILE_ID];

    for (let day = 0; day <= 60; day++) {
      h.actions.closeWeeks(PROFILE_ID, NOW_MS + day * DAY_MS); // [ms] epoch, UTC
    }
    // The projection walks a private index; it must not write the stored one.
    projectedCalendar(h.read(), PROFILE_ID, MONDAY, 60); // [d]

    expect(h.read().cursors[PROFILE_ID]?.nextSessionIndex).toBe(0);
    expect(h.read().cursors[PROFILE_ID]).toEqual(before);
    expect(h.read().assignments[PROFILE_ID]).toEqual([]);
    expectStorable(h.read());
  });
});

/*
 * The other half of the classification (master plan §6.4 as amended). A refusal needs the
 * error to be domain-minted AND the state to agree; the tests above pin states that agree, so
 * these pin the error shape, which is what the state check alone could not see.
 */
describe('a throw the domain did not mint', () => {
  it('propagates out of a state whose gate the classifier does recognise', () => {
    const h = harness(seed());
    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS);
    // MONDAY is now the open day, so every other day is inside the single-open-assignment
    // gate. That used to be licence enough to swallow whatever the call threw.
    expect(refusesTransition(h.read(), PROFILE_ID, TUESDAY)).toBe(true);
    const before = h.read();

    novelThrow.armed = true;
    try {
      expect(() => h.actions.startSession(PROFILE_ID, TUESDAY, NOW_MS + DAY_MS)).toThrow(
        /^NOVEL: /,
      );
    } finally {
      novelThrow.armed = false;
    }

    expect(h.read()).toBe(before); // the document is untouched either way
    expect(h.error()).toBeNull(); // and the user is not told it was a schedule problem
  });

  it('recognises the two shapes the domain mints and nothing else', () => {
    // cursor.ts: Error, prefixed with the calling function's name.
    expect(isDomainMinted(new Error(`startSession: a session is already in progress on ${MONDAY}`)))
      .toBe(true);
    // calendar.ts: RangeError, for every gate it closes.
    expect(isDomainMinted(new RangeError(`assignToday: the plan is paused on ${MONDAY}`))).toBe(
      true,
    );
    expect(isDomainMinted(new TypeError('NOVEL: a failure the domain never mints'))).toBe(false);
    // The domain's wording without the domain's prefix is not the domain's throw.
    expect(isDomainMinted(new Error('a session is already in progress'))).toBe(false);
    expect(isDomainMinted('a string nobody threw on purpose')).toBe(false);
  });
});

/*
 * Profile and plan guards. A profile id nobody owns and a cursor naming a plan that is not
 * stored are both defects — a caller bug and a corrupt document — but the domain answers each
 * of them with an empty projection or an untouched state, which the classifier then read as
 * "the week has nothing left to offer". The guards run before the transition and outside the
 * classification, so neither can be reported as a schedule the user could fix.
 */
describe('profile and plan guards', () => {
  const UNKNOWN = 'nobody';

  it('every schedule action rejects an unknown profile, naming itself', () => {
    const h = harness(seed());
    const calls: [string, () => void][] = [
      ['startSession', () => h.actions.startSession(UNKNOWN, MONDAY, NOW_MS)],
      ['completeSession', () => h.actions.completeSession(UNKNOWN, MONDAY, NOW_MS)],
      ['skipSession', () => h.actions.skipSession(UNKNOWN, MONDAY, null)],
      ['pausePlan', () => h.actions.pausePlan(UNKNOWN, MONDAY, null)],
      ['resumePlan', () => h.actions.resumePlan(UNKNOWN, WEDNESDAY)],
      ['assignToday', () => h.actions.assignToday(UNKNOWN, MONDAY, 'Push')],
      ['closeWeeks', () => h.actions.closeWeeks(UNKNOWN, NOW_MS)],
    ];
    const before = h.read();

    for (const [name, call] of calls) {
      expect(call).toThrow(`${name}: "${UNKNOWN}" is not a known profile`);
    }

    expect(h.read()).toBe(before);
    // The reviewer's probe: assignToday on an unknown profile used to reach the user as
    // "not among the sessions remaining (none)" — a refusal about a profile that does not
    // exist, and a document the schema would have rejected had anything been written.
    expect(h.error()).toBeNull();
  });

  it('a cursor naming a plan that is not stored is a defect on every action that needs one', () => {
    const dangling: AppState = { ...seed(), plans: {} };
    const h = harness(dangling);
    const missing = `names plan "${PLAN_ID}", which is not stored`;

    expect(() => h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS)).toThrow(missing);
    expect(() => h.actions.completeSession(PROFILE_ID, MONDAY, NOW_MS)).toThrow(missing);
    expect(() => h.actions.skipSession(PROFILE_ID, MONDAY, null)).toThrow(missing);
    expect(() => h.actions.assignToday(PROFILE_ID, MONDAY, 'Push')).toThrow(missing);
    expect(() => h.actions.closeWeeks(PROFILE_ID, NOW_MS)).toThrow(missing);

    // startSession and closeWeeks used to return the state unchanged and report nothing at
    // all; assignToday used to report an empty week. Neither says "this document is corrupt".
    expect(h.read()).toBe(dangling);
    expect(h.error()).toBeNull();
  });

  it('closeWeeks still runs for a profile the wizard has not given a plan yet', () => {
    // App mounts useWeeklyClose above the setup branch, so the background catch-up runs
    // between createProfile and setPlan. No cursor is a legal state with nothing to review;
    // it is the DANGLING cursor above that is corrupt.
    const noPlan: AppState = { ...seed(), cursors: {}, plans: {} };
    const h = harness(noPlan);

    h.actions.closeWeeks(PROFILE_ID, NOW_MS);

    expect(h.read()).toBe(noPlan);
    expect(h.error()).toBeNull();
  });
});

/*
 * Clearing the refusal. The message is answered by the next attempt that CHANGES the document,
 * identity being the domain's own no-op signal. A no-op that cleared it would tell the user
 * their complaint had been dealt with by an action that did nothing at all — and on a finished
 * plan or an unpaused plan, every remaining control is a no-op, so the banner would clear
 * itself on the first thing they tried and leave them nothing to read.
 */
describe('a documented no-op leaves the standing refusal up', () => {
  it('resumePlan with nothing paused', () => {
    const h = harness(seed());
    h.actions.assignToday(PROFILE_ID, MONDAY, 'Cardio');
    const refusal = h.error();
    expect(refusal).not.toBeNull();
    const before = h.read();

    h.actions.resumePlan(PROFILE_ID, WEDNESDAY); // cursor.ts: not paused, so a no-op

    expect(h.read()).toBe(before);
    expect(h.error()).toBe(refusal);
  });

  it('startSession on a finished plan', () => {
    const h = harness(
      seedState({
        labels: LABELS,
        weekdays: [...MWF],
        startedOn: PREV_MONDAY,
        timezone: TZ_ATHENS,
        nextSessionIndex: LABELS.length, // [sessions] one past the last: the plan is finished
      }),
    );
    h.actions.assignToday(PROFILE_ID, MONDAY, 'Push');
    const refusal = h.error();
    expect(refusal).not.toBeNull();
    const before = h.read();

    h.actions.startSession(PROFILE_ID, MONDAY, NOW_MS); // nothing left to assign: a no-op

    expect(h.read()).toBe(before);
    expect(h.error()).toBe(refusal);
  });
});
