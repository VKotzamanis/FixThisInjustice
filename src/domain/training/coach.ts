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
// P4 REVIEW ITEM 2. This module used to assemble English sentences here and return them as
// `text`, while src/content/copy.ts carried the ten `coach.*` keys as formatted EXAMPLES that
// nothing resolved. Two copies of every sentence, one of them dead, and no skin could override
// what the user actually read. It now returns a copy KEY and the values that go in its slots;
// the words live in the copy table and are rendered at the UI boundary by FORMAT.withSlots
// (src/ui/views/TrainView.tsx). What stays here is the decision of WHICH sentence to say and
// the quantities it says it with - the ladder, the deadbands and the unit formatting - which
// is domain work; choosing the words is not.
//
// A param may carry a number, or a load already formatted by src/domain/units.ts ("60 kg",
// "135 lb", "BW"). Numbers and units are part of the copy contract and not of the skin, so
// formatting them here is sanctioned; a param may never carry a WORD the skin should own, and
// coach.test.ts asserts that.
//
// Code review (before the refactor): `coach.aboveRange` read "2 reps above range. Add load
// next session.", which both diverged from the string this module shipped and issued a load
// decision. The load decision is not the coach line's to make - `ProgressionAdvice` owns
// add-load, hold and deload, and states its own reason - so the key carries this module's
// wording and no coach string tells the user what to do next session. coach.test.ts asserts
// that over both the generated lines and the copy table.
import type { CopyKey } from '../../content/copy';
import type { LoggedSet, UnitSystem } from '../types';
import { displayLoad, formatLoad, toStoredLoad, UNIT_LABEL } from '../units';
import {
  isCompletedSet,
  LOAD_EQ_TOL_KG,
  type CompletedSet,
  type ProgressionAdvice,
} from './progression';

export interface CoachLine {
  /** The `coach.*` key in src/content/copy.ts whose template carries this sentence. */
  key: CopyKey;
  /**
   * The values for that template's `{slot}`s. A number, or a quantity already rendered in the
   * user's display unit by src/domain/units.ts. Never a word.
   */
  params: Record<string, string | number>;
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
    if (set.durationS !== null) {
      // [s] the logged duration; the unit is in the template, not here.
      return { key: 'coach.durationLogged', params: { seconds: set.durationS }, tone: 'telemetry' };
    }
    return { key: 'coach.setLogged', params: {}, tone: 'telemetry' };
  }

  const best = lifetimeBest(history);

  // 1. Load PR against the lifetime best. This is a heaviest-load record and is
  //    labelled as one; it is not an estimated-1RM record (code review A25).
  //    A bodyweight set carries loadKg 0, and 0 > 0 + LOAD_EQ_TOL_KG is false, so
  //    this rung can never fire for one.
  if (best !== null && set.loadKg > best.loadKg + LOAD_EQ_TOL_KG) {
    return {
      key: 'coach.loadPr',
      params: { load: formatLoad(best.loadKg, units), reps: best.reps },
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
      key: 'coach.repPr',
      params: { load: formatLoad(set.loadKg, units), reps: best.reps },
      tone: 'telemetry',
    };
  }

  // 3. Against the suggested load. `advice.loadKg` is null whenever the engine
  //    could not name a load, which includes every bodyweight lift
  //    (progression.ts returns null for ex.isBodyweight), so a bodyweight set
  //    falls straight through to the repetition rungs and is judged on reps alone.
  //
  //    Code review: that argument covers a lift the PLAN marks bodyweight, not a
  //    loaded lift performed at zero external load - an unweighted dip or chin-up
  //    logged against an exercise the engine does name a load for. There the
  //    deadband fired and reported the entire suggestion as a shortfall ("60 kg
  //    under the suggested load.", "135 lb under the suggested load."), which is a
  //    statement about the suggestion, not about the set. A set carrying no
  //    external load has no load to compare, so this rung - and with it every
  //    load-delta string - is skipped, and the set is judged on repetitions alone
  //    with formatLoad's bodyweight wording ("BW"). The test is exact equality and
  //    not LOAD_EQ_TOL_KG: zero is exact in both unit systems, since
  //    toStoredLoad(0, 'imperial') === 0, and a genuinely light load is a real
  //    measurement that this rung must still judge.
  const suggestedKg = advice.loadKg; // [kg] canonical
  const carriesNoExternalLoad = set.loadKg === 0; // [kg] exactly 0 = bodyweight
  if (suggestedKg !== null && !carriesNoExternalLoad) {
    const overBandKg = toStoredLoad(OVER_BAND[units], units); // [kg]
    const underBandKg = toStoredLoad(UNDER_BAND[units], units); // [kg]
    if (set.loadKg > suggestedKg + overBandKg) {
      return {
        key: 'coach.overSuggested',
        params: { delta: formatDelta(set.loadKg - suggestedKg, units) },
        tone: 'coach',
      };
    }
    if (set.loadKg < suggestedKg - underBandKg) {
      return {
        key: 'coach.underSuggested',
        params: { delta: formatDelta(suggestedKg - set.loadKg, units) },
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
      // The singular is its own key, not a plural marker passed out of the domain: which words
      // a count takes is a fact about the language, and the language lives in the copy table.
      return {
        key: over === 1 ? 'coach.aboveRangeOne' : 'coach.aboveRange',
        params: { count: over },
        tone: 'coach',
      };
    }
    if (set.reps < p.lo) {
      return {
        key: 'coach.belowRange',
        params: { reps: set.reps, lo: p.lo, hi: p.hi },
        tone: 'coach',
      };
    }
    if (set.reps === p.hi) {
      return {
        key: 'coach.topOfRange',
        params: { load: formatLoad(set.loadKg, units), reps: set.reps },
        tone: 'coach',
      };
    }
    return {
      key: 'coach.insideRange',
      params: { load: formatLoad(set.loadKg, units), reps: set.reps, lo: p.lo, hi: p.hi },
      tone: 'coach',
    };
  }

  return {
    key: 'coach.setReadout',
    params: { load: formatLoad(set.loadKg, units), reps: set.reps },
    tone: 'telemetry',
  };
}
