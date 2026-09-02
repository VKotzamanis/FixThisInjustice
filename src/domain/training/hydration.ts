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
import type { AppState, EpochMs, HydrationEntry, Kg, LocalTime, ML } from '../types';

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
 * In-session body-mass loss above which fluid replacement was inadequate.
 * Sawka 2007 (see the file header), verbatim: prevent "excessive (> 2 % body
 * weight loss from water deficit) dehydration". The comparison is strict, so a
 * loss of exactly 2 % is not flagged.
 */
export const DEHYDRATION_LOSS_FRACTION = 0.02; // dimensionless

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

/** True when the session's mass loss exceeded the ACSM 2007 threshold, strictly. */
export function exceedsDehydrationThreshold(preKg: Kg, postKg: Kg): boolean {
  return bodyMassLossFraction(preKg, postKg) > DEHYDRATION_LOSS_FRACTION;
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
 *  1. post-session-weigh - the session on today's date is completed, the
 *     profile opted in to pre/post weigh-ins, a pre-session mass was recorded
 *     on that local day at or before the session started, and no mass has been
 *     logged since the session ended. The pre-session entry is required:
 *     without it nothing can
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
  const assignment = (state.assignments[profileId] ?? []).find((a) => a.date === today) ?? null;

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
    // "Pre-session" means logged on the session's own local day, at or before it
    // started. Scoping to the day matters: without it any body-mass entry the
    // user ever recorded would satisfy the guard, and a weekly weigh-in would
    // make it vacuous. Known limitation, inherited by the > 2 % comparison the
    // view then makes: the app cannot tell a mass taken at the gym door from
    // one taken at breakfast the same morning.
    const hasPreSessionMass = masses.some((b) => b.date === today && b.loggedAt <= startedAt);
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
    const anchor = Math.max(assignment.startedAt, latestMark(entry?.marks ?? [])); // [ms] epoch UTC
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
