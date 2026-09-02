/**
 * User-facing copy, default (clinical) skin.
 *
 * Contract: docs/design/2026-09-01-copy-contract.md. Every string here obeys R1-R11.
 * Numbers, units and quantity names are part of the contract, not of the skin: a skin may
 * rewrite the sentence around `60 kg`, never `60 kg` itself.
 *
 * The union and the table below are the block the contract prints, pasted verbatim, plus the
 * keys P2 Task 7 (the setup wizard) is the first to render. Later tasks append their own keys
 * to both in the task that first renders them.
 *
 * Strings that carry a value are NOT assembled at the call site: the frames live in `FORMAT`
 * at the bottom of this file, so a skin can reorder a sentence without touching a view, and so
 * no number or unit is duplicated between a view and this table. Where the contract prints an
 * example value in the table (`// formatted`), the example stays: it documents the shape the
 * matching `FORMAT` member produces.
 */
export type CopyKey =
  // --- shell, save/load banners, recovery (P1) ---
  | 'shell.status.loading'
  | 'shell.status.loaded'
  | 'banner.update.tag'
  | 'banner.update.body'
  | 'button.reload'
  | 'banner.saveQuota.tag'
  | 'banner.saveQuota.body'
  | 'banner.saveUnavailable.tag'
  | 'banner.saveUnavailable.body'
  | 'banner.saveFailed.tag'
  | 'banner.saveFailed.body'
  | 'banner.loadInvalid.tag'
  | 'banner.loadInvalid.body'
  | 'button.exportData'
  | 'button.retrySave'
  | 'button.exportStoredCopy'
  | 'button.exportStoredData'
  | 'recovery.hero'
  | 'recovery.advice'
  | 'recovery.exported'
  | 'recovery.confirm'
  | 'button.clearData'
  | 'recovery.cleared.hero'
  | 'recovery.cleared.advice'
  | 'hero.noProfile'
  | 'advice.noProfile'
  // --- setup wizard, targets, check-in (P2) ---
  | 'setup.hero'
  | 'button.continue'
  | 'button.back'
  | 'button.confirmStart'
  | 'advice.unitsOnce'
  | 'advice.timezoneDetected'
  | 'advice.timezoneInvalid'
  | 'advice.sexUsedFor'
  | 'advice.bodyFatOptional'
  | 'advice.tapeMethod'
  | 'advice.tapeNeedFemale'
  | 'advice.tapeNeedMale'
  | 'advice.loadSteps'
  | 'advice.creatineOnly'
  | 'advice.deloadEveryFourth'
  | 'hero.dailyTargets'
  | 'status.rateUnknown'
  | 'button.recordIntake'
  | 'why.targetsBasis'
  | 'advice.storedUnitsUnchanged'
  | 'advice.noProfileSetupFirst'
  // --- setup wizard fields and validation (P2 Task 7; appended by that task) ---
  | 'disclosure.why'
  | 'step.units'
  | 'step.timezone'
  | 'step.body'
  | 'step.training'
  | 'step.goal'
  | 'step.availability'
  | 'step.programme'
  | 'step.review'
  | 'label.unitsMetric'
  | 'label.unitsImperial'
  | 'label.timezone'
  | 'label.name'
  | 'label.sexMale'
  | 'label.sexFemale'
  | 'label.birthYear'
  | 'label.feet'
  | 'label.inches'
  | 'label.bodyFatNone'
  | 'label.bodyFatKnown'
  | 'label.bodyFatTape'
  | 'label.activity'
  | 'label.experience'
  | 'label.equipment'
  | 'label.microPlates'
  | 'label.goal'
  | 'label.targetDate'
  | 'label.creatine'
  | 'label.weighIn'
  | 'label.sessionsPerWeek'
  | 'label.startTime'
  | 'label.duration'
  | 'label.includeCardio'
  | 'label.energy'
  | 'label.protein'
  | 'label.fluid'
  | 'label.expectedRate'
  | 'label.creatineDose'
  | 'label.maintenanceOnly'
  | 'label.inTargetRange'
  | 'label.none'
  | 'quantity.height'
  | 'quantity.bodyMass'
  | 'quantity.targetBodyMass'
  | 'quantity.bodyFat'
  | 'quantity.neck'
  | 'quantity.abdomenI'
  | 'quantity.abdomenII'
  | 'quantity.hip'
  | 'quantity.barbellStep'
  | 'quantity.dumbbellStep'
  | 'quantity.stackStep'
  | 'quantity.microPlateStep'
  | 'quantity.weeklySessionTarget'
  | 'quantity.programmeWeeks'
  | 'quantity.age'
  | 'option.activitySedentary'
  | 'option.activityModerate'
  | 'option.activityVigorous'
  | 'option.experienceNovice'
  | 'option.experienceIntermediate'
  | 'option.experienceAdvanced'
  | 'option.equipmentFullGym'
  | 'option.equipmentDumbbells'
  | 'option.equipmentBodyweight'
  | 'option.goalFatLoss'
  | 'option.goalMuscleGain'
  | 'option.goalRecomposition'
  | 'option.goalMaintenance'
  | 'weekday.monday'
  | 'weekday.tuesday'
  | 'weekday.wednesday'
  | 'weekday.thursday'
  | 'weekday.friday'
  | 'weekday.saturday'
  | 'weekday.sunday'
  | 'hero.programme'
  | 'advice.weighIn'
  | 'advice.tapeOutOfDomain'
  | 'advice.bodyFatEstimate'
  | 'why.bodyFatEstimate'
  | 'why.bodyFatOptional'
  | 'error.valueRequired'
  | 'error.pickOneDay'
  | 'error.positive'
  | 'error.wholeNumber'
  // --- targets view, settings and app navigation (P2 Task 8; appended by that task) ---
  | 'hero.intakeCheckIn'
  | 'hero.profile'
  | 'hero.equipmentSteps'
  | 'hero.hydration'
  | 'label.displayUnit'
  | 'label.activeProfile'
  | 'label.rmr'
  | 'label.tdee'
  | 'label.energyProgress'
  | 'label.proteinProgress'
  | 'quantity.energyIntake'
  | 'quantity.proteinIntake'
  | 'quantity.dailyBeverageTarget'
  | 'advice.beverageDefault'
  | 'why.beverageDefault'
  | 'advice.intakeRejected'
  | 'error.outsideAccepted'
  | 'advice.viewNotBuilt'
  | 'nav.today'
  | 'nav.plan'
  | 'nav.train'
  | 'nav.targets'
  | 'nav.log'
  | 'nav.settings'
  // --- today and plan (P3) ---
  | 'hero.noPlan'
  | 'advice.completeSetup'
  | 'hero.programmeComplete'
  | 'hero.sessionCompleted'
  | 'hero.sessionSkipped'
  | 'hero.sessionInProgress'
  | 'hero.noSessionToday'
  | 'advice.nextSession'
  | 'advice.noSessionIn14Days'
  | 'advice.noSessionsLeftThisWeek'
  | 'status.planPaused'
  | 'status.skipReason'
  | 'button.startSession'
  | 'button.returnToSession'
  | 'button.markCompleted'
  | 'button.skipToday'
  | 'button.confirmSkip'
  | 'button.cancel'
  | 'button.trainSomethingElse'
  | 'button.trainLabelToday'
  | 'button.pausePlan'
  | 'button.resumePlan'
  | 'status.deloadNote'
  // --- training session (P4) ---
  | 'hero.train'
  | 'advice.noProfileTrain'
  | 'advice.deloadBlock'
  | 'status.rest'
  | 'button.skipRest'
  | 'button.logSet'
  | 'button.deleteSet'
  | 'button.undo'
  | 'button.addSet'
  | 'button.addExercise'
  | 'button.saveExercise'
  | 'button.finishSession'
  | 'button.logBodyMass'
  | 'button.formReference'
  | 'button.formCues'
  | 'button.nextInstance'
  | 'button.openClip'
  | 'button.searchInstance'
  | 'advice.noClipRecorded'
  | 'advice.drinkToThirst'
  | 'advice.beverageShortfall'
  | 'advice.logPostSessionMass'
  | 'why.postSessionMass'
  | 'advice.fluidLoss'
  | 'why.fluidLoss'
  | 'coach.setLogged'
  | 'coach.durationLogged'
  | 'coach.loadPr'
  | 'coach.repPr'
  | 'coach.overSuggested'
  | 'coach.underSuggested'
  | 'coach.aboveRange'
  | 'coach.belowRange'
  | 'coach.topOfRange'
  | 'coach.insideRange'
  // --- reminders (P5) ---
  | 'status.remindersUnconfigured'
  | 'status.remindersUnsupported'
  | 'status.remindersNeedInstall'
  | 'status.remindersDenied'
  | 'status.remindersOff'
  | 'status.remindersPending'
  | 'status.remindersActive'
  | 'hero.installFirst'
  | 'advice.installIos'
  | 'advice.iosVersion'
  | 'push.body'
  // --- motivation video (P6) ---
  | 'hero.weeklyTargetMissed'
  | 'hero.motivationPreview'
  | 'advice.motivationPreview'
  | 'advice.weekMissed'
  | 'advice.weekMissedNone'
  | 'button.play'
  | 'button.dismiss'
  | 'button.muteThisWeek'
  | 'button.preview'
  | 'button.removeCustomClip'
  | 'status.bundledClipChecking'
  | 'status.bundledClipPresent'
  | 'status.bundledClipAbsent'
  | 'status.customClipNone'
  | 'status.customClipStored'
  | 'advice.videoWrongType'
  | 'advice.videoTooLarge'
  | 'advice.videoStoreFailed'
  // --- log, export, migration, settings (P7) ---
  | 'hero.importFromOldApp'
  | 'advice.importIntro'
  | 'advice.importNothingDeleted'
  | 'advice.importUnitsNeeded'
  | 'advice.importUnreadable'
  | 'advice.importNoResult'
  | 'advice.importDownloadFirst'
  | 'why.importRejections'
  | 'button.runImport'
  | 'button.keepImport'
  | 'button.startClean'
  | 'button.downloadLegacyJson'
  | 'button.setUpProfile'
  | 'advice.noWeeksYet'
  | 'advice.noSetsLogged'
  | 'hero.exportImport'
  | 'button.downloadJson'
  | 'button.downloadSummary'
  | 'button.downloadCalendar'
  | 'advice.jsonIsBackup'
  | 'advice.calendarAlarms'
  | 'advice.importReplaces'
  | 'status.importOk'
  | 'advice.importParseFailed'
  | 'advice.fileUnreadable'
  | 'hero.dataOnDevice'
  | 'advice.dataOnDevice'
  | 'button.wipeAll'
  | 'advice.wipeAll'
  | 'button.deleteLegacy'
  | 'advice.deleteLegacy'
  | 'confirm.typeToConfirm'
  // --- boot, atlas, capsule, spotlight, transitions (P8) ---
  | 'hero.atlas'
  | 'advice.atlas'
  | 'advice.noCardsMatch'
  | 'status.undiscovered'
  | 'hero.timeCapsule'
  | 'advice.timeCapsule'
  | 'advice.capsuleOpenDatePassed'
  | 'button.sealCapsule'
  | 'button.openCapsule'
  | 'button.skipBoot'
  | 'button.continueTransition'
  | 'advice.noMatches'
  | 'toast.setDeleted'
  | 'status.setsLogged'
  // --- setup wizard, review fixes (P2 Task 7) ---
  | 'status.targetsNotEstimated';

export const DEFAULT_COPY: Readonly<Record<CopyKey, string>> = {
  // --- shell, save/load banners, recovery (P1) ---
  'shell.status.loading': 'reading local data',
  'shell.status.loaded': 'local data loaded',
  'banner.update.tag': 'UPDATE READY',
  'banner.update.body': 'A new version is ready.',
  'button.reload': 'Reload',
  'banner.saveQuota.tag': 'STORAGE FULL',
  'banner.saveQuota.body': 'Storage is full. Export now.',
  'banner.saveUnavailable.tag': 'NO STORAGE',
  'banner.saveUnavailable.body': 'Storage is unavailable here. Export now.',
  'banner.saveFailed.tag': 'SAVE FAILED',
  'banner.saveFailed.body': 'The change could not be saved. The stored copy is unchanged.',
  'banner.loadInvalid.tag': 'INVALID DATA',
  'banner.loadInvalid.body':
    'Stored data did not validate: unrecognized key. Nothing was overwritten.', // formatted
  'button.exportData': 'Export data',
  'button.retrySave': 'Retry save',
  'button.exportStoredCopy': 'Export stored copy',
  'button.exportStoredData': 'Export stored data',
  'recovery.hero': 'The app could not start',
  'recovery.advice': 'Your data is unchanged. Export it before clearing.',
  'recovery.exported': 'Export downloaded.',
  'recovery.confirm': 'Export first, then type DELETE.',
  'button.clearData': 'Clear stored data',
  'recovery.cleared.hero': 'Stored data cleared',
  'recovery.cleared.advice': 'Reload to start empty.',
  'hero.noProfile': 'No profile yet',
  'advice.noProfile': 'Setup is not built yet.',

  // --- setup wizard, targets, check-in (P2) ---
  'setup.hero': 'Setup',
  'button.continue': 'Continue',
  'button.back': 'Back',
  'button.confirmStart': 'Confirm and start',
  'advice.unitsOnce': 'Chosen once. Values are stored in kg and mL either way.',
  'advice.timezoneDetected': 'Detected from this device. Dates and reminders use this zone.',
  'advice.timezoneInvalid': 'Not a recognised IANA time zone.',
  'advice.sexUsedFor': 'Used by the RMR, body-fat and fluid equations.',
  'advice.bodyFatOptional': 'Optional. With it, RMR uses the Cunningham fat-free-mass equation.',
  'advice.tapeMethod': 'US Navy circumference method. All girths in cm, tape level and snug.',
  'advice.tapeNeedFemale': 'Enter neck, abdomen I and hip girths.',
  'advice.tapeNeedMale': 'Enter neck and abdomen II girths.',
  'advice.loadSteps': 'The smallest increment a suggested load may use.',
  'advice.creatineOnly': 'The only supplement tracked. Dose scales with body mass.',
  'advice.deloadEveryFourth': 'Every fourth week halves set counts. Load is unchanged.',
  'hero.dailyTargets': 'Daily targets',
  'status.rateUnknown': 'Not established by the evidence base',
  'button.recordIntake': 'Record intake',
  'why.targetsBasis': 'How these numbers were derived',
  'advice.storedUnitsUnchanged': 'Stored values never change. Mass is always held in kg.',
  'advice.noProfileSetupFirst': 'No profile. Complete setup first.',

  // --- setup wizard fields and validation (P2 Task 7; appended by that task) ---
  // R9: the literal summary for any disclosure carrying arithmetic or a derivation.
  'disclosure.why': 'why?',
  'step.units': 'Units',
  'step.timezone': 'Time zone',
  'step.body': 'Body',
  'step.training': 'Training context',
  'step.goal': 'Goal',
  'step.availability': 'Availability',
  'step.programme': 'Programme length',
  'step.review': 'Review',
  'label.unitsMetric': 'Kilograms (kg)',
  'label.unitsImperial': 'Pounds (lb)',
  'label.timezone': 'Time zone',
  'label.name': 'Name',
  'label.sexMale': 'Male',
  'label.sexFemale': 'Female',
  'label.birthYear': 'Birth year',
  'label.feet': 'Feet',
  'label.inches': 'Inches',
  'label.bodyFatNone': 'Not measured',
  'label.bodyFatKnown': 'Known percentage',
  'label.bodyFatTape': 'Estimate from tape measurements',
  'label.activity': 'Activity level',
  'label.experience': 'Experience',
  'label.equipment': 'Equipment',
  'label.microPlates': 'Micro-plates available',
  'label.goal': 'Goal',
  'label.targetDate': 'Target date (optional)',
  'label.creatine': 'Creatine monohydrate',
  'label.weighIn': 'Weigh in before and after sessions',
  'label.sessionsPerWeek': 'Sessions per week',
  'label.startTime': 'start time',
  'label.duration': 'duration',
  'label.includeCardio': 'Add one conditioning block per week',
  'label.energy': 'Energy',
  'label.protein': 'Protein',
  'label.fluid': 'Fluid (beverages)',
  'label.expectedRate': 'Expected rate',
  'label.creatineDose': 'Creatine',
  'label.maintenanceOnly': 'Maintenance only',
  'label.inTargetRange': 'In the target set range',
  'label.none': 'none',
  // R11: quantity names, composed with the profile's unit by FORMAT.quantityWithUnit.
  'quantity.height': 'Height',
  'quantity.bodyMass': 'Body mass',
  'quantity.targetBodyMass': 'Target body mass',
  'quantity.bodyFat': 'Body fat',
  'quantity.neck': 'Neck',
  'quantity.abdomenI': 'Abdomen I',
  'quantity.abdomenII': 'Abdomen II',
  'quantity.hip': 'Hip',
  'quantity.barbellStep': 'Barbell step',
  'quantity.dumbbellStep': 'Dumbbell step, per pair',
  'quantity.stackStep': 'Weight-stack step',
  'quantity.microPlateStep': 'Micro-plate step',
  'quantity.weeklySessionTarget': 'Weekly session target',
  'quantity.programmeWeeks': 'Programme length',
  'quantity.age': 'Age',
  'option.activitySedentary': 'Sedentary: desk work, little walking',
  'option.activityModerate': 'Moderate: regular walking, active job or training',
  'option.activityVigorous': 'Vigorous: heavy physical work, daily hard training',
  'option.experienceNovice': 'Novice: under one year of consistent training',
  'option.experienceIntermediate': 'Intermediate: one to three years',
  'option.experienceAdvanced': 'Advanced: over three years',
  'option.equipmentFullGym': 'Full gym',
  'option.equipmentDumbbells': 'Dumbbells only',
  'option.equipmentBodyweight': 'Bodyweight only',
  'option.goalFatLoss': 'Fat loss',
  'option.goalMuscleGain': 'Muscle gain',
  'option.goalRecomposition': 'Recomposition',
  'option.goalMaintenance': 'Maintenance',
  'weekday.monday': 'Monday',
  'weekday.tuesday': 'Tuesday',
  'weekday.wednesday': 'Wednesday',
  'weekday.thursday': 'Thursday',
  'weekday.friday': 'Friday',
  'weekday.saturday': 'Saturday',
  'weekday.sunday': 'Sunday',
  'hero.programme': 'Programme',
  'advice.weighIn': 'Optional. Compares body mass before and after a session.',
  'advice.tapeOutOfDomain': 'These girths fall outside the equation. No estimate is shown.',
  'advice.bodyFatEstimate': '21.9 % body fat, ± 3.52 percentage points.', // formatted
  'why.bodyFatEstimate':
    'The figure after ± is the standard error of the US Navy estimate against hydrostatic weighing. It is larger than most changes a user will chase, so use the estimate to track change over time, not as an absolute number.',
  'why.bodyFatOptional':
    'With a body-fat value the engine uses Cunningham for RMR and prescribes protein per kg of fat-free mass. Without one it uses Mifflin-St Jeor and prescribes protein per kg of body mass.',
  'error.valueRequired': 'Enter a number.',
  'error.pickOneDay': 'Select at least one weekday.',
  'error.positive': 'Enter a number greater than zero.',
  'error.wholeNumber': 'Enter a whole number.',

  // --- targets view, settings and app navigation (P2 Task 8; appended by that task) ---
  'hero.intakeCheckIn': 'Intake check-in',
  'hero.profile': 'Profile',
  'hero.equipmentSteps': 'Equipment steps',
  'hero.hydration': 'Hydration',
  'label.displayUnit': 'Display unit',
  'label.activeProfile': 'Active profile',
  // Intermediate quantities. They live inside the why? disclosure (R9), never on the face.
  'label.rmr': 'Resting metabolic rate',
  'label.tdee': 'Total daily energy expenditure',
  // Accessible names for the two bars. The glyphs read out as punctuation, so the name is
  // what says which quantity the bar is about, and against which bound.
  'label.energyProgress': 'Energy against target',
  'label.proteinProgress': 'Protein against the lower bound of the range',
  'quantity.energyIntake': 'Energy consumed today',
  'quantity.proteinIntake': 'Protein consumed today',
  'quantity.dailyBeverageTarget': 'Daily beverage target',
  'advice.beverageDefault': 'Default for the stated sex: 3000 mL per day.', // formatted
  'why.beverageDefault':
    'IOM 2005 beverage share of the total-water adequate intake, DOI 10.17226/10925. The adequate intake for total water is 3.7 L per day for men and 2.7 L for women, of which beverages supply 3.0 L and 2.2 L. Water in food supplies the rest and is not counted here, because an app cannot measure it.',
  'advice.intakeRejected': 'That daily total is outside the accepted range.',
  'error.outsideAccepted': 'Outside the accepted range.',
  'advice.viewNotBuilt': 'Today is not built yet.', // formatted
  'nav.today': 'Today',
  'nav.plan': 'Plan',
  'nav.train': 'Train',
  'nav.targets': 'Targets',
  'nav.log': 'Log',
  'nav.settings': 'Settings',

  // --- today and plan (P3) ---
  'hero.noPlan': 'No plan configured.',
  'advice.completeSetup': 'Complete setup to generate a plan.',
  'hero.programmeComplete': 'Programme complete.',
  'hero.sessionCompleted': 'Session completed.',
  'hero.sessionSkipped': 'Session skipped.',
  'hero.sessionInProgress': 'Session in progress.',
  'hero.noSessionToday': 'No session scheduled today.',
  'advice.nextSession': 'Next: Wed 07:00 Push.', // formatted; weekday, start time, label
  'advice.noSessionIn14Days': 'No sessions in the next 14 days.',
  'advice.noSessionsLeftThisWeek': 'No sessions remain this week.',
  'status.planPaused': 'Plan paused since 2026-09-07.', // formatted; pause start date
  'status.skipReason': 'Reason: illness', // formatted; the reason the user typed
  'button.startSession': 'Start session',
  'button.returnToSession': 'Return to session',
  'button.markCompleted': 'Mark completed',
  'button.skipToday': 'Skip today',
  'button.confirmSkip': 'Confirm skip',
  'button.cancel': 'Cancel',
  'button.trainSomethingElse': 'Train something else',
  'button.trainLabelToday': 'Train Legs today', // formatted; the chosen label
  'button.pausePlan': 'Pause plan',
  'button.resumePlan': 'Resume plan',
  'status.deloadNote': 'volume −50 %, load unchanged', // formatted; the actual set modifier

  // --- training session (P4) ---
  'hero.train': 'TRAIN',
  'advice.noProfileTrain': 'No profile. Complete setup first.',
  'advice.deloadBlock': 'Deload block: set count reduced, load held.',
  'status.rest': 'REST',
  'button.skipRest': 'Skip',
  'button.logSet': 'Log',
  'button.deleteSet': 'Delete',
  'button.undo': 'Undo',
  'button.addSet': 'Add set',
  'button.addExercise': 'Add exercise',
  'button.saveExercise': 'Add',
  'button.finishSession': 'Finish session',
  'button.logBodyMass': 'Log body mass',
  'button.formReference': 'Form reference',
  'button.formCues': 'Form cues',
  'button.nextInstance': 'Try next instance',
  'button.openClip': 'Open clip',
  'button.searchInstance': 'Search instance',
  'advice.noClipRecorded': 'No clip recorded for this exercise.',
  'advice.drinkToThirst': 'Drink to thirst.',
  'advice.beverageShortfall': 'Beverage intake 900 mL of 2600 mL today.', // formatted
  'advice.logPostSessionMass': 'Log your post-session body mass.',
  'why.postSessionMass':
    'A loss above 2 % of pre-session mass means fluid replacement was inadequate (ACSM 2007).',
  'advice.fluidLoss': 'Fluid loss above 2 %. Replace it over the next hours.',
  'why.fluidLoss': 'Loss of 2.4 % of pre-session mass, above the 2 % threshold (ACSM 2007).', // formatted
  'coach.setLogged': 'Set logged.',
  'coach.durationLogged': '45 s logged.', // formatted
  'coach.loadPr': 'Load PR. Previous best 60 kg × 8.', // formatted
  'coach.repPr': 'Rep PR at 60 kg. Previous best 8 reps.', // formatted
  'coach.overSuggested': '2.5 kg over the suggested load.', // formatted
  'coach.underSuggested': '5 kg under the suggested load.', // formatted
  'coach.aboveRange': '2 reps above range. Add load next session.', // formatted
  'coach.belowRange': '4 reps, below the prescribed 6-8.', // formatted
  'coach.topOfRange': 'Top of range at 60 kg × 8.', // formatted
  'coach.insideRange': '60 kg × 7, inside the prescribed 6-8.', // formatted

  // --- reminders (P5) ---
  'status.remindersUnconfigured': 'Reminders are not configured in this build.',
  'status.remindersUnsupported': 'This browser cannot receive push notifications.',
  'status.remindersNeedInstall': 'Add this app to the Home Screen first.',
  'status.remindersDenied': 'Notifications are blocked. Re-enable them in settings.',
  'status.remindersOff': 'Reminders are off.',
  'status.remindersPending': 'Reminders are on. Schedule not sent yet.',
  'status.remindersActive': 'Reminders are active. Schedule last sent at 17:00.', // formatted
  'hero.installFirst': 'Install to the Home Screen first',
  'advice.installIos': 'On iPhone and iPad, only an installed app receives notifications.',
  'advice.iosVersion': 'Requires iOS 18.4 or later.',
  'push.body': 'Upper A at 18:00, session 3 of 24', // formatted

  // --- motivation video (P6) ---
  'hero.weeklyTargetMissed': 'Weekly target missed',
  'hero.motivationPreview': 'Motivation video: preview',
  'advice.motivationPreview': 'Preview. No week is being reported.',
  'advice.weekMissed': 'Week of 2026-08-24: 1 of 4 sessions completed.', // formatted
  'advice.weekMissedNone': 'Week of 2026-08-24: no sessions completed.', // formatted
  'button.play': 'Play',
  'button.dismiss': 'Dismiss',
  'button.muteThisWeek': 'Mute this week',
  'button.preview': 'Preview',
  'button.removeCustomClip': 'Remove custom clip',
  'status.bundledClipChecking': 'Bundled clip: checking.',
  'status.bundledClipPresent': 'Bundled clip: present.',
  'status.bundledClipAbsent': 'Bundled clip: absent. Choose a file below.',
  'status.customClipNone': 'Custom clip: none.',
  'status.customClipStored': 'Custom clip: stored on this device.',
  'advice.videoWrongType': 'Not a video file.',
  'advice.videoTooLarge': 'File is too large. The limit is 150 MiB.',
  'advice.videoStoreFailed': 'The file could not be stored.',

  // --- log, export, migration, settings (P7) ---
  'hero.importFromOldApp': 'Import from the old app',
  'advice.importIntro': 'Old data was found. Set up a profile first.',
  'advice.importNothingDeleted': 'Nothing is deleted from the old app.',
  'advice.importUnitsNeeded': 'The old app stored no units. Two questions follow.',
  'advice.importUnreadable': 'The old data is not JSON. Nothing has been changed.',
  'advice.importNoResult': 'The import produced no result. Nothing has been changed.',
  'advice.importDownloadFirst': 'Download the untouched copy before keeping this import.',
  'why.importRejections': 'What could not be imported, and why',
  'button.runImport': 'Run the import',
  'button.keepImport': 'Keep this import',
  'button.startClean': 'Start clean',
  'button.downloadLegacyJson': 'Download legacy JSON',
  'button.setUpProfile': 'Set up your profile',
  'advice.noWeeksYet': 'No weeks to show yet.',
  'advice.noSetsLogged': 'No sets logged yet.',
  'hero.exportImport': 'Export and import',
  'button.downloadJson': 'Download JSON',
  'button.downloadSummary': 'Download summary .txt',
  'button.downloadCalendar': 'Download calendar .ics',
  'advice.jsonIsBackup': 'The JSON file is the complete backup.',
  'advice.calendarAlarms': 'Whether an imported alarm fires is not guaranteed.',
  'advice.importReplaces': 'Importing replaces everything on this device.',
  'status.importOk': 'Imported. The current state has been replaced.',
  'advice.importParseFailed': 'That text is not JSON. Nothing has been changed.',
  'advice.fileUnreadable': 'The file could not be read.',
  'hero.dataOnDevice': 'Data on this device',
  'advice.dataOnDevice': 'Everything stays on this device. There is no account.',
  'button.wipeAll': 'Wipe all data',
  'advice.wipeAll': 'Everything on this device is removed. A JSON backup downloads first.',
  'button.deleteLegacy': 'Delete legacy data',
  'advice.deleteLegacy': "The old app's three keys are removed. Anything not imported is lost.",
  'confirm.typeToConfirm': 'Type DELETE to confirm',

  // --- boot, atlas, capsule, spotlight, transitions (P8) ---
  'hero.atlas': 'Atlas',
  'advice.atlas': 'A field journal. Every logged set may add a card.',
  'advice.noCardsMatch': 'No cards match this filter.',
  'status.undiscovered': 'UNDISCOVERED',
  'hero.timeCapsule': 'Time capsule',
  'advice.timeCapsule': 'A note to your future self, sealed until a date you pick.',
  'advice.capsuleOpenDatePassed': 'The open date has passed.',
  'button.sealCapsule': 'Seal capsule',
  'button.openCapsule': 'Open capsule',
  'button.skipBoot': 'Skip',
  'button.continueTransition': 'Continue',
  'advice.noMatches': 'No matches.',
  'toast.setDeleted': 'Set deleted.',
  'status.setsLogged': '250 sets recorded.', // formatted

  // --- setup wizard, review fixes (P2 Task 7) ---
  'status.targetsNotEstimated':
    'Targets are not estimated for these entries. Go back and check the body screen.',
};

/**
 * One string from the default table, with an optional skin overlay merged over it.
 *
 * The overlay is a parameter rather than a read of `UiPrefs.skin` because no skin table ships
 * yet: this keeps the signature the contract asks for without pretending a selection exists.
 */
export function copy(key: CopyKey, overrides?: Partial<Record<CopyKey, string>>): string {
  return overrides?.[key] ?? DEFAULT_COPY[key];
}

/**
 * Frames for the strings that carry a value.
 *
 * Every number and unit these receive comes from a domain module (`src/domain/units.ts`,
 * `src/domain/nutrition.ts`, `src/domain/bodyfat.ts`), never from this file, so a bound can
 * never drift between the message and the check that produced it.
 */
export const FORMAT = {
  /** "Step 1 of 8: Units". Contract R5: a colon, not a dash. */
  stepOf: (index: number, total: number, title: string): string =>
    `Step ${index} of ${total}: ${title}`,

  /** "Body mass (kg)". The unit comes from UNIT_LABEL; the quantity from a copy key. */
  quantityWithUnit: (quantity: string, unit: string): string => `${quantity} (${unit})`,

  /** "Monday start time". Used for the per-weekday slot controls. */
  slotField: (weekday: string, field: string): string => `${weekday} ${field}`,

  /** "21.9 % body fat, ± 3.52 percentage points." */
  bodyFatEstimate: (pct: number, seePct: number): string =>
    `${pct.toFixed(1)} % body fat, ± ${seePct.toFixed(2)} percentage points.`,

  /** "-1.5 lb/week" or "+0.4 kg/week". The sign is explicit on both branches. */
  signedRate: (displayValue: number, unit: string): string =>
    `${displayValue < 0 ? '-' : '+'}${Math.abs(displayValue).toFixed(1)} ${unit}/week`,

  /** "2960 kcal" for the review row. */
  kcal: (value: number): string => `${value} kcal`,

  /** "133-191 g". An en-dash is reserved for prose ranges; a hyphen reads correctly here. */
  gramsRange: (lo: number, hi: number): string => `${lo}-${hi} g`,

  /** "5 g" for the creatine dose row. */
  grams: (value: number): string => `${value} g`,

  /** "Upper / Lower x2, 12 weeks, 48 sessions." */
  splitSummary: (name: string, weeks: number, sessions: number): string =>
    `${name}, ${weeks} weeks, ${sessions} sessions.`,

  /** "Maintenance only: rear-delt, calf." Never hidden: content review section 2.1. */
  muscleList: (label: string, muscles: readonly string[], noneWord: string): string =>
    `${label}: ${muscles.length === 0 ? noneWord : muscles.join(', ')}.`,

  /** "Body mass must be 30 to 300 kg." Bounds arrive from the domain module that owns them. */
  outOfRange: (quantity: string, lo: number, hi: number, unit?: string): string =>
    `${quantity} must be ${lo} to ${hi}${unit === undefined || unit === '' ? '' : ` ${unit}`}.`,

  /** "Barbell step must be at most 220.5 lb." */
  atMost: (quantity: string, hi: number, unit?: string): string =>
    `${quantity} must be at most ${hi}${unit === undefined || unit === '' ? '' : ` ${unit}`}.`,

  /** "RMR equation: Mifflin-St Jeor. Activity factor (PAL): 1.7." */
  rmrBasis: (equation: string, activityFactor: number): string =>
    `RMR equation: ${equation}. Activity factor (PAL): ${activityFactor}.`,

  // --- P2 Task 8 ---

  /** "Intake check-in: 2026-09-01". Contract R5: a colon, not a dash. */
  headingWithDate: (heading: string, date: string): string => `${heading}: ${date}`,

  /**
   * "2100 / 2723 kcal", "150 / 112-160 g". The unit is carried by the TARGET side only, so a
   * progress line never prints the same unit twice.
   */
  valueOfTarget: (value: string, target: string): string => `${value} / ${target}`,

  /** "Default for the stated sex: 3000 mL per day." The volume is already formatted. */
  beverageDefault: (volume: string): string => `Default for the stated sex: ${volume} per day.`,

  /** "Today is not built yet." The name comes from the navigation entry. */
  notBuiltYet: (view: string): string => `${view} is not built yet.`,

  /**
   * "2 days selected for 4 sessions per week. Select at least 4 days." Both counts are
   * named because the fix is a choice between them: add days, or reduce the split.
   */
  daysForSessions: (days: number, sessionsPerWeek: number): string =>
    `${days} days selected for ${sessionsPerWeek} sessions per week. ` +
    `Select at least ${sessionsPerWeek} days.`,
} as const;
