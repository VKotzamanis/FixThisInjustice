import type { Exercise, Prescription, Seconds } from '../types';

/**
 * Exercise library, ported from the legacy `data.js` day tables (names, video search strings,
 * operational notes) and the `console-content.js` FORM_CUES keys (cue ids). Generic only: no
 * personal literal, no medication, no location. Nothing is invented -- where the legacy file
 * carried no video search string, `videoQuery` is null and P4 hides the video control.
 *
 * Ids are the 40 canonical slugs listed in master plan section 5: the 31 legacy ports, the seven
 * equipment-tier exercises the Task 3 review added, and two more (chin-up, bench-dip) from the
 * section 5 rulings, so the dumbbells-only and bodyweight tiers reach every declared muscle they
 * can reach at all. P4's src/content/formCues.ts is keyed by the same slugs, so
 * `formCueId === id` for every exercise that has a cue; a rename here that is not mirrored
 * there fails the FORM_CUE_IDS test rather than silently losing the cue. The nine added
 * exercises have no legacy cue and no legacy search string, so they carry `formCueId: null`
 * (P4 writes the cues) and a plain "<name> form" `videoQuery` -- invented text is confined to
 * that one mechanical pattern, which library.test.ts asserts character for character.
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
 * DIRECT-MOVER RULE (master plan section 5; a HEURISTIC, written out here so every row below
 * can be audited against it). The Pelland report fixes the 1.0/0.5 weights, not which muscle
 * earns which, so the assignment is stated rather than assumed. Three cases, and every muscle
 * falls in exactly one of them:
 *
 *   DIRECT (`muscleGroups`, 1.0 set) -- a prime mover of the lift, working through a large
 *     range of motion under load. It is what the set is FOR.
 *   SECONDARY (`secondaryMuscles`, INDIRECT_SET_FRACTION) -- assists the prime mover
 *     dynamically: it shortens and lengthens under load through the working range, but either
 *     it is not the prime mover, or its net length change is small.
 *   NEITHER (listed nowhere) -- an isometric stabiliser, which resists motion instead of
 *     producing it: erector spinae in a squat or deadlift, abdominals in a standing press,
 *     forearm flexors in a row, rotator cuff in any press. These earn no set credit at all.
 *
 * Applied to the lower body the rule sorts the lifts into THREE FAMILIES, named and populated
 * by master plan section 5. `library.test.ts` asserts each family membership, so a future re-tag
 * that breaks the rule fails a test rather than silently shifting the weekly volume figure:
 *
 *   HIP-DOMINANT -- large hip range, knee angle roughly held
 *     conventional-deadlift, romanian-deadlift, db-romanian-deadlift (section 5 lists the
 *     nordic-hamstring-curl here too; see the exception below)
 *     -> glutes AND hamstrings DIRECT, quads SECONDARY WHERE LOADED. Quads are loaded in the
 *        conventional pull only, where the shank is inclined and the knee extends off the floor;
 *        the Romanian variants hold the knee, so quads are listed nowhere in those rows.
 *   HIP-DOMINANT HYBRID -- large hip range WITH substantial knee excursion
 *     trap-bar-deadlift, bulgarian-split-squat
 *     -> quads AND glutes DIRECT, hamstrings SECONDARY. The hamstrings produce a real
 *        hip-extension moment, but the knee extends at the same time, so their net length
 *        change is small: assisting mover, not prime mover.
 *   KNEE-DOMINANT -- large knee range, torso comparatively upright
 *     barbell-back-squat, leg-press, goblet-squat
 *     -> quads DIRECT, glutes AND hamstrings SECONDARY. Same hamstring argument as above, plus
 *        the hip range is smaller than in any hinge.
 *
 * THE ONE EXCEPTION, stated rather than reconciled away: section 5 lists nordic-hamstring-curl
 * among the hip-dominant lifts, but the family rule cannot be applied to it as written. The
 * movement is resisted knee FLEXION at a fixed hip; there is no hip-extension range to credit, so
 * the row carries hamstrings DIRECT and no glutes, where every other hip-dominant lift carries
 * both. Tagging its glutes direct to match the family would credit a muscle that does not
 * lengthen or shorten through the movement. The row is therefore tagged by the rule (prime mover
 * through a large range under load) rather than by the family label, and library.test.ts's
 * hip-dominant assertions cover the three hinges only.
 *
 * This is an engineering judgement inside a cited counting rule, not a published table.
 *
 * The conditioning entries (rower-intervals, stair-climber, walk) carry NO muscle groups on
 * purpose: fractional set counting is a resistance-training construct and these are prescribed
 * by duration, so counting sets for them would corrupt the weekly volume figure.
 *
 * EQUIPMENT TIERS NEST (master plan section 5): bodyweight is a subset of dumbbells-only, which
 * is a subset of full-gym. `equipment` therefore lists every tier an exercise is available in,
 * not the minimum one: a bodyweight exercise carries all three tags, a dumbbell exercise
 * carries `dumbbells-only` and `full-gym`. library.test.ts asserts the closure directly (a row
 * tagged `bodyweight` must also carry the other two; a row tagged `dumbbells-only` must also
 * carry `full-gym`), so a one-tag row is a test failure rather than an exercise that silently
 * vanishes from the tier that owns the equipment.
 *
 * `isBodyweight` is a LOAD question and `equipment` is an AVAILABILITY question; they are not
 * the same axis. Four rows are bodyweight-modality yet full-gym only, each because the movement
 * needs apparatus a home setting cannot assume: weighted-pull-up (plates or a belt),
 * ab-wheel-rollout (a wheel), rower-intervals and stair-climber (ergometers).
 *
 * TIER COVERAGE by DIRECT movers, D = at least one direct exercise, s = secondary work only,
 * "." = no stimulus at all. Recomputed as a test in library.test.ts; printed here so a reviewer
 * sees the gap without running it.
 *
 *   muscle        full-gym   dumbbells-only   bodyweight
 *   chest            D             D              D
 *   front-delt       D             D              D
 *   side-delt        D             D              s   <- secondary only; see below
 *   rear-delt        D             D              s   <- secondary only; see below
 *   triceps          D             D              D   <- bench-dip closed this
 *   biceps           D             D              D   <- chin-up closed this
 *   lats             D             D              D
 *   mid-back         D             D              D
 *   quads            D             D              D
 *   hamstrings       D             D              D
 *   glutes           D             D              D
 *   calves           D             D              D
 *   abs              D             D              D
 *
 * The bodyweight column is the honest limit of an unloaded tier and is reported, not papered
 * over. Two groups have no direct row there and the generator reports both as maintenance-only
 * (master plan section 5):
 *   side delt -- no unloaded exercise abducts the humerus against gravity through a working
 *     range; the load has to be in the hand. It is worked as an assisting mover by the pike
 *     push-up, which is a correction to the older "no side-delt stimulus at all" wording in
 *     section 5: the same section's ruling that every overhead press carries side-delt as a
 *     secondary mover names the pike push-up explicitly, and that press is in this tier.
 *   rear delt -- assisting work only, from inverted-row and chin-up. A direct option would need
 *     a fly or a face-pull, and both need external load or a cable.
 * The two gaps that closed did so by adding an exercise, not by re-tagging one: chin-up gives
 * the tier direct biceps work and bench-dip direct triceps work. Both facts are encoded as
 * explicit exception sets in the tests, so closing a gap later means deleting an exception
 * rather than editing an assertion.
 */

/** Fraction of a direct set credited to an indirect (assisting) muscle. Dimensionless. */
export const INDIRECT_SET_FRACTION = 0.5;

/**
 * Closed vocabulary for muscleGroups and secondaryMuscles. PROVENANCE: the content review
 * section 2.1 weekly-set audit counted TWELVE groups -- chest, quads, hamstrings, lats, abs,
 * mid-back, front delt, triceps, biceps, calves, rear delt, side delt. `glutes` is the
 * thirteenth and is added HERE, not by the review: the hinge lifts need a hip-extension group
 * of their own or their direct sets would have to be credited to the hamstrings, which would
 * both over-count hamstring volume and hide a gap in glute volume. templates.ts and the volume
 * selectors may not invent a fourteenth.
 */
export const MUSCLE_GROUPS = Object.freeze([
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
] as const);

/**
 * Deep-freeze one exercise: the object AND each of its three arrays. The library is a shared
 * module-level constant that P3/P4 selectors read on every render, so a consumer that pushed
 * onto `muscleGroups` would corrupt every later volume count in the session with no error
 * raised at the point of damage. Frozen IN PLACE and returned, so `EXERCISE_BY_ID[id]` is still
 * the identical object held by EXERCISES.
 */
function freezeExercise(e: Exercise): Exercise {
  Object.freeze(e.muscleGroups);
  Object.freeze(e.secondaryMuscles);
  Object.freeze(e.equipment);
  return Object.freeze(e);
}

const EXERCISE_TABLE: Exercise[] = [
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
    id: 'db-overhead-press',
    name: 'Dumbbell overhead press',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'upper-compound',
    muscleGroups: ['front-delt'],
    // side-delt matches overhead-press-barbell and push-press: master plan section 5 rules that
    // every overhead press carries it as a secondary mover, because the humerus abducts under
    // load while the front delt drives the press. Its absence here was an omission, not a
    // judgement, and it under-counted side-delt volume in the dumbbells-only tier.
    secondaryMuscles: ['side-delt', 'triceps'],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'dumbbell overhead press form',
    formCueId: null, // P4 writes the cue; no legacy cue object exists for this id
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
  {
    id: 'pike-push-up',
    name: 'Pike push-up',
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    // The bodyweight tier's only front-delt direct work. Hips high, torso near vertical, so the
    // press is overhead rather than horizontal -- that is what moves the front delt from
    // secondary (push-up) to prime mover here.
    muscleGroups: ['front-delt'],
    // Same overhead-press ruling as the barbell and dumbbell presses (master plan section 5).
    // This tag is the bodyweight tier's ONLY side-delt stimulus of any kind.
    secondaryMuscles: ['side-delt', 'triceps'],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'pike push-up form',
    formCueId: null,
    note: null,
  },
  {
    id: 'bench-dip',
    name: 'Bench dip',
    isBodyweight: true,
    // Multi-joint -- the elbow extends and the shoulder flexes against the body's weight -- so it
    // is classed with the close-grip bench press and NOT with the overhead extension. loadClass
    // drives the progression step and the rest interval, so this is not a taxonomy label only.
    isCompoundPrimary: true,
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    // The bodyweight tier's only direct triceps work (master plan section 5 ruling). Triceps is
    // the prime mover; the sternal chest and front delt assist through a short range, which is
    // the same split the close-grip bench press gets with the roles of chest and triceps swapped.
    muscleGroups: ['triceps'],
    secondaryMuscles: ['chest', 'front-delt'],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'bench dip form',
    formCueId: null,
    note: null,
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
    id: 'db-rear-delt-fly',
    name: 'Dumbbell rear-delt fly',
    isBodyweight: false,
    isCompoundPrimary: false,
    modality: 'dumbbell',
    loadClass: 'isolation',
    // Rear delt only. The scapular retractors are cued QUIET in a strict fly (the movement is
    // transverse abduction at the shoulder), which is what separates it from face-pull, where
    // retraction is part of the movement and mid-back is credited as an assisting mover.
    muscleGroups: ['rear-delt'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'dumbbell rear-delt fly form',
    formCueId: null,
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
    // Needs only a bar, which every tier assumes; tags nest, so all three (was missing
    // dumbbells-only, which hid the pull-up from that tier entirely).
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'perfect pullup form jeff nippard',
    formCueId: 'pull-up',
    note: null,
  },
  {
    id: 'chin-up',
    name: 'Chin-up',
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    // Biceps DIRECT, which is what separates this row from the pull-up (master plan section 5
    // ruling). The supinated grip puts the elbow flexors in line with the pull, so they shorten
    // through the full range as prime movers rather than assisting the lats. It is the bodyweight
    // tier's only direct biceps work. Rear delt assists the shoulder extension, as in every
    // vertical pull.
    muscleGroups: ['biceps', 'lats'],
    secondaryMuscles: ['rear-delt'],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'chin-up form',
    formCueId: null,
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
    // TRUE, and deliberately so. The body is the base resistance and the belt-hung plate is an
    // increment on top of it, exactly as for a weighted dip; `isBodyweight` answers "what is
    // being lifted", not "is any external load present". It was false before the Task 3 review,
    // which contradicted `modality: 'bodyweight'` two lines down and would have made P4 offer a
    // plate-quantised load entry for a lift that has no plate step.
    isBodyweight: true,
    isCompoundPrimary: true,
    // External load hangs from a belt or between the feet, so there is no plate step to
    // quantise against: units.ts stepFor() returns 0 kg for modality "bodyweight". P4 must
    // treat a zero step as "no quantisation" rather than dividing by it.
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    muscleGroups: ['lats'],
    secondaryMuscles: ['biceps', 'mid-back'],
    // full-gym ONLY, and this is the exception to the "bodyweight modality gets all three tiers"
    // pattern: the whole point of the exercise is the added plates, which the dumbbells-only and
    // bodyweight tiers do not have. Plain pull-up covers those tiers.
    equipment: ['full-gym'],
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
    // rear-delt matches the two barbell rows: any row that pulls the elbow past the torso
    // assists shoulder transverse extension. Its absence here was an omission, not a judgement.
    secondaryMuscles: ['biceps', 'rear-delt'],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'single arm dumbbell row form meadows',
    formCueId: 'db-single-arm-row',
    note: null,
  },
  {
    id: 'inverted-row',
    name: 'Inverted row',
    isBodyweight: true,
    isCompoundPrimary: true,
    modality: 'bodyweight',
    loadClass: 'upper-compound',
    // The bodyweight tier's only mid-back direct work, and its only rear-delt stimulus of any
    // kind. Same muscle map as the barbell rows because it is the same movement pattern with
    // the body as the load.
    muscleGroups: ['mid-back', 'lats'],
    secondaryMuscles: ['rear-delt', 'biceps'],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'inverted row form',
    formCueId: null,
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
    // KNEE-DOMINANT family: quads direct, glutes and hamstrings secondary.
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
    // KNEE-DOMINANT family: quads direct, glutes and hamstrings secondary.
    muscleGroups: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: ['full-gym'],
    videoQuery: null, // the legacy combined entry carried only the Bulgarian search string
    formCueId: 'leg-press',
    note: null,
  },
  {
    id: 'goblet-squat',
    name: 'Goblet squat',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'lower-compound',
    // KNEE-DOMINANT family, named as such by master plan section 5: quads direct, glutes AND
    // hamstrings secondary. Tagged identically to the back squat and leg press because the rule
    // keys on the movement pattern, not the implement.
    muscleGroups: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'goblet squat form',
    formCueId: null,
    note: null,
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian split squat',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'lower-compound',
    // HIP-DOMINANT HYBRID family: the front hip travels a long way, the front knee flexes deeply
    // -- quads and glutes are both prime movers, hamstrings assist.
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
    // HIP-DOMINANT family: the knee angle is held while the hip travels through its full range,
    // so glutes and hamstrings are both prime movers. Glutes were secondary before the Task 3
    // review; that under-counted glute volume by 0.5 set on every RDL set in the plan.
    muscleGroups: ['hamstrings', 'glutes'],
    secondaryMuscles: [],
    equipment: ['full-gym'],
    videoQuery: 'romanian deadlift form jeff nippard',
    formCueId: 'romanian-deadlift',
    note: null,
  },
  {
    id: 'db-romanian-deadlift',
    name: 'Dumbbell Romanian deadlift',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'dumbbell',
    loadClass: 'lower-compound',
    // HIP-DOMINANT family, tagged identically to the barbell Romanian deadlift.
    muscleGroups: ['hamstrings', 'glutes'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only'],
    videoQuery: 'dumbbell romanian deadlift form',
    formCueId: null,
    note: null,
  },
  {
    id: 'trap-bar-deadlift',
    name: 'Trap-bar deadlift',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'barbell',
    loadClass: 'lower-compound',
    // HIP-DOMINANT HYBRID family. The handles sit in line with the body, so the shank angle and
    // knee excursion are larger than in a conventional pull: quadriceps are a direct mover here,
    // assisting there. Glutes are direct in both.
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
    // HIP-DOMINANT family: glutes and hamstrings direct. Quads are secondary here and absent
    // from the Romanian variants, because the shank is inclined and the knee extends off the
    // floor -- a real but assisting contribution.
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
    id: 'nordic-hamstring-curl',
    name: 'Nordic hamstring curl',
    isBodyweight: true,
    isCompoundPrimary: false,
    modality: 'bodyweight',
    loadClass: 'isolation',
    // The bodyweight tier's only hamstring direct work: knee flexion against bodyweight, the
    // unloaded counterpart of leg-curl-machine. Needs the ankles anchored (a partner or a
    // loaded barbell); that is a setup constraint, not equipment a tier can lack, so all three
    // tiers are tagged. P4's cue must carry the eccentric-only entry point -- the concentric is
    // beyond most novices and this is the single most common way the movement is done wrong.
    muscleGroups: ['hamstrings'],
    secondaryMuscles: [],
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
    videoQuery: 'nordic hamstring curl form',
    formCueId: null,
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
    // Needs a bar, which every tier assumes for pull-ups; tags nest, so all three.
    equipment: ['full-gym', 'dumbbells-only', 'bodyweight'],
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
 * The library. Deep-frozen: the array, every exercise object, and every exercise's
 * `muscleGroups`, `secondaryMuscles` and `equipment` array. `readonly Exercise[]` is a
 * compile-time promise only, and P3/P4/P8 all hold this array across renders, so the runtime
 * guard is what actually stops an accidental in-place sort or push. Mutation throws a TypeError
 * under ES-module strict mode, which is every file in this project.
 */
export const EXERCISES: readonly Exercise[] = Object.freeze(EXERCISE_TABLE.map(freezeExercise));

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
export const FORM_CUE_IDS: readonly string[] = Object.freeze(
  EXERCISES.flatMap((e) => (e.formCueId === null ? [] : [e.formCueId])),
);

/**
 * Rest interval before the next set. Single source for the whole app: P4's defaultRestS()
 * delegates here so the table cannot drift into two copies (master plan section 6.3/6.5).
 *
 * Content review section 9. The two compound rows take the LOWER bound of their verified band;
 * the isolation row takes the UPPER bound of its band, and the asymmetry is deliberate:
 *   heavy multi-joint compound (<= 6 reps)  180-300 s -> 180 s (lower bound)
 *   moderate compound (6-12 reps)           120-180 s -> 120 s (lower bound)
 *   single-joint isolation, machine          60-90 s  ->  90 s (UPPER bound)
 * Master plan section 6.3 fixes the isolation default at 90 s, so this file returns 90 and not
 * 60. Taking the lower bound on the compounds keeps the session clock short where the band is
 * wide and the evidence is strong; taking the upper bound on isolation costs 30 s per set and
 * keeps every returned value at or above the 90 s floor the "never returns 30-60 s" test
 * asserts. A 60 s isolation default would sit inside the rejected band's range.
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
 * `{ kind: "none" }` is included in that list: it is the prescription P4 uses for a set with no
 * target at all, and an unknown rep count is treated the same way whatever its cause.
 *
 * A COMPOUND ABOVE 12 REPS also returns 120 s, and that is a documented extrapolation, not a
 * table lookup. The review's bands stop at 12 reps; there is no verified row for a 15-rep or
 * 20-rep compound. The function returns the moderate-compound 120 s rather than inventing a
 * shorter row, on the same reasoning as the rejected 30-60 s default below: a set that is
 * longer under tension is not evidence for LESS recovery, and the cost of being wrong in this
 * direction is clock time only.
 *
 * @returns rest duration in seconds [s]
 */
export function restSFor(ex: Exercise, prescription: Prescription): Seconds {
  if (ex.loadClass === 'isolation') return 90; // [s]
  if (prescription.kind === 'reps' && prescription.hi <= 6) return 180; // [s]
  return 120; // [s]
}
