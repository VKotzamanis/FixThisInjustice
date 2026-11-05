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
  start: "LET'S GO BABES",
  finish: "that's a wrap",
  skipToday: 'not today satan',
  confirmSkip: 'yes skip it',
  undo: 'Undo',
  looksGood: 'Looks Good',
  recoveryHeading: 'Stored Data Could Not Be Read',
  writesPaused: 'Nothing is saved until you import a backup',
  finishAnyway: 'Finish Anyway',
  logTab: 'the archive',
  logBodyMass: 'Log Body Mass',
  editEntry: 'Edit',
  saveEntry: 'Save',
  fluidLoss: 'Fluid loss above 2 %. Replace over the next hours.',
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
