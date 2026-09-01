import type { Equipment, Exercise, Experience, Prescription } from '../types';
import { EXERCISE_BY_ID } from './library';

/**
 * Split templates for 2-6 training days.
 *
 * Source for the split choice and the weekly set band: content review Deliverable 2 section 7.
 * Source for the counting rule behind the band: section 6 (Pelland JC et al. 2025, Sports Medicine
 * 56(2):481-505, DOI 10.1007/s40279-025-02344-w) -- a direct set counts 1.0, an indirect set 0.5.
 * Source for the >= 10 sets/week floor and the ~18-20 sets/week deceleration point: Currier BS
 * et al. (2026) ACSM Position Stand, Med Sci Sports Exerc 58(4):851-872,
 * DOI 10.1249/mss.0000000000003897.
 * Frequency is a scheduling variable, not a growth variable: Schoenfeld BJ, Grgic J, Krieger J
 * (2019), J Sports Sci 37(11):1286-1295, DOI 10.1080/02640414.2018.1555906 -- "strong evidence
 * that resistance training frequency does not significantly or meaningfully impact muscle
 * hypertrophy when volume is equated". So the split's only job is to distribute the weekly set
 * target across the days the user actually has.
 * No coefficient here is sex-specific: Roberts BM et al. (2020), DOI 10.1519/JSC.0000000000003521.
 *
 * The report supplies NO goal-stratified rep range, so `PlanInput.goal` does not appear in this
 * file at all; it changes energy and protein only (see src/domain/nutrition.ts).
 */

export type SessionsPerWeek = 2 | 3 | 4 | 5 | 6;
export type SlotClass = 'compound' | 'isolation';
export type SlotIntensity = 'heavy' | 'moderate' | 'light';

export interface ExerciseSlot {
  role: string; // movement pattern, for readability and debugging only
  slotClass: SlotClass;
  intensity: SlotIntensity;
  candidates: string[]; // exercise ids, best first; the generator takes the first that fits
}

export interface SessionTemplate {
  label: string;
  slots: ExerciseSlot[];
}

export interface SplitTemplate {
  sessionsPerWeek: SessionsPerWeek;
  name: string;
  note: string; // shown on the wizard review screen; states the split's honest limits
  sessions: SessionTemplate[];
  sets: Record<Experience, Record<SlotClass, { lo: number; hi: number }>>; // sets per exercise, dimensionless count
  bandMuscles: readonly string[]; // muscles this template places inside WEEKLY_SET_BAND
}

/**
 * Fractional sets per muscle per week, by training days. Content review D2 section 7 table,
 * reproduced verbatim. Dimensionless counts (sets/week), not a physical quantity.
 * Counting rule: a direct set 1.0, an indirect set 0.5 (see INDIRECT_SET_FRACTION in library.ts).
 */
export const WEEKLY_SET_BAND: Record<SessionsPerWeek, readonly [number, number]> = {
  2: [6, 10],
  3: [9, 15],
  4: [12, 16],
  5: [14, 18],
  6: [16, 20],
};

/**
 * Sets per exercise by experience, dimensionless counts.
 *
 * The report supplies the weekly BAND but no experience-stratified coefficient, so novice sits at
 * the bottom of the band and advanced at the top. HEURISTIC -- within-band placement, labelled as
 * such, not a published stratification. The figures were computed rather than guessed: for every
 * template and every experience level, the weekly fractional volume of each muscle in
 * `bandMuscles` was evaluated against WEEKLY_SET_BAND, and the tables below are the ones that
 * land inside it. `templates.test.ts` re-runs that computation as an assertion, so a slot edit
 * that pushes a muscle out of band fails the suite rather than shipping.
 *
 * The band is compared against the MIDPOINT of each exercise's set range, because the range is a
 * double-progression device rather than two prescriptions. HONEST LIMIT: at five days an advanced
 * user who takes every exercise to the top of its range reaches 20 fractional sets/muscle/week
 * against a 14-18 band. That is the six-day band top and the top of ACSM 2026's ~18-20
 * deceleration range, not a volume at which the review reports any decline: D2 section 6 states
 * the dose-response curve is "monotonic increasing and decelerating -- not a threshold, not an
 * inverted U within the studied range". No template exceeds 20 at any experience level.
 */
const SETS_2_TO_4: SplitTemplate['sets'] = {
  novice: { compound: { lo: 3, hi: 3 }, isolation: { lo: 3, hi: 3 } },
  intermediate: { compound: { lo: 3, hi: 4 }, isolation: { lo: 3, hi: 3 } },
  advanced: { compound: { lo: 4, hi: 4 }, isolation: { lo: 3, hi: 4 } },
};
const SETS_5: SplitTemplate['sets'] = {
  novice: { compound: { lo: 3, hi: 4 }, isolation: { lo: 3, hi: 4 } },
  intermediate: { compound: { lo: 4, hi: 4 }, isolation: { lo: 4, hi: 4 } },
  advanced: { compound: { lo: 4, hi: 5 }, isolation: { lo: 4, hi: 5 } },
};
const SETS_6: SplitTemplate['sets'] = {
  novice: { compound: { lo: 4, hi: 4 }, isolation: { lo: 4, hi: 4 } },
  intermediate: { compound: { lo: 4, hi: 5 }, isolation: { lo: 4, hi: 5 } },
  advanced: { compound: { lo: 5, hi: 5 }, isolation: { lo: 5, hi: 5 } },
};

/* Slot constructors keep the tables below readable. */
const heavy = (role: string, candidates: string[]): ExerciseSlot => ({
  role,
  slotClass: 'compound',
  intensity: 'heavy',
  candidates,
});
const comp = (role: string, candidates: string[]): ExerciseSlot => ({
  role,
  slotClass: 'compound',
  intensity: 'moderate',
  candidates,
});
const iso = (role: string, candidates: string[]): ExerciseSlot => ({
  role,
  slotClass: 'isolation',
  intensity: 'light',
  candidates,
});

/* Candidate orders. Each list runs the full-gym option first, then a dumbbell option, then a
 * bodyweight option, so one table serves all three equipment settings and the substitution keeps
 * the muscles the slot exists to train. A slot with no fitting candidate is dropped rather than
 * replaced by something it does not train; `templates.test.ts` asserts that what survives still
 * covers every muscle that equipment setting can reach at all. */
const HORIZONTAL_PRESS = ['barbell-bench-press', 'incline-db-press', 'push-up'];
const INCLINE_PRESS = ['incline-db-press', 'push-up'];
const TRICEPS_PRESS = ['close-grip-bench-press', 'push-up'];
const VERTICAL_PRESS = ['overhead-press-barbell', 'push-up'];
const EXPLOSIVE_PRESS = ['push-press', 'push-up'];
const VERTICAL_PULL_A = ['lat-pulldown', 'pull-up'];
const VERTICAL_PULL_B = ['pull-up', 'lat-pulldown'];
const HORIZONTAL_PULL_A = ['barbell-row-pendlay', 'db-single-arm-row'];
const HORIZONTAL_PULL_B = ['db-single-arm-row', 'barbell-row-pendlay'];
const SQUAT = ['barbell-back-squat', 'bulgarian-split-squat'];
const LEG_PRESS = ['leg-press', 'bulgarian-split-squat'];
const DEADLIFT = ['trap-bar-deadlift', 'conventional-deadlift', 'bulgarian-split-squat'];
const SPLIT_SQUAT = ['bulgarian-split-squat'];
const HINGE = ['romanian-deadlift', 'conventional-deadlift'];
const LEG_CURL = ['leg-curl-machine'];
const CALF = ['calf-raise'];
const LATERAL = ['lateral-raise'];
const REAR_DELT = ['face-pull'];
const CURL_A = ['barbell-curl', 'hammer-curl'];
const CURL_B = ['hammer-curl', 'barbell-curl'];
const CORE_PLANK = ['plank'];
const CORE_HANG = ['hanging-knee-raise', 'plank'];
const CORE_WHEEL = ['ab-wheel-rollout', 'plank'];

export const SPLIT_TEMPLATES: Record<SessionsPerWeek, SplitTemplate> = {
  2: {
    sessionsPerWeek: 2,
    name: 'Full body x2',
    note: 'Two full-body sessions. Content review section 7: at two days a week most muscles sit below the ACSM >= 10 sets/week hypertrophy floor unless the sessions run long. That is stated rather than hidden. It still clears the >= 2 sessions/week the ACSM 2026 position stand recommends for strength.',
    sessions: [
      {
        label: 'Full body A',
        slots: [
          heavy('squat', SQUAT),
          comp('horizontal press', HORIZONTAL_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_A),
          comp('hinge', HINGE),
          comp('vertical press', VERTICAL_PRESS),
          iso('lateral raise', LATERAL),
          iso('core', CORE_PLANK),
        ],
      },
      {
        label: 'Full body B',
        slots: [
          heavy('deadlift', DEADLIFT),
          comp('incline press', INCLINE_PRESS),
          comp('vertical pull', VERTICAL_PULL_A),
          iso('rear delt', REAR_DELT),
          iso('elbow flexion', CURL_A),
          iso('calf', CALF),
          iso('core', CORE_HANG),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMuscles: [
      'abs',
      'biceps',
      'chest',
      'front-delt',
      'glutes',
      'hamstrings',
      'lats',
      'mid-back',
      'quads',
    ],
  },
  3: {
    sessionsPerWeek: 3,
    name: 'Full body x3',
    note: 'Three full-body sessions. Content review section 7 prefers this over push/pull/legs at three days: PPL would give each muscle one session a week and force all its weekly volume into that session, where the last sets are least productive.',
    sessions: [
      {
        label: 'Full body A',
        slots: [
          heavy('squat', SQUAT),
          comp('horizontal press', HORIZONTAL_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_A),
          iso('lateral raise', LATERAL),
          iso('elbow flexion', CURL_A),
          iso('core', CORE_PLANK),
        ],
      },
      {
        label: 'Full body B',
        slots: [
          heavy('hinge', HINGE),
          comp('vertical press', VERTICAL_PRESS),
          comp('vertical pull', VERTICAL_PULL_A),
          comp('leg press', LEG_PRESS),
          iso('knee flexion', LEG_CURL),
          iso('calf', CALF),
          iso('core', CORE_HANG),
        ],
      },
      {
        label: 'Full body C',
        slots: [
          heavy('deadlift', DEADLIFT),
          comp('incline press', INCLINE_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_B),
          comp('push-up', ['push-up']),
          iso('rear delt', REAR_DELT),
          iso('elbow flexion', CURL_B),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMuscles: ['biceps', 'chest', 'hamstrings', 'lats', 'mid-back', 'quads'],
  },
  4: {
    sessionsPerWeek: 4,
    name: 'Upper / Lower x2',
    note: "The engine default. Content review section 7: best evidence fit, matching Currier 2023's highest-ranked hypertrophy prescription (higher-load, multiset, twice-weekly; SMD 0.66, 95 % CrI 0.47 to 0.85).",
    sessions: [
      {
        label: 'Upper A',
        slots: [
          heavy('horizontal press', HORIZONTAL_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_A),
          comp('incline press', INCLINE_PRESS),
          comp('vertical pull', VERTICAL_PULL_A),
          iso('lateral raise', LATERAL),
          iso('elbow flexion', CURL_A),
        ],
      },
      {
        label: 'Lower A',
        slots: [
          heavy('squat', SQUAT),
          comp('hinge', HINGE),
          comp('leg press', LEG_PRESS),
          iso('knee flexion', LEG_CURL),
          iso('calf', CALF),
          iso('core', CORE_PLANK),
        ],
      },
      {
        label: 'Upper B',
        slots: [
          heavy('triceps press', TRICEPS_PRESS),
          comp('vertical pull', VERTICAL_PULL_B),
          comp('vertical press', VERTICAL_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_B),
          iso('rear delt', REAR_DELT),
          iso('elbow flexion', CURL_B),
        ],
      },
      {
        label: 'Lower B',
        slots: [
          heavy('deadlift', DEADLIFT),
          comp('split squat', SPLIT_SQUAT),
          comp('push-up', ['push-up']),
          iso('lateral raise', LATERAL),
          iso('calf', CALF),
          iso('core', CORE_HANG),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMuscles: ['biceps', 'chest', 'hamstrings', 'lats', 'quads'],
  },
  5: {
    sessionsPerWeek: 5,
    name: 'Upper / Lower x2 + accessory',
    note: 'Upper, lower, upper, lower, then an accessory session for the groups the four main sessions leave at maintenance. Content review section 7: approaching the 18-20 sets/week point where marginal return approaches zero.',
    sessions: [
      {
        label: 'Upper A',
        slots: [
          heavy('horizontal press', HORIZONTAL_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_A),
          comp('incline press', INCLINE_PRESS),
          comp('vertical pull', VERTICAL_PULL_A),
          iso('lateral raise', LATERAL),
          iso('elbow flexion', CURL_A),
        ],
      },
      {
        label: 'Lower A',
        slots: [
          heavy('squat', SQUAT),
          comp('hinge', HINGE),
          comp('leg press', LEG_PRESS),
          iso('knee flexion', LEG_CURL),
          iso('calf', CALF),
          iso('core', CORE_PLANK),
        ],
      },
      {
        label: 'Upper B',
        slots: [
          heavy('triceps press', TRICEPS_PRESS),
          comp('vertical pull', VERTICAL_PULL_B),
          comp('vertical press', VERTICAL_PRESS),
          comp('horizontal pull', HORIZONTAL_PULL_B),
          iso('rear delt', REAR_DELT),
          iso('elbow flexion', CURL_B),
        ],
      },
      {
        label: 'Lower B',
        slots: [
          heavy('deadlift', DEADLIFT),
          comp('split squat', SPLIT_SQUAT),
          iso('lateral raise', LATERAL),
          iso('calf', CALF),
          iso('core', CORE_HANG),
        ],
      },
      {
        label: 'Accessory',
        slots: [
          heavy('push-up', ['push-up']),
          iso('rear delt', REAR_DELT),
          iso('lateral raise', LATERAL),
          iso('calf', CALF),
          iso('core', CORE_WHEEL),
          iso('core', CORE_HANG),
        ],
      },
    ],
    sets: SETS_5,
    bandMuscles: ['abs', 'biceps', 'chest', 'hamstrings', 'lats', 'mid-back', 'quads'],
  },
  6: {
    sessionsPerWeek: 6,
    name: 'Push / Pull / Legs x2',
    note: 'Content review section 7: the top of the useful range. Marginal return is near zero beyond roughly 18-20 sets per muscle per week, so this template adds frequency, not volume beyond the band.',
    sessions: [
      {
        label: 'Push A',
        slots: [
          heavy('horizontal press', HORIZONTAL_PRESS),
          comp('incline press', INCLINE_PRESS),
          comp('vertical press', VERTICAL_PRESS),
          iso('lateral raise', LATERAL),
          iso('core', CORE_PLANK),
        ],
      },
      {
        label: 'Pull A',
        slots: [
          heavy('horizontal pull', HORIZONTAL_PULL_A),
          comp('vertical pull', VERTICAL_PULL_A),
          iso('rear delt', REAR_DELT),
          iso('elbow flexion', CURL_A),
          iso('elbow flexion', CURL_B),
        ],
      },
      {
        label: 'Legs A',
        slots: [
          heavy('squat', SQUAT),
          comp('hinge', HINGE),
          comp('leg press', LEG_PRESS),
          iso('knee flexion', LEG_CURL),
          iso('calf', CALF),
        ],
      },
      {
        label: 'Push B',
        slots: [
          heavy('triceps press', TRICEPS_PRESS),
          comp('push-up', ['push-up']),
          comp('explosive press', EXPLOSIVE_PRESS),
          iso('lateral raise', LATERAL),
          iso('core', CORE_WHEEL),
        ],
      },
      {
        label: 'Pull B',
        slots: [
          heavy('vertical pull', VERTICAL_PULL_B),
          comp('horizontal pull', HORIZONTAL_PULL_B),
          iso('rear delt', REAR_DELT),
          iso('core', CORE_HANG),
          iso('calf', CALF),
        ],
      },
      {
        label: 'Legs B',
        slots: [
          heavy('deadlift', DEADLIFT),
          comp('split squat', SPLIT_SQUAT),
          iso('lateral raise', LATERAL),
          iso('core', CORE_HANG),
          iso('calf', CALF),
        ],
      },
    ],
    sets: SETS_6,
    bandMuscles: [
      'abs',
      'biceps',
      'chest',
      'front-delt',
      'hamstrings',
      'lats',
      'mid-back',
      'quads',
      'side-delt',
    ],
  },
};

/**
 * Rep prescriptions.
 *
 * Content review section 9 stratifies by LOAD, not by goal: heavy multi-joint work is >= 80 % 1RM
 * at <= 6 reps; moderate compound work is 6-12 reps. The report supplies NO goal-stratified rep
 * range, so PlanInput.goal does not appear here.
 *
 * Exercise-level overrides reproduce the legacy prescriptions for movements with no external
 * load: push-ups and pull-ups were "3 x max", the plank "60 s", the rower and stair climber
 * "20 min", the walk "20-30 min" (1500 s is the midpoint of that legacy range, an operational
 * figure, not a physiological one).
 */
const REPS_HEAVY = { lo: 4, hi: 6 } as const; // repetitions; <= 6 reps is the section 9 heavy class
const REPS_MODERATE = { lo: 6, hi: 8 } as const; // repetitions; inside the section 9 moderate 6-12 band
const REPS_ISOLATION = { lo: 8, hi: 12 } as const; // repetitions; inside the section 9 moderate 6-12 band

export function prescriptionFor(ex: Exercise, intensity: SlotIntensity): Prescription {
  switch (ex.id) {
    case 'push-up':
    case 'pull-up':
      return { kind: 'amrap', minimum: null };
    case 'plank':
      return { kind: 'time', targetS: 60 }; // [s]
    case 'rower-intervals':
    case 'stair-climber':
      return { kind: 'duration', targetS: 1200 }; // [s] = 20 min
    case 'walk':
      return { kind: 'duration', targetS: 1500 }; // [s] = 25 min, midpoint of the legacy 20-30 min
    default:
      break;
  }
  if (ex.loadClass === 'isolation') return { kind: 'reps', ...REPS_ISOLATION };
  return intensity === 'heavy'
    ? { kind: 'reps', ...REPS_HEAVY }
    : { kind: 'reps', ...REPS_MODERATE };
}

/**
 * Rest interval before the next set, in seconds.
 *
 * Master plan section 6.3 (amended): the rest table has ONE home, src/domain/plan/library.ts, so
 * P4's defaultRestS() and this module cannot drift into two copies. It is re-exported here
 * because the split templates are the natural import site for a consumer building a session, and
 * because the P2 Task 4 contract lists `restSFor` among this module's exports.
 */
export { restSFor } from './library';

/** First candidate that the equipment supports and the session has not already used. */
export function resolveSlot(
  slot: ExerciseSlot,
  equipment: Equipment,
  used: ReadonlySet<string>,
): Exercise | null {
  for (const id of slot.candidates) {
    const ex = EXERCISE_BY_ID[id];
    if (!ex) continue;
    if (used.has(ex.id)) continue;
    if (!ex.equipment.includes(equipment)) continue;
    return ex;
  }
  return null;
}
