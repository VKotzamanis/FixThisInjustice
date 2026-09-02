// src/domain/training/records.ts
//
// Personal records over the logged-set history. Pure and library-free: it never looks an
// exercise up, so it works identically for the shipped library and for a user-added exercise.
//
// Three records per exercise, because they answer three different questions and are routinely
// set in three different sessions:
//   bestSet   the heaviest set actually performed,          load [kg] and repetitions
//   bestE1RM  the highest Epley one-repetition-max ESTIMATE, load [kg]
//   bestAmrap the most repetitions in one UNLOADED set,      repetitions
//
// The estimate is an estimate. Epley B (1985) gives 1RM = load * (1 + reps / 30); the equation
// and its provenance live in progression.ts, which is the one place it is written down, and
// Reynolds et al. (2006) report a standard error of estimate of 1.85 kg to 14.05 kg at 5RM.
// It is an index for ordering sets, never a measured maximum, and the Log view labels it as an
// estimate wherever it is shown.
//
// Every load is canonical kilograms. Nothing here converts to a display unit; the view does
// that through src/domain/units.ts.

import { compareLocalDate, weekStart } from '../dates';
import type { Kg, LocalDate, LoggedSet } from '../types';
import { e1RMOrNull } from './progression';

export interface BestSet {
  loadKg: Kg; // [kg]; 0 is a valid bodyweight load
  reps: number; // [repetitions]
  date: LocalDate;
}

export interface BestE1RM {
  loadKg: Kg; // [kg] the load that produced the estimate
  reps: number; // [repetitions]
  e1RMKg: Kg; // [kg] Epley estimate, not a measured maximum
  date: LocalDate;
}

export interface BestAmrap {
  reps: number; // [repetitions]
  date: LocalDate;
}

export interface ExerciseRecords {
  exerciseId: string;
  /** Heaviest set: max load, then max reps, then the EARLIEST date it was first achieved. */
  bestSet: BestSet | null;
  /** Highest Epley estimate over sets with a load above zero and inside the equation's domain. */
  bestE1RM: BestE1RM | null;
  /** Most reps in one unloaded set (loadKg 0, or a load that was not recorded). */
  bestAmrap: BestAmrap | null;
  /** Every set logged for this exercise, including ones with no rep count. [sets] */
  totalSets: number;
}

/**
 * True when `a` should replace `b` as the heaviest set.
 *
 * Load first, then repetitions, then the earlier date. The date rule is deliberate: two
 * identical performances are one record, and the record belongs to the session that first
 * reached it, not to the most recent repeat of it.
 *
 * The comparison goes through compareLocalDate rather than a raw `<`. The two agree only
 * because every LocalDate is a zero-padded ISO string, which is an invariant of dates.ts and
 * not of this function; routing it through the one module that owns date order means a change
 * to the representation has one place to be fixed.
 */
function beatsSet(a: BestSet, b: BestSet): boolean {
  if (a.loadKg !== b.loadKg) return a.loadKg > b.loadKg; // [kg]
  if (a.reps !== b.reps) return a.reps > b.reps; // [repetitions]
  return compareLocalDate(a.date, b.date) < 0;
}

/** True when estimate `a` should replace `b`. Same tie-break as beatsSet: the earlier date. */
function beatsE1RM(a: BestE1RM, b: BestE1RM): boolean {
  if (a.e1RMKg !== b.e1RMKg) return a.e1RMKg > b.e1RMKg; // [kg]
  return compareLocalDate(a.date, b.date) < 0;
}

/** True when AMRAP `a` should replace `b`. Same tie-break: the earlier date. */
function beatsAmrap(a: BestAmrap, b: BestAmrap): boolean {
  if (a.reps !== b.reps) return a.reps > b.reps; // [repetitions]
  return compareLocalDate(a.date, b.date) < 0;
}

/**
 * Records for every exercise the log mentions, keyed by exercise id.
 *
 * One pass over the sets: the legacy view recomputed a reduction per exercise inside the
 * render (code review A48), which is quadratic in the number of exercises for no gain.
 *
 * Ordering is by ASSIGNMENT DATE, never by `loggedAt`. A set entered late still belongs to the
 * training day it was performed on, and the wall clock would put a backfilled session after
 * sessions that came later in the programme (code review A23).
 */
export function computeRecords(sets: readonly LoggedSet[]): Map<string, ExerciseRecords> {
  const out = new Map<string, ExerciseRecords>();

  for (const s of sets) {
    let rec = out.get(s.exerciseId);
    if (rec === undefined) {
      rec = {
        exerciseId: s.exerciseId,
        bestSet: null,
        bestE1RM: null,
        bestAmrap: null,
        totalSets: 0,
      };
      out.set(s.exerciseId, rec);
    }
    rec.totalSets += 1;

    // A set with no rep count is a record in no ordering: it is counted above and dropped here.
    // A timed hold logs durationS and reps null, and holding a plank is not a repetition max.
    if (s.reps === null) continue;

    const loadKg = s.loadKg; // [kg]; null = not recorded, 0 = bodyweight

    if (loadKg !== null) {
      const candidate: BestSet = { loadKg, reps: s.reps, date: s.assignmentDate };
      if (rec.bestSet === null || beatsSet(candidate, rec.bestSet)) rec.bestSet = candidate;

      // Bodyweight sets carry loadKg 0, and Epley on a zero load estimates zero: a real number
      // that means nothing. The estimate exists only for external load.
      if (loadKg > 0) {
        // e1RMOrNull returns null outside 1 <= reps <= E1RM_MAX_REPS (10), which is the
        // validity guard master plan section 6.5 sets on the Epley equation.
        const estimateKg = e1RMOrNull(loadKg, s.reps); // [kg]
        if (estimateKg !== null) {
          const e: BestE1RM = {
            loadKg,
            reps: s.reps,
            e1RMKg: estimateKg,
            date: s.assignmentDate,
          };
          if (rec.bestE1RM === null || beatsE1RM(e, rec.bestE1RM)) rec.bestE1RM = e;
        }
      }
    }

    // Unloaded work: an explicit bodyweight set, or one whose load was never recorded. Both
    // are rep records and neither is a load record.
    if (loadKg === null || loadKg === 0) {
      const a: BestAmrap = { reps: s.reps, date: s.assignmentDate };
      if (rec.bestAmrap === null || beatsAmrap(a, rec.bestAmrap)) rec.bestAmrap = a;
    }
  }

  return out;
}

/** One point of the weekly AMRAP series: the best rep count in the ISO week beginning `weekStart`. */
export interface AmrapWeek {
  /** Monday of the ISO week, in the profile's timezone. */
  weekStart: LocalDate;
  reps: number; // [repetitions]
}

/**
 * Best rep count per ISO week for one exercise, ascending by week.
 *
 * Weeks with no logged set are absent rather than zero: a week not trained is missing data,
 * and plotting it as zero repetitions would draw a collapse that never happened.
 */
export function weeklyAmrapMax(sets: readonly LoggedSet[], exerciseId: string): AmrapWeek[] {
  const best = new Map<LocalDate, number>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.reps === null) continue;
    const wk = weekStart(s.assignmentDate);
    best.set(wk, Math.max(best.get(wk) ?? 0, s.reps)); // [repetitions]
  }
  return [...best.entries()]
    .map(([week, reps]) => ({ weekStart: week, reps }))
    .sort((a, b) => compareLocalDate(a.weekStart, b.weekStart));
}
