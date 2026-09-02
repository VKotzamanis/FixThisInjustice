import type { CopyKey } from './copy';

/**
 * The limelight copy table, merged over the clinical default per key.
 *
 * Source: docs/design/round3/2026-09-01-round3-plan.md, section 3.4 for the twenty rows the design
 * names and sections 3.1-3.3 for the rules every other row here obeys. The register is brat summer
 * crossed with stan twitter: camp, lower case, and aimed at the week or at the app, never at the
 * person reading it.
 *
 * FOUR RULES BIND THIS FILE, and the suite in copy.test.ts decides all four mechanically.
 *
 * 1. A skin changes words, never facts. Every `{slot}` the default carries is carried here, and a
 *    literal digit appears only where the default has the same digit. Numbers, units and quantity
 *    names belong to the contract, not to the skin: `load`, `body mass`, `beverage intake`, `reps`,
 *    `kg` and `mL` survive the translation unchanged, which is why the coach lines below read as
 *    the clinical sentence with a limelight tag on the end rather than as a rewrite.
 * 2. Lower case everywhere except two rows. Round three, section 3.2: `MOTHER` and `LET'S GO BABES`
 *    shout BECAUSE nothing else does, and the uppercase list is closed at three, the third being
 *    the marquee, which is a component rather than a string.
 * 3. No emoji, not one, in the strings or in these comments (round three, section 3.1). The
 *    positions where the stan-twitter parent carried an emoji now carry a pixel icon, mapped in
 *    src/skins/limelight/Icon.tsx.
 * 4. The joke never sits on a control whose misreading costs data. Every string that fronts a
 *    wipe, an import, a legacy delete, an export or a save failure is absent from this table on
 *    purpose, and the clinical sentence stands there in every skin.
 *
 * WHAT IS NOT HERE, AND WHY. Case alone is not a reason for a row: cloning a string to lower-case
 * it puts the same sentence in two files and makes the second one rot. The skin's own token block
 * is where a blanket lower case belongs, and until it exists an unoverridden string renders in
 * clinical case. Rows exist here only where the WORDS change.
 */
export const LIMELIGHT_COPY: Readonly<Partial<Record<CopyKey, string>>> = {
  // --- round three, section 3.4: the twenty rows the design names ---
  'button.startSession': "LET'S GO BABES", // shouted, 1 of 2 in this table
  'status.rest': 'catch ur breath',
  'button.skipToday': 'not today satan',
  'button.pausePlan': 'on hiatus',
  'button.trainSomethingElse': 'plot twist',
  // The three week-delta rows keep the two counts as slots, so the numbers the user reads are the
  // domain's own and the skin owns only the verdict on the week. The design column read
  // "2 of 4. flop era."; that is this row with `2` and `4` substituted.
  'status.weekDeltaNegative': '{completed} of {target}. flop era.',
  'status.weekDeltaZero': '{completed} of {target}. she delivered.',
  'status.weekDeltaPositive': '{completed} of {target}. no crumbs.',
  'advice.drinkToThirst': 'hydrate or diedrate',
  // The two hydration rows P8 close-out B converted from template literals in copy.ts, in the
  // voice the row above already set. The VOLUMES stay slots the domain filled, and "beverage
  // intake" is the quantity name the contract fixes (R11) rather than a word this skin may
  // reword: only the verb and the tag are the skin's. `button.logVolume` is one word plus a
  // number, so R1 is met.
  'button.logVolume': 'hydrate {volume}',
  'advice.beverageShortfall': 'beverage intake {logged} of {target} today. top it up.',
  // The three Train frames P8 close-out D made reachable, each traced to a position the
  // mockup draws (docs/design/round3/2026-09-01-design-I-limelight.html). Close-out B converted
  // the frames; until close-out D threaded the overlay through ExerciseCard, SetRow and
  // TrainView, a row here would have rendered nowhere, which is why they arrive now.
  //
  // The eyebrow is the mockup's train system bar, "upper . ep. 12", and the today screen's own
  // sub-line under the session name; `status.sessionCursor` above already spells a session as
  // an episode, so the two agree. `{label}` is the PLAN's session name and `{date}` is a
  // LocalDate: a slot filled from the user's own data is outside the copy contract, and this
  // table neither lower-cases nor restates one.
  'status.sessionEyebrow': 'ep. {ordinal}, {label}',
  // The mockup's ticker item, "set 3 of 3 . bench". The quantity name `set` is the contract's
  // (R11) and survives; the separator is the only thing this row changes.
  'status.setCounter': 'set {n} of {targetSets}',
  // No mockup row for this one. `show` is this table's own word for a session, set by
  // `nav.train`, `hero.sessionInProgress` and `status.bootSchedule`, and the load, the reps and
  // the date stay exactly the slots the domain filled. The MULTIPLICATION SIGN is the default's
  // and is a unit token, not a word.
  'status.lastSessionSets': 'last show {date}: {load} \u00d7 {reps}',
  'status.prReached': 'new best. mother.',
  'hero.weeklyTargetMissed': 'the intervention',
  'status.sessionCursor': 'ep. {shown} of {total}',
  'status.planProgress': '{completed} served. {skipped} skipped. {remaining} to go.',
  'button.extendRest': '+30s',
  'button.skipRest': "i'm ready",
  'hero.weekReview': 'the reunion',
  'hero.sessionCompleted': 'ate.',
  'status.prStamp': 'MOTHER', // shouted, 2 of 2
  // The same word at the key the week stamp reads (P8 close-out B). Three KEYS in this table are
  // now upper case and the shouted list round three closed at three WORDS is unchanged: MOTHER
  // is one word wherever it is keyed, and copy.test.ts asserts both the key list and that the
  // three keys resolve to two distinct strings.
  'status.weekMetStamp': 'MOTHER',
  // Round three, section 3.3: the title may be camp, the body may not. This row carries no
  // verdict, no second person judgement and no joke, and it is the one row in the table whose
  // register is fixed by a rule rather than by taste. The design's own draft ended "monday is the
  // next slot", which asserts a weekday this string cannot know; the schedule is the plan's, so
  // the sentence names the slot without naming the day.
  'advice.interventionBody': 'the week flopped, not you. the next slot still stands.',
  'label.settingsSkin': 'the look',

  // --- the controls a user meets in the training and plan flow ---
  'button.continue': 'go on',
  'button.confirmStart': 'lock it in',
  'button.returnToSession': 'back on stage',
  'button.markCompleted': 'mark it done',
  'button.confirmSkip': 'yes skip it',
  'button.cancel': 'never mind',
  'button.resumePlan': 'comeback tour',
  'button.logSet': 'log it',
  'button.addSet': 'one more',
  'button.finishSession': "that's a wrap",
  'button.openSpotlight': 'find it',
  'button.sealCapsule': 'seal it',
  'button.openCapsule': 'open it',
  'button.writeCapsule': 'write it',
  'button.readCapsule': 'read it',
  'button.skipBoot': 'skip it',
  // The ticker's own control (P8 close-out B). The board already names it in the board's
  // register; without a row here the limelight strip announced itself in sentence case, which is
  // the wart amendment 9 records for the sounds toggle. Three words, so R1 is met, and the
  // uppercase list round three closed is untouched.
  'button.pauseTicker': 'pause the ticker',
  'button.continueTransition': 'go on',
  // The one refusal the schedule mints that this skin has a word for. `button.pausePlan` is
  // "on hiatus" here, so the sentence that reports a day the pause covers uses the same word;
  // the DATE stays the slot the domain filled, and the refusal still says the plan is stopped,
  // which is the fact the user has to act on (P8 close-out B).
  'status.refusalPaused': 'the plan is on hiatus on {date}.',

  // The missed-week screen. `dismiss` closes the clip; it is not a commit, so it may be camp.
  // The clip plays itself, muted, which is the only autoplay an engine allows, so there is no
  // play control here to name (P8 close-out B retired the unused `button.play`).
  'button.dismiss': 'not now',
  'button.motivationClipPreview': 'sneak peek',
  'button.retrySave': 'try again',

  // --- the nav ---
  'nav.today': 'today',
  'nav.plan': 'the run',
  'nav.train': 'showtime',
  'nav.targets': 'the numbers',
  'nav.log': 'the archive',
  'nav.settings': 'backstage',
  'nav.atlas': 'the collection',
  // The nav landmark's accessible name. It stays recognisable as navigation: a landmark label
  // that a screen reader announces as a joke costs a user the map of the app.
  'nav.label': 'the views',

  // --- the coach lines, which are templates ---
  // Every slot and every quantity name is the default's. What changes is the tag on the end, and
  // the tag is aimed at the set, never at the lifter.
  'coach.setLogged': 'set logged. next.',
  'coach.setDeleted': 'set deleted. gone.',
  'coach.setReadout': '{load} × {reps} logged. noted.',
  'coach.durationLogged': '{seconds} s logged. held it.',
  'coach.loadPr': 'load personal record. mother. previous best {load} × {reps}.',
  'coach.repPr': 'repetition personal record at {load}. mother. previous best {reps} reps.',
  'coach.overSuggested': '{delta} over the suggested load. showing off.',
  'coach.underSuggested': '{delta} under the suggested load. still counts.',
  'coach.aboveRange': '{count} reps above the prescribed range. no crumbs.',
  'coach.aboveRangeOne': '{count} rep above the prescribed range. no crumbs.',
  'coach.belowRange': '{reps} reps, below the prescribed {lo}-{hi}. it happens.',
  'coach.topOfRange': 'top of range at {load} × {reps}. ate.',
  'coach.insideRange': '{load} × {reps}, inside the prescribed {lo}-{hi}. locked in.',

  // --- the toasts ---
  'toast.setDeleted': 'set deleted. gone.',
  'status.milestoneSets': '{count} sets recorded. no crumbs.',
  'status.specimenAcquired': 'new {rarity} specimen. obsessed.',

  // --- the boot sequence and the Konami refusal ---
  // The boot lines are printed through FORMAT.bootStep, which pads a dotted leader to a fixed
  // column from the label's own length, so a longer label here shortens the leader rather than
  // breaking the alignment.
  'hero.boot': 'warming up',
  'status.bootConsole': 'limelight console v3',
  'status.bootPlan': 'cueing the plan',
  'status.bootStore': 'unpacking the archive',
  'status.bootPlanName': 'the {name} era',
  'status.bootSchedule': '{count} shows per week',
  'status.bootOk': 'yes',
  'status.bootReady': "she's ready.",
  'status.konami': 'no cheat code. nobody skips a squat.',

  // --- the rest of the screens, where the words earn a change ---
  'hero.train': 'showtime',
  'hero.sessionSkipped': 'skipped. next.',
  'hero.sessionInProgress': 'the show is running.',
  'hero.noSessionToday': 'day off, apparently.',
  'hero.programmeComplete': 'the whole run. done.',
  'hero.spotlight': 'find it',
  'hero.timeCapsule': 'a note for later',
  'hero.dailyTargets': 'the numbers',
  'hero.personalRecords': 'the highlight reel',
  'hero.compliance': 'the attendance',
  'status.planComplete': 'wrapped',
  'status.undiscovered': 'still a mystery',
  'label.settingsSounds': 'the noise',
  // The shortcut off switch (P8 close-out B), in the pattern the two settings labels beside it
  // already use. The word the criterion defines is kept: this is the switch for the app's
  // single-character shortcuts and nothing else, so no skin may make it sound like a preference
  // about something broader.
  'label.settingsHotkeys': 'the shortcuts',
  'advice.noSessionIn14Days': 'nothing booked for 14 days. dry spell.',
  'advice.noSessionToday': 'nothing assigned today. pick one on today.',
  'advice.noSetsLogged': 'no sets yet. start something.',
  'advice.noCardsMatch': 'nothing matches that filter.',
  'advice.noMatches': 'nothing.',
  'advice.noSpotlightMatch': 'nothing.',
  'advice.atlas': 'a field journal. every logged set might drop a card.',
  'advice.timeCapsule': 'a note to future you, sealed until a date you pick.',
  'advice.pauseHoldsCursor': 'a hiatus costs you nothing.',
  'advice.deloadBlock': 'deload block: fewer sets, same load.',
};
