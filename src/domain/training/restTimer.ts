// src/domain/training/restTimer.ts
//
// A rest interval is a pair of absolute instants, never a decremented counter. Code review
// A31 records the legacy defect: the elapsed value was read from the wall clock, but the
// chime test lived inside a setInterval callback, and background tabs are throttled to >= 1 s
// and suspended outright on iOS. Locking the phone at t = 30 s of a 90 s rest and unlocking
// at t = 150 s fired the interval for the first time on resume and chimed 60 s late.
//
// Every function here is pure and takes `now` as an argument. Nothing in this module reads a
// clock, holds state, or schedules a callback, so a suspended tab cannot leave a stale count
// behind: remainingS is a function of `now` and is correct the instant the tab wakes.
//
// Units: instants are epoch ms UTC [ms]; every rest quantity is seconds [s]. Sign convention:
// remainingS is time LEFT, so it is non-negative by construction; a negative `deltaS` passed
// to `extend` shortens the interval.
import { restSFor } from '../plan/library';
import type { EpochMs, Exercise, PlannedExercise, Seconds } from '../types';

/*
 * Rest-interval defaults, content peer review section 9. These three constants are the NAMED
 * values the UI and the tests refer to; the decision logic is not here. `defaultRestS`
 * delegates to `restSFor` in src/domain/plan/library.ts, which is the single source of truth
 * for the stratification (master plan section 6.5 as amended). restTimer.test.ts pins each
 * constant to the value restSFor returns, so the two cannot drift apart silently.
 *
 * Heavy multi-joint compound (>= 80 % 1RM, <= 6 reps): 180-300 s.
 *   de Salles BF et al. (2009), Rest Interval between Sets in Strength Training,
 *   Sports Med 39(9):765-777, DOI 10.2165/11315230-000000000-00000 (3-5 min at 50-90 % 1RM);
 *   Grgic J et al. (2018), Sports Med 48(1):137-151, DOI 10.1007/s40279-017-0788-x
 *   (> 2 min to maximise strength in trained individuals). Default: the bottom of the band.
 *
 * Moderate compound (6-12 reps): 120-180 s.
 *   Schoenfeld BJ et al. (2016), J Strength Cond Res 30(7):1805-1812,
 *   DOI 10.1519/JSC.0000000000001272: 3 min beat 1 min for 1RM squat, 1RM bench and
 *   anterior-thigh thickness in 21 trained men over 8 weeks.
 *
 * Single-joint isolation, machine and accessory work: 60-90 s (lower systemic cost).
 * Default: the top of the band.
 *
 * Contradicting evidence, stated rather than omitted (review section 9): ACSM 2026 found
 * strength "was not affected by ... short (< 1 min) versus long (> 1 min) between-set rest
 * intervals" and "insufficient data" for hypertrophy. The acute effect is uncontested - short
 * rest reduces reps and load in subsequent sets - so rest acts on adaptation through
 * volume-load, not as an independent stimulus. Long rest on heavy compounds costs clock time
 * only.
 *
 * Honest limit (review section 9): the literature stratifies rest by LOAD and GOAL, not by
 * exercise type. Keying on loadClass plus the rep ceiling is the closest faithful mapping
 * onto the load ranges actually tested; exercise-type stratification per se is INSUFFICIENT
 * EVIDENCE.
 */
export const REST_HEAVY_COMPOUND_S: Seconds = 180; // [s]
export const REST_MODERATE_COMPOUND_S: Seconds = 120; // [s]
export const REST_ISOLATION_S: Seconds = 90; // [s]

/**
 * Rep ceiling that puts a multi-joint set in the heavy band (review section 9). Declared here
 * because the UI names the boundary when it explains a default; the branch that applies it
 * lives in restSFor, and restTimer.test.ts asserts that hi at this ceiling gets the heavy
 * default and hi one rep above gets the moderate one.
 */
export const HEAVY_REP_CEILING = 6; // [repetitions]

/**
 * The persisted shape of a running rest interval. Defined here rather than in types.ts: it is
 * P4-local state, mirrored to sessionStorage by the session slice and never written into the
 * persisted document (master plan section 3 forbids persisting derived values).
 */
export interface RestTimer {
  startedAt: EpochMs; // [ms] epoch ms UTC, the instant the rest began
  endsAt: EpochMs; // [ms] epoch ms UTC, the instant it is due to end
  durationS: Seconds; // [s] as originally requested; extensions move endsAt only
}

/**
 * Starts a rest interval at `now`. `durationS` is expected to be non-negative (the Seconds
 * contract in types.ts); it is recorded verbatim so the originally prescribed rest survives
 * any later extension.
 */
export function startRest(durationS: Seconds, now: EpochMs): RestTimer {
  return { startedAt: now, endsAt: now + durationS * 1000, durationS }; // [ms] = [s] x 1000
}

/**
 * Seconds left, computed from endsAt and clamped at 0. Never decremented, so a 10-minute
 * background suspension yields 0 rather than a frozen count (master plan section 7, P4 timer
 * gate). A part-second remainder rounds UP, so the display never reads 0 while time is left.
 *
 * @returns time remaining [s], >= 0
 */
export function remainingS(timer: RestTimer, now: EpochMs): Seconds {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000)); // [s]
}

/**
 * Full span of the timer including any extensions; drives the progress ring, which cannot use
 * durationS because `extend` deliberately leaves that field alone.
 *
 * Rounds UP, the same way remainingS does. The two are divided and compared by the caller
 * (elapsed / total for the ring, remaining for the readout), so rounding them differently lets
 * remainingS exceed totalS on a fractional span: a 90.2 s span reads as 91 s remaining out of a
 * 90 s total at t = startedAt, and the ring draws past full. A fractional span is reachable
 * because `extend` takes an unconstrained deltaS.
 *
 * @returns span endsAt - startedAt [s], >= 0, >= remainingS at any `now` >= startedAt
 */
export function totalS(timer: RestTimer): Seconds {
  return Math.max(0, Math.ceil((timer.endsAt - timer.startedAt) / 1000)); // [s]
}

/**
 * Extends the interval by moving endsAt; startedAt and durationS are untouched. A negative
 * deltaS shortens it, and endsAt is clamped at startedAt so the timer can be cut to zero
 * remaining but never inverted: totalS stays a non-negative span and a shortened timer
 * reaches 0 by arithmetic rather than only through the clamp inside remainingS.
 *
 * Returns a new object; the argument is never mutated.
 */
export function extend(timer: RestTimer, deltaS: number): RestTimer {
  const moved = timer.endsAt + deltaS * 1000; // [ms] = [s] x 1000, signed
  return { ...timer, endsAt: Math.max(timer.startedAt, moved) }; // [ms]
}

/**
 * The rest interval a planned exercise should start with. This is a library lookup plus a
 * delegation to `restSFor`, which owns the cited stratification (master plan section 6.5 as
 * amended); no second rest table exists in this module.
 *
 * @returns rest duration [s]
 */
export function defaultRestS(ex: PlannedExercise, lib: Record<string, Exercise>): Seconds {
  const exercise = lib[ex.exerciseId];
  // Unknown exercise (a custom exercise not in the passed map): there is no Exercise to
  // stratify on, so this is the one value chosen here rather than by restSFor. It matches
  // restSFor's own fallthrough, the moderate-compound default, so an unknown exercise gets the
  // same rest as a known compound the stratification cannot place.
  //
  // The shortest interval is NOT the conservative choice, which is why it is not used: under-
  // resting a set that is in fact a heavy compound costs reps and load in the sets that follow
  // (de Salles 2009, Grgic 2018, Schoenfeld 2016, cited above), while over-resting a set that
  // is in fact isolation work costs clock time and nothing else. The asymmetry runs one way.
  if (exercise === undefined) return REST_MODERATE_COMPOUND_S; // [s]
  return restSFor(exercise, ex.prescription); // [s]
}
