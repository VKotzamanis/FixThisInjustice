/*
 * Hydration cues.
 *
 * No fixed drinking volume is prescribed during a session anywhere in this
 * file, and none may ever be added. Content peer review section 3 computed the
 * legacy fixed-volume rule (console-train.jsx:262-266) at up to 4.5 L in one
 * session, which exceeds any plausible sweat rate and any plausible
 * gastric-emptying rate, with exercise-associated hyponatraemia as the
 * mechanism of harm. Its replacement is mass-based, from ACSM; Sawka MN,
 * Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS (2007),
 * Exercise and Fluid Replacement, Med Sci Sports Exerc 39(2):377-390,
 * DOI 10.1249/mss.0b013e31802ca597 (verified; PMID 17277604), verbatim: the
 * goal is to prevent "excessive (> 2 % body weight loss from water deficit)
 * dehydration", and "customized fluid replacement programs are recommended.
 * Individual sweat rates can be estimated by measuring body weight before and
 * after exercise." The commonly cited "~1.5 L per kg lost" replacement figure
 * is marked PARAPHRASE in the review (the publisher returned HTTP 402) and
 * therefore ships as no number anywhere. hydration.test.ts asserts the absence
 * mechanically over this file's own text.
 *
 * Copy contract (master plan section 3, docs/design/2026-09-01-copy-contract.md):
 * HydrationCue.message carries a CopyKey, never user-facing prose. The Train
 * view (P4 Task 10) resolves it through copy() so a skin can override the
 * wording, and formats shortfallML through units.formatVolume in the user's
 * display unit. Nothing here builds a sentence or formats a number.
 *
 * Units: volume mL, body mass kg, instants epoch ms UTC, wall-clock times
 * "HH:mm" in the profile's IANA zone. Fractions are dimensionless.
 * Sign convention (master plan section 3, current - reference): a body-mass
 * loss fraction is POSITIVE when mass was lost.
 */
import { localTimeOf, todayLocal } from '../dates';
import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  HydrationEntry,
  Kg,
  LocalTime,
  ML,
  SessionAssignment,
} from '../types';

/**
 * Sex-specific baseline daily beverage target, re-exported from the nutrition
 * engine so the training layer and the targets view cannot drift apart. It is
 * the IOM (2005) BEVERAGE share (DOI 10.17226/10925), not the total-water AI,
 * because an app cannot observe the water contained in food.
 */
export { dailyBeverageTargetML } from '../nutrition';

/**
 * Minimum interval between in-session drink prompts.
 * A cadence, not a dose: the prompt exists so that thirst is consulted
 * periodically, and it names no volume. Sawka 2007 prescribes an individually
 * customised replacement programme, so a single number would be wrong for
 * every user; the app therefore prompts and lets thirst set the amount.
 */
export const SESSION_CHECK_INTERVAL_MS = 20 * 60 * 1000; // [ms] = 20 min

/** Local wall-clock time from which a daily shortfall is worth reporting. */
export const DAILY_SHORTFALL_AFTER: LocalTime = '18:00'; // [HH:mm] in Profile.timezone

/**
 * Fraction of the day's own target below which the shortfall cue fires.
 * HEURISTIC, not a sourced constant: half the target with roughly a quarter of
 * the waking day left is the point at which the remainder stops being
 * comfortably drinkable. No source in the content review sets an intra-day
 * checkpoint, so this is a design decision, recorded here as one.
 */
export const DAILY_SHORTFALL_FRACTION = 0.5; // dimensionless

/**
 * How long after it started a session still owns the in-session cues.
 *
 * Code review: the session used to be found by `assignment.date === todayLocal(...)`,
 * which dropped every session cue the instant the session crossed local midnight.
 * A session started at 23:50 lost its drink cadence and its post-session weigh-in
 * prompt at 00:10, because an assignment is filed under the local day it was
 * scheduled for while `todayLocal(now)` had already rolled over. The session is now
 * found by its own `startedAt` - the latest assignment started at or before `now` -
 * which is the same session the store's `session.activeAssignmentDate` names while
 * one is open; this module is pure and is handed only AppState, so it derives the
 * answer rather than reading that field.
 *
 * The search is bounded because an unbounded one would revive last week's session
 * and prompt for its weigh-in days late. The bound has to exceed the longest
 * plausible resistance-training session and stay below the gap between two
 * assignments, which are filed at least one calendar day apart; 12 h sits between
 * the two, so a session still in progress is never dropped and yesterday's is never
 * revived. HEURISTIC, not a sourced constant, and recorded here as one.
 */
export const SESSION_LOOKBACK_MS = 12 * 3_600_000; // [ms] = 12 h

/**
 * How long before the session started a body-mass entry may have been logged and
 * still count as the pre-session mass.
 *
 * Code review: the window used to be "the session's own local day", which admits a
 * mass taken at breakfast and rejects one taken an hour before a session that runs
 * past midnight. The first is the dangerous half. Body mass varies within a day by
 * of order 1-2 kg from fluid balance and gut content, which on an 80 kg subject is
 * 1.3-2.5 % - the same order as the 2 % threshold this measurement feeds - so a
 * stale morning mass can manufacture or mask the flag on its own and cannot support
 * it. A 6 h window bounds that drift while still admitting a mass taken at home
 * before travelling to the gym. HEURISTIC, not a sourced constant: the sources cited
 * in the file header set the threshold, not the measurement window.
 */
export const PRE_SESSION_MASS_WINDOW_MS = 6 * 3_600_000; // [ms] = 6 h

/**
 * In-session body-mass loss above which fluid replacement was inadequate.
 * Sawka 2007 (see the file header), verbatim: prevent "excessive (> 2 % body
 * weight loss from water deficit) dehydration". The comparison is strict, so a
 * loss of exactly 2 % is not flagged - see DEHYDRATION_FRACTION_TOL for how
 * "exactly" is decided in floating point.
 */
export const DEHYDRATION_LOSS_FRACTION = 0.02; // dimensionless

/**
 * Numerical tolerance on that comparison, dimensionless like the fraction itself.
 *
 * Code review: (pre - post) / pre for a loss of exactly 2 % is not exactly 0.02
 * in binary floating point, and which side of 0.02 it lands on depends on the
 * subject's mass. With post = pre x 0.98 the quotient sits a few ulp ABOVE 0.02
 * at pre = 70, 85, 96 and 110 kg, and at or below it at pre = 80 and 100 kg, so
 * a bare `>` flagged four of those six subjects for hitting the threshold
 * exactly and cleared the other two. A physical threshold cannot depend on the
 * subject's mass through rounding. The tolerance is far above the worst
 * deviation measured over those masses (8.0e-17, at pre = 70 kg) and far below
 * the resolution of the measurement that feeds it - a 0.1 kg scale reading on
 * an 80 kg subject resolves 1.25e-3 of body mass - so it removes the artefact
 * without moving the physical threshold.
 */
export const DEHYDRATION_FRACTION_TOL = 1e-9; // dimensionless

export interface HydrationCue {
  kind: 'session-check' | 'daily-shortfall' | 'post-session-weigh';
  message: string; // a CopyKey; the view resolves it, see the file header
  shortfallML: ML | null; // [mL] daily-shortfall only; null for the other kinds
}

/**
 * The copy key each cue kind maps to. Exported so the view and its tests bind
 * to a constant rather than to a repeated string literal. The default wording
 * lives in src/content/copy.ts (P4 Task 10).
 */
export const HYDRATION_COPY_KEY = {
  'session-check': 'advice.drinkToThirst',
  'daily-shortfall': 'advice.beverageShortfall',
  'post-session-weigh': 'advice.logPostSessionMass',
} as const satisfies Record<HydrationCue['kind'], string>;

/**
 * Body-mass change across a session as a fraction of the pre-session mass.
 * Sign convention: POSITIVE = mass lost, so the result is (pre - post) / pre.
 * A non-positive pre-session mass is not a measurement; it returns 0 rather
 * than dividing, so no caller can be handed an Infinity or a NaN.
 */
export function bodyMassLossFraction(preKg: Kg, postKg: Kg): number {
  // [kg], [kg] -> dimensionless
  if (preKg <= 0) return 0;
  return (preKg - postKg) / preKg;
}

/**
 * True when the session's mass loss exceeded the ACSM 2007 threshold, strictly.
 * DEHYDRATION_FRACTION_TOL absorbs the floating-point noise of the division, so
 * a loss of exactly 2 % is not flagged at any pre-session mass.
 */
export function exceedsDehydrationThreshold(preKg: Kg, postKg: Kg): boolean {
  // dimensionless > dimensionless
  return bodyMassLossFraction(preKg, postKg) > DEHYDRATION_LOSS_FRACTION + DEHYDRATION_FRACTION_TOL;
}

/**
 * The session the cues belong to right now: the assignment with the latest
 * `startedAt` at or before `now`, and within SESSION_LOOKBACK_MS of it.
 * Selected by the instant it started, never by its scheduled local date, so a
 * session that runs past local midnight keeps its cues. See SESSION_LOOKBACK_MS.
 */
function activeAssignment(
  assignments: readonly SessionAssignment[],
  now: EpochMs, // [ms] epoch UTC
): SessionAssignment | null {
  let current: SessionAssignment | null = null;
  let currentStartedAt = -Infinity; // [ms] epoch UTC
  for (const a of assignments) {
    const { startedAt } = a; // [ms] epoch UTC, null = never started
    if (startedAt === null) continue;
    if (startedAt > now) continue; // scheduled but not started; the caller owns the clock
    if (now - startedAt > SESSION_LOOKBACK_MS) continue; // too old to be the current session
    if (startedAt > currentStartedAt) {
      current = a;
      currentStartedAt = startedAt;
    }
  }
  return current;
}

/**
 * The body-mass entry that counts as this session's PRE-session mass, or null.
 *
 * The latest entry logged at or before `startedAt` and no more than
 * PRE_SESSION_MASS_WINDOW_MS before it. Exported because the Train view needs
 * exactly the reference the post-session cue's own guard uses (P4 polish item
 * 2): the > 2 % comparison is meaningful only against the mass this session
 * started from, and the view previously compared against
 * Profile.body.baselineMassKg - a mass from whenever the profile was set up,
 * which reports the programme's mass change rather than the session's fluid
 * loss and can manufacture or mask the flag on its own.
 *
 * Ties are broken by the latest `loggedAt`, never by array position: the store
 * keeps bodyMass sorted by civil DATE, so two entries on one day arrive in
 * insertion order and position is not a fact about when they were measured.
 */
export function preSessionMass(
  masses: readonly BodyMassEntry[],
  startedAt: EpochMs, // [ms] epoch UTC
): BodyMassEntry | null {
  let best: BodyMassEntry | null = null;
  for (const entry of masses) {
    const { loggedAt } = entry; // [ms] epoch UTC
    if (loggedAt > startedAt) continue; // after the session began: not a pre-session mass
    if (startedAt - loggedAt > PRE_SESSION_MASS_WINDOW_MS) continue; // too stale to compare
    if (best === null || loggedAt > best.loggedAt) best = entry;
  }
  return best;
}

/**
 * The most recent drink mark of the day, or 0 when there is none.
 * Marks are written by the app itself and are therefore never ahead of `now`;
 * were one to be, the cadence below would simply not fire, which is the safe
 * direction to fail in.
 */
function latestMark(marks: readonly EpochMs[]): EpochMs {
  return marks.reduce((latest, t) => (t > latest ? t : latest), 0); // [ms] epoch UTC, 0 = none
}

/**
 * The single hydration cue that applies right now, or null.
 *
 * Pure: every input is an argument, `now` included, so the result is
 * reproducible and the caller owns the clock.
 *
 * Precedence, highest first. At most one cue is returned, because the view has
 * one advice line.
 *
 *  1. post-session-weigh - the current session (see activeAssignment) is
 *     completed, the profile opted in to pre/post weigh-ins, a pre-session mass
 *     was logged within PRE_SESSION_MASS_WINDOW_MS before the session started,
 *     and no mass has been logged since the session ended. The pre-session entry
 *     is required: without it nothing can
 *     be compared, and Sawka 2007's rule is a comparison. Once the post-session
 *     mass is logged, the store passes both to exceedsDehydrationThreshold and
 *     the view raises the > 2 % flag; that flag is not a cue kind, because the
 *     cue exists to obtain the measurement, not to report it.
 *  2. session-check - a session is active and the cadence has elapsed. The rule
 *     is exactly: due when now - max(startedAt, latest mark of today) is at
 *     least SESSION_CHECK_INTERVAL_MS. Logging a drink therefore restarts the
 *     window, so the prompt cannot stack up behind a user who is already
 *     drinking, and the anchor is never earlier than the session start, so a
 *     mark from earlier in the day cannot make the first prompt due at once.
 *     Marks are read from the entry for the current local day AND from the entry
 *     for the day the session started on, which are the same entry except across
 *     local midnight; a drink logged at 23:55 therefore still anchors the window
 *     at 00:10. Residual limitation, left as it is: a session spanning more than
 *     those two civil days would lose the earliest of them, which no plausible
 *     resistance-training session does (SESSION_LOOKBACK_MS bounds it at 12 h).
 *  3. daily-shortfall - at or after DAILY_SHORTFALL_AFTER in the profile's
 *     zone, today's logged beverage volume is below DAILY_SHORTFALL_FRACTION
 *     of the profile's own editable target.
 */
export function hydrationCue(
  state: AppState,
  profileId: string,
  now: EpochMs, // [ms] epoch UTC
  sessionActive: boolean,
): HydrationCue | null {
  const profile = state.profiles[profileId];
  if (profile === undefined) return null;

  const tz = profile.timezone;
  const today = todayLocal(tz, now);
  const entry: HydrationEntry | null =
    (state.hydration[profileId] ?? []).find((e) => e.date === today) ?? null;
  const volumeML = entry?.volumeML ?? 0; // [mL] logged today
  // Found by `startedAt`, not by `date === today`: a session that crosses local
  // midnight keeps its cues. See activeAssignment and SESSION_LOOKBACK_MS.
  const assignment = activeAssignment(state.assignments[profileId] ?? [], now);

  // 1. Post-session weigh-in.
  if (
    profile.hydration.weighInOptIn &&
    assignment !== null &&
    assignment.status === 'completed' &&
    assignment.startedAt !== null &&
    assignment.completedAt !== null &&
    now >= assignment.completedAt
  ) {
    const { startedAt, completedAt } = assignment; // [ms] epoch UTC
    const masses = state.bodyMass[profileId] ?? [];
    // "Pre-session" means logged within PRE_SESSION_MASS_WINDOW_MS before the
    // session started. A window and not a calendar day: the day scope admitted a
    // breakfast mass, whose within-day drift is the same order as the 2 % flag it
    // feeds, and it rejected a valid mass whenever the session ran past midnight.
    // Some bound is still required - without one, any body-mass entry the user
    // ever recorded would satisfy the guard and a weekly weigh-in would make it
    // vacuous. Residual limitation, inherited by the > 2 % comparison the view
    // then makes: within the window the app still cannot tell a mass taken at the
    // gym door from one taken 5 h earlier.
    const hasPreSessionMass = preSessionMass(masses, startedAt) !== null;
    const hasPostSessionMass = masses.some((b) => b.loggedAt >= completedAt);
    if (hasPreSessionMass && !hasPostSessionMass) {
      return {
        kind: 'post-session-weigh',
        message: HYDRATION_COPY_KEY['post-session-weigh'],
        shortfallML: null,
      };
    }
  }

  // 2. In-session cadence. No volume is named; the instruction is to drink to thirst.
  if (sessionActive && assignment !== null && assignment.startedAt !== null) {
    /*
     * The marks of TODAY and of the day the session started on (P4 polish item 9). A hydration
     * entry is a per-local-day total and stays day-scoped for the shortfall rule, so a session
     * that crosses local midnight had its own drinks filed under the previous day and became
     * invisible the moment the day rolled over: the anchor fell back to the session start,
     * hours earlier, and the first prompt after midnight was due at once. Reading the second
     * day costs one more find over a list with one entry per day.
     */
    const startedOn = todayLocal(tz, assignment.startedAt); // the session's own civil day
    const sessionDayEntry: HydrationEntry | null =
      startedOn === today
        ? entry
        : ((state.hydration[profileId] ?? []).find((e) => e.date === startedOn) ?? null);
    const anchor = Math.max(
      assignment.startedAt,
      latestMark(entry?.marks ?? []),
      latestMark(sessionDayEntry?.marks ?? []),
    ); // [ms] epoch UTC
    if (now - anchor >= SESSION_CHECK_INTERVAL_MS) {
      return {
        kind: 'session-check',
        message: HYDRATION_COPY_KEY['session-check'],
        shortfallML: null,
      };
    }
  }

  // 3. Daily shortfall against the profile's own target.
  const targetML = profile.hydration.dailyTargetML; // [mL/day]
  if (
    localTimeOf(now, tz) >= DAILY_SHORTFALL_AFTER &&
    volumeML < DAILY_SHORTFALL_FRACTION * targetML
  ) {
    return {
      kind: 'daily-shortfall',
      message: HYDRATION_COPY_KEY['daily-shortfall'],
      shortfallML: Math.max(0, Math.round(targetML - volumeML)), // [mL] still to drink
    };
  }

  return null;
}
