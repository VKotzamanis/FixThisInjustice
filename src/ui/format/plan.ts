// src/ui/format/plan.ts
//
// Presentation-only formatting for plan content. Clinical register: no hype, no emoji, the
// defined quantity every time (master plan section 3, copy contract R11).
//
// Why these live here and not in src/content/copy.ts. copy.ts holds SENTENCES, which a skin
// may reword. These are renderings of a QUANTITY and its unit: "120 s" is the same duration in
// every skin, and master plan section 3 puts numbers, units and quantity names outside the
// skin ("a skin may rewrite the sentence around 60 kg, never 60 kg itself"). The same split is
// already shipped in src/domain/units.ts, which formats masses and volumes for every view.
//
// Durations are seconds in the model and are printed as whole minutes ONLY when they divide
// exactly, so no value is rounded to look tidy: 150 s stays 150 s rather than becoming 3 min.

import { isoWeekday } from '../../domain/dates';
import { EXERCISE_BY_ID } from '../../domain/plan/library';
import type { IsoWeekday, LocalDate, Prescription, Seconds } from '../../domain/types';

/** [s] At and above this, a duration that divides into whole minutes is printed in minutes. */
const MINUTE_THRESHOLD_S = 120;

/**
 * The empty value slot: this cell has no value, as against a value of zero.
 *
 * Copy contract R5 retains a bare em dash in exactly this position ("a placeholder, not a
 * connector"). One definition, so a view and a formatter cannot print two different marks for
 * the same absence.
 */
export const NO_VALUE = '—';

/** [s] -> "45 s" or "2 min". */
export function formatSeconds(s: Seconds): string {
  if (s >= MINUTE_THRESHOLD_S && s % 60 === 0) return `${s / 60} min`;
  return `${s} s`;
}

/**
 * The prescription as the user must execute it.
 *
 * The en dash in a rep range is the one the copy contract retains (R5: an en dash in a numeric
 * range is not a connector), and the bare em dash for `none` is R5's value-slot placeholder,
 * not a connector either.
 */
export function formatPrescription(p: Prescription): string {
  switch (p.kind) {
    case 'reps':
      return p.lo === p.hi ? `${p.lo} reps` : `${p.lo}–${p.hi} reps`;
    case 'amrap':
      return p.minimum === null ? 'AMRAP' : `AMRAP, min ${p.minimum} reps`;
    case 'time':
      return `hold ${formatSeconds(p.targetS)}`;
    case 'duration':
      return formatSeconds(p.targetS);
    case 'none':
      return NO_VALUE;
  }
}

/** [sets] -> "3" or "3–4". */
export function formatSets(setsLo: number, setsHi: number): string {
  return setsLo === setsHi ? `${setsLo}` : `${setsLo}–${setsHi}`;
}

/** [s] -> "rest 2 min". */
export function formatRest(restS: Seconds): string {
  return `rest ${formatSeconds(restS)}`;
}

/** ISO weekday numbers are Monday-first (1 = Monday), as everywhere else in this codebase. */
export const WEEKDAY_ABBR: Record<IsoWeekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

/**
 * The weekday of a LocalDate, through the domain's own ISO weekday function.
 *
 * Never `new Date(date).getDay()`: that parses the string as UTC midnight and then reports the
 * weekday in the HOST zone, which is a day out for part of the world (finding A8).
 */
export function formatWeekday(date: LocalDate): string {
  return WEEKDAY_ABBR[isoWeekday(date)];
}

/** The "DD" of a LocalDate. String slicing, never a Date object, for the same reason. */
export function formatDayOfMonth(date: LocalDate): string {
  return date.slice(8, 10);
}

/**
 * The library name for an exercise id, falling back to the id itself.
 *
 * A plan generated against an earlier library can name an exercise this build no longer holds.
 * Rendering the id is ugly and honest; throwing would take the whole session view down over a
 * label.
 */
export function exerciseName(exerciseId: string): string {
  return EXERCISE_BY_ID[exerciseId]?.name ?? exerciseId;
}
