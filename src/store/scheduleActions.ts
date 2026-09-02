// src/store/scheduleActions.ts
//
// The store's schedule actions (master plan §6.7, P3). Every one of them is a call into a
// pure domain function under `set`, so the behaviour is tested in the domain modules and only
// the wiring is tested here. No date arithmetic, no clock, and no schedule branching lives in
// this file.
//
// Error surfacing (master plan §6.4 as amended). cursor.ts and calendar.ts THROW on an
// illegal transition rather than returning the state unchanged, because a silent no-op is
// indistinguishable from a change the UI simply has not rendered yet. The store has to decide
// what a throw means, and the two kinds are not the same thing:
//
//   REFUSAL — a legal state of the app in which this particular request cannot be honoured,
//     and which the user can act on: the plan is paused on that day, another day is still open
//     ("a session is already in progress"), or the label tapped is no longer among the
//     sessions the week has left. The document is left exactly as it was and the domain's own
//     message goes to `status.lastActionError`, which is NOT persisted (master plan §3: no
//     derived values persisted, and a refusal is a fact about one attempt, not about the
//     document). It is cleared by the next schedule action that succeeds.
//
//   DEFECT — anything else. A corrupt plan, a bug in a gate this file has not been taught
//     about, a TypeError. It is rethrown, so it reaches RootErrorBoundary with its stack
//     intact instead of being reported to the user as a schedule they could fix.
//
// The split is decided by the classifiers below, which run ONLY after a throw and ask whether
// the state the call was made against is one the domain is contractually entitled to refuse
// in. The domain stays the authority on WHETHER to refuse (it threw) and on the wording (its
// message is what the user sees); the classifier only sorts. If the domain grows a gate this
// file does not know about, the classifier returns false and the throw propagates — loud, not
// swallowed, which is the safe direction for a rule about someone's training record.

import {
  assignToday as assignTodayPure,
  remainingLabelsThisWeek,
} from '../domain/schedule/calendar';
import {
  completeSession as completeSessionPure,
  isPaused,
  isTerminal,
  pausePlan as pausePlanPure,
  resumePlan as resumePlanPure,
  skipSession as skipSessionPure,
  startSession as startSessionPure,
} from '../domain/schedule/cursor';
import { closeWeeks as closeWeeksPure } from '../domain/schedule/weekly';
import type { AppState, EpochMs, LocalDate, UiPrefs } from '../domain/types';

export interface ScheduleActionDeps {
  /** Applies a pure AppState transition. Zustand's `set` is adapted to this in index.ts. */
  set(updater: (state: AppState) => AppState): void;
  /**
   * Records the user-facing refusal, or clears it with null. Writes the non-persisted
   * `status.lastActionError`. Must be idempotent: the slice calls it after every attempted
   * transition, including the ones that change nothing.
   */
  setActionError(message: string | null): void;
}

export interface ScheduleActions {
  startSession(profileId: string, date: LocalDate, now: EpochMs): void;
  completeSession(profileId: string, date: LocalDate, now: EpochMs): void;
  skipSession(profileId: string, date: LocalDate, reason: string | null): void;
  pausePlan(profileId: string, from: LocalDate, reason: string | null): void;
  resumePlan(profileId: string, to: LocalDate): void;
  assignToday(profileId: string, date: LocalDate, label: string): void;
  closeWeeks(profileId: string, now: EpochMs): void;
  setUi(patch: Partial<UiPrefs>): void;
  /**
   * Clears `status.lastActionError`.
   *
   * The refusal banner's dismiss control, and nothing else. A refusal is a fact about ONE
   * attempt, so it must be dismissable without the user having to make a second attempt
   * succeed first: on a paused plan the only way out would otherwise be an action the domain
   * refuses for the same reason. It writes no persisted field and takes no arguments, so it
   * cannot be mistaken for a transition.
   */
  clearActionError(): void;
}

/**
 * Is `state` one in which cursor.ts is entitled to refuse a transition on `date`?
 *
 * Mirrors the two gates in cursor.ts's assignmentFor(), using that module's own exported
 * predicates rather than a copy of their logic:
 *   1. the day is inside an open pause — a paused day holds no session at all;
 *   2. some other day is still open (non-terminal) — at most one assignment is open per
 *      profile, so a second open day would claim a second session.
 * Neither gate can reach a day that already has an assignment, so that case is answered first.
 *
 * Exported for its own tests: the shipped domain has no reachable defect path through these
 * actions, so the rethrow branch is pinned here rather than by simulating a corrupt plan.
 */
export function refusesTransition(state: AppState, profileId: string, date: LocalDate): boolean {
  const assignments = state.assignments[profileId] ?? [];
  if (assignments.some((a) => a.date === date)) return false;
  if (isPaused(state.pauses[profileId] ?? [], date)) return true;
  return assignments.some((a) => !isTerminal(a));
}

/**
 * Is `label` outside what assignToday can honour on `date`?
 *
 * remainingLabelsThisWeek is defined as "exactly the labels assignToday can honour" (master
 * plan §6.4), so this is the domain's own gate rather than a reconstruction of it. The case
 * it catches in practice is a stale render: the user taps a label that a completion in
 * another tab, or a pause, has since taken off the list.
 */
export function refusesLabel(
  state: AppState,
  profileId: string,
  date: LocalDate,
  label: string,
): boolean {
  return !remainingLabelsThisWeek(state, profileId, date).includes(label);
}

/** The thrown value's own text. Non-Error throws are stringified rather than hidden. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs one attempted transition: apply the pure function, or classify the throw.
 *
 * The refusal message is collected in a holder rather than in a bare `let`, so the value read
 * after `set()` is the one the updater assigned and not the initializer TypeScript would
 * otherwise narrow it to.
 */
function attempt(
  deps: ScheduleActionDeps,
  apply: (state: AppState) => AppState,
  isRefusal: (state: AppState) => boolean,
): void {
  const outcome: { refusal: string | null } = { refusal: null };
  deps.set((state) => {
    try {
      return apply(state);
    } catch (err) {
      if (!isRefusal(state)) throw err; // a defect: never reported as a schedule problem
      outcome.refusal = messageOf(err);
      return state; // identity preserved: the document is not rewritten by a refusal
    }
  });
  deps.setActionError(outcome.refusal);
}

export function createScheduleActions(deps: ScheduleActionDeps): ScheduleActions {
  return {
    startSession: (profileId, date, now) =>
      attempt(
        deps,
        (s) => startSessionPure(s, profileId, date, now), // now: [ms] epoch, UTC
        (s) => refusesTransition(s, profileId, date),
      ),

    completeSession: (profileId, date, now) =>
      attempt(
        deps,
        (s) => completeSessionPure(s, profileId, date, now), // now: [ms] epoch, UTC
        (s) => refusesTransition(s, profileId, date),
      ),

    skipSession: (profileId, date, reason) =>
      attempt(
        deps,
        (s) => skipSessionPure(s, profileId, date, reason),
        (s) => refusesTransition(s, profileId, date),
      ),

    // pausePlan and resumePlan cannot throw — an already-paused pause and a resume with no
    // open pause are both documented no-ops — but they are the user's way OUT of a refusal,
    // so they clear the message like any other successful transition.
    pausePlan: (profileId, from, reason) =>
      attempt(
        deps,
        (s) => pausePlanPure(s, profileId, from, reason),
        () => false,
      ),

    resumePlan: (profileId, to) =>
      attempt(
        deps,
        (s) => resumePlanPure(s, profileId, to),
        () => false,
      ),

    assignToday: (profileId, date, label) =>
      attempt(
        deps,
        (s) => assignTodayPure(s, profileId, date, label),
        (s) => refusesLabel(s, profileId, date, label),
      ),

    /*
     * Not routed through attempt(): closeWeeks is a background catch-up with the wall clock
     * (src/app/useWeeklyClose.ts), not something the user asked for, so it must neither raise
     * a refusal nor clear the one left by the action the user did ask for. It has no gates and
     * returns the state unchanged when there is nothing to close, so a throw from here is a
     * defect and propagates on its own.
     */
    closeWeeks: (profileId, now) => deps.set((s) => closeWeeksPure(s, profileId, now)), // [ms] epoch, UTC

    // Identical to the P1 implementation in index.ts, which this replaces when the slice is
    // spread last. A preference is not a schedule attempt, so it leaves lastActionError alone.
    setUi: (patch) => deps.set((s) => ({ ...s, ui: { ...s.ui, ...patch } })),

    /*
     * Not routed through attempt() either: there is no transition to apply and nothing that
     * can throw. It goes straight to the same idempotent channel every attempt reports
     * through, so a dismiss of an already-clear banner costs no state object and no re-render.
     */
    clearActionError: () => {
      deps.setActionError(null);
    },
  };
}
