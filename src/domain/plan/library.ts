import type { Exercise, Prescription, Seconds } from '../types';

/**
 * Exercise library, ported from the legacy `data.js` day tables (names, video search strings,
 * operational notes) and the `console-content.js` FORM_CUES keys (cue ids). Generic only: no
 * personal literal, no medication, no location. Nothing is invented -- where the legacy file
 * carried no video search string, `videoQuery` is null and P4 hides the video control.
 *
 * Ids are the 31 canonical slugs listed in master plan section 5 (the comment above
 * `PlannedExercise` in src/domain/types.ts). P4's src/content/formCues.ts is keyed by the same
 * slugs, so `formCueId === id` for every exercise that has a cue; a rename here that is not
 * mirrored there fails the FORM_CUE_IDS test rather than silently losing the cue.
 *
 * PORT MAP, legacy name -> id (28 legacy cue objects cover 31 ids because three of them
 * describe two exercises each in bracketed halves and are split in P4):
 *   "Pull-ups (or lat pulldown)"        -> pull-up, lat-pulldown
 *   "Leg press -> Bulgarian split squat" -> leg-press, bulgarian-split-squat
 *   "Trap bar DL -> conventional"        -> trap-bar-deadlift, conventional-deadlift
 *   "Barbell row (heavier)"              -> barbell-row (cue rewritten to the strict standard
 *                                           in P4; the legacy id `barbell-row-heavy` and its
 *                                           "slight cheat / TnT" permission do not ship --
 *                                           content review section 6, WRONG (unsafe))
 *   "No training"                        -> dropped (not an exercise)
 *
 * SET COUNTING. muscleGroups = DIRECT movers, counted as 1.0 set each; secondaryMuscles =
 * INDIRECT movers, counted as INDIRECT_SET_FRACTION. Counting rule verified in content review
 * section 6: Pelland JC et al. (2025), Sports Medicine 56(2):481-505,
 * DOI 10.1007/s40279-025-02344-w -- "a direct set counts 1.0, an indirect set 0.5".
 *
 * CONVENTION (HEURISTIC, stated so it can be audited). The report does NOT define which
 * muscles are direct for a given lift. Here a muscle is SECONDARY only when it acts as a
 * DYNAMIC ASSISTING MOVER through the working range. Isometric stabilisers are NOT counted at
 * all: erector spinae in a squat or deadlift, abdominals in a standing press, forearm flexors
 * in a row, rotator cuff in any press. The one arguable case is the hamstrings in a squat and
 * a leg press: overall length change is small (they lengthen at the knee while shortening at
 * the hip), but they contribute a real hip-extension moment during the ascent, so they are
 * counted as assisting movers rather than stabilisers. This assignment is an engineering
 * judgement inside a cited counting rule, not a published table.
 *
 * The conditioning entries (rower-intervals, stair-climber, walk) carry NO muscle groups on
 * purpose: fractional set counting is a resistance-training construct and these are prescribed
 * by duration, so counting sets for them would corrupt the weekly volume figure.
 */

/** Fraction of a direct set credited to an indirect (assisting) muscle. Dimensionless. */
export const INDIRECT_SET_FRACTION = 0.5;

/**
 * Closed vocabulary for muscleGroups and secondaryMuscles. These are the groups the content
 * review section 2.1 counted weekly sets for; templates.ts and the volume selectors may not
 * invent a fourteenth.
 */
export const MUSCLE_GROUPS = [
  'chest',
  'front-delt',
  'side-delt',
  'rear-delt',
  'triceps',
  'biceps',
  'lats',
  'mid-back',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
] as const;

export const EXERCISES: readonly Exercise[] = [
  // ---- horizontal and vertical pressing ----
  {
    id: 'barbell-bench-press',
    name: 'Barbell bench press',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'upper-compound',
    muscleGroups: ['chest'],
    secondaryMuscles: ['front-delt', 'triceps'],
    equipment: ['full-gym'],
    videoQuery: 'bench press perfect form jeff nippard',
    formCueId: 'barbell-bench-press',
    note: null, // legacy "Start at 65 kg" dropped: an individual literal (content review section 2.1)
  },
  {
    id: 'close-grip-bench-press',
    name: 'Close-grip bench press',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'upper-compound',
    muscleGroups: ['triceps', 'chest'],
    secondaryMuscles: ['front-delt'],
    equipment: ['full-gym'],
    videoQuery: 'close grip bench press tricep form',
    formCueId: 'close-grip-bench-press',
    note: null,
  },
  {
    id: 'overhead-press-barbell',
    name: 'Overhead press (barbell)',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'upper-compound',
    muscleGroups: ['front-delt'],
    secondaryMuscles: ['side-delt', 'triceps'],
    equipment: ['full-gym'],
    videoQuery: 'overhead press standing barbell form athlean',
    formCueId: 'overhead-press-barbell',
    note: null,
  },
  {
    id: 'push-press',
    name: 'Push press',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'upper-compound',
    // The leg drive is a brief power transfer through a shallow dip, not a working range for
    // the quadriceps, so no lower-body group is credited here.
    muscleGroups: ['front-delt'],
    secondaryMuscles: ['side-delt', 'triceps'],
    equipment: ['full-gym'],
    videoQuery: 'push press form technique jeff nippard',
    formCueId: 'push-press',
    note: null,
  },
  {
    id: 'incline-db-press',
    name: 'Incline dumbbell press',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'upper-compound',
    muscleGroups: ['chest'],
    secondaryMuscles: ['front-delt', 'triceps'],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'incline dumbbell press form jeff nippard',
    formCueId: 'incline-db-press',
    note: null,
  },
  {
    id: 'push-up',
    name: 'Push-up',
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    muscleGroups: ['chest'],
    secondaryMuscles: ['front-delt', 'triceps'],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'perfect pushup form athlean',
    formCueId: 'push-up',
    note: null, // legacy "Daily push-up sets only" dropped: a personal rule
  },
  // ---- shoulder and arm isolation ----
  {
    id: 'lateral-raise',
    name: 'Lateral raise',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'dumbbell',
    loadClass: 'isolation',
    muscleGroups: ['side-delt'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'lateral raises perfect form jeff nippard',
    formCueId: 'lateral-raise',
    note: null,
  },
  {
    id: 'triceps-overhead-extension',
    name: 'Overhead triceps extension',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'dumbbell',
    loadClass: 'isolation',
    muscleGroups: ['triceps'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'overhead tricep extension long head form',
    formCueId: 'triceps-overhead-extension',
    // One dumbbell held in both hands, or a cable rope. Load steps follow the dumbbell-pair
    // setting (kg per pair), which over-estimates the step for a single bell; the effect is a
    // larger suggested increment, which P4's guard turns into "extend reps" -- the safe
    // direction.
    note: 'One dumbbell held in both hands, or a cable rope.',
  },
  {
    id: 'barbell-curl',
    name: 'Barbell curl',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'barbell',
    loadClass: 'isolation',
    muscleGroups: ['biceps'],
    secondaryMuscles: [],
    equipment: ['full-gym'],
    videoQuery: 'barbell bicep curl form jeff nippard',
    formCueId: 'barbell-curl',
    note: null,
  },
  {
    id: 'hammer-curl',
    name: 'Hammer curl',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'dumbbell',
    loadClass: 'isolation',
    muscleGroups: ['biceps'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'hammer curl brachialis form',
    formCueId: 'hammer-curl',
    note: null,
  },
  // ---- pulling ----
  {
    id: 'pull-up',
    name: 'Pull-up',
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    muscleGroups: ['lats'],
    secondaryMuscles: ['biceps', 'mid-back'],
    equipment: ['full-gym', 'bodyweight'],
    videoQuery: 'perfect pullup form jeff nippard',
    formCueId: 'pull-up',
    note: null,
  },
  {
    id: 'lat-pulldown',
    name: 'Lat pulldown',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'machine',
    loadClass: 'upper-compound',
    muscleGroups: ['lats'],
    secondaryMuscles: ['biceps', 'mid-back'],
    equipment: ['full-gym'],
    videoQuery: null, // the legacy combined entry carried only the pull-up search string
    formCueId: 'lat-pulldown',
    note: null,
  },
  {
    id: 'weighted-pull-up',
    name: 'Weighted pull-up',
    isBodyweight: false,
    isCompoundPrimary: true,
    // External load hangs from a belt or between the feet, so there is no plate step to
    // quantise against: units.ts stepFor() returns 0 kg for modality "bodyweight". P4 must
    // treat a zero step as "no quantisation" rather than dividing by it.
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    muscleGroups: ['lats'],
    secondaryMuscles: ['biceps', 'mid-back'],
    equipment: ['full-gym', 'bodyweight'],
    videoQuery: 'weighted pullup form progression',
    formCueId: 'weighted-pull-up',
    note: 'External load added by belt or dumbbell.',
  },
  {
    id: 'barbell-row-pendlay',
    name: 'Barbell row (Pendlay)',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'upper-compound',
    muscleGroups: ['mid-back', 'lats'],
    secondaryMuscles: ['biceps', 'rear-delt'],
    equipment: ['full-gym'],
    videoQuery: 'pendlay row form technique',
    formCueId: 'barbell-row-pendlay',
    note: null,
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'upper-compound',
    muscleGroups: ['mid-back', 'lats'],
    secondaryMuscles: ['biceps', 'rear-delt'],
    equipment: ['full-gym'],
    // Ported from the legacy "Barbell row (heavier)" entry (P7 migration maps that legacy name
    // to this id). Only the search string carries over; the legacy cue's cheat-rep permission
    // is replaced by the strict standard in P4.
    videoQuery: 'barbell row form heavy science',
    formCueId: 'barbell-row',
    note: null,
  },
  {
    id: 'db-single-arm-row',
    name: 'Single-arm dumbbell row',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'upper-compound',
    muscleGroups: ['mid-back', 'lats'],
    secondaryMuscles: ['biceps'],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'single arm dumbbell row form meadows',
    formCueId: 'db-single-arm-row',
    note: null,
  },
  {
    id: 'face-pull',
    name: 'Face pull',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'cable',
    loadClass: 'isolation',
    muscleGroups: ['rear-delt'],
    secondaryMuscles: ['mid-back'],
    equipment: ['full-gym'],
    videoQuery: 'face pulls athlean rear delt form',
    formCueId: 'face-pull',
    note: null, // legacy "Mandatory, every Pull day, forever" dropped: a personal rule
  },
  // ---- lower body ----
  {
    id: 'barbell-back-squat',
    name: 'Barbell back squat',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'lower-compound',
    muscleGroups: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: ['full-gym'],
    videoQuery: 'back squat form squat university',
    formCueId: 'barbell-back-squat',
    note: null, // legacy "60% of previous max" dropped: undefined for a new user
  },
  {
    id: 'leg-press',
    name: 'Leg press',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'machine',
    loadClass: 'lower-compound',
    muscleGroups: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: ['full-gym'],
    videoQuery: null, // the legacy combined entry carried only the Bulgarian search string
    formCueId: 'leg-press',
    note: null,
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian split squat',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'lower-compound',
    muscleGroups: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'bulgarian split squat form jeff nippard',
    formCueId: 'bulgarian-split-squat',
    note: 'Rear foot elevated. Unloaded when no dumbbells are available. Log the load as 0.', // legacy "Bulgarian from wk 5" dropped: a personal schedule
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian deadlift',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'lower-compound',
    muscleGroups: ['hamstrings'],
    secondaryMuscles: ['glutes'],
    equipment: ['full-gym'],
    videoQuery: 'romanian deadlift form jeff nippard',
    formCueId: 'romanian-deadlift',
    note: null,
  },
  {
    id: 'trap-bar-deadlift',
    name: 'Trap-bar deadlift',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'lower-compound',
    // The handles sit in line with the body, so the shank angle and knee excursion are larger
    // than in a conventional pull: quadriceps are a direct mover here, assisting there.
    muscleGroups: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    equipment: ['full-gym'],
    videoQuery: 'trap bar deadlift vs conventional biomechanics',
    formCueId: 'trap-bar-deadlift',
    note: null, // legacy "Conventional from wk 9. Always first." dropped: a personal schedule
  },
  {
    id: 'conventional-deadlift',
    name: 'Conventional deadlift',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'lower-compound',
    muscleGroups: ['hamstrings', 'glutes'],
    secondaryMuscles: ['quads'],
    equipment: ['full-gym'],
    videoQuery: 'trap bar deadlift vs conventional biomechanics', // one legacy entry, both halves
    formCueId: 'conventional-deadlift',
    note: null,
  },
  {
    id: 'leg-curl-machine',
    name: 'Leg curl (machine)',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'machine',
    loadClass: 'isolation',
    muscleGroups: ['hamstrings'],
    secondaryMuscles: [],
    equipment: ['full-gym'],
    videoQuery: 'lying leg curl form hamstring',
    formCueId: 'leg-curl-machine',
    note: null,
  },
  {
    id: 'calf-raise',
    name: 'Calf raise',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'machine',
    loadClass: 'isolation',
    muscleGroups: ['calves'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'calf raise form jeff nippard',
    formCueId: 'calf-raise',
    note: 'Machine, dumbbells in hand, or bodyweight on a step.',
  },
  // ---- trunk ----
  {
    id: 'plank',
    name: 'Plank',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight',
    loadClass: 'isolation',
    muscleGroups: ['abs'], // the target of the hold, not a stabiliser role
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'plank perfect form athlean',
    formCueId: 'plank',
    note: null,
  },
  {
    id: 'ab-wheel-rollout',
    name: 'Ab wheel rollout',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight',
    loadClass: 'isolation',
    muscleGroups: ['abs'],
    secondaryMuscles: [],
    equipment: ['full-gym'], // needs a wheel; not assumed present in a home setting
    videoQuery: 'ab wheel rollout form athlean',
    formCueId: 'ab-wheel-rollout',
    note: null,
  },
  {
    id: 'hanging-knee-raise',
    name: 'Hanging knee raise',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight',
    loadClass: 'isolation',
    muscleGroups: ['abs'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'bodyweight'], // needs a bar, which the bodyweight setting also assumes for pull-ups
    videoQuery: 'hanging knee raise form abs',
    formCueId: 'hanging-knee-raise',
    note: null,
  },
  // ---- conditioning: prescribed by duration, so no sets are counted ----
  {
    id: 'rower-intervals',
    name: 'Rower intervals',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight', // ergometer damper is not a plate step; stepFor() returns 0 kg
    loadClass: 'isolation', // loadClass drives rest and progression, neither of which applies
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ['full-gym'],
    videoQuery: 'rowing machine perfect form technique drive',
    formCueId: 'rower-intervals',
    note: '1 min hard / 2 min easy.', // [min] work and recovery, ported verbatim
  },
  {
    id: 'stair-climber',
    name: 'Stair climber',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight',
    loadClass: 'isolation',
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ['full-gym'],
    videoQuery: null, // the legacy entry carried no search string
    formCueId: 'stair-climber',
    note: 'Steady moderate.',
  },
  {
    id: 'walk',
    name: 'Walk',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight',
    loadClass: 'isolation',
    muscleGroups: [],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: null, // the legacy entry carried no search string
    formCueId: 'walk',
    note: 'Optional.',
  },
];

/**
 * Id-keyed view of the same objects (master plan amendment P3-10 / P4-15: library.ts exports
 * both the readonly array and the keyed map, so no consumer rebuilds one from the other).
 * Identity is preserved: EXERCISE_BY_ID[id] is the very object in EXERCISES.
 */
export const EXERCISE_BY_ID: Readonly<Record<string, Exercise>> = Object.freeze(
  Object.fromEntries(EXERCISES.map((e) => [e.id, e])),
);

/**
 * The contract P4's src/content/formCues.ts must satisfy: its keys are exactly these ids.
 * P4 must also apply the content review section 6 corrections before shipping the cue text:
 * delete the weighted-pull-up "5-7 bodyweight pull-ups" equivalence (UNSUPPORTED); delete
 * "knee push-ups ... don't transfer well" (contradicted by Ebben 2011); replace the leg-press
 * "STOP at 90 degrees" cap with the lumbar-flexion limit; delete "Locking knees fully at the
 * top -> joint stress" (UNSUPPORTED); soften "Knees caving inward -> ACL strain"; mark the
 * push-press "~20% more weight", the stair-climber "~30% fewer calories" and the rower
 * "legs do 60%" as COULD NOT VERIFY or drop the numbers; gate the squat Valsalva cue behind a
 * contraindication note; and write barbell-row to the strict standard with no cheat permission.
 */
export const FORM_CUE_IDS: readonly string[] = EXERCISES.flatMap((e) =>
  e.formCueId === null ? [] : [e.formCueId],
);

/**
 * Rest interval before the next set. Single source for the whole app: P4's defaultRestS()
 * delegates here so the table cannot drift into two copies (master plan section 6.3/6.5).
 *
 * Content review section 9, lower bound of each verified band:
 *   heavy multi-joint compound (<= 6 reps)  180-300 s -> 180 s
 *   moderate compound (6-12 reps)           120-180 s -> 120 s
 *   single-joint isolation, machine          60-90 s  ->  90 s
 * Sources verified in that section: de Salles BF et al. (2009), Sports Med 39(9):765-777,
 * DOI 10.2165/11315230-000000000-00000 (3-5 min at 50-90% 1RM); Grgic J et al. (2018),
 * Sports Med 48(1):137-151, DOI 10.1007/s40279-017-0788-x (> 2 min to maximise strength in
 * trained individuals); Schoenfeld BJ et al. (2016), J Strength Cond Res 30(7):1805-1812,
 * DOI 10.1519/JSC.0000000000001272 (3 min beat 1 min for 1RM squat, 1RM bench and
 * anterior-thigh thickness over 8 weeks).
 *
 * The rejected 30-60 s "hypertrophy rest" default is never returned: its case rested on an
 * acute growth-hormone surrogate, and the direct longitudinal test above found 1 min worse.
 *
 * HONEST LIMIT, quoted from the review: "the literature stratifies rest by load and goal, not
 * by exercise type. The multi-joint/single-joint mapping above is an engineering heuristic
 * onto the load ranges actually tested -- INSUFFICIENT EVIDENCE for exercise-type
 * stratification per se." ACSM 2026 found no strength effect of short versus long rest; the
 * reconciliation is that rest acts through volume-load, not as an independent stimulus, so
 * long rest on heavy compounds costs only clock time.
 *
 * A prescription with no rep range (amrap, time, duration, none) falls to the moderate
 * compound default, because its rep count is unknown and 120 s is the conservative choice.
 *
 * @returns rest duration in seconds [s]
 */
export function restSFor(ex: Exercise, prescription: Prescription): Seconds {
  if (ex.loadClass === 'isolation') return 90; // [s]
  if (prescription.kind === 'reps' && prescription.hi <= 6) return 180; // [s]
  return 120; // [s]
}
