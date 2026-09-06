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
  // The suggested-load line's ABSENCE row (whole-app review, item 2). `label.suggestedLoad`
  // itself stays clinical for the reason copy.test.ts records: its `{kind}` slot arrives already
  // resolved from a `status.advice*` row this table does not carry, so a camp frame around a
  // clinical kind would read as two voices in one sentence. That objection does not reach here.
  // This row has NO SLOT: no kind to disagree with, no load to invent, no number at all, which
  // is what makes a word of this table's own safe in a position the sibling row cannot take one.
  //
  // A show that has no script for a number is unscripted, and this table already spells a
  // session as a show and a finished plan as `wrapped`. Case alone earns no row in this file, so
  // a lower-cased "no load suggested" would not have qualified; this is a different word.
  'label.noSuggestedLoad': 'unscripted',
  'hero.weeklyTargetMissed': 'the intervention',
  'status.sessionCursor': 'ep. {shown} of {total}',
  // `+30 s`, not `+30s`: the SPACE and the LOWER CASE are the unit, not typography. SI 5.4.3
  // puts a space between the value and the symbol, and `s` is the second while `S` is the
  // siemens, so the shortened form states no quantity at all. This table lower-cases its words;
  // it does not get to re-case a symbol (P8 review).
  'button.extendRest': '+30 s',
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
  /*
   * `button.continue` carried 'go on' here. Round 1 claim C1.05.2 asked for "Previous" and
   * "Next" by name, and the owner tests on this skin, so renaming only the default table would
   * have changed nothing they can see. The override is DROPPED rather than lower-cased to
   * 'next': a named request outranks the register convention. `button.back` never had one and
   * now inherits "Previous" for the same reason.
   *
   * The board keeps PROCEED. That skin is a departures concourse and PROCEED is the sign at
   * every gate, which is a documented voice rather than an unconsidered default, and it is not
   * the skin this round is being tested on.
   */
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
  // The one refusal the schedule mints that this skin has a word for. `button.pausePlan` is
  // "on hiatus" here, so the sentence that reports a day the pause covers uses the same word;
  // the DATE stays the slot the domain filled, and the refusal still says the plan is stopped,
  // which is the fact the user has to act on (P8 close-out B).
  'status.refusalPaused': 'the plan is on hiatus on {date}.',

  // The missed-week screen. `dismiss` closes the clip; it is not a commit, so it may be camp.
  // The clip plays itself, muted, which is the only autoplay an engine allows, so there is no
  // play control here to name (P8 close-out B retired the unused `button.play`).
  //
  // IT WAS "not now" UNTIL THE P8 REVIEW, and that was a promise the control cannot keep. It is
  // the ONLY control on the popup and pressing it writes `missHandled` for the week
  // (src/ui/motivation/MotivationModal.tsx): the screen does not come back, so a word meaning
  // "later" states the opposite of what the tap does. `noted.` acknowledges and promises
  // nothing, and it is the register `hero.sessionCompleted` ("ate.") already set for this table:
  // one word, lower case, full stop. The rejected candidates were `fine.`, which reads as a
  // verdict on the user rather than on the week, and `bye.`, which announces a departure the
  // user is not making -- the app is still on screen behind the popup.
  'button.dismiss': 'noted.',
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
  'advice.noSpotlightMatch': 'nothing.',
  'advice.atlas': 'a field journal. every logged set might drop a card.',
  'advice.timeCapsule': 'a note to future you, sealed until a date you pick.',
  'advice.pauseHoldsCursor': 'a hiatus costs you nothing.',
  'advice.deloadBlock': 'deload block: fewer sets, same load.',

  // --- P9 Task 12: the today screen ---
  // The fourteen-day strip, the two empty states and the skip form. Each strip word is also the
  // aria-label of a day glyph (TodayView.tsx:84-89), so each one still names the state a screen
  // reader has to hear: a day that is booked, live, served, a no show, on hiatus or off.
  'hero.noPlan': 'no plan. tragic.',
  'advice.completeSetup': 'no setup, no plan. sort it out.',
  // The heading of the fourteen-day list. The COUNT is the default's own and stays a literal 14,
  // which is the window `projectDays` builds; only the noun beside it is this table's.
  'hero.nextFourteenDays': 'the next 14 dates',
  'status.remainingThisWeek': 'still to come this week',
  'status.dayPlanned': 'booked',
  'status.dayInProgress': 'live',
  // Round three, section 3.4 spells a completed session "served" in `plan_progress`, so the day
  // cell uses the word the design already set rather than a second one for the same state.
  'status.dayCompleted': 'served',
  'status.daySkipped': 'no show',
  'status.dayPaused': 'on hiatus', // the word `button.pausePlan` already uses for a stopped plan
  'status.dayRest': 'day off', // the words `hero.noSessionToday` already uses for an empty day
  // The skip form's free-text field. The parenthesis is the control semantic, not decoration: it
  // states that the field may be left empty, so it survives the rewrite.
  'label.skipReason': 'the story (optional)',

  // --- P9 Task 12: the train screen ---
  'advice.noProfileTrain': 'no profile. setup first, babes.',
  // A bonus row is a set past the prescription, which is what an encore is. It stands where
  // `status.setCounter` stands on a planned row (SetRow.tsx:144), and that row is already this
  // table's "set {n} of {targetSets}", so the two markers now speak one language.
  'label.bonusSet': 'encore',
  'label.equipment': 'the gear',
  // Brief F Part 1c / round 1 owner feedback: "'The gear' -> Rename to equipment access." That
  // feedback was about THIS screen's equipment picker specifically, now the Equipment Access
  // slider, which is why it takes its OWN key rather than reusing `label.equipment` above --
  // that key also labels AddCustomExercise.tsx's unrelated modality field, which "the gear"
  // still suits and this rename must not touch.
  'label.equipmentAccess': 'equipment access',
  // The rest timer's notification, which arrives on a lock screen. `button.returnToSession` is
  // "back on stage", so the notification that ends the rest uses the same words.
  'notification.restOver': 'rest over. back on stage.',
  // A refusal keeps the clinical sentence and takes a camp word in front of it. What the user
  // has to know is that the exercise was NOT added, so that clause is left standing.
  'status.customExerciseRefused': 'nope. the exercise was not added.',

  // --- P9 Task 12: the settings screen ---
  // Three section headings and the empty state. Everything else on this screen stays clinical,
  // for the reasons the block below records.
  'hero.profile': 'who you are',
  'hero.skin': 'the look and the noise', // `label.settingsSkin` and `label.settingsSounds`, joined
  // The reminders section. A call time is when the performer has to be at the theatre, which is
  // what a session reminder states. The controls inside the section stay clinical: a misread
  // reminder state costs the user a session.
  'hero.reminders': 'call times',
  // The same sentence as `advice.noProfileTrain`, which the default table also duplicates.
  'advice.noProfileSetupFirst': 'no profile. setup first, babes.',

  /*
   * WHAT STAYS CLINICAL ON THE FOUR MAIN SCREENS, AND WHY (P9 Task 12).
   *
   * 130 default keys reach Today, Train, Plan or Settings (131 until Brief F Part 3 deleted
   * `label.microPlates`, which reached Settings' now-removed micro-plate checkbox). Twenty-one
   * took a row above, the twenty-first being `label.noSuggestedLoad`, which the whole-app review
   * added with a row in both tables. The other 109 are named below, grouped so each reason is
   * written once rather than once per key. Recount the list against the tree with the sweep in
   * docs/plans/2026-09-02-09-prose-and-docs-pass.md, Task 12 step 1, WITH ONE CORRECTION: that
   * sweep greps for a single-quoted key and a view that hands a key to a component as a JSX prop
   * writes it in double quotes (`titleKey="label.confirmWipe"`, `copyKey="button.skipToday"`).
   * Match both quotes or the count comes back two short, which is how it first came back 128.
   *
   * RULE 4, a control whose misreading costs data (18). The wipe, the two legacy paths, the
   * backup download and the clip failure say what they destroy or fail to destroy, a set delete
   * is not recoverable, and the two confirm titles name the act the dialog is about to do:
   *   advice.clipClearFailed, advice.dataOnDevice, advice.deleteLegacy, advice.legacyOldDataKept,
   *   advice.storedUnitsUnchanged, advice.wipeRemoves, button.deleteLegacy, button.downloadBackup,
   *   button.downloadLegacyJson, button.legacyDeleteOld, button.legacyReopen, button.wipeAll,
   *   button.wipeConfirm, button.deleteSet, hero.dataOnDevice, hero.exportImport,
   *   label.confirmDeleteLegacy, label.confirmWipe
   *
   * THE INSTALL GUIDE (12). Every string quotes a label the operating system draws: Share, Add to
   * Home Screen, Install app, the three dots. A skin that rewrites them makes the instruction
   * unfollowable, because the user is matching the words against another program's screen:
   *   advice.installIosVersion, advice.installOnlyInstalledApp, hero.installHomeScreen,
   *   label.installAndroid, label.installIos, status.installAndroidInstall,
   *   status.installAndroidMenu, status.installAndroidOpen, status.installIosAdd,
   *   status.installIosOpen, status.installIosSafari, status.installIosShare
   *
   * THE REMINDER STATE AND ITS CONTROLS (12). The panel reports whether this device will receive
   * a push, and the two failures report that it will not. A user who misreads one believes a
   * reminder is coming and misses the session. ReminderSettingsPanel.test.tsx renders under the
   * shipped skin and asserts these by key against the default table, so a row here fails there:
   *   advice.reminderSubscribeFailed, advice.reminderSyncFailed, label.reminderDayOfTime,
   *   label.reminderLeadTimes, label.remindersEnable, status.remindersDenied,
   *   status.remindersNeedInstall, status.remindersNeedReenable, status.remindersOff,
   *   status.remindersPending, status.remindersUnconfigured, status.remindersUnsupported
   *
   * THE READINESS SCREENING (6). It asks about chest pain, dizziness and medication, and it
   * raises a physician-consult flag. Camp on a health gate is what round three, section 3.3 rules
   * out, and the flag has to read as a flag:
   *   button.redoReadiness, button.startReadiness, hero.readiness, status.notScreened,
   *   status.readinessConsult, status.readinessNoFlags
   *
   * BODY MASS AND FLUID LOSS (3). Rule 4 again, and src/ui/views/train/BodyMassQuickLog.test.tsx
   * already asserts the fall-through by key: the entry feeds the 2 % dehydration comparison, the
   * advice line is the flag that comparison raises, and the why body is the ACSM 2007 citation:
   *   advice.fluidLoss, button.logBodyMass, why.postSessionMass
   *
   * THE QUANTITIES, THE UNITS AND THE INCREMENTS (16). Rule 1 and contract R11: a skin may put a
   * word beside a quantity and may not rename one. Every string below is a defined quantity name,
   * a unit name, or the sentence that defines an increment or a dose. `label.microPlates` left
   * this list when Brief F Part 3 deleted the key (the owner asked for the micro-plate option to
   * go, and only that):
   *   advice.creatineOnly, advice.loadSteps, hero.equipmentSteps, hero.hydration, label.creatine,
   *   label.displayUnit, label.unitsImperial, label.unitsMetric, label.week,
   *   quantity.barbellStep, quantity.bodyMass, quantity.dailyBeverageTarget,
   *   quantity.exerciseName, quantity.postSessionBodyMass, quantity.preSessionBodyMass,
   *   unit.characters
   *
   * THE PROFILE FIELDS THE TARGETS ARE COMPUTED FROM (14). The activity, experience and goal
   * options are the criterion the user matches themselves against, and the same words name the
   * inputs on the Targets screen, which keeps them under R11. Renaming "Fat loss" to a gym verb
   * would leave the picker and the target it drives calling one thing two things:
   *   label.activeProfile, label.activity, label.experience, label.goal, option.activityModerate,
   *   option.activitySedentary, option.activityVigorous, option.experienceAdvanced,
   *   option.experienceIntermediate, option.experienceNovice, option.goalFatLoss,
   *   option.goalMaintenance, option.goalMuscleGain, option.goalRecomposition
   *
   * THE THREE SKIN NAMES (3). Proper nouns, and the id an export carries.
   * src/ui/settings/SkinSettings.test.tsx asserts them as literals under all three skins: a skin
   * that renamed the other two would be a skin the user could not reliably leave:
   *   option.skinBoard, option.skinClinical, option.skinLimelight
   *
   * THE NUMBER-ENTRY ERRORS (4). Each states the number the field will accept, which is the whole
   * content of the string:
   *   advice.durationNeeded, error.outsideAccepted, error.positive, error.valueRequired
   *
   * THE PROGRESSION ADVICE KINDS (4). They resolve into the slot of `label.suggestedLoad`, which
   * has no row here for the reason copy.test.ts records, so a camp kind would render inside a
   * clinical frame. They also name what to do with the barbell, which is an instruction:
   *   status.adviceAddLoad, status.adviceDeload, status.adviceExtendReps, status.adviceHold
   *
   * THE EQUIPMENT NAMES (5). A dumbbell is a dumbbell. The picker writes the exercise modality,
   * so a renamed option selects a different thing than it says:
   *   label.modality.barbell, label.modality.bodyweight, label.modality.cable,
   *   label.modality.dumbbell, label.modality.machine
   *
   * THE CUSTOM-EXERCISE FORM (2). Its noun is the domain's, and the only camp alternative coins a
   * word for "exercise" that no other row in this table uses:
   *   button.addExercise, button.saveExercise
   *
   * THE TECHNIQUE REFERENCE (2). "Form cues" names the content the modal shows, and the modal
   * heading is the same phrase. Renaming the button parts the control from what it opens:
   *   button.formCues, button.formReference
   *
   * THE TWO TRAINING TERMS (2). A deload block and a training block are the periodisation terms
   * the plan documents use, and the strip is a picture of them:
   *   label.blockStrip, status.deloadTag
   *
   * CASE ALONE, OR THE LIMELIGHT WORD ALREADY (4). `disclosure.why` ships as "why?", which is the
   * string round three, section 3.4 asks for; `status.nextSession` ships as "next";
   * `button.backToToday` names the tab, and this table already lower-cases that name;
   * `banner.actionRefused.tag` is "NOT APPLIED", and keeping its emphasis would mean a fourth
   * shouted key, which round three closed at three:
   *   banner.actionRefused.tag, button.backToToday, disclosure.why, status.nextSession
   *
   * THE TWO SENTENCES ABOUT THE APP'S OWN RULES (2). One names the keys Escape and the modifiers,
   * which belong to the browser; the other states the promise this table lives under, and a camp
   * restatement of "a skin changes wording and colour, never numbers or units" would undercut the
   * guarantee it makes:
   *   advice.hotkeysOff, advice.skinChanges
   */
};
