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
The disclosure is a `<details>` element. Its summary is the literal `why?` when it carries
arithmetic or a derivation, and a descriptive noun phrase of at most 5 words when it carries a list
or reference content ("What transfers", "What could not be imported, and why"). Text inside a
disclosure is exempt from R1-R4: the disclosure exists to hold what does not fit. Where a component
has no disclosure, add one; where a domain function produces the sentence, it returns it as a
separate `why` string and never concatenates it into the message.

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


---

## Sweep of the P2–P8 plans (2026-09-01)

Every user-visible string literal changed in `docs/plans/2026-09-01-0[2-8]-*.md`, with its matching
test assertion. Long paragraphs are quoted by their opening clause. Rows marked **+why** also gained
a `<details>` disclosure carrying the text that was removed from the inline copy. P2 Tasks 1 and 2
were in execution and were not touched.

| Plan | Task | Before | After |
| --- | --- | --- | --- |
| P2 | 3 | `Rear foot elevated. Unloaded when no dumbbells are available — log the load as 0.` | `… available; log the load as 0.` |
| P2 | 7 | `Sedentary — desk work, little walking` (and the other four activity labels) | `Sedentary: desk work, little walking` |
| P2 | 7 | `Step 1 of 8 — Units` | `Step 1 of 8: Units` |
| P2 | 7 | `Chosen once. Every field below is labelled in this unit; values are stored in kilograms and converted exactly.` | `Chosen once. Values are stored in kg and converted exactly.` |
| P2 | 7 | `Detected from this device. Every date and reminder is computed in this zone.` | `Detected from this device. Dates and reminders use this zone.` |
| P2 | 7 | `Not a recognised IANA time zone identifier.` | `Not a recognised IANA time zone.` |
| P2 | 7 | `Sex is collected because the resting-metabolic-rate equation, the body-fat equation and the fluid target each take a sex term. Nothing else in the app does.` | `Used by the RMR, body-fat and fluid equations. Nothing else.` |
| P2 | 7 | `Body fat is optional. With it the engine uses the Cunningham fat-free-mass equation and sets protein per kilogram of fat-free mass; without it, …` | `Optional. With it, RMR and protein use fat-free mass.` **+why** |
| P2 | 7 | `US Navy circumference method, metric form. All girths in centimetres, measured horizontally, tape snug but not compressing.` | `US Navy circumference method. All girths in cm, tape snug.` |
| P2 | 7 | `Enter neck, abdomen I and hip girths to estimate.` / `Enter neck and abdomen II girths to estimate.` | `Enter neck, abdomen I and hip girths.` / `Enter neck and abdomen II girths.` |
| P2 | 7 | `21.9 % body fat, standard error 3.52 percentage points. Use it to track change over time, not as an absolute number.` | `21.9 % body fat, ± 3.52 percentage points.` **+why** |
| P2 | 7 | `Novice — under one year of consistent training` (and the other two experience options) | `Novice: under one year of consistent training` |
| P2 | 7 | `Load steps set the smallest increment a suggested load may use. Defaults are the common smallest plate pair.` | `The smallest increment a suggested load may use.` |
| P2 | 7 | `The only supplement the app tracks. Maintenance dose is scaled by body mass.` | `The only supplement tracked. Dose scales with body mass.` |
| P2 | 7 | `Every fourth week is a deload: set counts are halved and the load is unchanged.` | `Every fourth week halves set counts. Load is unchanged.` |
| P2 | 7 | `<summary>Basis</summary>` | `<summary>why?</summary>` |
| P2 | 8 | `Intake check-in — 2026-09-01` | `Intake check-in: 2026-09-01` |
| P2 | 8 | `<summary>How these numbers were derived</summary>` | `<summary>why?</summary>` |
| P2 | 8 | `Stored values never change with this setting: mass is always held in kilograms and converted for display.` | `Stored values never change. Mass is always held in kg.` |
| P2 | 8 | `Default for the stated sex is 3000 mL of beverages per day (IOM 2005, DOI …). Water in food is additional …` | `Default for the stated sex: 3000 mL per day.` **+why** |
| P2 | 8 | `Today is delivered in P3.` | `Today is not built yet.` |
| P3 | 5 | button `Train something else today` (+2 assertions) | `Train something else` |
| P3 | 5 | `Next session: Wed 07:00 — Push.` (+1 assertion) | `Next: Wed 07:00 Push.` |
| P3 | 5 | `No further session is scheduled in the next 14 days.` | `No sessions in the next 14 days.` |
| P4 | 2 | `2 reps above the prescribed range. Earn the load increment next session.` (+1 assertion) | `2 reps above the prescribed range.` |
| P4 | 5 | `Log your post-session body mass. A loss above two per cent of your pre-session mass means fluid replacement was inadequate (ACSM 2007).` | `Log your post-session body mass.` **+why** |
| P4 | 8 | `No specific clip is recorded for this exercise.` | `No clip recorded for this exercise.` |
| P4 | 8 | link `Open in a new tab` | `Open clip` |
| P4 | 8 | link `Search this instance` | `Search instance` |
| P4 | 10 | `<span className="ex-reason">{advice.reason}</span>` shown inline | same span, moved inside `<details><summary>why?</summary>` |
| P4 | 10 | `Loss of 2.4 per cent of pre-session mass, above the 2 per cent threshold (ACSM 2007). Replace the deficit over the hours after the session.` | `Fluid loss above 2 %. Replace it over the next hours.` **+why** |
| P4 | 10 | button `Form cues and common mistakes` | `Form cues` |
| P4 | 10 | button `Add a bonus set` | `Add set` |
| P4 | 10 | button `Add an exercise to this session` (+1 assertion) | `Add exercise` |
| P4 | 10 | submit button `Add exercise` (+1 assertion) | `Add` |
| P4 | 10 | `No profile is active. Complete setup first.` | `No profile. Complete setup first.` |
| P5 | 5 | push body `Upper A at 18:00 — session 3 of 24` (+8 fixtures and assertions) | `Upper A at 18:00, session 3 of 24` |
| P5 | 8 | `Add this app to the Home Screen before enabling reminders.` (+1 assertion, +1 runbook reference) | `Add this app to the Home Screen first.` |
| P5 | 8 | `Notification permission is denied. Re-enable it in the browser or system settings.` (+1 assertion) | `Notifications are blocked. Re-enable them in settings.` |
| P5 | 8 | `Reminders are on. The schedule has not reached the server yet.` (+1 assertion, +1 runbook reference) | `Reminders are on. Schedule not sent yet.` |
| P5 | 8 | `On iPhone and iPad, notifications reach a web app only once it is installed to the Home Screen. Safari tabs do not receive them.` | `On iPhone and iPad, only an installed app receives notifications. Safari tabs do not.` |
| P5 | 10 | runbook: 8 em-dash connectors (title, secret row, key-pair note, health-check note, install note, smoke-test step 9, two troubleshooting rows) | colons, semicolons or two sentences |
| P6 | 1 | `Week of 2026-08-24: 1 of 4 sessions completed. Target missed by 3.` (+4 assertions) | `Week of 2026-08-24: 1 of 4 sessions completed.` |
| P6 | 2 | `Not a video file: MIME type "video/x".` | `Not a video file: video/x.` |
| P6 | 2 | `File is 157286401 bytes; the limit is 157286400 bytes.` | `File is too large. The limit is 157286400 bytes.` |
| P6 | 4 | heading `Motivation video — preview` (+1 assertion) | `Motivation video: preview` |
| P6 | 4 | `Preview. No weekly review is being reported.` (+2 assertions) | `Preview. No week is being reported.` |
| P6 | 4 | button `Don't show again for this week` (+2 assertions, +2 prose references) | `Mute this week` |
| P6 | 6 | `Bundled clip: absent. Ship one at public/media/motivation.mp4, or choose a file below.` | `Bundled clip: absent. Choose a file below.` |
| P6 | 6 | `Stored in this browser only and never uploaded. Hard limit 157286400 bytes (150 MiB); a clip of 25 MiB or less is recommended.` | `Stored in this browser only, never uploaded. Limit 150 MiB.` **+why** |
| P7 | 3 | `The data stored by the old app could not be read as JSON. Nothing has been changed. Download the raw copy below and keep it; then start clean.` | `The old data could not be read as JSON. Nothing has been changed.` |
| P7 | 3 | `Data from the old app was found on this device. Before it can be imported, this app needs your profile and a training plan — …` | `Old data was found. Set up your profile first.` **+why** |
| P7 | 3 | `Nothing is deleted from the old app at any point.` | `Nothing is deleted from the old app.` |
| P7 | 3 | `Data from the old app was found on this device. It can be imported: logged sets, weekly push-up maxima, …` | `Old data was found on this device.` + `<details><summary>What transfers</summary>` |
| P7 | 3 | `Two things the old app never recorded have to be supplied: … a wrong answer here silently rescales your entire history.` | `The old app stored bare numbers. A wrong unit rescales your history.` |
| P7 | 3 | `Nothing is deleted from the old app. Its data stays on this device until you remove it yourself in Settings.` | merged into the single `Nothing is deleted from the old app.` line |
| P7 | 3 | rejection list `<code>{s.key}</code> — {s.reason}` | `<code>{s.key}</code>: {s.reason}` |
| P7 | 3 | `Download the untouched copy of the old data before keeping this import. It is the only record of anything the import refused.` | `Download the untouched copy first. It is the only record of what was refused.` |
| P7 | 4 | `Baseline 2026-09-01; projection -0.56 kg per week (15 % cut from TDEE …).` | `Baseline 2026-09-01.` **+why** |
| P7 | 4 | `Push-up — best reps per week` | `Push-up: best reps per week` |
| P7 | 4 | figcaption `Push-up — best 15 reps in one set` | `Push-up: best 15 reps in one set` |
| P7 | 5 | `FIXTHISINJUSTICE — TRAINING SUMMARY` (2 occurrences) | `FIXTHISINJUSTICE TRAINING SUMMARY` |
| P7 | 5 | `The JSON file is the complete backup: everything this app stores is in it. The calendar file holds … It is a courtesy: …` | two short paragraphs; `Whether an imported alarm fires is not guaranteed` retained for its test |
| P7 | 5 | `Importing replaces everything currently on this device. The file is validated first; if it does not match the schema, nothing changes and the reason is shown.` | `Importing replaces everything on this device. An invalid file changes nothing.` |
| P7 | 6 | `Everything this app stores lives on this device. There is no account and no copy anywhere else, so a wipe cannot be undone. …` | `Everything stays on this device. A wipe cannot be undone.` |
| P7 | 6 | wipe description `Every profile, plan, logged set, body-mass check-in and note on this device is removed, along with any video you added. A JSON backup downloads first.` | `Everything on this device is removed. A JSON backup downloads first.` |
| P7 | 6 | `Data from the old app is still on this device. It is untouched and read-only; removing it frees the storage it uses and stops the import offer.` | `The old app's data is still here. Removing it stops the import offer.` |
| P7 | 7 | README: 6 em-dash connectors (static-app line, storage line, the two "what leaves the device" items, the runbook link, the legacy-removal line) | colons, parentheses or two sentences |
| P8 | 5 | `A field journal. Every logged set has a small chance of adding a card. Each card states a finding and the work it comes from.` | `A field journal. Every logged set may add a card.` |
| P8 | 7 | `Write a note to your future self: why you are starting, what you expect, what you are prepared to be wrong about. It is sealed until the date you choose.` | `A note to your future self, sealed until a date you pick.` |

**Not changed, and why.** Exercise form cues, exercise notes, tips, Atlas card bodies and citations,
and the P5 runbook body keep their length (R10); only their em-dash connectors were removed. The
frozen legacy decoding table in P7 Task 1 keeps `setsSpec: "—"`, which is legacy data, not copy. A
bare `—` in a value slot (`session — of 24`, an empty prescription, an unfilled target) is a
placeholder and stays (R5). P2's `split-summary` keeps its muscle-group breakdown: a P2 test
requires the maintenance-only groups to be named rather than hidden. `{advice.kind}` still renders
the raw enum (`add-load`), which needs a copy map rather than a string edit. Plan prose addressed to
the executor, `describe`/`it` titles, code comments and the `check-media-size.sh` CI output were left
alone: none of them is user-facing copy.

---
## Retired and added keys (2026-09-02, P8 close-out B and D)

Appended, not merged into the body above: the P9 pass rewrites the contract, and until then this
section is the record of what the key list gained and lost after the P2-P8 sweep was written.

### Retired in `1500997`

Seventeen keys nothing rendered. Each was checked with `git grep` over `src` with the three copy
tables excluded, and against the `FORMAT` frames in `copy.ts`, before deletion. Three carried
limelight rows, which went with them (`button.play`, `button.preview`, `button.setUpProfile`), and
`button.play` also left `copy.test.ts`'s REQUIRED list: no control ever rendered it, because the
missed-week clip autoplays muted, which is the only autoplay an engine allows.

| Key | What it named |
| --- | --- |
| `advice.installIos` | the iOS install instructions, never built |
| `advice.iosVersion` | the iOS version notice beside them |
| `advice.videoStoreFailed` | a user-supplied motivation clip that would not store |
| `advice.videoTooLarge` | the same clip over the size cap |
| `advice.videoWrongType` | the same clip of the wrong MIME type |
| `advice.wipeAll` | a second wipe warning; the shipped screen uses its own |
| `button.muteThisWeek` | a per-week mute for the missed-week screen |
| `button.play` | a play control for a clip that autoplays muted |
| `button.preview` | a preview control for the same clip |
| `button.removeCustomClip` | removing a user-supplied clip |
| `button.setUpProfile` | a setup entry point the shell never rendered |
| `hero.installFirst` | the install-first hero above it |
| `status.bundledClipAbsent` | the bundled clip's three probe states, none surfaced |
| `status.bundledClipChecking` | " |
| `status.bundledClipPresent` | " |
| `status.customClipNone` | the custom clip's two states, neither surfaced |
| `status.customClipStored` | " |

Two keys on the same sweep list survive and were **not** deleted: `advice.weekMissedNone` has a live
reader (`FORMAT.weekMissed` branches onto it at `completed === 0`), and `advice.downloadBackupFirst`
was already gone. Retiring `button.setUpProfile` also closes the R1 ruling this contract's own P8
amendment asked for: the key had been shortened to three words, and now there is nothing to cap.

### Added since the sweep

| Key | Default | Why it exists |
| --- | --- | --- |
| `status.weekMetStamp` | `Target met` | A met week and a personal record became two different claims, so the week stamp stopped reading `status.prStamp`. Limelight keeps `MOTHER` at both; the board says `ALL DEPARTED`. |
| `label.settingsHotkeys` | `Keyboard shortcuts` | WCAG 2.1 SC 2.1.4 needs an off switch for single-character shortcuts, and the switch needs a name. |
| `advice.hotkeysOff` | `Off leaves Escape and the modifier shortcuts bound.` | What the switch does not take away, said once beside it: SC 2.1.4 scopes itself to a single character key, so `mod+k` and Escape stay bound. |
| `status.remindersNeedReenable` | `Reminders need enabling again on this device.` | The reminder preference travels with the exported document; the push subscription does not, because it is a bearer credential the export withholds. On the restoring device `Reminders are on` was false, not merely thin: no subscription exists and nothing is queued. The row names the device and the action, because nothing recovers on its own. |
| `unit.characters` | `characters` | The unit `FORMAT.outOfRange` names beside a name-length bound, previously a bare word passed from `AddCustomExercise`. It is a key while `cm`, `%` and `s` are not, because those are symbols and this is an English word. |
| `label.modality.barbell` | `Barbell` | One row per `Modality` member. The `<option>` labels in the custom-exercise form were the union MEMBERS, so the select rendered the model's own lower-case identifiers under every skin. The option VALUE is still the enum; only the label is copy. |
| `label.modality.dumbbell` | `Dumbbell` | " |
| `label.modality.machine` | `Machine` | " |
| `label.modality.cable` | `Cable` | " |
| `label.modality.bodyweight` | `Bodyweight` | " |

The `label.modality.*` rows settle half of the note the previous section ends on. That note reads
"`{advice.kind}` still renders the raw enum (`add-load`), which needs a copy map rather than a
string edit"; `ProgressionAdvice['kind']` got its map earlier (`ADVICE_KEY` in `ExerciseCard.tsx`,
onto `status.advice*`), and `Modality` gets one here (`MODALITY_KEY` in `AddCustomExercise.tsx`).
Both maps are `Record<Enum, CopyKey>` and exhaustive by type, so a member added to either union is a
compile error rather than an identifier on screen.
