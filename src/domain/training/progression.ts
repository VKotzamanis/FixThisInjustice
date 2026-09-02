// Double progression with a percentage increment and an equipment guard.
// Every threshold below comes from docs/review/2026-09-01-content-peer-review.md
// section 10 with the DOI reproduced; nothing here is invented.
//
// Deviations from the P4 plan's Task 1 Step 4 literal (recorded here; the plan is not edited):
//  - ProgressionAdvice gains `why: string`. Master plan section 3 and copy contract R9 cap an
//    advice line at 12 words and put the arithmetic behind a "why?" disclosure, returned by the
//    domain "as a separate `why` string, never concatenated into the message". The plan's
//    literal reason strings carried the percentages and the plate rounding inline and broke
//    both rules, so the arithmetic moved to `why` and every `reason` was cut to the limit.
//  - `e1RMOrNull` and `E1RM_MAX_REPS` are added. Master plan section 6.5 says reps <= 10 is
//    "null-guarded by caller"; defining the guard once here stops each caller reinventing it.
//    `e1RM` itself is unchanged and stays unguarded.
//  - `MAX_REASON_WORDS` is exported so the copy-contract test asserts against the same number.
//  - The plan's section 6.5 literal speaks only of repetitions. A "time" or "duration"
//    prescription is logged with `durationS` and `reps === null`, which `isCompletedSet`
//    rejects, so the hold branch reported no load at all for timed work. `isPerformedSet`
//    (internal) accepts either evidence of work; `isCompletedSet` and `CompletedSet` are
//    unchanged because coach.ts needs the repetition count for its personal-best rule.
import { compareLocalDate } from '../dates';
import type {
  Exercise,
  Kg,
  LoggedSet,
  PlanBlock,
  PlannedExercise,
  PlanTemplate,
  Prescription,
  Profile,
} from '../types';
import { achievableLoad, formatLoad, stepFor } from '../units';

/**
 * Fraction of the working load added when the top of the rep range is met on
 * every prescribed set. The 2-10 % band is ACSM (2009), Progression Models in
 * Resistance Training for Healthy Adults, Med Sci Sports Exerc 41(3):687-708,
 * DOI 10.1249/mss.0b013e3181915670 (verified; PMID 19204579), verbatim: "2-10%
 * increase in load be applied when the individual can perform the current
 * workload for one to two repetitions over the desired number".
 * The 5 % / 2.5 % split inside that band is the content peer review's section 10
 * heuristic and is marked INSUFFICIENT EVIDENCE there: no study compares
 * increment sizes head to head. It is a choice inside a cited range, not a
 * finding, and the `why` strings present it as such.
 */
export const INCREMENT_FRACTION: Record<Exercise['loadClass'], number> = {
  'lower-compound': 0.05, // dimensionless fraction of the working load
  'upper-compound': 0.025, // dimensionless
  isolation: 0.025, // dimensionless
};

/**
 * When the smallest achievable equipment step is more than this fraction of the
 * working load, no load increment can honour the ACSM band, so the engine
 * extends the rep range instead (content peer review section 10: a 20 kg curl in
 * a metric gym faces a 2.5 kg floor = 12.5 % of the working load).
 */
export const STEP_GUARD_FRACTION = 0.1; // dimensionless

/** Repetitions added to prescription.hi when the guard fires (review section 10). */
export const REP_RANGE_EXTENSION = 2; // [repetitions]

/**
 * Two logged loads count as the same working load within this tolerance.
 * Code review A24: exact float equality gated the legacy progression, and any
 * residue from a kg/lb conversion killed the rule silently. 0.01 kg sits well
 * below the smallest fractional plate pair in the review's section 10 plate
 * table (0.25 kg total), so it absorbs float residue and nothing a lifter could
 * physically load.
 */
export const LOAD_EQ_TOL_KG = 0.01; // [kg]

/** Master plan section 3: an advice line is at most twelve words. */
export const MAX_REASON_WORDS = 12; // [words]

/** Epley's stated validity domain (content peer review section 10). */
export const E1RM_MAX_REPS = 10; // [repetitions]

export interface ProgressionAdvice {
  kind: 'hold' | 'add-load' | 'extend-reps' | 'deload';
  loadKg: Kg | null; // [kg] canonical; null when no load can be suggested
  reason: string; // user-facing advice line, <= MAX_REASON_WORDS words, no arithmetic
  why: string; // the arithmetic behind `reason`, for the "why?" disclosure only
  prescription: Prescription; // as programmed for the session just performed
  nextPrescription: Prescription; // what the next session should use
}

/** A set with both a load and a rep count recorded. */
export interface CompletedSet extends LoggedSet {
  loadKg: Kg;
  reps: number;
}

export function isCompletedSet(s: LoggedSet): s is CompletedSet {
  return s.loadKg !== null && s.reps !== null;
}

/**
 * A set that carries a load and evidence that work was done. The evidence is a
 * repetition count for a rep or AMRAP prescription and a duration for a `time` or
 * `duration` one, so a plank or a carry is performed work even with `reps === null`.
 * `loadKg === 0` is a real bodyweight load and never "absent" (code review A60), so
 * only `null` disqualifies a set here.
 *
 * This is deliberately weaker than `isCompletedSet`, which stays as it is: coach.ts
 * compares repetitions at a load for its personal-best rule and cannot use a set
 * with no repetition count.
 */
type PerformedSet = LoggedSet & { loadKg: Kg };

function isPerformedSet(s: LoggedSet): s is PerformedSet {
  return s.loadKg !== null && (s.reps !== null || s.durationS !== null);
}

/**
 * Programme order, never wall-clock order. Code review A23: the legacy sorted
 * by `loggedAt`, so a set logged while scrubbing a future week outranked the
 * real history. `loggedAt` stays in storage for audit and orders nothing.
 */
export function compareSetOrder(a: LoggedSet, b: LoggedSet): number {
  const byDate = compareLocalDate(a.assignmentDate, b.assignmentDate);
  if (byDate !== 0) return byDate;
  return a.setNumber - b.setNumber;
}

export function sortSetHistory(sets: readonly LoggedSet[]): LoggedSet[] {
  return [...sets].sort(compareSetOrder);
}

/** Used when a session index falls outside every declared block. */
export const IDENTITY_BLOCK: PlanBlock = {
  index: -1,
  firstSessionIndex: 0,
  sessionCount: 0,
  setModifier: 1, // dimensionless
  loadModifier: 1, // dimensionless
  isDeload: false,
};

export function blockFor(plan: PlanTemplate, sessionIndex: number): PlanBlock {
  for (const b of plan.blocks) {
    if (
      sessionIndex >= b.firstSessionIndex &&
      sessionIndex < b.firstSessionIndex + b.sessionCount
    ) {
      return b;
    }
  }
  return IDENTITY_BLOCK;
}

/**
 * Epley estimate of a one-repetition maximum.
 * Epley B (1985), Poundage chart, in Boyd Epley Workout, Body Enterprises p.86.
 * The content peer review section 5 (card c003) records that this source is
 * self-published, not peer reviewed, with N unknown, and that Reynolds JM et al.
 * (2006), J Strength Cond Res 20(3):584-592, report a standard error of estimate
 * of 1.85 kg (chest press) to 14.05 kg (leg press) at 5RM. Treat the output as
 * an index for comparing sets, not as a measured 1RM.
 * Validity domain: 1 <= reps <= E1RM_MAX_REPS. This function does not guard;
 * e1RMOrNull does.
 */
export function e1RM(loadKg: Kg, reps: number): Kg {
  return loadKg * (1 + reps / 30); // [kg]
}

/** e1RM inside its validity domain, null outside it. The UI shows nothing on null. */
export function e1RMOrNull(loadKg: Kg, reps: number): Kg | null {
  if (!Number.isFinite(reps) || reps < 1 || reps > E1RM_MAX_REPS) return null;
  return e1RM(loadKg, reps); // [kg]
}

/** The identity on every prescription that has no upper bound to raise. */
function extendReps(p: Prescription): Prescription {
  return p.kind === 'reps' ? { kind: 'reps', lo: p.lo, hi: p.hi + REP_RANGE_EXTENSION } : p;
}

/** "6–8 repetitions" for a bounded range; a plain statement otherwise. */
function rangeText(p: Prescription): string {
  return p.kind === 'reps' ? `${p.lo}–${p.hi} repetitions` : 'no bounded rep range';
}

/**
 * The single copy frame for the set tally, used by BOTH count-bearing branches so a
 * hold and an add-load can never describe the same session differently. It reports
 * the met count and the required count as two separate numbers and never asserts
 * that "all" sets were met: the met count may legitimately exceed the required count
 * when the lifter performed the optional sets between setsLo and setsHi, and it is
 * below it in every hold. Both nouns are inflected, which is what retires the
 * "All 1 prescribed sets" copy.
 */
function metCountText(
  metCount: number, // [sets] at the working load with reps >= prescription.hi
  prescribedSets: number, // [sets] required = max(1, planned.setsLo)
  hiReps: number, // [repetitions] top of the prescribed range
  loadText: string, // working load, already formatted in the display unit
  date: string, // assignment date of the last session
): string {
  const met = metCount === 1 ? 'set' : 'sets';
  const required = prescribedSets === 1 ? 'set' : 'sets';
  return (
    `${metCount} ${met} reached ${hiReps} repetitions at ${loadText} on ${date}; ` +
    `${prescribedSets} prescribed ${required} required`
  );
}

export function suggestedProgression(
  history: readonly LoggedSet[],
  planned: PlannedExercise,
  ex: Exercise,
  profile: Profile,
  block: PlanBlock,
): ProgressionAdvice {
  const prescription = planned.prescription;
  const units = profile.units;
  const base = { prescription, nextPrescription: prescription };

  // Performed, non-bonus sets for this exercise only. Bonus sets are extra work by
  // definition and never decide whether the prescription was met, and never set the
  // working load. `isPerformedSet` rather than `isCompletedSet`, so a timed set
  // (durationS recorded, reps === null) is still visible to the rules below.
  const ordered = sortSetHistory(
    history.filter((s) => s.exerciseId === ex.id && !s.isBonus),
  ).filter(isPerformedSet);
  const last = ordered.at(-1);

  // 1. A deload block is a programme-level instruction and outranks everything
  //    else: it cuts volume (master plan section 5) and holds the load. Telling a
  //    lifter to add repetitions here would invert the block's purpose. This is
  //    the ordering decision recorded in the P4 plan's Task 1 preamble.
  if (block.isDeload) {
    return {
      ...base,
      kind: 'deload',
      loadKg: last ? last.loadKg : null, // [kg] 0 is a valid bodyweight load, not "absent"
      reason: 'Deload block: set count reduced, load held.',
      why: `Deload block ${block.index}: set modifier ${block.setModifier}, load modifier ${block.loadModifier}. A deload cuts volume and keeps the load (content review section 2.2, Bosquet 2007), so the prescription stays at ${rangeText(prescription)}.`,
    };
  }

  // 2. Bodyweight exercises carry no external load to increment.
  if (ex.isBodyweight) {
    const next = extendReps(prescription);
    return {
      ...base,
      kind: 'extend-reps',
      loadKg: null, // [kg] no external load exists to suggest
      nextPrescription: next,
      reason: 'Bodyweight lift: add repetitions, not load.',
      why:
        prescription.kind === 'reps'
          ? `No external load to increment, so the range rises by ${REP_RANGE_EXTENSION}: ${rangeText(prescription)} to ${rangeText(next)}.`
          : 'No external load to increment, and this prescription has no upper bound to raise, so it is unchanged.',
    };
  }

  // 3. Only a bounded rep prescription can trigger a load increment: `amrap`,
  //    `time`, `duration` and `none` set no top of a range to reach.
  //    Timed-prescription rule: a `time` or `duration` set is logged with `durationS`
  //    and `reps === null`. It is performed work, so it reaches `last` here and the
  //    hold carries the load actually used, instead of reporting no load at all.
  if (prescription.kind !== 'reps') {
    const heldText = last ? ` at ${formatLoad(last.loadKg, units)}` : '';
    const timedNote =
      prescription.kind === 'time' || prescription.kind === 'duration'
        ? ' A timed set records a duration and no repetition count; it still counts as performed, so the load above is the one last used.'
        : '';
    return {
      ...base,
      kind: 'hold',
      loadKg: last ? last.loadKg : null, // [kg] 0 is a valid bodyweight load, not "absent"
      reason: 'No fixed rep range: hold the load.',
      why: `Double progression raises the load only once every prescribed set reaches the top of the range. The "${prescription.kind}" prescription sets no top, so the load is unchanged${heldText}.${timedNote}`,
    };
  }

  if (!last) {
    return {
      ...base,
      kind: 'hold',
      loadKg: null, // [kg] nothing logged, so nothing to suggest from
      reason: `No sets recorded. Choose a load for ${rangeText(prescription)}.`,
      why: `The rule reads the last completed session for ${ex.name}. Nothing is logged for it yet, so no starting load can be derived from history.`,
    };
  }

  // Working-load rule. L is the HEAVIEST non-bonus load of the last session, and a
  // set counts as being "at the working load" only when its load is within
  // LOAD_EQ_TOL_KG of L. Warm-up and back-off sets sit below L by construction, so
  // they neither move L nor count towards it. A set logged ABOVE the rest of the
  // session becomes L instead, which leaves the lighter sets outside the tolerance
  // and holds the load: the engine never advances from a load that was not repeated.
  const lastSession = ordered.filter((s) => s.assignmentDate === last.assignmentDate);
  const workingLoadKg = lastSession.reduce((m, s) => Math.max(m, s.loadKg), 0); // [kg]

  // Prescribed-set rule (master plan section 6.5: "hold load until every prescribed
  // set of the LAST session reached prescription.hi"). The required count is
  // planned.setsLo, floored at 1. setsLo is what the session prescribes; setsHi is
  // the top of an OPTIONAL volume range, so it does not enter this rule at all:
  // gating on setsHi would stall a lifter who performs exactly the prescription.
  //
  // The test is `metCount >= prescribedSets`, never `metCount === lastSession.length`.
  // The length form counted LOGGED sets, so a single extra non-bonus back-off set
  // (3 x 60 kg x 8 plus 50 kg x 12, setsLo 3) revoked a progression the three
  // prescribed sets had already earned. A set with no repetition count recorded
  // (timed work logged against a rep prescription) can never have reached the top,
  // so it is performed but not met.
  const prescribedSets = Math.max(1, planned.setsLo); // [sets]
  const metCount = lastSession.filter(
    (s) =>
      s.reps !== null &&
      s.reps >= prescription.hi &&
      Math.abs(s.loadKg - workingLoadKg) <= LOAD_EQ_TOL_KG,
  ).length; // [sets]
  const metTop = metCount >= prescribedSets;
  const countText = metCountText(
    metCount,
    prescribedSets,
    prescription.hi,
    formatLoad(workingLoadKg, units),
    last.assignmentDate,
  );

  if (!metTop) {
    return {
      ...base,
      kind: 'hold',
      loadKg: workingLoadKg, // [kg]
      reason: `Hold ${formatLoad(workingLoadKg, units)} until every set reaches ${prescription.hi} repetitions.`,
      why: `${countText}. The load rises only when every prescribed set reaches the top of the range at the working load.`,
    };
  }

  const stepKg = stepFor(ex, profile.equipmentSteps); // [kg] smallest achievable increment
  const nextRange = extendReps(prescription);
  if (!(stepKg > 0)) {
    return {
      ...base,
      kind: 'extend-reps',
      loadKg: workingLoadKg, // [kg] unchanged
      nextPrescription: nextRange,
      reason: 'No load increment available: add repetitions.',
      why: `The profile records no usable increment for ${ex.modality} work, so the range rises by ${REP_RANGE_EXTENSION} instead: ${rangeText(prescription)} to ${rangeText(nextRange)}.`,
    };
  }

  // Guard. A zero working load makes the ratio Infinity, which correctly routes
  // to extend-reps rather than dividing by zero downstream.
  if (stepKg / workingLoadKg > STEP_GUARD_FRACTION) {
    const shareText =
      workingLoadKg > 0
        ? `${((100 * stepKg) / workingLoadKg).toFixed(1)} % of ${formatLoad(workingLoadKg, units)}`
        : 'unbounded against a zero working load';
    return {
      ...base,
      kind: 'extend-reps',
      loadKg: workingLoadKg, // [kg] unchanged
      nextPrescription: nextRange,
      reason: 'Increment too large: add repetitions instead.',
      why: `The smallest step available (${formatLoad(stepKg, units)}) is ${shareText}, above the ${(STEP_GUARD_FRACTION * 100).toFixed(0)} % guard and outside the 2-10 % band (ACSM 2009). The range rises to ${rangeText(nextRange)} instead.`,
    };
  }

  const fraction = INCREMENT_FRACTION[ex.loadClass]; // dimensionless
  const deltaTargetKg = fraction * workingLoadKg; // [kg]
  // Round DOWN to the equipment grid, then floor at one step: a target below one
  // step would otherwise quantise to zero and stall the progression forever.
  const deltaKg = Math.max(achievableLoad(deltaTargetKg, stepKg), stepKg); // [kg]
  const nextKg = workingLoadKg + deltaKg; // [kg]
  return {
    ...base,
    kind: 'add-load',
    loadKg: nextKg, // [kg]
    reason: `Add ${formatLoad(deltaKg, units)} and reset to ${prescription.lo} repetitions.`,
    why: `${countText}. ${(fraction * 100).toFixed(1)} % of the working load is ${formatLoad(deltaTargetKg, units)}, which rounds down to the ${formatLoad(stepKg, units)} equipment step and is floored at one step: ${formatLoad(deltaKg, units)}, giving ${formatLoad(nextKg, units)}. The 2-10 % band is ACSM 2009; the ${(fraction * 100).toFixed(1)} % choice inside it is a heuristic, not a finding.`,
  };
}
