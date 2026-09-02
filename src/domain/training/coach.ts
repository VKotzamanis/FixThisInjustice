// One short line about the set that was just logged, ranked by what is most
// worth saying. Ported from console-store.jsx:10-39 with the unit and labelling
// defects of code review A5 and A25 fixed, and the motivational filler removed
// per the global tone constraint.
//
// Deviations from the P4 plan's Task 2 Step 4 literal (recorded here; the plan is not edited):
//  - Repo style only: single quotes and [unit] comments, matching progression.ts. No behaviour,
//    threshold or string differs from the plan's literal.
//  - The rung-3 comment records why a bodyweight set is compared by repetitions alone.
//
// The strings are assembled here rather than in a view, which is the pattern Task 1's
// `ProgressionAdvice.reason` already set: src/content/copy.ts carries the `coach.*` keys as
// formatted EXAMPLES documenting the shape, exactly as it carries `advice.*` for progression.
// Note that `coach.aboveRange` there reads "2 reps above range. Add load next session.", which
// is the copy contract's older wording; this module ships the plan's "2 reps above the
// prescribed range." and no view reads the key yet.
import type { LoggedSet, UnitSystem } from '../types';
import { displayLoad, formatLoad, toStoredLoad, UNIT_LABEL } from '../units';
import {
  isCompletedSet,
  LOAD_EQ_TOL_KG,
  type CompletedSet,
  type ProgressionAdvice,
} from './progression';

export interface CoachLine {
  text: string;
  /** "telemetry" = a measured record or a plain readout; "coach" = an instruction. */
  tone: 'coach' | 'telemetry';
}

/**
 * Deadbands for the "over / under the suggested load" rungs, declared in the
 * user's DISPLAY unit and converted exactly. Code review A5: the legacy values
 * (0.5 and 2.5) were unlabelled numbers compared against possibly-lb input.
 * The imperial values hold the same fraction of the smallest common barbell
 * step in each system (content peer review section 10 plate table: 2.5 kg
 * metric, 5 lb imperial): 0.5/2.5 = 0.2 -> 1 lb, and 2.5/2.5 = 1.0 -> 5 lb.
 */
export const OVER_BAND: Record<UnitSystem, number> = { metric: 0.5, imperial: 1 }; // [kg] or [lb], display unit
export const UNDER_BAND: Record<UnitSystem, number> = { metric: 2.5, imperial: 5 }; // [kg] or [lb], display unit

/** Lifetime best: heaviest load, and among equal loads the most repetitions. */
function lifetimeBest(history: readonly LoggedSet[]): CompletedSet | null {
  let best: CompletedSet | null = null;
  for (const s of history) {
    // A set with no load recorded is not a record of anything and never wins.
    if (!isCompletedSet(s)) continue;
    if (best === null) {
      best = s;
      continue;
    }
    const heavier = s.loadKg > best.loadKg + LOAD_EQ_TOL_KG;
    const sameLoadMoreReps =
      Math.abs(s.loadKg - best.loadKg) <= LOAD_EQ_TOL_KG && s.reps > best.reps;
    if (heavier || sameLoadMoreReps) best = s;
  }
  return best;
}

/** A load difference, in the display unit, without the "BW" special case. */
function formatDelta(deltaKg: number, units: UnitSystem): string {
  // [kg] in
  return `${displayLoad(deltaKg, units)} ${UNIT_LABEL[units].load}`;
}

export function coachLine(
  set: LoggedSet,
  history: readonly LoggedSet[],
  advice: ProgressionAdvice,
  units: UnitSystem,
): CoachLine {
  if (!isCompletedSet(set)) {
    if (set.durationS !== null) return { text: `${set.durationS} s logged.`, tone: 'telemetry' };
    return { text: 'Set logged.', tone: 'telemetry' };
  }

  const best = lifetimeBest(history);

  // 1. Load PR against the lifetime best. This is a heaviest-load record and is
  //    labelled as one; it is not an estimated-1RM record (code review A25).
  //    A bodyweight set carries loadKg 0, and 0 > 0 + LOAD_EQ_TOL_KG is false, so
  //    this rung can never fire for one.
  if (best !== null && set.loadKg > best.loadKg + LOAD_EQ_TOL_KG) {
    return {
      text: `Load PR. Previous best ${formatLoad(best.loadKg, units)} × ${best.reps}.`,
      tone: 'telemetry',
    };
  }

  // 2. Rep PR at the same load. Compared within LOAD_EQ_TOL_KG, never by float
  //    equality (code review A24).
  if (
    best !== null &&
    Math.abs(set.loadKg - best.loadKg) <= LOAD_EQ_TOL_KG &&
    set.reps > best.reps
  ) {
    return {
      text: `Rep PR at ${formatLoad(set.loadKg, units)}. Previous best ${best.reps} reps.`,
      tone: 'telemetry',
    };
  }

  // 3. Against the suggested load. `advice.loadKg` is null whenever the engine
  //    could not name a load, which includes every bodyweight lift
  //    (progression.ts returns null for ex.isBodyweight), so a bodyweight set
  //    falls straight through to the repetition rungs and is judged on reps alone.
  const suggestedKg = advice.loadKg; // [kg] canonical
  if (suggestedKg !== null) {
    const overBandKg = toStoredLoad(OVER_BAND[units], units); // [kg]
    const underBandKg = toStoredLoad(UNDER_BAND[units], units); // [kg]
    if (set.loadKg > suggestedKg + overBandKg) {
      return {
        text: `${formatDelta(set.loadKg - suggestedKg, units)} over the suggested load.`,
        tone: 'coach',
      };
    }
    if (set.loadKg < suggestedKg - underBandKg) {
      return {
        text: `${formatDelta(suggestedKg - set.loadKg, units)} under the suggested load.`,
        tone: 'coach',
      };
    }
  }

  // 4-6. Against the prescribed rep range. Only a bounded rep prescription has a
  //      range to be above, below or at the top of; AMRAP and timed work do not.
  const p = advice.prescription;
  if (p.kind === 'reps') {
    if (set.reps > p.hi) {
      const over = set.reps - p.hi; // [repetitions]
      return {
        text: `${over} rep${over === 1 ? '' : 's'} above the prescribed range.`,
        tone: 'coach',
      };
    }
    if (set.reps < p.lo) {
      return { text: `${set.reps} reps, below the prescribed ${p.lo}-${p.hi}.`, tone: 'coach' };
    }
    if (set.reps === p.hi) {
      return { text: `Top of range at ${formatLoad(set.loadKg, units)} × ${set.reps}.`, tone: 'coach' };
    }
    return {
      text: `${formatLoad(set.loadKg, units)} × ${set.reps}, inside the prescribed ${p.lo}-${p.hi}.`,
      tone: 'coach',
    };
  }

  return { text: `${formatLoad(set.loadKg, units)} × ${set.reps} logged.`, tone: 'telemetry' };
}
