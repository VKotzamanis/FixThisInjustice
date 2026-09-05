/**
 * Form cues, ported from the legacy `console-content.js` FORM_CUES with every correction the
 * content peer review section 6 required.
 *
 * KEYED BY `Exercise.id`, NEVER BY NAME. The legacy object was keyed by display name and one key
 * drifted (`"Leg press -> Bulgarian split"` in `data.js` against
 * `"Leg press -> Bulgarian split squat"` here), so that exercise silently had no cues at all:
 * 29 exercises, 29 cue objects, 28 resolving (content review section 6, last row). Master plan
 * section 5 fixes `formCueId === id`, and `formCues.test.ts` asserts
 * `Object.keys(FORM_CUES)` equals `FORM_CUE_IDS` in both directions, so a rename in
 * `src/domain/plan/library.ts` that is not mirrored here fails a test rather than losing a cue.
 *
 * PORT MAP, legacy name -> id. Three legacy entries describe two exercises each in bracketed
 * halves and are split, because a generic library has one id per movement; the rest-day
 * pseudo-entry is dropped because it is not an exercise:
 *   "Pull-ups (or lat pulldown)"         -> pull-up, lat-pulldown
 *   "Leg press -> Bulgarian split squat" -> leg-press, bulgarian-split-squat
 *   "Trap bar DL -> conventional"        -> trap-bar-deadlift, conventional-deadlift
 *   "Barbell row (heavier)"              -> barbell-row (rewritten; see that entry)
 *   "No training"                        -> dropped
 * 28 legacy cue objects therefore produce the 31 ids the library lists in `FORM_CUE_IDS`. The
 * nine equipment-tier exercises added after the P2 Task 3 review carry `formCueId: null` and no
 * cue here; adding one means adding the id there in the same change.
 *
 * WHAT WAS CHANGED IN THE PORT:
 *   1. Every correction the content review section 6 demanded (see the per-entry comments).
 *   2. Em-dash and arrow connectors replaced by a colon, a comma or two sentences, and the
 *      "->" mistake arrows expanded into sentences (copy contract R5; cues are exempt from the
 *      length limits under R10, not from R5).
 *   3. Tone normalised to the master plan section 3 constraint: no hype, no superlatives, no
 *      shouting capitals, no emoji. "brutally effective per joule of effort", "the king of
 *      upper-body strength" and "the hardest ab exercise that exists" are gone; "per joule" is
 *      also not a quantity this literature reports (content review section 5, c002).
 *   4. Personal, medication and stimulant text: none survived into the cue library (the legacy
 *      instances were in `data.js` and the specimen cards, content review section 7), and
 *      `formCues.test.ts` asserts none is reintroduced.
 *   5. THREE CUE LINES HAVE NO LEGACY ANTECEDENT. They are listed because items 1 to 4 would
 *      otherwise read as an exhaustive account of the differences, and a reader checking the
 *      port against `legacy/console-content.js` would find text that items 1 to 4 do not
 *      explain. None of the three carries a number, a citation or a claim of effect:
 *        leg-press setup, "Brace before releasing the safeties." The legacy setup line it sits
 *        in place of ("Brace core. Stand tall.") was assigned to the Bulgarian half of the same
 *        split entry, so the safety-catch instruction is new.
 *        bulgarian-split-squat execution, "Descend until the front thigh is at least parallel."
 *        The legacy entry prescribed no depth for this exercise.
 *        stair-climber setup, "Stand centred on the steps with the hands off the rails." The
 *        legacy entry had ONE setup line and `formCues.test.ts` requires two, so this entry is
 *        padded; the added line restates the rail advice the same entry already carries in its
 *        mistakes and tip rather than introducing a new instruction.
 *
 * NO NEW CITATION IS INTRODUCED HERE. The one claim carrying a name (trap bar, Swinton 2011) is
 * the one the content review itself verified while correcting card u006.
 */

export interface FormCue {
  setup: string[];
  execution: string[];
  mistakes: string[];
  tip: string | null;
  /** Safety note gated on the pre-participation screen; rendered as a warning by P4 Task 8. */
  caution: string | null;
}

/**
 * Content peer review section 6, first row: the legacy programme prescribed heavy barbell work
 * with no warm-up protocol, no readiness screening, no injury-history intake and no
 * contraindication language anywhere (a grep for `warm.?up|par-?q|physician|contraindic|screen`
 * across all four reviewed files returned zero hits). The review requires both a warm-up
 * protocol and a pre-participation screen but supplies no sourced protocol, and the global
 * constraints forbid shipping an unsourced number. This notice therefore states the requirement
 * without prescribing sets, loads or durations; `formCues.test.ts` asserts it carries no digit.
 * A sourced protocol is requested as a P2 amendment.
 */
export const WARMUP_NOTICE =
  'Warm up before the first working set of each compound lift: general aerobic work, then progressively loaded ramp-up sets. Seek medical clearance before training if you have a cardiovascular, metabolic or renal condition, or symptoms that suggest one.';

export const FORM_CUES: Record<string, FormCue> = {
  'barbell-bench-press': {
    setup: [
      'Eyes under the bar. Shoulder blades squeezed together and down toward the back pockets.',
      'Feet flat, slight arch in the lower back, glutes in contact with the bench throughout.',
      'Grip just outside shoulder width, forearms vertical at the bottom.',
    ],
    execution: [
      'Pull the bar out of the rack rather than pressing it up. Hold it locked.',
      'Lower under control to the lower chest and touch lightly.',
      'Drive the feet into the floor and press in a slight arc up and back toward the rack.',
    ],
    mistakes: [
      'Elbows flared to 90 degrees from the torso: shoulder impingement risk. Tuck to about 70.',
      'Bouncing the bar off the chest: pause briefly instead.',
      'Lower back flat and glutes off the bench: loses leg drive and shoulder position.',
      'Bar drifting up the chest during the press: press up and back.',
    ],
    tip: 'If the shoulders fatigue before the chest, the scapulae are not retracted enough.',
    caution: null,
  },

  'overhead-press-barbell': {
    setup: [
      'Bar in the front rack on the shelf of the upper chest, elbows under the bar, wrists straight.',
      'Stance hip-width, glutes and abdominals braced. Rib cage stacked over the pelvis.',
      'Grip just outside the shoulders, forearms vertical when viewed from the side.',
    ],
    execution: [
      'Press straight up. As the bar passes the face, shrug and move the head through.',
      'Lock out over the mid-foot with the biceps near the ears.',
      'Lower under control to the front rack. Reset the breath each rep on heavy sets.',
    ],
    mistakes: [
      'Hyperextending the lower back: brace the abdominals and squeeze the glutes.',
      'Pushing the bar forward instead of up: the bar must travel vertically.',
      'Not shrugging at lockout: leaves the upper trapezius disengaged.',
      'Flaring the elbows wide: use roughly a 30 degree elbow angle.',
    ],
    tip: 'Think of pushing the body down past the bar rather than pushing the bar up.',
    caution: null,
  },

  'incline-db-press': {
    setup: [
      'Bench at about 30 degrees. Above 45 degrees the movement becomes a shoulder press.',
      'Feet flat. Retract the shoulder blades while sitting down.',
      'Kick the dumbbells onto the thighs, then back and down into the start position.',
    ],
    execution: [
      'Start with the arms locked, palms facing slightly inward.',
      'Lower under control with the elbows about 45 degrees from the torso.',
      'Press up and slightly together without letting the bells collide.',
    ],
    mistakes: [
      'Bench too steep: recruits the front deltoids and removes the upper chest.',
      'Elbows flared to 90 degrees: shoulder strain. Keep 45 to 60 degrees.',
      'Dumbbells drifting apart at the top: loses chest tension.',
      'Bouncing off the chest or stopping short: use the full range under control.',
    ],
    tip: 'The upper chest responds better to controlled eccentrics than to added load.',
    caution: null,
  },

  'lateral-raise': {
    setup: [
      'Dumbbells at the sides, a slight elbow bend held constant for the whole set.',
      'Lean forward slightly from the hips. Ribs stacked over the pelvis.',
      'Little fingers slightly higher than the thumbs.',
    ],
    execution: [
      'Raise the arms out to the side, leading with the elbows.',
      'Stop at shoulder height; higher trades deltoid work for trapezius.',
      'Lower slowly. The eccentric carries the stimulus.',
    ],
    mistakes: [
      'Swinging the torso: removes the deltoid work.',
      'Lifting above shoulder height: recruits the trapezius and upper back.',
      'Thumbs higher than the little fingers: internally rotates and shifts load to the front deltoid.',
      'Load too heavy for strict form.',
    ],
    tip: 'This is not a strength lift. Choose a load that allows strict repetitions across the prescribed range.',
    caution: null,
  },

  'triceps-overhead-extension': {
    setup: [
      'Hold one dumbbell with both hands cupping the top plate.',
      'Press it overhead with the elbows close to the ears and the upper arms near vertical.',
      'Ribs stacked over the pelvis, slight knee bend if standing.',
    ],
    execution: [
      'Lower the weight behind the head with the elbows tracking forward.',
      'Reach a deep stretch: the long head requires the lengthened position.',
      'Extend at the elbow only. The shoulder does not move.',
    ],
    mistakes: [
      'Elbows flaring outward: loses the long-head stretch.',
      'Stopping short of the stretch.',
      'Hyperextending the lumbar spine: anchor the torso with abdominals and glutes.',
      'Load too heavy for a small joint to control.',
    ],
    tip: 'The long head of the triceps is only loaded in the stretched position with the shoulder flexed.',
    caution: null,
  },

  // Legacy "Pull-ups (or lat pulldown)", first half of the split.
  'pull-up': {
    setup: [
      'Grip slightly wider than the shoulders, palms forward.',
      'Hang with the shoulders depressed, away from the ears.',
      'Cross the ankles or tuck the feet to prevent kipping.',
    ],
    execution: [
      'Pull the elbows down toward the ribcage.',
      'Bring the collarbone, not the chin, toward the bar.',
      'Lower under control until the elbows are fully extended.',
    ],
    mistakes: [
      'Kipping or swinging the legs: use band assistance instead.',
      'Partial repetitions from the top: no full latissimus engagement.',
      'Pulling with the biceps: drive the elbows.',
      'Shrugging at the bottom: keep the shoulders depressed.',
    ],
    tip: 'If a full repetition is not yet available, use controlled eccentrics from the top position.',
    caution: null,
  },

  // Legacy "Pull-ups (or lat pulldown)", second half of the split.
  'lat-pulldown': {
    setup: [
      'Thighs secured under the pad, feet flat.',
      'Grip slightly wider than the shoulders, palms forward.',
      'Chest up, shoulders depressed before the first repetition.',
    ],
    execution: [
      'Pull the bar to the upper chest by driving the elbows down.',
      'Hold the contracted position briefly.',
      'Return under control to a full stretch without letting the shoulders shrug.',
    ],
    mistakes: [
      'Leaning far back and turning it into a row.',
      'Pulling behind the neck: unnecessary shoulder external rotation under load.',
      'Letting the weight stack pull the shoulders up at the top.',
      'Partial range at either end.',
    ],
    tip: 'The pulldown is the load-adjustable regression of the pull-up; the movement pattern is the same.',
    caution: null,
  },

  'barbell-row-pendlay': {
    setup: [
      'Bar over the mid-foot. Hinge to a flat back with the torso parallel to the floor.',
      'Grip shoulder width, overhand. The bar resets on the floor each repetition.',
      'Brace hard. The back is flat, neither rounded nor extended.',
    ],
    execution: [
      // "Explosively" is the legacy adverb, kept: bar speed is the distinguishing feature of a
      // dead-stop row against a continuous one, and dropping it silently changed the cue.
      'Pull the bar explosively to the lower chest or upper abdomen.',
      'Pull the elbows back rather than up. Squeeze the shoulder blades together.',
      'Lower under control to the floor, pause, reset, repeat.',
    ],
    mistakes: [
      'Standing up during the pull: turns it into a partial deadlift.',
      'Pulling to the navel: loses upper-back work.',
      'Rounding the lower back: reset the position every repetition.',
      'Load too heavy for a strict movement.',
    ],
    tip: 'The dead-stop reset is what keeps the position honest between repetitions.',
    caution: null,
  },

  /*
   * REWRITTEN, not ported. Content review section 6, row "Heavy row permits cheat reps",
   * verdict WRONG (unsafe): the legacy "Barbell row (heavier)" cue read "Same as Pendlay row,
   * but you can use a slight cheat / TnT (touch-and-go)" and closed with "5-6 reps, slightly
   * cheaty TnT is fine here", which sanctions form breakdown on the heaviest loaded hip hinge
   * in the programme, for a population that includes novices, and contradicts the same cue
   * object's own "Rounding lower back -> injury" mistake line. The review's recommended change
   * is quoted in full: "Delete the permission. Keep the strict standard."
   *
   * The strict standard below is that recommendation written out (neutral spine, the hinge
   * angle held, no torso heave), NOT a new source: no citation is added, and no number that the
   * review did not verify is introduced. The legacy id `barbell-row-heavy` does not ship
   * (master plan section 5); the surviving id is `barbell-row`.
   */
  'barbell-row': {
    setup: [
      'Bar over the mid-foot. Hinge to a neutral spine at 35 to 45 degrees from horizontal, and hold that angle for the whole set.',
      'Grip shoulder width, overhand. Knees soft.',
      'Brace hard before the first repetition.',
    ],
    execution: [
      'Pull the bar to the lower chest or upper abdomen with strict form.',
      'Drive the elbows back and squeeze the shoulder blades.',
      'Lower under control. Stop the set when the torso angle starts to rise.',
    ],
    mistakes: [
      'A torso heave through the pull: the hinge angle is held, not swung.',
      'Rounding the lower back: reduce the load.',
      'Letting the bar drift forward: keep the pull line vertical.',
      'Pulling with the hands rather than driving the elbows.',
    ],
    tip: 'Stop the set at the first repetition that needs a torso heave. The strict standard applies at every load, and it applies to the heaviest row exactly as it applies to the lightest.',
    caution: null,
  },

  'db-single-arm-row': {
    setup: [
      'One knee and one hand on the bench, the other foot planted.',
      'Back flat, torso parallel to the floor.',
      'The dumbbell hangs directly below the shoulder with the arm extended.',
    ],
    execution: [
      'Pull the dumbbell toward the hip, not the chest.',
      'Drive the elbow back along the ribs.',
      'Squeeze at the top and lower slowly to a full stretch.',
    ],
    mistakes: [
      'Twisting the torso to move the weight.',
      'Pulling to chest level: the biceps take over.',
      'Rushing the eccentric.',
      'Letting the shoulder shrug at the bottom.',
    ],
    tip: 'Allow the shoulder blade to travel forward at the bottom; the stretch is what loads the latissimus.',
    caution: null,
  },

  'face-pull': {
    setup: [
      'Cable at face height with a rope attachment.',
      'Grip with the thumbs pointing back toward the body. Step back to load the cable.',
      'Staggered stance if stability is needed.',
    ],
    execution: [
      'Pull the rope to the face, not the chest.',
      'Externally rotate at the end range so the thumbs finish behind the ears.',
      'Hold the contracted position briefly, then return slowly.',
    ],
    mistakes: [
      'Pulling to the chest: becomes a horizontal row and misses the external rotators.',
      'Skipping the external rotation.',
      'Load too heavy, bringing the trapezius in.',
      'Hunching forward.',
    ],
    tip: 'Light load, high repetitions, every pulling session.',
    caution: null,
  },

  'barbell-curl': {
    setup: [
      'Feet hip width, bar at the thighs, grip shoulder width, palms up.',
      'Shoulder blades slightly retracted, elbows against the ribs.',
      'Brace to prevent torso swing.',
    ],
    execution: [
      'Curl by flexing at the elbow only.',
      'Bring the bar to the upper chest and hold briefly.',
      'Lower slowly to full extension.',
    ],
    mistakes: [
      'Swinging the torso: reduce the load.',
      'Elbows travelling forward or shoulders shrugging: recruits the front deltoid.',
      'Stopping short of full extension.',
      'Locking the wrists into extension.',
    ],
    tip: 'An EZ bar is biomechanically equivalent for the biceps and easier on the wrists.',
    caution: null,
  },

  'hammer-curl': {
    setup: [
      'Dumbbells at the sides, palms facing each other.',
      'Elbows against the ribs, standing tall.',
      'Slight knee bend, abdominals braced.',
    ],
    execution: [
      'Curl with the palms staying neutral throughout.',
      'Bring the dumbbell to shoulder height and hold briefly.',
      'Lower under control without swinging.',
    ],
    mistakes: [
      'Rotating to palms-up at the top: that is a supinated curl.',
      'Swinging the body.',
      'Stopping short of the full range.',
      'Elbows drifting forward.',
    ],
    tip: 'The neutral grip loads the brachialis and brachioradialis, which a supinated curl underworks.',
    caution: null,
  },

  /*
   * Two content review section 6 corrections land in this entry.
   *   "Valsalva without caveat" (PARTIALLY): the cue is standard practice for a heavy squat and
   *   is kept, but held-breath straining raises arterial pressure sharply, so the review
   *   requires a contraindication note gated on the screening step. That is `caution`.
   *   "Knee valgus -> ACL strain" (PARTIALLY): the coaching correction is right and is kept;
   *   the injury attribution is softened, because dynamic valgus is associated with injury in
   *   landing and cutting tasks and a squat knee cave is not evidence of ligament strain.
   */
  'barbell-back-squat': {
    setup: [
      'Bar on the mid-trapezius (low bar) or the front of the trapezius (high bar). Choose one and keep it.',
      'Stance shoulder width, toes turned out 15 to 30 degrees.',
      'Brace the abdominals. Big breath held throughout the repetition.',
    ],
    execution: [
      'Sit down and back, knees tracking over the toes.',
      'Descend to at least parallel: hip crease below the top of the knee.',
      'Drive through the whole foot and stand tall.',
    ],
    mistakes: [
      'Knees caving inward: push the knees out. Dynamic valgus is associated with knee injury in landing and cutting tasks, so correct it, but a squat knee cave is not itself evidence of ligament strain.',
      'Looking up or far forward: keep a neutral spine.',
      'Stopping above parallel.',
      'Lower back rounding at the bottom: work on hip mobility and do not descend beyond the position you can hold.',
    ],
    tip: 'Film from the side. The back angle should stay approximately constant through the lift.',
    caution:
      'The held breath raises arterial pressure sharply. Complete the pre-participation screen before training heavy with a braced breath hold, and seek medical clearance if you have hypertension or another cardiovascular risk factor.',
  },

  'romanian-deadlift': {
    setup: [
      'Bar at the hip crease, grip shoulder width.',
      'Soft knee bend, held in that position for the whole set.',
      'Shoulder blades back, chest up, abdominals braced.',
    ],
    execution: [
      'Push the hips back.',
      'Lower the bar along the thighs and shins, keeping it in contact with the body.',
      'Descend until the hamstrings reach a strong stretch, then drive the hips forward to stand.',
    ],
    mistakes: [
      'Bending the knees further during the repetition: that is a deadlift.',
      'Rounding the lower back: stop at the end of your own hamstring range.',
      'Letting the bar drift away from the body.',
      'Hyperextending at the top: stand tall with the glutes squeezed.',
    ],
    tip: 'This is a hip hinge, not a knee bend. If the knees travel forward, reset.',
    caution: null,
  },

  /*
   * Legacy "Leg press -> Bulgarian split squat", first half of the split, with two content
   * review section 6 corrections.
   *   "Leg press ROM cap": the legacy capped depth at a fixed "knees ~90 degrees ... STOP at
   *   90", which is arbitrary and contradicts the app's own card c010 on full range of motion.
   *   The real limit is lumbar flexion, which the legacy cue already named in the next line, so
   *   the fixed angle is deleted and the lumbar limit is the cue.
   *   "Never lock out" (UNSUPPORTED, gym folklore with no source offered): the joint-stress
   *   claim is deleted and restated as not slamming into extension.
   */
  'leg-press': {
    setup: [
      'Sit firmly with the lower back pressed into the pad.',
      'Feet shoulder width on the platform.',
      'Brace before releasing the safeties.',
    ],
    execution: [
      'Lower until the lower back begins to leave the pad, and no further.',
      'Drive through the whole foot.',
      'Extend without slamming into the end range.',
    ],
    mistakes: [
      'Descending past the point where the lower back peels off the pad: that is the real depth limit, not a fixed knee angle.',
      'Slamming into full extension at the top.',
      'Bouncing out of the bottom.',
      'Load too heavy to control the eccentric.',
    ],
    tip: 'Depth is limited by the lumbar spine, not by an angle read off the machine.',
    caution: null,
  },

  // Legacy "Leg press -> Bulgarian split squat", second half of the split.
  'bulgarian-split-squat': {
    setup: [
      'Rear foot elevated behind you on a bench.',
      'Front foot far enough forward that the knee tracks over the ankle at the bottom.',
      'Brace the core, stand tall.',
    ],
    execution: [
      'Lower straight down; the front knee bends and the rear leg follows.',
      'Descend until the front thigh is at least parallel.',
      'Drive through the front heel to stand.',
    ],
    mistakes: [
      'Front knee travelling far past the toes: move the front foot forward.',
      'Driving off the rear foot: that is a lunge.',
      'Torso collapsing forward.',
      'Losing balance from a stance that is too narrow.',
    ],
    tip: 'Unilateral loading exposes side-to-side differences that a bilateral squat hides.',
    caution: null,
  },

  'leg-curl-machine': {
    setup: [
      'Lying or seated. The pad sits just above the heel.',
      'Hips anchored against the pad.',
      'Choose a load that allows the full range.',
    ],
    execution: [
      'Curl the heels toward the glutes and hold the contracted position briefly.',
      'Lower slowly to a full stretch.',
      'Keep the hips down throughout.',
    ],
    mistakes: [
      'Lifting the hips off the pad to move the weight.',
      'Partial repetitions.',
      'No eccentric control.',
      'Changing ankle position between repetitions: pick dorsiflexed or plantarflexed and keep it.',
    ],
    tip: 'Knee flexion work balances the quadriceps-dominant pattern of squats and presses.',
    caution: null,
  },

  'calf-raise': {
    setup: [
      'Balls of the feet on the edge of a step or platform, heels free.',
      'Stand tall with a slight knee bend.',
      'Hold something for balance if standing.',
    ],
    execution: [
      'Rise as high as the ankle allows.',
      'Hold the top position briefly.',
      'Lower slowly until the calves reach a deep stretch.',
    ],
    mistakes: [
      'Bouncing through repetitions.',
      'Short range: the heel must drop below the platform.',
      'Bending the knees mid-repetition: shifts load from the gastrocnemius to the soleus.',
      'Load too heavy to complete the range.',
    ],
    tip: 'Range and controlled eccentrics matter more here than added load.',
    caution: null,
  },

  /*
   * Content review section 6, "Knee push-ups don't transfer" (UNSUPPORTED): the legacy tip
   * claimed knee push-ups train a different pattern and do not transfer, which is contradicted
   * by the biomechanics the app itself cites (Ebben 2011 measured the knee push-up at 49% of
   * body mass, i.e. a load regression on the same pattern). The claim is deleted. The tip below
   * names both regressions without repeating that percentage, which belongs to the specimen
   * card that cites it, not to a cue.
   */
  'push-up': {
    setup: [
      'Hands under the shoulders, slightly wider than shoulder width.',
      'Head, hips and heels in one line.',
      'Abdominals braced, glutes squeezed.',
    ],
    execution: [
      'Lower until the chest is just off the floor.',
      'Elbows about 45 degrees from the torso, not flared to 90.',
      'Press up and lock out the arms.',
    ],
    mistakes: [
      'Hips sagging: brace harder.',
      'Hips high: reduces the load.',
      'Elbows flared to 90 degrees.',
      'Partial repetitions.',
    ],
    tip: 'To regress, elevate the hands on a bench, or drop to the knees; both are load regressions of the same movement pattern and both transfer.',
    caution: null,
  },

  /*
   * Legacy "Trap bar DL -> conventional", first half of the split. The legacy tip claimed
   * "lower spine shear"; content review section 6 and card u006 establish that Swinton PA et al.
   * (2011), J Strength Cond Res 25(7):2000-2009, DOI 10.1519/JSC.0b013e3181e73f87, PMID 21659894
   * reported peak MOMENTS, not shear, so the quantity name is corrected.
   *
   * The result is also directional per joint, and the tip names the joints for that reason.
   * Swinton reported LOWER peak moments at the lumbar spine, the hip and the ankle with the trap
   * bar, and a HIGHER peak moment at the KNEE, than with the straight bar. An unqualified
   * "lowers the peak joint moments" therefore misstates the paper at one of the four joints it
   * measured, and understates the knee loading a user with a knee complaint needs to know about.
   * `formCues.test.ts` asserts the tip carries all four joints and the knee increase.
   */
  'trap-bar-deadlift': {
    setup: [
      'Stand inside the trap bar and grip the handles with a neutral grip.',
      'Hinge to a flat back, chest up, abdominals braced hard.',
      'Weight balanced over the mid-foot.',
    ],
    execution: [
      'Push the floor away, driving through the whole foot.',
      'Hips and shoulders rise together.',
      'Stand tall and squeeze the glutes without hyperextending.',
    ],
    mistakes: [
      'Hips rising first: turns the lift into a stiff-legged pull.',
      'Rounding the lower back at the bottom: reset or reduce the load.',
      'Letting the handles drift forward.',
      'Hyperextending at lockout.',
    ],
    tip: 'The trap bar shifts the load line: against a straight bar it lowers the peak moments at the lumbar spine, hip and ankle, and raises the peak moment at the knee (Swinton 2011). It is a different loading pattern, not an easier one.',
    caution: null,
  },

  // Legacy "Trap bar DL -> conventional", second half of the split.
  'conventional-deadlift': {
    setup: [
      'Bar over the mid-foot, shins close to the bar.',
      'Grip just outside the knees.',
      'Hinge to a flat back, chest up, abdominals braced hard.',
    ],
    execution: [
      'Push the floor away; hips and shoulders rise together.',
      'Keep the bar in contact with the legs the whole way up.',
      'Lock out by standing tall and squeezing the glutes.',
    ],
    mistakes: [
      'Hips shooting up first.',
      'Rounding the lower back: stop the set and reset.',
      'Bar drifting forward of the mid-foot.',
      'Hyperextending at the top.',
    ],
    tip: 'Lower in reverse: push the hips back first, then bend the knees once the bar passes them.',
    caution: null,
  },

  /*
   * Content review section 6, "Weighted pull-up equivalence" (UNSUPPORTED): the legacy tip
   * claimed one weighted pull-up at +20 kg is worth 5 to 7 bodyweight pull-ups by carryover.
   * No source was given and none was located, so the equivalence is deleted outright rather
   * than restated with a hedge.
   */
  'weighted-pull-up': {
    setup: [
      'Load with a dip belt, a plate between the feet, or a weighted vest.',
      'Same grip and hang as an unloaded pull-up.',
      'Hang with the shoulders depressed.',
    ],
    execution: [
      'Pull the elbows down; bring the collarbone toward the bar.',
      'Lower under control rather than dropping.',
      'Reset between repetitions if position is lost.',
    ],
    mistakes: [
      'Adding load faster than form allows.',
      'Partial repetitions from the top.',
      'Kipping the final repetitions: leave them undone and log honestly.',
      'Dropping out of the bottom position.',
    ],
    tip: 'Add load in the smallest increment your equipment allows; this lift has a short useful rep range.',
    caution: null,
  },

  'close-grip-bench-press': {
    setup: [
      'Grip about shoulder width. Narrower than that loads the wrists without adding triceps work.',
      'Feet planted, slight arch, shoulder blades retracted.',
      'Forearms vertical at the bottom.',
    ],
    execution: [
      'Lower the bar to the lower chest.',
      'Elbows tucked to about 30 degrees from the torso.',
      'Press, driving the lockout with the triceps.',
    ],
    mistakes: [
      'Grip too narrow: wrist strain with no added benefit.',
      'Elbows flared: that is a standard bench press.',
      'Lowering to the upper chest: recruits the shoulders.',
      'Bouncing off the chest.',
    ],
    tip: 'This is the highest-load triceps movement available and carries over to bench lockout strength.',
    caution: null,
  },

  /*
   * Content review section 6, "Push press +20%" (COULD NOT VERIFY): plausible and widely
   * repeated, but no primary source was located, so the number is deleted and only the
   * direction of the effect remains.
   */
  'push-press': {
    setup: [
      'Bar in the front rack, as for the overhead press.',
      'Stance hip width, feet flat.',
      'Abdominals braced, glutes squeezed.',
    ],
    execution: [
      'Quick quarter-squat dip with the knees forward and the torso upright.',
      'Drive up explosively so the leg drive transfers into the bar.',
      'Finish with arm extension and lock out overhead.',
    ],
    mistakes: [
      'Dipping with the torso leaning forward: dumps the bar forward.',
      'A slow dip: loses the elastic contribution.',
      'Pressing forward rather than straight up.',
      'Not finishing the press with the arms.',
    ],
    tip: 'The leg drive lets you handle more load than a strict press, which is why it is programmed for overhead strength rather than as a pressing substitute.',
    caution: null,
  },

  /*
   * Content review section 6, "Rower legs do 60%" (COULD NOT VERIFY): commonly cited in rowing
   * coaching, no primary source located, so the share is deleted and the drive sequence, which
   * is the coachable part, remains. The legacy damper numbers go with it: they described one
   * specific ergometer model, not a quantity.
   */
  'rower-intervals': {
    setup: [
      'Feet strapped in, balls of the feet against the pad.',
      'Damper setting in the middle of the range.',
      'Grip the handle overhand, just outside the knees.',
    ],
    execution: [
      'Drive order: legs, then back, then arms.',
      'Return order: arms, then back, then legs.',
      'Pull the handle to the sternum with a slight backward lean.',
    ],
    mistakes: [
      'Pulling with the arms first: the legs initiate the drive.',
      'Slamming the back open at the catch.',
      'Bending the knees too early on the return: the seat catches the hands.',
      'Pulling to the chin: keep the finish at the sternum.',
    ],
    tip: 'A higher damper setting is a lower stroke rate against more drag, not a harder workout by itself.',
    caution: null,
  },

  'plank': {
    setup: [
      'Forearms flat, elbows under the shoulders.',
      'Head, hips and heels in one line.',
      'Toes tucked, glutes squeezed, abdominals drawn in.',
    ],
    execution: [
      'Hold the position and breathe normally.',
      'Keep a slight posterior pelvic tilt.',
      'Maintain hard bracing for the prescribed duration.',
    ],
    mistakes: [
      'Hips sagging.',
      'Hips high, which reduces the demand.',
      'Holding the breath.',
      'Extending the hold at the cost of position.',
    ],
    tip: 'Hold quality decides the useful duration. When position can be held easily, add external load rather than time.',
    caution: null,
  },

  'ab-wheel-rollout': {
    setup: [
      'Knees on a pad, handles directly under the shoulders.',
      'Brace the abdominals and glutes before moving.',
      'Slight posterior pelvic tilt.',
    ],
    execution: [
      'Roll forward slowly, holding the pelvic position.',
      'Go as far as you can without the lower back extending.',
      'Pull back with the abdominals, not the arms.',
    ],
    mistakes: [
      'Lower back extending at the bottom: that is the range limit, not a target to pass.',
      'Progressing from knees to standing too early.',
      'Pulling back with the arms.',
      'Rushing the eccentric.',
    ],
    tip: 'Range is earned by holding the pelvic position, not by reaching further.',
    caution: null,
  },

  'hanging-knee-raise': {
    setup: [
      'Hang from a bar, grip shoulder width, palms forward.',
      'Shoulders depressed with slight latissimus tension.',
      'Legs hanging neutrally.',
    ],
    execution: [
      'Tilt the pelvis posteriorly first.',
      'Bring the knees toward the chest so the pelvis curls up.',
      'Lower slowly without swinging.',
    ],
    mistakes: [
      'Swinging the legs.',
      'Flexing only at the hip: the pelvic tilt is the abdominal component.',
      'Stopping at horizontal.',
      'Dropping the legs quickly.',
    ],
    tip: 'Without the pelvic tilt this is a hip-flexor exercise.',
    caution: null,
  },

  /*
   * Legacy "Light walk". The legacy carried one setup and one execution string, each holding
   * two sentences; they are split one sentence per line rather than merged, so the cue meets
   * the two-line minimum every other entry meets without new instruction being invented. The
   * legacy tip's pace and duration figures are dropped: they were personal programme literals,
   * not sourced prescriptions, and P4's hydration and conditioning copy carries no unsourced
   * number (content review section 3).
   */
  'walk': {
    setup: ['Comfortable shoes.', 'Nothing else to set up: out the door.'],
    execution: ['Walk at a conversational pace.', 'Keep the posture upright and the breathing easy.'],
    mistakes: [
      'Turning it into a conditioning session: this is recovery work.',
      'Walking hunched over a phone.',
      'Skipping it on busy days: any duration counts.',
    ],
    tip: 'Low-intensity walking adds energy expenditure without adding recovery cost.',
    caution: null,
  },

  /*
   * Legacy "Stair climber", split one sentence per line for the same reason as the walk entry.
   * Content review section 6, "Stair-climber rail claim" (COULD NOT VERIFY): handrail support
   * does reduce the energy cost of stepping, but the specific 30% figure is unsourced, so the
   * number is deleted and the direction remains. The legacy machine-level numbers described one
   * console and are dropped with it.
   *
   * The tip keeps the legacy corrective verbatim in meaning ("If you need to grip rails, slow
   * down"): pace is the variable the legacy cue told the user to move, and swapping it for the
   * machine level is a different instruction, not a rewording. The setup line about standing
   * centred with the hands off the rails has no legacy antecedent; it is disclosed in item 5 of
   * the header.
   */
  'stair-climber': {
    setup: ['Set the machine to a moderate level.', 'Stand centred on the steps with the hands off the rails.'],
    execution: [
      'Stand tall rather than hunching over the rails.',
      'Place the full foot on each step.',
    ],
    mistakes: [
      'Hunching over and supporting body mass on the rails: reduces the energy cost of the work.',
      'Climbing on the toes.',
      'Setting a pace you cannot hold for the prescribed duration.',
    ],
    tip: 'If the rails are needed for support, slow down.',
    caution: null,
  },
};
