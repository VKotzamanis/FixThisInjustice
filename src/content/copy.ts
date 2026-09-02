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
 * matching `FORMAT` member produces. Where the frame instead READS its key rather than
 * restating its words, the value carries a `{token}` slot in place of the example, so a skin
 * override reaches the rendered string (`status.milestoneSets`, `status.specimenAcquired`).
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
  | 'status.targetsNotEstimated'
  // --- targets and settings, review fixes (P2 Task 8) ---
  | 'nav.label'
  // --- pre-participation readiness screen (P2 Task 9; appended by that task) ---
  | 'step.readiness'
  | 'hero.readiness'
  | 'readiness.q1'
  | 'readiness.q2'
  | 'readiness.q3'
  | 'readiness.q3Note'
  | 'readiness.q4'
  | 'readiness.q5'
  | 'readiness.q6'
  | 'readiness.q6Note'
  | 'readiness.q7'
  | 'label.yes'
  | 'label.no'
  | 'advice.notMedicalAdvice'
  | 'advice.readinessAnyYes'
  | 'advice.readinessConsult'
  | 'why.readiness'
  | 'status.notScreened'
  | 'status.readinessNoFlags'
  | 'status.readinessConsult'
  | 'button.startReadiness'
  | 'button.redoReadiness'
  // --- Today view (P3 Task 5; appended by that task) ---
  | 'hero.nextFourteenDays'
  | 'status.remainingThisWeek'
  | 'status.dayCompleted'
  | 'status.daySkipped'
  | 'status.dayInProgress'
  | 'status.dayPaused'
  | 'status.dayPlanned'
  | 'status.dayRest'
  | 'label.skipReason'
  | 'advice.pauseHoldsCursor'
  | 'banner.actionRefused.tag'
  // --- session indicator in the top bar (P3 Task 7; appended by that task) ---
  | 'label.planPosition'
  | 'status.planComplete'
  // --- Plan view (P3 Task 6; appended by that task) ---
  | 'label.blockStrip'
  | 'label.block'
  | 'status.blockSessions'
  | 'status.deloadTag'
  | 'label.week'
  | 'label.weekOfCount'
  | 'status.nextSession'
  | 'why.deloadSets'
  // --- video and form-cue modals (P4 Task 8; appended by that task) ---
  | 'label.formReference'
  | 'label.videoSearch'
  | 'status.videoInstance'
  | 'button.closeModal'
  | 'label.formCues'
  | 'label.cueSetup'
  | 'label.cueExecution'
  | 'label.cueMistakes'
  | 'label.cueTip'
  | 'label.caution'
  | 'advice.noFormCues'
  // --- Train view (P4 Task 10; appended by that task) ---
  | 'button.extendRest'
  | 'button.backToToday'
  | 'label.bonusSet'
  | 'label.suggestedLoad'
  | 'status.adviceHold'
  | 'status.adviceAddLoad'
  | 'status.adviceExtendReps'
  | 'status.adviceDeload'
  | 'quantity.exerciseName'
  | 'quantity.preSessionBodyMass'
  | 'quantity.postSessionBodyMass'
  | 'advice.noSessionToday'
  | 'advice.durationNeeded'
  | 'coach.setDeleted'
  | 'notification.restOver'
  // --- toast queue (P8 Task 3; appended by that task) ---
  | 'label.coachNote'
  | 'label.telemetry'
  | 'status.milestoneSets'
  | 'status.specimenAcquired'
  // --- Log view (P7 Task 4; appended by that task) ---
  | 'hero.bodyMass'
  | 'hero.compliance'
  | 'hero.personalRecords'
  | 'hero.repsPerWeek'
  | 'label.complianceGrid'
  | 'advice.noBodyMassLogged'
  | 'status.markCompleted'
  | 'status.markSkipped'
  | 'status.markMissed'
  | 'status.markPlanned'
  | 'status.markNotPlanned'
  | 'status.noEstimated1RM'
  // --- export view and summary document (P7 Task 5; appended by that task) ---
  | 'label.downloads'
  | 'label.importSection'
  | 'label.pasteExport'
  | 'label.chooseExportFile'
  | 'button.checkImport'
  | 'button.replaceData'
  | 'advice.importInvalidNoChange'
  | 'advice.downloadBackupFirst'
  | 'advice.exportUnavailable'
  | 'advice.targetsNotEstimatedForProfile'
  // --- spotlight palette (P8 Task 8; appended by that task) ---
  | 'hero.spotlight'
  | 'button.openSpotlight'
  | 'label.spotlightQuery'
  | 'label.spotlightResults'
  | 'label.spotlightView'
  | 'label.spotlightExercise'
  | 'advice.noSpotlightMatch'
  // --- legacy migration wizard (P7 Task 3; appended by that task) ---
  | 'hero.legacyImport'
  | 'hero.legacyPreview'
  | 'hero.legacyDone'
  | 'advice.legacyFound'
  | 'advice.legacyNothingDeleted'
  | 'advice.legacyUnitRequired'
  | 'advice.legacyRefused'
  | 'advice.legacyApplyFailed'
  | 'advice.legacyStored'
  | 'advice.legacyStoreUnconfirmed'
  | 'advice.legacyOldDataDeleted'
  | 'advice.legacyOldDataKept'
  | 'disclosure.legacyTransfers'
  | 'disclosure.legacyBodyMassEvidence'
  | 'label.legacyLoadUnit'
  | 'label.legacyBodyMassUnit'
  | 'label.legacyUnitKg'
  | 'label.legacyUnitLb'
  | 'label.legacyMassUnitKg'
  | 'label.legacyMassUnitLb'
  | 'disclosure.whatTransfers'
  | 'disclosure.whatWasRefused'
  | 'disclosure.whatWasNotMatched'
  | 'button.legacyPreview'
  | 'button.legacyApply'
  | 'button.legacyDismiss'
  | 'button.legacyDeleteOld'
  | 'button.legacyKeepOld'
  | 'button.legacyClose'
  // --- typed confirmation shell, shared by every destructive action (P7 Task 3 review) ---
  | 'advice.exportBeforeConfirm'
  | 'status.exportTaken'
  // --- reminders and Home Screen install (P5 Task 8; appended by that task) ---
  | 'hero.reminders'
  | 'label.remindersEnable'
  | 'label.reminderDayOfTime'
  | 'label.reminderLeadTimes'
  | 'label.reminderLead'
  | 'advice.reminderSubscribeFailed'
  | 'advice.reminderSyncFailed'
  | 'hero.installHomeScreen'
  | 'advice.installOnlyInstalledApp'
  | 'advice.installIosVersion'
  | 'label.installIos'
  | 'status.installIosSafari'
  | 'status.installIosShare'
  | 'status.installIosAdd'
  | 'status.installIosOpen'
  | 'label.installAndroid'
  | 'status.installAndroidMenu'
  | 'status.installAndroidInstall'
  | 'status.installAndroidOpen'
  // --- motivation modal (P6 Task 4; appended by that task) ---
  | 'advice.tapForSound'
  // --- P4 final review fixes (appended by that task) ---
  | 'coach.setReadout'
  | 'coach.aboveRangeOne'
  | 'status.customExerciseRefused'
  | 'status.refusalPaused'
  | 'status.refusalSessionOpen'
  | 'status.refusalAlreadyStarted'
  | 'status.refusalNotNextDay'
  | 'status.refusalLabelNotOffered'
  | 'status.refusalUnrecognised'
  // --- motivation clip in Settings (P6 Task 6; appended by that task) ---
  | 'hero.motivationVideo'
  | 'label.motivationClipChoose'
  | 'label.motivationClipReplace'
  | 'status.motivationClipNone'
  | 'status.motivationClipStored'
  | 'advice.motivationClipStorage'
  | 'advice.motivationClipLimit'
  | 'button.motivationClipPreview'
  | 'button.motivationClipRemove'
  | 'status.motivationClipNotVideo'
  | 'status.motivationClipTooLarge'
  | 'status.motivationClipNotStored'
  // --- time capsule (P8 Task 7; appended by that task) ---
  | 'button.writeCapsule'
  | 'button.readCapsule'
  | 'label.capsuleNote'
  | 'label.capsuleOpensOn'
  | 'status.capsuleSealed'
  | 'status.capsuleWritten'
  | 'advice.capsuleNoteShort'
  | 'advice.capsuleNoteLong'
  | 'advice.capsuleDateRange';


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
  // P4 review item 2: these ten were formatted EXAMPLES that nothing resolved, while
  // src/domain/training/coach.ts assembled the same sentences in English in the domain. They
  // are now the TEMPLATES that module's return value is rendered through
  // (FORMAT.withSlots), so a skin override reaches the string the user actually reads. Every
  // slot carries a value the domain computed; the words around it are this table's.
  //
  // P4 review item 3: "PR" was a colloquial stand-in. Contract R11 names the quantity, and
  // `hero.personalRecords` below already spells it out. The repetition COUNT keeps the short
  // form ("8 reps") the Log view and FORMAT.repsCount already use; only the name of the
  // record is spelled out.
  'coach.setLogged': 'Set logged.',
  'coach.durationLogged': '{seconds} s logged.', // template; FORMAT.withSlots
  'coach.loadPr': 'Load personal record. Previous best {load} × {reps}.', // template
  'coach.repPr': 'Repetition personal record at {load}. Previous best {reps} reps.', // template
  'coach.overSuggested': '{delta} over the suggested load.', // template
  'coach.underSuggested': '{delta} under the suggested load.', // template
  'coach.aboveRange': '{count} reps above the prescribed range.', // template
  'coach.belowRange': '{reps} reps, below the prescribed {lo}-{hi}.', // template
  'coach.topOfRange': 'Top of range at {load} × {reps}.', // template
  'coach.insideRange': '{load} × {reps}, inside the prescribed {lo}-{hi}.', // template

  // --- reminders (P5) ---
  // R7: a statement of fact about this deployment, not a clause about the app's own
  // construction. It is what the panel says when the build carried no Worker origin or no
  // VAPID key (REMINDERS_CONFIGURED, src/config/reminders.ts).
  'status.remindersUnconfigured': 'Reminders are not set up on this deployment.',
  'status.remindersUnsupported': 'This browser cannot receive push notifications.',
  'status.remindersNeedInstall': 'Add this app to the Home Screen first.',
  // Names WHERE the block is lifted. The permission belongs to the browser, not to the app,
  // so "in settings" alone sends the user to the app's own Settings screen, which cannot
  // change it. P5 Task 8 edited this line in place; it had no renderer before.
  'status.remindersDenied': 'Notifications are blocked. Allow them in your browser site settings.',
  'status.remindersOff': 'Reminders are off.',
  'status.remindersPending': 'Reminders are on. Schedule not sent yet.',
  // template; FORMAT.remindersActive fills {time} with a local wall clock in the profile's
  // zone (src/domain/dates.ts localTimeOf), never a UTC instant. P5 Task 8 replaced the
  // formatted example with the slot so a skin override reaches the rendered string.
  'status.remindersActive': 'Reminders are on. Schedule last sent at {time}.',
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

  // --- targets and settings, review fixes (P2 Task 8) ---
  // Accessible name of the view-switching landmark. The word "navigation" is deliberately
  // absent: a screen reader appends the landmark role itself, so including it here would be
  // announced as "navigation navigation".
  'nav.label': 'Views',

  // --- pre-participation readiness screen (P2 Task 9; appended by that task) ---
  /*
   * SAFETY TEXT, NOT SKIN COPY. The seven questions below are the screening instrument this app
   * administers: a skin may not reword them, because rewording one changes what it screens for.
   * They are this project's OWN wording of the seven PAR-Q+ screening domains, never the form's
   * sentences (master plan section 10.4, decision `readiness-screen-own-wording`): the official
   * PAR-Q+ form is "all rights reserved" and no reproduction permission has been obtained. The
   * instrument being modelled is cited in READINESS_SOURCE (src/content/readinessQuestions.ts).
   *
   * Each question is a closed yes/no about a diagnosis, a symptom or an instruction the user has
   * already been given. None asks WHICH condition or WHICH medication, because no such value is
   * ever collected or stored (global constraint: Personal data). Question 5 names medication as
   * a category for exactly that reason, and stores nothing but a boolean.
   */
  'step.readiness': 'Readiness',
  'hero.readiness': 'Readiness',
  'readiness.q1': 'Has a doctor diagnosed you with a heart condition?',
  'readiness.q2': 'Do you get chest pain at rest or during physical activity?',
  'readiness.q3': 'In the last 12 months, have you lost consciousness or lost balance from dizziness?',
  'readiness.q3Note': 'Answer no if the dizziness came only from over-breathing during exercise.',
  'readiness.q4': 'Has a doctor diagnosed you with another chronic condition?',
  'readiness.q5': 'Do you take prescribed medication for a chronic condition?',
  'readiness.q6': 'Do you have a bone, joint or soft tissue problem that activity could worsen?',
  'readiness.q6Note': 'Answer no if the problem no longer limits your physical activity.',
  'readiness.q7': 'Has a doctor told you to exercise only under medical supervision?',
  'label.yes': 'Yes',
  'label.no': 'No',
  'advice.notMedicalAdvice': 'This is not medical advice.',
  'advice.readinessAnyYes': 'Answer yes to any question: consult a physician before training.',
  'advice.readinessConsult':
    'You answered yes on the readiness screen. Consult a physician before training.',
  // R9: what the screen is modelled on, what it stores, and what it does not do. The citation
  // itself is READINESS_SOURCE and is rendered beside this line, never inside it.
  'why.readiness':
    'These seven questions are this app\'s own wording of the seven screening domains of the PAR-Q+. No answer is stored. Only the screening date and whether any answer was yes are kept. A yes is not a diagnosis and this app is not a clearance instrument.',
  'status.notScreened': 'Not screened.',
  'status.readinessNoFlags': 'No flags.',
  'status.readinessConsult': 'Physician consult advised.',
  'button.startReadiness': 'Start readiness screen',
  'button.redoReadiness': 'Redo readiness screen',

  // --- Today view (P3 Task 5; appended by that task) ---
  'hero.nextFourteenDays': 'Next 14 days',
  'status.remainingThisWeek': 'Remaining this week',
  // The six day states the 14-day strip can be in. They are the accessible NAME of each
  // glyph: the glyph itself is drawn (SVG), so it has no text for a screen reader to read.
  'status.dayCompleted': 'Completed',
  'status.daySkipped': 'Skipped',
  'status.dayInProgress': 'In progress',
  'status.dayPaused': 'Paused',
  'status.dayPlanned': 'Planned',
  'status.dayRest': 'Rest',
  // A short free-text field, and deliberately not a medical one: it is stored verbatim in
  // SessionAssignment.skipReason and never interpreted, so the label states no category.
  'label.skipReason': 'Reason (optional)',
  'advice.pauseHoldsCursor': 'Paused days consume no session.',
  // A refusal left the document exactly as it was; the tag says so before the reason does.
  'banner.actionRefused.tag': 'NOT APPLIED',
  // --- session indicator in the top bar (P3 Task 7; appended by that task) ---
  'label.planPosition': 'Plan position',
  'status.planComplete': 'complete',

  // --- Plan view (P3 Task 6; appended by that task) ---
  // The accessible name of the block strip. The chips are buttons that move the week
  // scrubber, so the group needs a name of its own for the list they form.
  'label.blockStrip': 'Training blocks',
  'label.block': 'Block 1', // formatted; the 1-based block number
  'status.blockSessions': 'sessions 1–3', // formatted; the block's session range
  // The flag on a deload chip. Set beside `status.deloadNote`, which states the size of the
  // cut: this word says only that the block is one, so a skin can reword it without touching
  // the quantity beside it.
  'status.deloadTag': 'DELOAD',
  'label.week': 'Week',
  'label.weekOfCount': 'Week 1 of 2', // formatted; the shown week and the plan's week count
  // The cursor marker on the session the plan will serve next. Lower case: it is a mark on a
  // row, not a heading.
  'status.nextSession': 'next',
  // R9: how a deload week's set counts were derived. Behind a `why?` disclosure, because the
  // user acts on the COUNT and not on the multiplication that produced it.
  'why.deloadSets':
    'Each set count is the planned count times this block\'s set modifier of 0.5, rounded to the nearest whole set, minimum 1. The load is unchanged.', // formatted

  // --- video and form-cue modals (P4 Task 8; appended by that task) ---
  // The accessible name of the video dialog and the eyebrow above the exercise name. Set in
  // sentence case; the eyebrow's capitals are a text-transform in train.css, so a skin
  // rewriting this string does not have to shout.
  'label.formReference': 'Form reference',
  // The heading over the search panel shown when no clip id is recorded for the exercise.
  'label.videoSearch': 'Search',
  'status.videoInstance': 'instance 1 of 6', // formatted; the 1-based position in the allowlist
  // The accessible name of the close control on both dialogs. The glyph itself is the token
  // set's mark, which copy contract R6 admits; this is what a screen reader says instead.
  'button.closeModal': 'Close',
  'label.formCues': 'Form cues and common mistakes',
  'label.cueSetup': 'Setup',
  'label.cueExecution': 'Execution',
  'label.cueMistakes': 'Common mistakes',
  'label.cueTip': 'Tip',
  // Prefixes the one cue that carries a safety note (the braced breath hold of a heavy squat).
  // The word is load-bearing: colour alone must not be what marks the line as a warning.
  'label.caution': 'Caution',
  // Security constraint 30: a control the user pressed never renders an empty dialog. The nine
  // equipment-tier exercises carry `formCueId: null` and reach this line.
  'advice.noFormCues': 'No form cues recorded for this exercise.',

  // --- Train view (P4 Task 10; appended by that task) ---
  // The rest control adds a fixed 30 s. The value is part of the control, not of the skin: a
  // skin that renamed it "+1 min" would state an extension the timer does not make.
  'button.extendRest': '+30 s',
  // Leaves the finished session. Named for the destination, because after the post-session
  // weigh-in there is nothing left to do here.
  'button.backToToday': 'Back to Today',
  // The row marker for a set logged beyond the prescribed count. Not "extra": a bonus set is
  // the term LoggedSet.isBonus records, and the progression engine excludes it by that name.
  'label.bonusSet': 'BONUS',
  'label.suggestedLoad': 'Suggested',
  // What the progression engine decided, one label per ProgressionAdvice.kind. These name the
  // ACTION, never the arithmetic behind it; that lives in the why? disclosure (contract R9).
  'status.adviceHold': 'Hold load',
  'status.adviceAddLoad': 'Add load',
  // "repetitions", not "reps", in a label the user reads as an instruction (contract R11).
  'status.adviceExtendReps': 'Extend repetitions',
  'status.adviceDeload': 'Deload',
  'quantity.exerciseName': 'Exercise name',
  // The first half of the pair. Collected before the first set of a session the user opted in
  // to weigh, because the > 2 % rule compares a session against ITS OWN starting mass, and no
  // other mass in the document can stand in for it.
  'quantity.preSessionBodyMass': 'Pre-session body mass',
  // Distinct from `quantity.bodyMass`: the post-session entry is the second half of a PAIR,
  // and the > 2 % comparison is meaningless if the two are confused.
  'quantity.postSessionBodyMass': 'Post-session body mass',
  'advice.noSessionToday': 'No session is assigned today. Pick one on Today.',
  // The refusal message of the seconds field on a timed set. It names what to enter, not what
  // was wrong with the entry: "invalid" tells the user nothing they can act on.
  'advice.durationNeeded': 'Enter the seconds held, above zero.',
  // Reports the deletion; the Undo control beside it is `button.undo`. Stated, not apologised
  // for: the record is recoverable for six seconds and the control says so.
  'coach.setDeleted': 'Set deleted.',
  // The title of the local notification posted while the page is hidden (master plan section
  // 6.5). It is copy, not a literal in the panel, because it is user-facing text.
  'notification.restOver': 'Rest over',

  // --- toast queue (P8 Task 3; appended by that task) ---
  // The two tags naming where a one-line toast came from: a coach line is an instruction, a
  // telemetry line is a measured readout of the set just logged. Sentence case, because the
  // eyebrow's capitals are a text-transform in toastQueue.css: a skin does not have to shout.
  'label.coachNote': 'Coach',
  'label.telemetry': 'Telemetry',
  // The milestone line. "recorded", not "logged", and no exclamation mark (R8); P8 Task 10
  // owns the thresholds that decide when this is shown. A `{count}` slot, not an example
  // value: FORMAT.milestoneSets reads this key, so the words live here alone and a skin that
  // rewrites the sentence - including moving the count inside it - is honoured.
  'status.milestoneSets': '{count} sets recorded.', // template; FORMAT.milestoneSets fills it
  // The eyebrow over a drawn specimen card. The rarity word is the card's own enum, so it is
  // a slot rather than a literal; the sentence around it is this key's to rewrite.
  'status.specimenAcquired': '{rarity} specimen acquired', // template; FORMAT.specimenAcquired

  // --- Log view (P7 Task 4; appended by that task) ---
  // Section headings. Separate keys from the `quantity.*` field labels that carry the same
  // words: a skin retitles a section without also relabelling the input the user types into.
  'hero.bodyMass': 'Body mass',
  'hero.compliance': 'Compliance',
  // "Personal records", not "PRs": R11 names the quantity, and the list also carries an
  // estimated one-repetition maximum, which is not a record at all.
  'hero.personalRecords': 'Personal records',
  'hero.repsPerWeek': 'Best reps per week',
  // The accessible name of the compliance grid itself; each cell names its own day and mark.
  'label.complianceGrid': 'Session compliance by week',
  // States what is absent, not what the user should have done (R7): the Log view reports
  // history and asks for nothing. `advice.noWeeksYet` and `advice.noSetsLogged`, which the
  // grid and the records list also need, are already in the table above.
  'advice.noBodyMassLogged': 'No body mass logged yet.',
  // The five compliance marks. 'Missed' is a planned day that has passed without being
  // completed or deliberately skipped; 'Not planned' is a day the programme never assigned,
  // which is a rest day and never a failure (code review A48, where rest days were marked
  // non-compliant). The two are distinct words because they mean opposite things.
  'status.markCompleted': 'Completed',
  'status.markSkipped': 'Skipped',
  'status.markMissed': 'Missed',
  'status.markPlanned': 'Planned',
  'status.markNotPlanned': 'Not planned',
  // Shown where the Epley equation has no defensible input: no external load, or no set
  // inside its validity domain of ten repetitions.
  'status.noEstimated1RM': 'No estimated 1RM',

  // --- export view and summary document (P7 Task 5; appended by that task) ---
  'label.downloads': 'Downloads',
  'label.importSection': 'Import',
  // The textarea's label. The file picker beside it carries `label.chooseExportFile`, so
  // neither control has to name the other.
  'label.pasteExport': 'Paste a previous export',
  'label.chooseExportFile': 'Choose an export file',
  // Two phases, two words. Checking validates and writes nothing; replacing is the
  // destructive step and says which of the two it is (master plan section 3).
  'button.checkImport': 'Check import',
  'button.replaceData': 'Replace data',
  'advice.importInvalidNoChange': 'An invalid file changes nothing.',
  // The export gate master plan section 3 requires: the confirmation stays disabled until the
  // user has taken a copy of what the import is about to overwrite.
  'advice.downloadBackupFirst': 'Download the JSON backup first. It enables the control below.',
  'advice.exportUnavailable': 'The current data could not be read back. Nothing was downloaded.',
  // The summary document's stand-in for the targets block when the profile falls outside the
  // domain the nutrition equations were fitted on. Stated, not silently omitted.
  'advice.targetsNotEstimatedForProfile': 'Targets are not estimated for this profile.',

  // --- spotlight palette (P8 Task 8) ---
  // The dialog's own heading, which is also what names it to a screen reader.
  'hero.spotlight': 'Search',
  // The tap target that opens the palette on a phone, where there is no keyboard to press the
  // combo on. R2: three words or fewer, and it names the action rather than the mechanism.
  'button.openSpotlight': 'Search',
  // The combobox's accessible name, and its placeholder. It states what the palette searches,
  // so the empty field is not a guess: views and the exercises the plan prescribes.
  'label.spotlightQuery': 'Search views and exercises',
  // The listbox's accessible name. Separate from the field's, because a screen reader reads
  // the two in different places and 'Search views and exercises' is not what the list IS.
  'label.spotlightResults': 'Search results',
  // The kind of one result, shown on the row and read as part of it. A view and an exercise
  // can carry the same word (a 'Plan' view beside a planned exercise), so the row says which.
  'label.spotlightView': 'View',
  'label.spotlightExercise': 'Exercise',
  // The empty result set. It reports what is absent and asks for nothing (R7).
  'advice.noSpotlightMatch': 'No matches.',

  // --- legacy migration wizard (P7 Task 3; appended by that task) ---
  'hero.legacyImport': 'Import from the old app',
  'hero.legacyPreview': 'What the import will write',
  'hero.legacyDone': 'Import complete',
  // The offer. It states the fact and the one guarantee that makes accepting it safe; it asks
  // for nothing (R7).
  'advice.legacyFound': 'Data from the old app was found on this device.',
  'advice.legacyNothingDeleted': 'Nothing in the old app is deleted until you ask.',
  // The load unit is asked for, never assumed: the legacy store held a bare number, so a wrong
  // answer rescales the whole load history by the pound-to-kilogram factor.
  'advice.legacyUnitRequired': 'Choose a unit. A wrong unit rescales every load.',
  'advice.legacyRefused': 'The old data could not be read. Nothing has changed.',
  'advice.legacyApplyFailed': 'The import was refused. Nothing has changed.',
  'advice.legacyStored': 'The imported data is stored. The old data is still here.',
  // Shown when the write could not be confirmed. The delete is withheld in that case, so this
  // says which of the two things happened instead of reporting a success.
  'advice.legacyStoreUnconfirmed': 'The write was not confirmed. The old data is kept.',
  'advice.legacyOldDataDeleted': 'The old app data has been deleted.',
  'advice.legacyOldDataKept': 'The old app data was left in place.',
  // Disclosure bodies, exempt from R1-R4 (R9): a disclosure exists to hold what does not fit.
  'disclosure.legacyTransfers':
    'Logged sets, weekly push-up maxima, body-mass check-ins, beverage intake, daily notes, ' +
    'collected specimen cards, and a sealed time capsule. Every record the import cannot read ' +
    'is listed with its reason before anything is written.',
  // The evidence behind the body-mass assumption, stated so the user can overrule it rather
  // than trust it. Three independent legacy facts, not a preference.
  'disclosure.legacyBodyMassEvidence':
    'The old body-mass field was labelled lb, refused values outside the pound range, and its ' +
    'text export reported pounds. The load field carried no such evidence, which is why that ' +
    'unit is asked for instead of assumed.',
  'label.legacyLoadUnit': 'In which unit did you type your loads?',
  'label.legacyBodyMassUnit': 'In which unit did you type your body mass?',
  'label.legacyUnitKg': 'Kilograms (kg)',
  'label.legacyUnitLb': 'Pounds (lb)',
  // The body-mass radios carry their own labels rather than reusing the two above: both pairs
  // are in the document at once, so identical labels would name two controls each.
  'label.legacyMassUnitKg': 'Kilograms (kg), body mass',
  'label.legacyMassUnitLb': 'Pounds (lb), body mass',
  'disclosure.whatTransfers': 'What transfers',
  'disclosure.whatWasRefused': 'What was not imported, and why',
  'disclosure.whatWasNotMatched': 'Days not matched to a session',
  'button.legacyPreview': 'Preview import',
  'button.legacyApply': 'Keep this import',
  'button.legacyDismiss': 'Start clean',
  'button.legacyDeleteOld': 'Delete old data',
  'button.legacyKeepOld': 'Keep old data',
  'button.legacyClose': 'Close',
  // --- typed confirmation shell, shared by every destructive action (P7 Task 3 review) ---
  // The gate, stated before it is met. The word itself is not named here: FORMAT.typeToConfirm
  // owns that sentence, so the label and the compared word cannot say different things.
  'advice.exportBeforeConfirm': 'Download the backup before this can be confirmed.',
  'status.exportTaken': 'Backup downloaded.',
  // --- reminders and Home Screen install (P5 Task 8) ---
  'hero.reminders': 'Reminders',
  'label.remindersEnable': 'Enable reminders',
  // "Day-of" is hyphenated, not dashed: R5 bans the dash as a CONNECTOR, and this is one word.
  'label.reminderDayOfTime': 'Day-of reminder time',
  'label.reminderLeadTimes': 'Before each session',
  // template; FORMAT.reminderLead fills it from LEAD_MINUTE_CHOICES. [min] before the slot.
  'label.reminderLead': '{minutes} minutes before',
  // The two failures the user can see. Neither carries the underlying message: an HTTP status
  // or a push endpoint is not something the user can act on, and the endpoint is a credential.
  'advice.reminderSubscribeFailed': 'The browser refused to register this device.',
  'advice.reminderSyncFailed': 'The schedule did not reach the server.',
  'hero.installHomeScreen': 'Install to the Home Screen',
  'advice.installOnlyInstalledApp': 'Only an installed app receives notifications. A browser tab does not.',
  'advice.installIosVersion': 'Requires iOS 18.4 or later.',
  'label.installIos': 'iPhone and iPad',
  'status.installIosSafari': 'Open this page in Safari.',
  'status.installIosShare': 'Tap Share, the square with an upward arrow.',
  'status.installIosAdd': 'Scroll down, tap Add to Home Screen, then tap Add.',
  'status.installIosOpen': 'Open the app from the Home Screen icon.',
  'label.installAndroid': 'Android Chrome',
  'status.installAndroidMenu': 'Open the browser menu, the three dots.',
  'status.installAndroidInstall': 'Tap Install app, then confirm.',
  'status.installAndroidOpen': 'Open the app from the home screen icon.',

  // --- motivation modal (P6 Task 4; appended by that task) ---
  // The clip autoplays muted, which is the only autoplay any engine allows; sound needs a
  // gesture, and this line names it. Rendered only while the clip is still muted.
  'advice.tapForSound': 'Tap the video for sound.',

  // --- P4 final review fixes (appended by that task) ---
  // Two coach sentences src/domain/training/coach.ts ships that the ten `coach.*` keys above
  // never covered: the plain readout it falls back to for an AMRAP or timed prescription, and
  // the singular of the above-range line. The singular is its own key rather than a plural
  // marker passed in from the domain, because which words a count takes is a fact about the
  // language and belongs in this table.
  'coach.setReadout': '{load} × {reps} logged.', // template; FORMAT.withSlots
  'coach.aboveRangeOne': '{count} rep above the prescribed range.', // template
  // P4 review item 1. Shown beside the custom-exercise form when the store refuses the record.
  // It states the outcome and nothing about the cause: the causes the store's own gates raise
  // (a colliding id, a name the schema rejects) are faults in the caller, not choices the user
  // made, and the length bound the user CAN act on is reported by FORMAT.outOfRange instead.
  'status.customExerciseRefused': 'The exercise was not added.',
  // P4 review item 4. The refusal banner used to render the domain's thrown message verbatim,
  // function-name prefix and all ("startSession: the plan is paused on 2026-03-02"). These are
  // the refusals src/domain/schedule/cursor.ts and src/domain/schedule/calendar.ts mint, one
  // key each, mapped by src/ui/format/refusal.ts. The date is a slot, never a literal, so a
  // skin reorders the sentence without touching the day it names.
  'status.refusalPaused': 'The plan is paused on {date}.', // template
  'status.refusalSessionOpen': 'A session is already in progress on {date}.', // template
  'status.refusalAlreadyStarted': 'This session already started on {date}.', // template
  'status.refusalNotNextDay': '{date} is not the next session day.', // template
  'status.refusalLabelNotOffered':
    '{label} is not among the sessions remaining on {date}.', // template
  // Anything the mapper does not recognise. It says what happened and stops: naming a cause
  // this build cannot identify would be a guess presented as a fact.
  'status.refusalUnrecognised': 'That change was refused.',

  // --- motivation clip in Settings (P6 Task 6) ---
  // The section heading. "Video" rather than "clip" so it matches the popup this previews
  // ('hero.motivationPreview'); the FILE the user picks is a clip throughout.
  'hero.motivationVideo': 'Motivation video',
  // The picker's label, which is also the replace control: one clip is stored per profile, so
  // choosing a second one is the replacement. Two labels rather than one, because "Choose a
  // clip" over a section that already holds one would be asking for a second.
  'label.motivationClipChoose': 'Choose a clip',
  'label.motivationClipReplace': 'Replace the clip',
  // The two states with no file name to show. The second is what a reload leaves: the id
  // survives in the document, the name does not (see the note in MotivationSettings.tsx).
  'status.motivationClipNone': 'No clip chosen. The bundled clip plays.',
  'status.motivationClipStored': 'A clip is stored on this device.',
  'advice.motivationClipStorage': 'Stored on this device, never uploaded.',
  // R9: the limit and the unit the size line uses, behind the "why?" disclosure and therefore
  // exempt from R1-R4. Both figures are slots filled from the constants that enforce them, so
  // neither can drift from the value the picker actually refuses. FORMAT.withSlots.
  'advice.motivationClipLimit':
    'The limit is {bytes} bytes. Sizes here are reported in MiB, {mib} bytes each. ' +
    'A clip of 25 MiB or less plays back reliably on a phone.', // template
  'button.motivationClipPreview': 'Preview',
  'button.motivationClipRemove': 'Remove clip',
  // The two refusals src/domain/motivation/assets.ts mints, mapped by key in
  // MotivationSettings.tsx. Neither repeats what the thrown message says: the browser's MIME
  // type and the limit in bytes are not things the user can act on, and the limit is one
  // number, held above, rather than a second copy of it here that could drift.
  'status.motivationClipNotVideo': 'That file is not a video.',
  'status.motivationClipTooLarge': 'That file is over the size limit.',
  // Anything else the save threw. It states the outcome and stops.
  'status.motivationClipNotStored': 'The clip was not stored.',

  // --- time capsule (P8 Task 7; appended by that task) ---
  // The two controls the P8 block above did not name: the one that reaches the writing
  // dialog, and the one that reaches an already opened capsule again. Sealing and opening are
  // 'button.sealCapsule' and 'button.openCapsule'.
  'button.writeCapsule': 'Write capsule',
  'button.readCapsule': 'Read capsule',
  'label.capsuleNote': 'Note to your future self',
  'label.capsuleOpensOn': 'Opens on',
  // The sealed card. It states the open date and how far off it is, and carries no part of
  // the note: a sealed capsule that leaked a word of its contents would not be sealed.
  // {days} arrives from FORMAT.capsuleSealed already carrying its unit. [d]
  'status.capsuleSealed': 'Opens {date}, in {days}.', // formatted
  // The date the note was written, as a civil date in the profile's zone, never a UTC
  // instant. Shown only once the capsule is open.
  'status.capsuleWritten': 'Sealed {date}.', // formatted
  // The three refusals the writing dialog can state. Each names the bound it refuses against,
  // because a refusal that does not say what would be accepted is a dead end. The character
  // bound is src/domain/schema.ts MAX_NOTE_CHARS [characters]; the two dates are civil dates
  // in the profile's zone.
  'advice.capsuleNoteShort': 'Write at least {count} characters before sealing.', // formatted
  'advice.capsuleNoteLong': 'The note is longer than {count} characters.', // formatted
  'advice.capsuleDateRange': 'Pick a date between {from} and {to}.', // formatted
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

  // --- targets and settings, review fixes (P2 Task 8) ---

  /**
   * The why? text behind the daily beverage target. `why.beverageDefault` in the table above
   * is the formatted EXAMPLE of what this produces, in the same way as `advice.beverageDefault`.
   *
   * The two beverage figures arrive as the mL/day the engine actually prescribes
   * (`dailyBeverageTargetML`, itself BEVERAGE_TARGET_ML) and are converted to litres here, so
   * the sentence cannot state a share the app does not give. The 3.7 / 2.7 L figures stay
   * literal: they are the IOM TOTAL-water adequate intake, which this app neither stores nor
   * prescribes, and which is named only to say what the beverage share is a share of.
   */
  // --- pre-participation readiness screen (P2 Task 9) ---

  /**
   * "Screened 2026-09-01. No flags." The date is the LOCAL screening date held on the profile,
   * and the second sentence is a copy key (`status.readinessNoFlags` or
   * `status.readinessConsult`), so this frame states no outcome of its own.
   */
  screenedOn: (date: string, status: string): string => `Screened ${date}. ${status}`,

  beverageBasis: (maleML: number, femaleML: number): string =>
    'IOM 2005 beverage share of the total-water adequate intake, DOI 10.17226/10925. ' +
    'The adequate intake for total water is 3.7 L per day for men and 2.7 L for women, of ' +
    `which beverages supply ${(maleML / 1000).toFixed(1)} L and ${(femaleML / 1000).toFixed(1)} L. ` +
    'Water in food supplies the rest and is not counted here, because an app cannot measure it.',

  // --- Today view (P3 Task 5) ---

  /**
   * "Push, 07:00, 2 exercises". The label is the plan's own session label, the time is the
   * availability slot's `HH:mm` in the profile's zone, and the count is what the session
   * holds. Commas, not middots or dashes (copy contract R5).
   */
  sessionSummary: (label: string, startTime: string, exerciseCount: number): string =>
    `${label}, ${startTime}, ${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`,

  /**
   * "3–4 × 6–10 reps". Both operands arrive already formatted from src/ui/format/plan.ts, so
   * this frame owns the multiplication sign and nothing else. The en dashes are numeric
   * ranges, which R5 retains.
   */
  setsBy: (sets: string, prescription: string): string => `${sets} × ${prescription}`,

  /** "Next: Wed 07:00 Push." The weekday abbreviation comes from a LocalDate, never a Date. */
  nextSession: (weekday: string, startTime: string, label: string): string =>
    `Next: ${weekday} ${startTime} ${label}.`,

  /** "Plan paused since 2026-09-07." The date is the open pause's own `from`. */
  pausedSince: (date: string): string => `Plan paused since ${date}.`,

  /** "Reason: illness". The reason is the user's text, reproduced and never classified. */
  skipReason: (reason: string): string => `Reason: ${reason}`,

  /** "Train Legs today". The label is one of remainingLabelsThisWeek. */
  trainLabelToday: (label: string): string => `Train ${label} today`,

  /** "6 of 6 sessions closed on 2026-09-07." The date is PlanCursor.completedOn. */
  programmeClosed: (total: number, date: string): string =>
    `${total} of ${total} sessions closed on ${date}.`,

  // --- session indicator in the top bar (P3 Task 7) ---

  /**
   * "S 12/48", and "S 6/6 complete" once the cursor is terminal. `S` is the SESSION the
   * plan cursor stands at, never the calendar day: the two diverge the moment a session is
   * missed. `shown` and `total` are counts of sessions, 1-based and already clamped by the
   * caller. `suffix` is a copy key's string (`status.planComplete`) or '', so this frame
   * states no outcome of its own.
   */
  planPosition: (shown: number, total: number, suffix: string): string =>
    suffix === '' ? `S ${shown}/${total}` : `S ${shown}/${total} ${suffix}`,

  /**
   * The same position spelled out for a screen reader: "Session 12 of 48", and
   * "Session 6 of 6. Programme complete." The abbreviated visible form is unreadable
   * aloud, so the indicator's accessible name comes from here instead. `status` is a copy
   * key's string (`hero.programmeComplete`) or '', as in `screenedOn` above.
   */
  planPositionLabel: (shown: number, total: number, status: string): string =>
    status === ''
      ? `Session ${shown} of ${total}`
      : `Session ${shown} of ${total}. ${status}`,

  // --- Plan view (P3 Task 6) ---

  /** "Block 2". `blockNumber` is 1-based; `PlanBlock.index` is 0-based, so the view adds one. */
  blockLabel: (blockNumber: number): string => `Block ${blockNumber}`,

  /**
   * "sessions 4–6": the plan positions a block covers, 1-based and inclusive. The en dash is a
   * numeric range, which copy contract R5 retains.
   */
  blockSessions: (from: number, to: number): string => `sessions ${from}–${to}`,

  /**
   * "volume −50 %, load unchanged". `cutPct` is the percentage of PLANNED SETS the block
   * removes, computed by the caller from `PlanBlock.setModifier` so the note can never
   * overstate a cut the plan does not make. The load half is not a variable: master plan
   * section 5 and content review section 2.2 (Bosquet 2007) fix `loadModifier` at 1 for a
   * deload, so a deload that changed the load would be a defect, not a different sentence.
   * The leading mark is U+2212 MINUS SIGN, not a dash: it is arithmetic, not a connector.
   */
  deloadNote: (cutPct: number): string => `volume −${cutPct} %, load unchanged`,

  /** "Week 1 of 2". Both are 1-based counts of weeks over the whole plan. */
  weekOfCount: (shown: number, total: number): string => `Week ${shown} of ${total}`,

  /**
   * R9's disclosure body for a deload week: the multiplication behind the set counts printed
   * beside it. `setModifier` is the block's own, dimensionless multiplier.
   */
  deloadSetsBasis: (setModifier: number): string =>
    `Each set count is the planned count times this block's set modifier of ${setModifier}, rounded to the nearest whole set, minimum 1. The load is unchanged.`,

  // --- video and form-cue modals (P4 Task 8) ---

  /**
   * "instance 2 of 6": which Invidious front-end the modal is framing. `shown` is 1-based;
   * the modal holds a 0-based index into `src/config/videoInstances.ts`, so the view adds one.
   * `total` is that list's length, which is also what generates the CSP frame-src allowlist,
   * so the count the user reads and the count the browser enforces cannot differ.
   */
  videoInstanceOf: (shown: number, total: number): string => `instance ${shown} of ${total}`,

  // --- Train view (P4 Task 10) ---

  /** "SESSION 1, Upper". Commas, not middots or dashes (copy contract R5). */
  sessionEyebrow: (ordinal: number, label: string): string => `SESSION ${ordinal}, ${label}`,

  /** "SET 2/3": the set's position in the count this block prescribes, after the modifier. */
  setCounter: (n: number, targetSets: number): string => `SET ${n}/${targetSets}`,

  /**
   * "Set 2 load", the quantity name of one row's load field. It is per-row rather than a bare
   * "Load" because every row on the card carries one, and a label repeated three times names
   * nothing (the field's accessible name is this string plus the unit).
   */
  setLoadQuantity: (n: number): string => `Set ${n} load`,

  /** "Set 2 reps". Repetitions are a dimensionless count, so no unit is composed onto it. */
  setRepsQuantity: (n: number): string => `Set ${n} reps`,

  /**
   * "Set 2 duration", the quantity a `time` or `duration` prescription collects instead of a
   * repetition count. The field composes the unit onto it the way every other UnitInput does,
   * so the label reads "Set 2 duration (s)" and the seconds are part of the accessible name.
   */
  setDurationQuantity: (n: number): string => `Set ${n} duration`,

  /** "Set 2 bodyweight": the toggle that stores loadKg 0 rather than an entered load. */
  setBodyweightQuantity: (n: number): string => `Set ${n} bodyweight`,

  /** The accessible name of one row's log control; the visible word is `button.logSet`. */
  logSetLabel: (n: number): string => `Log set ${n}`,

  /** The accessible name of one row's delete control; the visible word is `button.deleteSet`. */
  deleteSetLabel: (n: number): string => `Delete set ${n}`,

  /**
   * "60 kg × 8", one logged set. The load arrives already formatted by src/domain/units.ts, so
   * a logged value is never re-rounded here, and "BW" reaches this frame unchanged.
   */
  loggedSet: (load: string, reps: string): string => `${load} × ${reps}`,

  /**
   * "BW × 45 s", one logged timed set. Separate from `loggedSet` because the second operand
   * is a DURATION and carries its unit: printing "BW × 45" beside "60 kg × 8" would make a
   * hold indistinguishable from a rep count at a glance.
   */
  loggedTimedSet: (load: string, durationS: number): string => `${load} × ${durationS} s`,

  /** "2/3": sets logged today against the count this block prescribes. */
  exerciseProgress: (done: number, targetSets: number): string => `${done}/${targetSets}`,

  /** "Cable crunch (bonus)": an exercise added to the session beyond the plan. */
  bonusExerciseName: (name: string): string => `${name} (bonus)`,

  /**
   * "Last session 2026-02-27: 60 kg × 8, 8, 8". The date is the assignment's own LocalDate,
   * never a wall-clock rendering, and the reps are that session's list in programme order.
   */
  lastSessionSets: (date: string, load: string, reps: string): string =>
    `Last session ${date}: ${load} × ${reps}`,

  /**
   * "Suggested 62.5 kg: add load". The load is what the user dials in, so it is inline (R9);
   * how it was derived is not, and lives in the why? disclosure beside it. `kind` is one of
   * the `status.advice*` keys, so this frame states no decision of its own.
   */
  suggestedLoad: (load: string, kind: string): string => `Suggested ${load}: ${kind}`,

  /**
   * "2:00" — a clock readout, not a sentence. Seconds are zero-padded to two digits so the
   * width does not jump as the count falls; minutes are not, because a rest interval is
   * single-digit minutes.
   */
  restRemaining: (minutes: number, seconds: number): string =>
    `${minutes}:${String(seconds).padStart(2, '0')}`,

  /** "Log 250 mL": the drink control, whose volume is the profile's own editable cup size. */
  logVolume: (volume: string): string => `Log ${volume}`,

  /**
   * "Beverage intake 900 mL of 2600 mL today." Both volumes arrive formatted by
   * src/domain/units.ts, so the sentence cannot state a unit the profile does not use.
   */
  beverageShortfall: (logged: string, target: string): string =>
    `Beverage intake ${logged} of ${target} today.`,

  /**
   * R9's disclosure body behind `advice.fluidLoss`: the measured loss against the threshold it
   * exceeded. `lossPct` is already fixed to one decimal by the caller (a percentage of the
   * pre-session mass); `thresholdPct` is DEHYDRATION_LOSS_FRACTION as a percentage, passed in
   * rather than written here so the sentence and the comparison cannot drift apart.
   */
  fluidLossWhy: (lossPct: string, thresholdPct: number): string =>
    `Loss of ${lossPct} % of pre-session mass, above the ${thresholdPct} % threshold (ACSM 2007).`,

  // --- toast queue (P8 Task 3) ---

  /**
   * "250 sets recorded." The words are `status.milestoneSets`, read rather than restated, so a
   * skin overriding that key changes what is rendered; this frame owns the substitution and
   * nothing else. The count arrives already rendered as a string, so no grouping or locale
   * decision is taken in this file; P8 Task 10 owns the milestone thresholds and the grouped
   * form of the count.
   *
   * The replacement is a FUNCTION, not a string: `String.replace` expands `$&` and friends in
   * a string replacement, and a value that happened to contain one would be rewritten by the
   * frame that is supposed to be inserting it verbatim.
   */
  milestoneSets: (count: string, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('status.milestoneSets', overrides).replace('{count}', () => count),

  /**
   * "common specimen acquired": the eyebrow over a drawn specimen card. The rarity is the
   * card's own `SpecimenRarity`, passed in rather than written here, so the word the user
   * reads and the draw weight behind it cannot drift apart; the sentence around it is
   * `status.specimenAcquired`, so a skin override applies to it. The capitals are a
   * text-transform in toastQueue.css.
   */
  specimenAcquired: (rarity: string, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('status.specimenAcquired', overrides).replace('{rarity}', () => rarity),

  // --- Log view (P7 Task 4) ---

  /**
   * "8 reps": a repetition count with its quantity name. Repetitions are dimensionless, so
   * this composes no unit; it exists so a chart axis and a caption name the count the same
   * way. It sits here rather than in src/ui/format/plan.ts only because that module is not in
   * this task's file list; it is a quantity rendering and belongs beside `formatPrescription`.
   */
  repsCount: (reps: number): string => `${reps} reps`,

  /**
   * The accessible name of the body-mass chart. It states the span of BOTH axes and the newest
   * reading, because a screen reader gets no shape from the path: the range says what the
   * picture covers and the last value says where the series ended. Both masses arrive already
   * formatted by src/domain/units.ts, so the sentence cannot state a unit the profile does not
   * use.
   */
  bodyMassChartLabel: (
    fromDate: string,
    toDate: string,
    lowMass: string,
    highMass: string,
    lastMass: string,
    lastDate: string,
  ): string =>
    `Body mass ${fromDate} to ${toDate}, ${lowMass} to ${highMass}. Last ${lastMass} on ${lastDate}.`,

  /** The same name for a chart that has a projection but no measurement on it yet. */
  bodyMassChartEmptyLabel: (
    fromDate: string,
    toDate: string,
    lowMass: string,
    highMass: string,
  ): string =>
    `Body mass ${fromDate} to ${toDate}, ${lowMass} to ${highMass}. No measurement logged.`,

  /**
   * R9's disclosure body behind the body-mass chart: the rate the dashed projection is drawn
   * at. Signed, and formatted by src/domain/units.ts, so a negative rate reads as the loss it
   * is. The rule that produced it is `NutritionTargets.basis.rateRule` and is printed beside
   * this line by the view, never concatenated into it.
   */
  bodyMassProjection: (ratePerWeek: string): string => `Projection ${ratePerWeek} per week.`,

  /**
   * "2026-01-19: 93.1 kg", the hover title of one measured point. The mass arrives already
   * formatted by src/domain/units.ts, and the date is the entry's own LocalDate rather than a
   * wall-clock rendering.
   */
  bodyMassPoint: (date: string, mass: string): string => `${date}: ${mass}`,

  /** "2026-01-05: 12 reps", the hover title of one point on a weekly AMRAP sparkline. */
  amrapPoint: (weekStart: string, reps: string): string => `${weekStart}: ${reps}`,

  /** "2026-01-05: Completed", the accessible name of one compliance cell. */
  complianceCell: (date: string, mark: string): string => `${date}: ${mark}`,

  /**
   * "Week of 2026-01-05: 2 of 3 completed". Two counts, not a difference: the signed delta is
   * arithmetic and belongs behind a disclosure (R9), while the two counts are the facts the
   * user reads the row for.
   */
  complianceWeek: (monday: string, completed: number, target: number): string =>
    `Week of ${monday}: ${completed} of ${target} completed`,

  /**
   * "99 kg estimated 1RM". The word "estimated" is not decoration: the Epley figure carries a
   * standard error of estimate of several kilograms (Reynolds 2006) and must never be read as
   * a measured maximum. The load arrives already formatted by src/domain/units.ts.
   */
  estimated1RM: (load: string): string => `${load} estimated 1RM`,

  /** The empty state of one exercise's sparkline, naming the exercise it is empty for. */
  noSetsForExercise: (name: string): string => `No ${name} sets logged yet.`,

  /** "Push-up: best 15 reps in one set", the caption under a weekly AMRAP sparkline. */
  amrapBest: (name: string, reps: number): string =>
    `${name}: best ${reps} reps in one set`,

  /** The accessible name of an AMRAP sparkline: the week range it covers and its last point. */
  amrapChartLabel: (name: string, fromWeek: string, toWeek: string, lastReps: number): string =>
    `${name} best reps per week, ${fromWeek} to ${toWeek}. Last ${lastReps} reps.`,

  // --- export view and summary document (P7 Task 5) ---

  /**
   * "The calendar holds the next 28 days." The horizon is the view's own constant, passed in
   * rather than written here, so the sentence and the projection cannot state different
   * windows.
   */
  calendarWindow: (days: number): string => `The calendar holds the next ${days} days.`,

  /** "Each session carries an alarm 2 hours before it." The lead is the view's constant. */
  calendarAlarmLead: (hours: number): string =>
    `Each session carries an alarm ${hours} hours before it.`,

  /**
   * The refusal a schema rejection produces. `reason` is the validator's own path-and-message
   * string, kept verbatim: it names the field that failed, which is the only thing that tells
   * the user which file to go back to.
   */
  importRejected: (reason: string): string =>
    `The import was rejected: ${reason}. Nothing has been changed.`,

  /** The summary document's closing line, naming the unit every figure above it is in. */
  summaryUnitsFooter: (unit: string): string =>
    `All loads and masses in this document are in ${unit}.`,

  /** The summary document's stated failure when the profile it was asked for is absent. */
  summaryNoProfile: (profileId: string): string =>
    `There is no profile with id "${profileId}" in this document.`,

  // --- legacy migration wizard (P7 Task 3) ---
  // Counts, never differences: the preview reports what each figure is, and the reasons sit
  // beside them in a disclosure rather than being summed into one number (R9).

  /**
   * "22 sets", one line of the migration preview. [sets]
   *
   * The four counters below singularise, in the pattern sessionSummary already uses: a preview
   * that reports "1 sets" reads as a formatting fault, and a user weighing an irreversible
   * import is entitled to doubt every other number on the screen once one of them is wrong.
   */
  legacySets: (sets: number): string => `${sets} ${sets === 1 ? 'set' : 'sets'}`,

  /** "7 sessions": the training sessions the import reconstructs. [sessions] */
  legacySessions: (sessions: number): string =>
    `${sessions} ${sessions === 1 ? 'session' : 'sessions'}`,

  /** "17 records not imported". Each reason is listed behind a disclosure. */
  legacyDropped: (records: number): string =>
    `${records} ${records === 1 ? 'record' : 'records'} not imported`,

  /** "3 days not matched to a session". [d] Those sets are kept under a legacy session id. */
  legacyFallbacks: (days: number): string =>
    `${days} ${days === 1 ? 'day' : 'days'} not matched to a session`,

  /**
   * The label above a typed-confirmation field: "Type DELETE to confirm".
   *
   * A frame rather than a fixed string (code review finding 3). The word is the same value
   * ConfirmDestructive compares the typed text against, so a skin that rewrites the sentence
   * cannot name a word the gate will not accept and leave the control permanently disabled.
   */
  typeToConfirm: (word: string): string => `Type ${word} to confirm`,

  /** One refused record: its legacy key, and the migration's own wording for the refusal. */
  legacySkip: (key: string, reason: string): string => `${key}: ${reason}`,

  /** The body-mass unit the import will assume, shown before it runs. */
  legacyBodyMassAssumed: (unit: string): string => `Body mass is read as ${unit}.`,

  /** Both unit assumptions, echoed back from the report the import actually produced. */
  legacyUnitsAssumed: (loads: string, bodyMass: string): string =>
    `Loads read as ${loads}. Body mass read as ${bodyMass}.`,

  /** Why the import was refused, in the migration's own words. */
  legacyRefusedReason: (reason: string): string => `Reason: ${reason}`,
  // --- reminders (P5 Task 8) ---

  /**
   * "120 minutes before", one lead-time choice. The words are `label.reminderLead`, read
   * rather than restated, so a skin override reaches the rendered label; the number comes
   * from LEAD_MINUTE_CHOICES in src/config/reminders.ts. [min] before the slot start.
   */
  reminderLead: (minutes: number, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('label.reminderLead', overrides).replace('{minutes}', () => String(minutes)),

  /**
   * "Reminders are on. Schedule last sent at 17:00." The time is a local wall clock in the
   * profile's zone, formatted by src/domain/dates.ts, never a UTC instant.
   */
  remindersActive: (time: string, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('status.remindersActive', overrides).replace('{time}', () => time),

  // --- P4 final review fixes ---

  /**
   * One template key, with every `{slot}` in it replaced by the matching member of `params`.
   *
   * The named frames above each own one sentence. This one exists for the two families whose
   * key is chosen by a domain module rather than by the call site: the coach lines
   * (`src/domain/training/coach.ts` returns a `CopyKey` and its values) and the schedule
   * refusals (`src/ui/format/refusal.ts` maps a thrown message onto a key). Writing eleven and
   * six named frames instead would put the same substitution in seventeen places and still
   * leave the caller choosing between them by key.
   *
   * A slot with no matching member is left standing rather than replaced with "undefined", so
   * a template and a caller that have drifted apart show the slot name and fail a test rather
   * than shipping a sentence with a hole in it.
   *
   * The replacement is a FUNCTION for the reason `milestoneSets` records: `String.replace`
   * expands `$&` and friends in a string replacement, and a value containing one would be
   * rewritten by the frame that is supposed to insert it verbatim.
   */
  withSlots: (
    key: CopyKey,
    params: Readonly<Record<string, string | number>>,
    overrides?: Partial<Record<CopyKey, string>>,
  ): string =>
    copy(key, overrides).replace(/\{(\w+)\}/g, (slot, name: string) => {
      const value = params[name];
      return value === undefined ? slot : String(value);
    }),

  // --- motivation clip in Settings (P6 Task 6) ---

  /**
   * "Clip: holiday.mp4". The file name the browser reported for the clip that was picked.
   * Never a path: File.name carries the base name only, which is all the user needs to tell
   * one clip from another.
   */
  motivationClipName: (name: string): string => `Clip: ${name}`,

  /** "12.4 MiB": the stored clip's size, one number with its unit. [MiB] */
  motivationClipSize: (mib: string): string => `${mib} MiB`,

  // --- time capsule (P8 Task 7) ---

  /**
   * "Opens 2026-11-29, in 30 days." The date is the capsule's own LocalDate and the count is
   * whole calendar days from today to it (src/domain/dates.ts daysBetween), never a difference
   * of wall clocks. The unit word is singularised here, in the pattern legacySets uses, so a
   * capsule one day off does not read "in 1 days". [d]
   */
  capsuleSealed: (
    date: string,
    days: number,
    overrides?: Partial<Record<CopyKey, string>>,
  ): string =>
    copy('status.capsuleSealed', overrides)
      .replace('{date}', () => date)
      .replace('{days}', () => `${days} ${days === 1 ? 'day' : 'days'}`),

  /** "Sealed 2026-09-07.": the civil date the note was written, in the profile's zone. */
  capsuleWritten: (date: string, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('status.capsuleWritten', overrides).replace('{date}', () => date),

  /**
   * "9 of 5000 characters": what has been written, against the bound the schema enforces.
   * Two counts, never their difference, in the pattern complianceWeek uses. [characters]
   */
  capsuleCount: (written: number, max: number): string => `${written} of ${max} characters`,

  /** "Write at least 20 characters before sealing." [characters] */
  capsuleNoteShort: (count: number, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('advice.capsuleNoteShort', overrides).replace('{count}', () => String(count)),

  /** "The note is longer than 5000 characters." The bound is schema.ts MAX_NOTE_CHARS. */
  capsuleNoteLong: (count: number, overrides?: Partial<Record<CopyKey, string>>): string =>
    copy('advice.capsuleNoteLong', overrides).replace('{count}', () => String(count)),

  /** "Pick a date between 2026-09-14 and 2028-09-06." Both bounds are civil dates. */
  capsuleDateRange: (
    from: string,
    to: string,
    overrides?: Partial<Record<CopyKey, string>>,
  ): string =>
    copy('advice.capsuleDateRange', overrides)
      .replace('{from}', () => from)
      .replace('{to}', () => to),
} as const;
