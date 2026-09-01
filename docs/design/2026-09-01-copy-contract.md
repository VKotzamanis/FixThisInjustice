# Copy contract (default skin)

Status: binding on every UI task in P1–P8. Master plan §3 "Copy in all user-facing strings" points here.

The default skin is clinical: it states what happened and what to do, and nothing else. A skin may
change register (master plan §3 "Skins"); it may not change a number, a unit, or the meaning of a
plan-altering control, and R1–R4 and R9 bind every skin.

## Rules

Word counts exclude numerals and units (`60 kg × 8` counts as one word).

**R1 — A button is at most 3 words.**
Before: `Train something else today` · After: `Train something else`

**R2 — A hero (h1/h2, the one line the screen is about) is at most 8 words.**
Before: `two of four, bestie. the week flopped, not you.` · After: `Weekly target missed`

**R3 — An advice line is at most 12 words.**
Before: `Log your post-session body mass. A loss above two per cent of your pre-session mass means fluid replacement was inadequate (ACSM 2007).`
After: `Log your post-session body mass.` The rest moves behind R9.

**R4 — A banner is at most 2 short sentences.**
Before: `The document could not be serialised, so nothing was written and the stored document is unchanged. Retry the save; if it fails again, export the last stored document before making further changes.`
After: `The change could not be saved. The stored copy is unchanged.`

**R5 — No em-dash or en-dash as a connector.** Use a colon, a comma, a semicolon, or two sentences.
Before: `Sedentary — desk work, little walking` · After: `Sedentary: desk work, little walking`
Retained: an en-dash in a numeric range (`6–8 reps`, `3–4 × 6–10`); a bare `—` in a table cell or a
value slot meaning *no value* (`session — of 24`), which is a placeholder, not a connector.

**R6 — No emoji in the default skin.** Status glyphs already in the token set (`✓ ✗ ⚠ ✕`) are marks,
not emoji, and stay.
Before: `🏆 NEW PR · previous best 60 kg` · After: `Load PR. Previous best 60 kg × 8.`

**R7 — No hedging and no filler.** Cut "just", "simply", "please", "we", "you might want to", and any
clause about the app's own construction.
Before: `It is added in the next plan; this build carries the storage, schema and unit layers it needs.`
After: `Setup is not built yet.`

**R8 — No exclamation marks.** P8's own test for `milestoneMessage` is named "states the count
without motivational filler"; that is the register everywhere.
Before: `1,000 sets logged!` · After: `1,000 sets recorded.`

**R9 — Arithmetic goes behind a "why?" disclosure.** Progression percentages, plate rounding, delta
formulas, and unit conversions are never inline.
Criterion for inlining: *show it inline only if the user must act differently because of it.* A
suggested load the user will dial in must be inline; how it was rounded must not.
Before: `All sets reached 8 reps on 25 Aug, so +2.5 % (3.4 lb) rounded up to the 5 lb barbell step. Entered in lb, stored as 63.50 kg.`
After: `Suggested 65 lb` plus `<details><summary>why?</summary>` carrying the same sentence verbatim.
The disclosure is a `<details>` element with the literal summary `why?`. Where a component has no
disclosure, add one; where a domain function produces the sentence, it returns it as a separate
`why` string and never concatenates it into the message.

**R10 — Exempt content.** Exercise form cues, exercise notes and tips, Atlas card bodies and
citations, and the reminders runbook (`worker/RUNBOOK.md`) are exempt from R1–R4 and R9. They are
reference text a user chooses to open. They are **not** exempt from R5, R6 or R11.

**R11 — Name the defined quantity.** Never a colloquial stand-in, in copy or in identifiers.
Before: `weight`, `calories`, `water` · After: `load` (kg on a bar) or `body mass`; `kcal`;
`beverage intake (mL)`. Likewise RPE, RIR, 1RM, e1RM, `T_p`-style names where the field has one.

## Where the copy lives

`src/content/copy.ts` exports the default table. A view imports `copy('button.startSession')`, never a
literal. A skin supplies `Partial<Record<CopyKey, string>>` merged over the default, selected by
`UiPrefs.skin`. Strings that interpolate a value are functions of their arguments, not templates
assembled at the call site, so a skin can reorder them.

Test assertions quote the default table. Changing a string here changes its test in the same commit.

## `src/content/copy.ts` (default, clinical)

Paste this block; P2–P8 append their own keys to both the union and the table in the same task that
first renders them.

```ts
/**
 * User-facing copy, default (clinical) skin.
 *
 * Contract: docs/design/2026-09-01-copy-contract.md. Every string here obeys R1-R11.
 * Numbers, units and quantity names are part of the contract, not of the skin: a skin may
 * rewrite the sentence around `60 kg`, never `60 kg` itself.
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
  | 'status.setsLogged';

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
  'banner.loadInvalid.body': 'Stored data did not validate: unrecognized key. Nothing was overwritten.', // formatted
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
  'why.postSessionMass': 'A loss above 2 % of pre-session mass means fluid replacement was inadequate (ACSM 2007).',
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
};
```

