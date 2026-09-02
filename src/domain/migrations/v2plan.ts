/*
 * Frozen decoding table for the legacy console store (localStorage key "fti.console.v2").
 *
 * Every value here is copied verbatim from the legacy `legacy/data.js` (`window.PLAN`) as it
 * stood at the cutover commit. It exists ONLY to decode keys that are already on the user's
 * phone. It is not a training plan, it is never used to prescribe anything, and it must never
 * be edited to "improve" the programme: editing it silently rewrites the user's history.
 *
 * Legacy key scheme (console-store.jsx:152, console-train.jsx:391):
 *   sets[`${week}-${day}-${exIdx}-${setNumber}`]
 *     week      1..24     [dimensionless] programme week ordinal
 *     day       1..7      [dimensionless] position in a fixed 7-day rotation, NOT a calendar
 *                         weekday
 *     exIdx     0..n-1    index into PLAN.days[day-1].exercises
 *               1000 + i  the i-th user-added exercise of that (week, day)
 *     setNumber 1-based   [dimensionless] set ordinal within the exercise
 *
 * Legacy calendar semantics (console-store.jsx:68-77, `programPosition`):
 *   `programPosition` maps a date to `day_idx = daysBetween(startDate, today)` [d], then
 *   `week = floor(day_idx / 7) + 1` and `doW = (day_idx % 7) + 1`. Inverting it gives the rule
 *   `legacyDateOf` implements: day 1 of week 1 IS `startDate`, and the offset from it is
 *   (week - 1) * 7 + (day - 1) days [d]. The full programme therefore spans
 *   23 * 7 + 6 = 167 days [d] from first to last session, i.e. 168 calendar days inclusive.
 *
 * Two slots, and only two, change which exercise they mean part-way through the programme.
 * Both are recorded in data.js as a note on a single slot rather than as a second exercise
 * list, so the LIST ITSELF never differs between phases: the length, the order and every other
 * slot are constant across all 24 weeks (verified by reading every consumer of
 * `PLAN.days[...].exercises` in the legacy tree; each indexes the one array and none
 * substitutes a phase-specific list).
 *   day 3 slot 2 "Leg press -> Bulgarian split"  note "Bulgarian from wk 5"
 *                (data.js:156; corroborated by the week-5 volume note, data.js:84)
 *   day 5 slot 0 "Trap bar DL -> conventional"   note "Conventional from wk 9. Always first."
 *                (data.js:179; corroborated by the week-9 volume note, data.js:88, and by the
 *                 phase-2 summary, data.js:45)
 * Everything else in data.js that varies by week -- set counts and deloads -- varies in
 * PLAN.volume, reproduced below as V2_VOLUME, not in the exercise lists.
 *
 * Exercise ids are the canonical slugs of src/domain/plan/library.ts (master plan section 5).
 * Every one of the 29 legacy slots either resolves to a library id or is listed in UNMAPPED
 * with the reason it cannot; nothing is guessed.
 */

import { addDays } from '../dates';
import type { LocalDate } from '../types';

/**
 * Session id carried by every migrated set whose legacy day has no equally named session in
 * the user's new plan. It is a real, stable id, not a sentinel: the Log view groups by it and
 * shows it as "legacy import".
 */
export const LEGACY_SESSION_ID = 'legacy-v2';

/** Programme length in weeks [dimensionless count]. */
export const LEGACY_WEEKS = 24;
/** Rotation length in days [d]; the legacy rotation is fixed, not calendar-aligned. */
export const LEGACY_DAYS_PER_WEEK = 7;

export type LegacyDayKind = 'lift' | 'cardio' | 'rest';

export interface LegacyExerciseRange {
  /** inclusive legacy week number, 1..24 */
  fromWeek: number;
  /** inclusive legacy week number, 1..24 */
  toWeek: number;
  /** id in src/domain/plan/library.ts, or null when the slot has no library equivalent */
  exerciseId: string | null;
}

export interface LegacyExerciseSlot {
  /** PLAN.days[d-1].exercises[i].name, verbatim */
  legacyName: string;
  /** PLAN.days[d-1].exercises[i].sets, verbatim: "2→4", "3", "—" */
  setsSpec: string;
  /** covers weeks 1..24 with no gap and no overlap */
  ranges: readonly LegacyExerciseRange[];
}

export interface LegacyDay {
  /** 1..7 */
  day: number;
  /** PLAN.days[d-1].name, verbatim */
  name: string;
  kind: LegacyDayKind;
  exercises: readonly LegacyExerciseSlot[];
}

/** Every slot that never changes exercise gets this shape. */
function allWeeks(exerciseId: string | null): LegacyExerciseRange[] {
  return [{ fromWeek: 1, toWeek: LEGACY_WEEKS, exerciseId }];
}

/**
 * Deep-freeze one legacy day: the day object, its exercise list, every slot and every week
 * range. A frozen table is the whole point of this module. `readonly` is a compile-time
 * promise only, and this table is the sole record of what a stored key meant, so an in-place
 * edit by any consumer would rewrite logged history with no error raised at the point of
 * damage. Frozen in place and returned, so identity is preserved.
 */
function freezeDay(d: LegacyDay): LegacyDay {
  for (const slot of d.exercises) {
    for (const r of slot.ranges) Object.freeze(r);
    Object.freeze(slot.ranges);
    Object.freeze(slot);
  }
  Object.freeze(d.exercises);
  return Object.freeze(d);
}

/**
 * PLAN.volume (data.js:79-104). Index 0 is week 1.
 * `sets` is the volume-ramp target [dimensionless count of working sets]; `deload` forces the
 * target to 2 (console-store.jsx:374).
 */
export const V2_VOLUME: readonly { sets: number; deload: boolean }[] = Object.freeze(
  [
    { sets: 2, deload: false }, // w1  baseline, establish form
    { sets: 2, deload: false }, // w2
    { sets: 3, deload: false }, // w3
    { sets: 3, deload: false }, // w4
    { sets: 3, deload: false }, // w5  Bulgarian split squats introduced
    { sets: 2, deload: true }, //  w6  deload
    { sets: 3, deload: false }, // w7
    { sets: 4, deload: false }, // w8
    { sets: 4, deload: false }, // w9  conventional deadlift reintroduced
    { sets: 4, deload: false }, // w10
    { sets: 4, deload: false }, // w11
    { sets: 2, deload: true }, //  w12 deload
    { sets: 4, deload: false }, // w13
    { sets: 4, deload: false }, // w14
    { sets: 4, deload: false }, // w15
    { sets: 4, deload: false }, // w16
    { sets: 4, deload: false }, // w17
    { sets: 2, deload: true }, //  w18 deload
    { sets: 4, deload: false }, // w19
    { sets: 4, deload: false }, // w20
    { sets: 4, deload: false }, // w21
    { sets: 4, deload: false }, // w22
    { sets: 4, deload: false }, // w23
    { sets: 2, deload: true }, //  w24 deload
  ].map((v) => Object.freeze(v)),
);

/**
 * PLAN.days (data.js:117-210). Index 0 is day 1.
 *
 * Two legacy names each cover a slot the P2 library splits in two, and in both cases the
 * library records which half kept the legacy search string, which is what fixes the mapping:
 *   "Pull-ups (or lat pulldown)"  -> pull-up   (lat-pulldown carries videoQuery null,
 *                                               library.ts:443)
 *   "Leg press → Bulgarian split" -> the week ranges below (leg-press carries videoQuery null,
 *                                               library.ts:577)
 * `Barbell row (Pendlay)` (day 2) and `Barbell row (heavier)` (day 5) stay two distinct
 * library ids -- barbell-row-pendlay and barbell-row -- because the legacy app keyed personal
 * records on the display name and therefore tracked them separately. Merging them here would
 * rewrite history.
 */
const V2_DAYS_TABLE: LegacyDay[] = [
  {
    day: 1,
    name: 'Push',
    kind: 'lift',
    exercises: [
      { legacyName: 'Barbell bench press', setsSpec: '2→4', ranges: allWeeks('barbell-bench-press') },
      { legacyName: 'Overhead press (barbell)', setsSpec: '2→4', ranges: allWeeks('overhead-press-barbell') },
      { legacyName: 'Incline DB press', setsSpec: '2→3', ranges: allWeeks('incline-db-press') },
      { legacyName: 'Lateral raises', setsSpec: '2→3', ranges: allWeeks('lateral-raise') },
      { legacyName: 'Tricep overhead extension', setsSpec: '2→3', ranges: allWeeks('triceps-overhead-extension') },
    ],
  },
  {
    day: 2,
    name: 'Pull',
    kind: 'lift',
    exercises: [
      { legacyName: 'Pull-ups (or lat pulldown)', setsSpec: '2→4', ranges: allWeeks('pull-up') },
      { legacyName: 'Barbell row (Pendlay)', setsSpec: '2→4', ranges: allWeeks('barbell-row-pendlay') },
      { legacyName: 'DB single-arm row', setsSpec: '2→3', ranges: allWeeks('db-single-arm-row') },
      { legacyName: 'Face pulls', setsSpec: '3', ranges: allWeeks('face-pull') },
      { legacyName: 'Barbell bicep curl', setsSpec: '2→3', ranges: allWeeks('barbell-curl') },
      { legacyName: 'Hammer curl', setsSpec: '2', ranges: allWeeks('hammer-curl') },
    ],
  },
  {
    day: 3,
    name: 'Legs',
    kind: 'lift',
    exercises: [
      { legacyName: 'Barbell back squat', setsSpec: '2→4', ranges: allWeeks('barbell-back-squat') },
      { legacyName: 'Romanian deadlift', setsSpec: '2→3', ranges: allWeeks('romanian-deadlift') },
      {
        legacyName: 'Leg press → Bulgarian split',
        setsSpec: '2→3',
        // data.js:156 note "Bulgarian from wk 5"
        ranges: [
          { fromWeek: 1, toWeek: 4, exerciseId: 'leg-press' },
          { fromWeek: 5, toWeek: LEGACY_WEEKS, exerciseId: 'bulgarian-split-squat' },
        ],
      },
      { legacyName: 'Leg curl (machine)', setsSpec: '2→3', ranges: allWeeks('leg-curl-machine') },
      { legacyName: 'Calf raise', setsSpec: '3→4', ranges: allWeeks('calf-raise') },
    ],
  },
  {
    day: 4,
    name: 'Rest',
    kind: 'rest',
    exercises: [
      { legacyName: 'Push-ups (3 × max)', setsSpec: '3', ranges: allWeeks('push-up') },
      // "Light walk" is the legacy row the library's `walk` entry was ported from: formCues.ts
      // names it ("Legacy \"Light walk\"", formCues.ts:767), and the library entry carries the
      // legacy note "Optional." verbatim with videoQuery null because the legacy row had no
      // video field. sets "—", so no set is ever prescribed for it.
      { legacyName: 'Light walk', setsSpec: '—', ranges: allWeeks('walk') },
    ],
  },
  {
    day: 5,
    name: 'Upper Power',
    kind: 'lift',
    exercises: [
      {
        legacyName: 'Trap bar DL → conventional',
        setsSpec: '4',
        // data.js:179 note "Conventional from wk 9. Always first."
        ranges: [
          { fromWeek: 1, toWeek: 8, exerciseId: 'trap-bar-deadlift' },
          { fromWeek: 9, toWeek: LEGACY_WEEKS, exerciseId: 'conventional-deadlift' },
        ],
      },
      { legacyName: 'Weighted pull-ups', setsSpec: '3', ranges: allWeeks('weighted-pull-up') },
      { legacyName: 'Close-grip bench press', setsSpec: '3', ranges: allWeeks('close-grip-bench-press') },
      { legacyName: 'Barbell row (heavier)', setsSpec: '3', ranges: allWeeks('barbell-row') },
      { legacyName: 'Push press', setsSpec: '3', ranges: allWeeks('push-press') },
    ],
  },
  {
    day: 6,
    name: 'Cardio + Core',
    kind: 'cardio',
    exercises: [
      { legacyName: 'Rower intervals', setsSpec: '—', ranges: allWeeks('rower-intervals') },
      { legacyName: 'Stair climber', setsSpec: '—', ranges: allWeeks('stair-climber') },
      { legacyName: 'Plank', setsSpec: '3', ranges: allWeeks('plank') },
      { legacyName: 'Ab wheel rollout', setsSpec: '3', ranges: allWeeks('ab-wheel-rollout') },
      { legacyName: 'Hanging knee raise', setsSpec: '3', ranges: allWeeks('hanging-knee-raise') },
    ],
  },
  {
    day: 7,
    name: 'Full Rest',
    kind: 'rest',
    exercises: [
      // "No training" is a placeholder row, not an exercise. See UNMAPPED.
      { legacyName: 'No training', setsSpec: '—', ranges: allWeeks(null) },
    ],
  },
];

export const V2_DAYS: readonly LegacyDay[] = Object.freeze(V2_DAYS_TABLE.map(freezeDay));

/**
 * The legacy slot names that deliberately resolve to no library id, and why. A name belongs
 * here only when the legacy row is not an exercise at all; a row whose exercise merely has a
 * different display name in the P2 library is mapped in V2_DAYS, never listed here. Task 2
 * reads this to decide what it may drop silently: an unmapped name that is NOT in this table
 * is a defect, not a rest row.
 */
export const UNMAPPED: Readonly<Record<string, string>> = Object.freeze({
  'No training':
    'Day 7 placeholder row (data.js:207), not an exercise: sets "—", reps "—", note "Muscle is built during recovery, not the session". The P2 library has no entry for the absence of training and must not gain one.',
});

/**
 * The session label a legacy day claims, for matching against PlannedSession.label in the
 * user's new plan. `null` means the legacy day was a rest day and claims no label. Day 6
 * claims "Cardio" but is matched on SessionKind in v2.ts, not on this string.
 */
export const V2_DAY_LABEL: Readonly<Record<number, string | null>> = Object.freeze({
  1: 'Push',
  2: 'Pull',
  3: 'Legs',
  4: null,
  5: 'Upper Power',
  6: 'Cardio',
  7: null,
});

/** The legacy day record, or null when `day` is outside 1..7. */
export function legacyDay(day: number): LegacyDay | null {
  return V2_DAYS[day - 1] ?? null;
}

/** The slot at `exIdx` of `day`, or null when either index is out of range. */
export function legacySlot(day: number, exIdx: number): LegacyExerciseSlot | null {
  const d = legacyDay(day);
  if (d === null) return null;
  return d.exercises[exIdx] ?? null;
}

/**
 * The library id this (day, exIdx) meant in `week`, or null when the slot has no library
 * equivalent, the indices are out of range, or the week is outside 1..24.
 */
export function legacyExerciseIdAt(day: number, exIdx: number, week: number): string | null {
  const slot = legacySlot(day, exIdx);
  if (slot === null) return null;
  for (const r of slot.ranges) {
    if (week >= r.fromWeek && week <= r.toWeek) return r.exerciseId;
  }
  return null;
}

/**
 * Reproduces console-store.jsx:372-383 (`setsForWeek`) exactly, including its fallbacks, so
 * that `isBonus` on a migrated set means what it meant in the old app: a set logged beyond the
 * prescribed count for that week. Returns a count of working sets [dimensionless].
 *
 * One deliberate difference: the legacy function indexes PLAN.volume[wk - 1] unguarded and
 * throws on a week outside 1..24, which cannot happen in the legacy UI because the week is
 * clamped on entry (console-store.jsx:140). A corrupt stored key can carry any week, so this
 * returns the same 2 the legacy function returns for an unparseable spec rather than throwing
 * mid-migration.
 */
export function legacyTargetSets(setsSpec: string, week: number): number {
  const vol = V2_VOLUME[week - 1];
  if (vol === undefined) return 2;
  if (vol.deload) return 2;
  const m = /(\d+)\s*→\s*(\d+)/.exec(setsSpec);
  if (m !== null) {
    const lo = Number.parseInt(m[1] ?? '', 10);
    const hi = Number.parseInt(m[2] ?? '', 10);
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      return Math.min(hi, Math.max(lo, vol.sets));
    }
    return 2;
  }
  const n = Number.parseInt(setsSpec, 10);
  return Number.isFinite(n) ? n : 2;
}

/**
 * (week, day) -> calendar date, using the legacy rule that day 1 of week 1 is the start date
 * itself. `week` and `day` are 1-based [dimensionless]; the caller validates their ranges.
 * The offset is (week - 1) * 7 + (day - 1) days [d] and is computed with the zone-free
 * calendar arithmetic of dates.ts, so no DST transition can shift it.
 */
export function legacyDateOf(startDate: LocalDate, week: number, day: number): LocalDate {
  return addDays(startDate, (week - 1) * LEGACY_DAYS_PER_WEEK + (day - 1));
}

/**
 * Display name -> library id, for the `exName` field frozen into legacy set payloads and for
 * the `exercise` field on legacy specimen records. For the two slots whose exercise changes
 * mid-programme the name alone is ambiguous, so this returns the id of the FIRST week range;
 * callers that hold a week number use `legacyExerciseIdAt` instead, which is exact.
 */
export function legacyIdForName(name: string): string | null {
  const key = name.trim();
  for (const day of V2_DAYS) {
    for (const slot of day.exercises) {
      if (slot.legacyName === key) return slot.ranges[0]?.exerciseId ?? null;
    }
  }
  return null;
}
