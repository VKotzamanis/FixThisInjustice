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
//     document).
//
//   DEFECT — anything else. A corrupt plan, a bug in a gate this file has not been taught
//     about, a TypeError. It is rethrown, so it reaches RootErrorBoundary with its stack
//     intact instead of being reported to the user as a schedule they could fix.
//
// Sorting one from the other takes TWO independent agreements, and a throw is a refusal only
// when it has both:
//
//   1. THE ERROR IS DOMAIN-MINTED (isDomainMinted). Either a RangeError, which is what
//      calendar.ts raises for every one of its gates, or a message opening with `"<fn>: "` for
//      one of the seven schedule entry points, which is the shape cursor.ts stamps on every
//      gate it closes. This is the half that was missing: classifying on the STATE alone made
//      the state a licence to swallow, so any unrelated throw — a TypeError from a refactor
//      part-way through, a bug in a helper — arriving while the plan happened to be paused was
//      reported to the user as a schedule problem and the stack was lost.
//   2. THE STATE AGREES (the isRefusal predicates below). The domain is entitled to refuse in
//      this state, so a message minted here is one the user can act on.
//
// The domain stays the authority on WHETHER to refuse (it threw) and on the wording (its
// message is what the user sees); the classifier only sorts, and it sorts towards the rethrow
// whenever either half is unsatisfied — loud, not swallowed, which is the safe direction for a
// rule about someone's training record.
//
// Guards run BEFORE the transition and outside that classification (requireProfile,
// requirePlan). A profile id nobody owns, or a cursor naming a plan that is not stored, is a
// defect in the caller or a corrupt document; neither is a state the user can act on, and
// neither may reach the classifier, which would otherwise read the empty projection such a
// document produces as "the week offers no labels" and report a corrupt plan as a refusal.
//
// Clearing the refusal. A standing message is cleared by the next attempt that CHANGES the
// document, identity being the test (the domain returns its argument for a documented no-op:
// resumePlan when nothing is paused, startSession once the plan is finished). A no-op that
// cleared the banner would tell the user their complaint had been answered by an action that
// did nothing at all. The dismiss control (clearActionError) is the other way out.

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
import type {
  AppState,
  EpochMs,
  LocalDate,
  PlanCursor,
  PlanTemplate,
  Profile,
  UiPrefs,
} from '../domain/types';

export interface ScheduleActionDeps {
  /** Applies a pure AppState transition. Zustand's `set` is adapted to this in index.ts. */
  set(updater: (state: AppState) => AppState): void;
  /**
   * Records the user-facing refusal, or clears it with null. Writes the non-persisted
   * `status.lastActionError`. Must be idempotent: an unchanged message must not mint a new
   * status object.
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
 * Guard for every action that writes a record keyed by a profile id.
 *
 * The schema's root refinement rejects a document whose per-profile map carries a key no
 * profile owns (master plan section 5), and the store is the only writer, so the check belongs
 * at the point of writing rather than at the next reload: a caller that passes an id nobody
 * owns has a bug, and the alternative to throwing is a document that cannot be saved and a
 * silent data loss at the next load. `updateProfile` is deliberately not on this path — its
 * contract says an unknown id is a no-op, and it writes nothing keyed by that id.
 *
 * It lives in this module rather than in index.ts, which is where its P1/P2 callers are,
 * because index.ts already imports this file: one definition on this side of that edge, two
 * definitions or an import cycle on the other. There must be exactly one, since the P1/P2 and
 * P3 actions have to agree on what "not a known profile" means.
 */
export function requireProfile(state: AppState, action: string, profileId: string): Profile {
  const profile = state.profiles[profileId];
  if (profile === undefined) {
    throw new Error(`${action}: "${profileId}" is not a known profile`);
  }
  return profile;
}

/**
 * The plan a cursor names, or a throw. A cursor pointing at a plan that is not stored is a
 * dangling reference — a corrupt document — and the domain answers it with an empty projection
 * that is indistinguishable from a legitimately empty week. Reading it as a refusal would tell
 * the user their week is over; it has to reach the error boundary instead.
 */
function requirePlanOf(
  state: AppState,
  action: string,
  profileId: string,
  cursor: PlanCursor,
): PlanTemplate {
  const plan = state.plans[cursor.planId];
  if (plan === undefined) {
    throw new Error(
      `${action}: the cursor for "${profileId}" names plan "${cursor.planId}", which is not stored`,
    );
  }
  return plan;
}

/**
 * Profile, cursor and plan, for the actions that cannot do anything without all three. The
 * profile check comes first so the message names the outermost thing that is missing.
 */
export function requirePlan(
  state: AppState,
  action: string,
  profileId: string,
): { cursor: PlanCursor; plan: PlanTemplate } {
  requireProfile(state, action, profileId);
  const cursor = state.cursors[profileId];
  if (cursor === undefined) {
    throw new Error(`${action}: "${profileId}" has no plan cursor`);
  }
  return { cursor, plan: requirePlanOf(state, action, profileId, cursor) };
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

/**
 * The seven domain entry points this slice calls, and the only names a refusal message may
 * open with. cursor.ts stamps `${fn}: ` on both of its gates, with fn naming the caller.
 */
const DOMAIN_FUNCTIONS = [
  'startSession',
  'completeSession',
  'skipSession',
  'pausePlan',
  'resumePlan',
  'assignToday',
  'closeWeeks',
] as const;

/** The thrown value's own text. Non-Error throws are stringified rather than hidden. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Was `err` minted by the schedule domain as a refusal, rather than merely raised while one
 * was being attempted?
 *
 * Two shapes, both of them the domain's own: calendar.ts raises RangeError for every gate it
 * closes (assignToday's four gates and its two window invariants), and cursor.ts raises Error
 * with the calling function's name as the prefix. Anything else — a TypeError, a message from
 * a library, a throw from a helper that has no such prefix — is a defect, whatever state it
 * arrived in.
 *
 * The prefix is matched against all seven names rather than only against the caller's own,
 * because the names identify the DOMAIN's vocabulary, not the call site: a message minted by a
 * shared helper on behalf of another entry point is still the domain refusing. It is the state
 * check in attempt() that ties the refusal to this particular call.
 */
export function isDomainMinted(err: unknown): boolean {
  if (err instanceof RangeError) return true;
  const message = messageOf(err);
  return DOMAIN_FUNCTIONS.some((fn) => message.startsWith(`${fn}: `));
}

/**
 * Runs one attempted transition: guard, apply, or classify the throw.
 *
 * The outcome is collected in a holder rather than in a bare `let`, so the values read after
 * `set()` are the ones the updater assigned and not the initializers TypeScript would
 * otherwise narrow them to.
 */
function attempt(
  deps: ScheduleActionDeps,
  guard: (state: AppState) => void,
  apply: (state: AppState) => AppState,
  isRefusal: (state: AppState) => boolean,
): void {
  const outcome: { refusal: string | null; changed: boolean } = { refusal: null, changed: false };
  deps.set((state) => {
    // Outside the try, deliberately: a guard failure is a statement about the caller's
    // arguments or about the document's integrity, and must never be offered to the
    // classifier as something the user could act on.
    guard(state);
    try {
      const next = apply(state);
      // Identity, which the domain documents as its no-op signal: a transition with nothing
      // to do returns its argument.
      outcome.changed = next !== state;
      return next;
    } catch (err) {
      // Both halves must agree. Either alone would swallow: the error shape alone would
      // report a gate the state cannot actually be in, and the state alone would report any
      // throw that happened to land in a gated state.
      if (!isDomainMinted(err) || !isRefusal(state)) throw err;
      outcome.refusal = messageOf(err);
      return state; // identity preserved: the document is not rewritten by a refusal
    }
  });

  if (outcome.refusal !== null) {
    deps.setActionError(outcome.refusal);
  } else if (outcome.changed) {
    // Only a transition that actually moved the document answers a standing refusal. A
    // documented no-op leaves it up, because it has changed nothing about why it was raised.
    deps.setActionError(null);
  }
}

export function createScheduleActions(deps: ScheduleActionDeps): ScheduleActions {
  return {
    startSession: (profileId, date, now) =>
      attempt(
        deps,
        (s) => void requirePlan(s, 'startSession', profileId),
        (s) => startSessionPure(s, profileId, date, now), // now: [ms] epoch, UTC
        (s) => refusesTransition(s, profileId, date),
      ),

    completeSession: (profileId, date, now) =>
      attempt(
        deps,
        (s) => void requirePlan(s, 'completeSession', profileId),
        (s) => completeSessionPure(s, profileId, date, now), // now: [ms] epoch, UTC
        (s) => refusesTransition(s, profileId, date),
      ),

    skipSession: (profileId, date, reason) =>
      attempt(
        deps,
        (s) => void requirePlan(s, 'skipSession', profileId),
        (s) => skipSessionPure(s, profileId, date, reason),
        (s) => refusesTransition(s, profileId, date),
      ),

    // pausePlan and resumePlan cannot throw — an already-paused pause and a resume with no
    // open pause are both documented no-ops — but they are the user's way OUT of a refusal,
    // so a pause or resume that changes something clears the message like any other
    // transition. They write `pauses[profileId]` and read no plan, so the profile is the
    // whole of their guard.
    pausePlan: (profileId, from, reason) =>
      attempt(
        deps,
        (s) => void requireProfile(s, 'pausePlan', profileId),
        (s) => pausePlanPure(s, profileId, from, reason),
        () => false,
      ),

    resumePlan: (profileId, to) =>
      attempt(
        deps,
        (s) => void requireProfile(s, 'resumePlan', profileId),
        (s) => resumePlanPure(s, profileId, to),
        () => false,
      ),

    assignToday: (profileId, date, label) =>
      attempt(
        deps,
        (s) => void requirePlan(s, 'assignToday', profileId),
        (s) => assignTodayPure(s, profileId, date, label),
        (s) => refusesLabel(s, profileId, date, label),
      ),

    /*
     * Not routed through attempt(): closeWeeks is a background catch-up with the wall clock
     * (src/app/useWeeklyClose.ts), not something the user asked for, so it must neither raise
     * a refusal nor clear the one left by the action the user did ask for. It has no gates, so
     * a throw from here is a defect and propagates on its own.
     *
     * Its guard is the profile plus, if there is a cursor, the plan that cursor names. The
     * cursor itself is optional here and only here: App mounts useWeeklyClose above the setup
     * branch, so this runs for a profile the wizard has created but not yet given a plan, and
     * "no programme yet" is a legal state with nothing to review.
     */
    closeWeeks: (profileId, now) =>
      deps.set((s) => {
        requireProfile(s, 'closeWeeks', profileId);
        const cursor = s.cursors[profileId];
        if (cursor !== undefined) requirePlanOf(s, 'closeWeeks', profileId, cursor);
        return closeWeeksPure(s, profileId, now); // now: [ms] epoch, UTC
      }),

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
