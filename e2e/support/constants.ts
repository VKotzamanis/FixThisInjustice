// e2e/support/constants.ts
//
// Values the end-to-end specs share. Each one that restates an app value is pinned to it by
// src/test/e2eDocument.test.ts (AGENTS.md rule 2), so the two cannot drift.

/** The preview server's port. 4173 is vite's default and is often already taken by a probe. */
export const E2E_PORT = 4174;

/** The app's base path is `/FixThisInjustice/` (vite.config.ts `base`). */
export const E2E_BASE_URL = `http://localhost:${String(E2E_PORT)}/FixThisInjustice/`;

/**
 * The browser context's zone AND every seeded profile's zone. They must be the same: with the
 * profile in another zone, page.clock produced the wrong civil date (audit G, harness note).
 */
export const E2E_TIMEZONE = 'America/Chicago';

/** The document key. Pinned to src/store/persistence.ts STORAGE_KEY by e2eDocument.test.ts. */
export const STORAGE_KEY = 'fti.v3';

/** Set once the seed has been written, so a relaunch (a new page) does not re-seed. */
export const SEEDED_MARKER_KEY = 'fti.e2e.seeded';

export const PROFILE_ID = 'e2e-profile';

/**
 * The words the specs tap or read, as the shipped limelight skin renders them. Each is pinned to
 * the copy table by e2eDocument.test.ts; `recoveryHeading` and `writesPaused` are pinned by the
 * task that adds their keys (plan Task 17).
 */
export const LABEL = {
  todayTab: 'today',
  logTab: 'the archive',
  settingsTab: 'backstage',
  // P4a Task 7: the fifth bottom-bar slot; Plan, Atlas and Settings are rows of its sheet.
  moreTab: 'More',
  start: "LET'S GO BABES",
  finish: "that's a wrap",
  skipToday: 'not today satan',
  confirmSkip: 'yes skip it',
  undo: 'Undo',
  looksGood: 'Looks Good',
  recoveryHeading: 'Stored Data Could Not Be Read',
  writesPaused: 'Nothing is saved until you import a backup',
  unreadableHeading: 'Unreadable Records',
  trainTab: 'showtime',
  finishAnyway: 'Finish Anyway',
  logBodyMass: 'Log Body Mass',
  editEntry: 'Edit',
  saveEntry: 'Save',
  fluidLoss: 'Fluid loss above 2 %. Replace over the next hours.',
  // P4a (plan docs/plans/2026-11-04-p4a-shell-design.md Task 17): the bar and the More sheet.
  targetsTab: 'the numbers',
  planRow: 'the run',
  atlasRow: 'the collection',
  settingsRow: 'backstage',
  findRow: 'find it',
  // R8: the install card's dismiss button (button.dismiss; limelight overrides the base 'Dismiss').
  dismiss: 'noted.',
  // L9: the exercise card's form-video control (button.formReference).
  formReference: 'Form Reference',
} as const;

/**
 * L9: the clip the seeded Monday session's first exercise frames, as the privacy-enhanced embed
 * URL. Pinned by e2eDocument.test.ts to embedUrl(VIDEO_INSTANCES[0], library videoId).
 */
export const FORM_VIDEO = {
  exerciseId: 'barbell-back-squat',
  embedSrc: 'https://www.youtube-nocookie.com/embed/-bJIpOq-LWk?playsinline=1',
} as const;

/** "Set 1 load (kg)": FORMAT.quantityWithUnit(FORMAT.setLoadQuantity(n), 'kg'). */
export function loadLabel(n: number): string {
  return `Set ${String(n)} load (kg)`;
}

/** "Set 1 reps": FORMAT.setRepsQuantity(n). */
export function repsLabel(n: number): string {
  return `Set ${String(n)} reps`;
}

/** "Log set 1": FORMAT.logSetLabel(n). */
export function logLabel(n: number): string {
  return `Log set ${String(n)}`;
}

/** "Delete set 1": FORMAT.deleteSetLabel(n). */
export function deleteLabel(n: number): string {
  return `Delete set ${String(n)}`;
}

/** Spec R13 record database. Pinned to src/store/db/records.ts by e2eDocument.test.ts. */
export const RECORD_DB_NAME = 'fti';
export const RECORD_APP_STORE = 'app';
export const RECORD_META_KEY = 'meta';
export const RECORD_MAP_STORES = [
  'profiles',
  'availability',
  'plans',
  'cursors',
  'pauses',
  'assignments',
  'sets',
  'bodyMass',
  'hydration',
  'intake',
  'weeklyReviews',
  'reminderSettings',
  'motivation',
  'specimens',
  'capsules',
  'customExercises',
] as const;
export const RECORD_SINGLETONS = ['activeProfileId', 'pushDevice', 'setupDraft', 'ui'] as const;
/** "Body mass (kg)": FORMAT.quantityWithUnit(copy('quantity.bodyMass'), 'kg'). */
export function massLabel(): string {
  return 'Body mass (kg)';
}

/** "Pre-session body mass (kg)". */
export function preMassLabel(): string {
  return 'Pre-session body mass (kg)';
}

/** "Post-session body mass (kg)". */
export function postMassLabel(): string {
  return 'Post-session body mass (kg)';
}
