import { ACCESS_UNLOCKS } from '../types';
import type { Equipment, EquipmentAccess, Exercise, Experience, Prescription } from '../types';
import { EXERCISE_BY_ID, MUSCLE_GROUPS } from './library';

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
/** The library's muscle vocabulary as a type, so a band declaration cannot name a typo. */
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
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
  /**
   * Muscles this template places inside WEEKLY_SET_BAND at EVERY experience level, declared PER
   * EQUIPMENT TIER because the claim is per tier: the same slot table resolves to different
   * exercises under `dumbbells-only` and `bodyweight`, so it places different muscles in band.
   * Master plan section 5: "The weekly-band claim of a split template is per equipment tier: a
   * template declares its in-band muscles for each tier separately, and the band tests cover
   * every day count x experience x tier." Everything not listed for a tier is reported to the
   * user as maintenance-only IN THAT TIER, by the generator's volumeReport, which recomputes the
   * figure from the plan it actually built. templates.test.ts recomputes all 45 cells from the
   * library's muscle tags and asserts equality, so these lists cannot drift into a wish list.
   */
  bandMusclesByEquipment: Record<Equipment, readonly MuscleGroup[]>;
  /**
   * The full-gym row of `bandMusclesByEquipment`, kept as a flat list because that is the shape
   * the P2 Task 4 contract published and generator.test.ts iterates. It is the same array, not a
   * second declaration, so the two cannot disagree.
   */
  bandMuscles: readonly MuscleGroup[];
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
 * RE-BASELINED after the library's direct-mover rule was corrected. The set tables here did NOT
 * move; `bandMuscles` did. Making the glutes a direct mover in the Romanian deadlift credits 1.0
 * set instead of 0.5 to every hinge set, which lifts glute volume into the band at three, four,
 * five and six days: the glutes are now declared there instead of being reported as maintenance-
 * only. That is a corrected count, not a changed prescription -- the same sessions were always
 * being performed.
 *
 * The band is compared against the MIDPOINT of each exercise's prescribed set interval. The
 * midpoint is the arithmetic mean of setsLo and setsHi, and it is used because a slot prescribes
 * an INTERVAL of sets, of which one number has to be chosen to compare against a band stated as a
 * single weekly figure. It is not a claim about what the user does over a block: double
 * progression climbs REPS inside a fixed set count and then adds load (content review D2 section
 * 10), so the set count does not travel from lo to hi over the weeks. The interval exists because
 * a session can lose or gain a set to time; the midpoint is the middle of that interval, and the
 * endpoints are reported alongside it rather than hidden.
 *
 * HONEST LIMIT: at five days an advanced user who performs the top of every interval reaches 20
 * fractional sets/muscle/week against a 14-18 band. That is the six-day band top and the top of
 * ACSM 2026's ~18-20 deceleration range, not a volume at which the review reports any decline: D2
 * section 6 states the dose-response curve is "monotonic increasing and decelerating -- not a
 * threshold, not an inverted U within the studied range". No template's interval top exceeds 20
 * at any experience level, in ANY of the three equipment tiers -- the claim used to hold for the
 * full-gym tier only, and the bodyweight tier reached 30 at five days before the chin-up left the
 * curl slots (see the candidate-order comment below). templates.test.ts asserts it over all 45
 * day-count x experience x tier cells.
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
/*
 * INTENSITY IS A LOAD CLAIM, so an unloaded movement cannot carry `heavy`. Content review D2
 * section 9 defines the heavy class as >= 80 % 1RM at <= 6 reps; a push-up has no external load,
 * takes an AMRAP prescription (no load step exists to progress) and therefore has no %1RM to
 * declare. The five-day accessory session's push-up slot is `comp` (moderate compound) for that
 * reason. Nothing downstream moves: prescriptionFor returns the same AMRAP either way, and
 * restSFor keys off the prescription, giving a compound with no rep range the moderate 120 s.
 * Only the false claim goes. A heavy slot that RESOLVES to a push-up in the bodyweight tier is a
 * different case: the slot's intensity is set by the barbell entry at the head of its candidate
 * list, and the substitution degrades what that tier can deliver. That is a limit of the tier,
 * not a claim the template makes; templates.test.ts asserts only that every heavy slot has at
 * least one candidate a load can be put on.
 */
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
 * trains every muscle DIRECTLY that the equipment setting can train at all, bar a short list of
 * documented exceptions.
 *
 * ORDER IS LOAD-BEARING TWICE OVER. The first fitting candidate wins, so the full-gym entries stay
 * at the head of every list: adding a lower-tier option can never change what a full-gym user is
 * prescribed, which is why the weekly volume figures below did not move when the dumbbell and
 * bodyweight options were added. Within a tier the order is best-fit first.
 *
 * The lower-tier entries are the seven equipment-tier exercises and the two section 5 ruling
 * exercises from library.ts. Each one is here because it closes a DIRECT-coverage gap its tier
 * could otherwise not close: db-overhead-press and pike-push-up (front delt), db-rear-delt-fly
 * (rear delt, dumbbells only), db-romanian-deadlift and nordic-hamstring-curl (hamstrings),
 * inverted-row (mid-back), goblet-squat (quads, so the second knee-dominant slot in a session is
 * not dropped), chin-up (biceps) and bench-dip (triceps). What no substitution can close is
 * listed as an exception in templates.test.ts, not papered over here.
 *
 * WHERE THE CHIN-UP SITS, AND WHY IT IS NOT IN THE CURL LISTS. The chin-up is the bodyweight
 * tier's only biceps-DIRECT exercise, so the tier needs it; it is also lats-direct, so where it
 * lands decides the tier's lats count. It used to be the third entry of both curl lists, which
 * put a lats-direct compound in an ISOLATION slot on top of the pull slots that already trained
 * the lats: at five days that gave the bodyweight tier six lats-direct credits, 27 sets/week
 * against a 14-18 band (range top 30, past the 20-set evidence ceiling). It now substitutes into
 * the SECOND horizontal-pull slot instead, and the curl lists resolve to nothing in a tier with
 * no curl. In the bodyweight tier every pull is lats-direct whichever pull it is, so swapping a
 * chin-up for the inverted-row there leaves lats untouched and moves biceps from assisting (0.5)
 * to direct (1.0) without adding a slot. The first horizontal-pull slot keeps the inverted-row,
 * which is the tier's only mid-back-direct exercise.
 *
 * The two-day template has no second horizontal-pull slot, so its vertical pull uses
 * VERTICAL_PULL_CHIN: full-gym still resolves lat-pulldown, and the sub-gym tiers resolve the
 * chin-up. REJECTED ALTERNATIVE, and the reason it lost: putting the chin-up in the vertical-pull
 * lists everywhere is the truer movement-pattern match, but a vertical-pull list cannot tell the
 * dumbbells-only tier from the bodyweight tier -- the only sub-gym vertical pulls in the library
 * are the pull-up and the chin-up, both available in both tiers. The dumbbells-only tier would
 * then take a chin-up ON TOP of its two hammer-curl slots, giving an advanced user 20.25
 * biceps sets/week at five days against a 14-18 band, range top 22.5. Substituting a vertical
 * pull into a horizontal-pull slot is the smaller error: it is one movement pattern off in one
 * tier, against a volume claim the review's band would not support. */
const HORIZONTAL_PRESS = ['barbell-bench-press', 'incline-db-press', 'push-up'];
const INCLINE_PRESS = ['incline-db-press', 'push-up'];
const TRICEPS_PRESS = ['close-grip-bench-press', 'bench-dip'];
const VERTICAL_PRESS = ['overhead-press-barbell', 'db-overhead-press', 'pike-push-up'];
const EXPLOSIVE_PRESS = ['push-press', 'db-overhead-press', 'pike-push-up'];
const VERTICAL_PULL_A = ['lat-pulldown', 'pull-up'];
const VERTICAL_PULL_B = ['pull-up', 'lat-pulldown'];
const VERTICAL_PULL_CHIN = ['lat-pulldown', 'chin-up'];
const HORIZONTAL_PULL_A = ['barbell-row-pendlay', 'db-single-arm-row', 'inverted-row'];
const HORIZONTAL_PULL_B = ['db-single-arm-row', 'barbell-row-pendlay', 'chin-up'];
const SQUAT = ['barbell-back-squat', 'goblet-squat', 'bulgarian-split-squat'];
const LEG_PRESS = ['leg-press', 'goblet-squat', 'bulgarian-split-squat'];
const DEADLIFT = ['trap-bar-deadlift', 'conventional-deadlift', 'bulgarian-split-squat'];
const SPLIT_SQUAT = ['bulgarian-split-squat'];
const HINGE = [
  'romanian-deadlift',
  'conventional-deadlift',
  'db-romanian-deadlift',
  'nordic-hamstring-curl',
];
const LEG_CURL = ['leg-curl-machine', 'nordic-hamstring-curl'];
const CALF = ['calf-raise'];
const LATERAL = ['lateral-raise'];
const REAR_DELT = ['face-pull', 'db-rear-delt-fly'];
const CURL_A = ['barbell-curl', 'hammer-curl'];
const CURL_B = ['hammer-curl', 'barbell-curl'];
const CORE_PLANK = ['plank'];
const CORE_HANG = ['hanging-knee-raise', 'plank'];
const CORE_WHEEL = ['ab-wheel-rollout', 'plank'];

/**
 * In-band muscles per day count and equipment tier, in sets/muscle/week against WEEKLY_SET_BAND.
 *
 * A muscle is listed for a tier only when its MIDPOINT weekly fractional volume sits inside the
 * band at ALL THREE experience levels, which is the strictest of the three cells and the one the
 * user is entitled to rely on. `templates.test.ts` recomputes every one of the 5 x 3 x 3 = 45
 * cells from the library's muscle tags and asserts equality with these lists, so a slot edit that
 * moves a muscle in or out fails the suite rather than shipping a stale claim.
 *
 * The lists shrink as the equipment does, and that is the honest result rather than a defect: the
 * bodyweight tier has no external load to add, so a slot that resolves to nothing (a curl with no
 * dumbbell, a machine leg curl) removes real sets from the week. What a tier cannot bring into
 * band it reports as maintenance-only for that tier.
 */
const BAND_MUSCLES: Record<SessionsPerWeek, Record<Equipment, readonly MuscleGroup[]>> = {
  // Band 6-10 sets/muscle/week.
  2: {
    'full-gym': [
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
    // No barbell row, so mid-back drops out; the dumbbell row's rear-delt assistance is enough to
    // put the rear delt in a band this low.
    'dumbbells-only': [
      'abs',
      'biceps',
      'chest',
      'front-delt',
      'glutes',
      'hamstrings',
      'lats',
      'quads',
      'rear-delt',
    ],
    // The chin-up is this tier's one biceps-direct exercise and the two-day template has one
    // pulling slot for it, which leaves the biceps below the floor rather than out of the plan.
    bodyweight: ['abs', 'chest', 'front-delt', 'glutes', 'hamstrings', 'lats', 'quads'],
  },
  // Band 9-15 sets/muscle/week.
  3: {
    'full-gym': ['biceps', 'chest', 'glutes', 'hamstrings', 'lats', 'mid-back', 'quads'],
    'dumbbells-only': ['biceps', 'chest', 'glutes', 'hamstrings', 'lats', 'quads'],
    bodyweight: ['glutes', 'lats', 'quads'],
  },
  // Band 12-16 sets/muscle/week.
  4: {
    'full-gym': ['biceps', 'chest', 'glutes', 'hamstrings', 'lats', 'quads'],
    'dumbbells-only': ['biceps', 'lats'],
    bodyweight: ['lats'],
  },
  // Band 14-18 sets/muscle/week.
  5: {
    'full-gym': ['abs', 'biceps', 'chest', 'glutes', 'hamstrings', 'lats', 'mid-back', 'quads'],
    'dumbbells-only': ['abs', 'biceps', 'lats'],
    bodyweight: ['abs', 'lats'],
  },
  // Band 16-20 sets/muscle/week.
  6: {
    'full-gym': [
      'abs',
      'biceps',
      'chest',
      'front-delt',
      'glutes',
      'hamstrings',
      'lats',
      'mid-back',
      'quads',
      'side-delt',
    ],
    'dumbbells-only': ['abs', 'front-delt', 'lats', 'side-delt'],
    bodyweight: ['abs', 'lats'],
  },
};

/**
 * The in-band muscles a template claims for one equipment tier, in sets/muscle/week. Everything
 * in MUSCLE_GROUPS that this does not return is maintenance-only for that tier.
 */
export function bandMusclesFor(
  days: SessionsPerWeek,
  equipment: Equipment,
): readonly MuscleGroup[] {
  return BAND_MUSCLES[days][equipment];
}

/**
 * THREE LIBRARY EXERCISES APPEAR IN NO CANDIDATE LIST, and each omission is deliberate:
 *   triceps-overhead-extension -- no template carries an elbow-extension ISOLATION slot in any
 *     tier. That is the documented short-week limit in templates.test.ts extended to every day
 *     count: the elbow extensors are trained by the pressing slots, and adding an isolation slot
 *     would move the weekly volume of every muscle the template already places in band.
 *   weighted-pull-up -- full-gym only, and tagged identically to the pull-up it would displace
 *     (lats direct; biceps and mid-back assisting), so listing it could only change WHICH full-gym
 *     exercise wins a vertical-pull slot, never the volume that slot delivers. It stays in the
 *     library for a user who logs it and for P4's progression rules, which need its load steps.
 *   barbell-row -- carries the same tags as barbell-row-pendlay, which leads HORIZONTAL_PULL_A.
 *     It exists so P7 can migrate the legacy "Barbell row (heavier)" log entries onto a canonical
 *     id, not so the generator can prescribe it.
 * library.test.ts owns the library's own coverage claims; this note exists so a reader does not
 * take the gap for an oversight.
 */
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
          comp('vertical pull', VERTICAL_PULL_CHIN),
          iso('rear delt', REAR_DELT),
          iso('elbow flexion', CURL_A),
          iso('calf', CALF),
          iso('core', CORE_HANG),
        ],
      },
    ],
    sets: SETS_2_TO_4,
    bandMusclesByEquipment: BAND_MUSCLES[2],
    bandMuscles: BAND_MUSCLES[2]['full-gym'],
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
    bandMusclesByEquipment: BAND_MUSCLES[3],
    bandMuscles: BAND_MUSCLES[3]['full-gym'],
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
    bandMusclesByEquipment: BAND_MUSCLES[4],
    bandMuscles: BAND_MUSCLES[4]['full-gym'],
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
          comp('push-up', ['push-up']),
          iso('rear delt', REAR_DELT),
          iso('lateral raise', LATERAL),
          iso('calf', CALF),
          iso('core', CORE_WHEEL),
          iso('core', CORE_HANG),
        ],
      },
    ],
    sets: SETS_5,
    bandMusclesByEquipment: BAND_MUSCLES[5],
    bandMuscles: BAND_MUSCLES[5]['full-gym'],
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
    bandMusclesByEquipment: BAND_MUSCLES[6],
    bandMuscles: BAND_MUSCLES[6]['full-gym'],
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
 *
 * The AMRAP case covers ALL SIX unloaded bodyweight compounds, not just the two the legacy app
 * happened to list (master plan section 5): push-up, pull-up, chin-up, bench-dip, inverted-row
 * and pike-push-up. The reason is mechanical rather than physiological -- none of them has a load
 * step to progress, so a rep range would have nothing to hand off to when its top was reached,
 * and P4's progression rule would have to invent one. The exclusions are deliberate: the
 * weighted-pull-up takes a belt or a plate and so does have a load step; the plank is timed; and
 * the three unloaded ISOLATION rows (ab-wheel-rollout, hanging-knee-raise, nordic-hamstring-curl)
 * progress by range and leverage within a rep target rather than by reps to failure, so a rep
 * range is a real prescription for them.
 */
const REPS_HEAVY = { lo: 4, hi: 6 } as const; // repetitions; <= 6 reps is the section 9 heavy class
const REPS_MODERATE = { lo: 6, hi: 8 } as const; // repetitions; inside the section 9 moderate 6-12 band
const REPS_ISOLATION = { lo: 8, hi: 12 } as const; // repetitions; inside the section 9 moderate 6-12 band

export function prescriptionFor(ex: Exercise, intensity: SlotIntensity): Prescription {
  switch (ex.id) {
    case 'push-up':
    case 'pull-up':
    case 'chin-up':
    case 'bench-dip':
    case 'inverted-row':
    case 'pike-push-up':
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

/**
 * First candidate that the LIBRARY holds, the equipment ACCESS unlocks, and the session has not
 * already used. Returns null only when no candidate clears all three, which is the sole omission
 * a split template declares: a slot is dropped rather than filled with something it does not
 * train.
 *
 * Takes an `EquipmentAccess` (what the USER has), not an `Equipment` (what an exercise needs):
 * Brief F Part 2. `ACCESS_UNLOCKS[equipment]` is the set of exercise tiers that access level
 * opens, and a candidate matches when its own `equipment` array INTERSECTS that set, rather than
 * containing one exact tier. A combination access level unlocks the union of its parts' tiers, so
 * it can resolve anything either pure part could -- see ACCESS_UNLOCKS's own comment (types.ts)
 * for why the two combination levels resolve every slot IDENTICALLY to one specific pure tier.
 *
 * `library` is the id-keyed exercise table to resolve against. It defaults to EXERCISE_BY_ID, so
 * every existing call site keeps its behaviour verbatim. The parameter exists because the plan
 * generator is handed a library by its caller and must not silently prescribe an exercise that
 * library does not contain (a reduced library is what an import or a future per-profile exercise
 * filter supplies); resolving against the module-level table instead would emit ids the caller
 * never offered.
 */
export function resolveSlot(
  slot: ExerciseSlot,
  equipment: EquipmentAccess,
  used: ReadonlySet<string>,
  library: Readonly<Record<string, Exercise>> = EXERCISE_BY_ID,
): Exercise | null {
  const unlocked = ACCESS_UNLOCKS[equipment];
  for (const id of slot.candidates) {
    const ex = library[id];
    if (!ex) continue;
    if (used.has(ex.id)) continue;
    if (!ex.equipment.some((tier) => unlocked.includes(tier))) continue;
    return ex;
  }
  return null;
}
