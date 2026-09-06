// src/test/funFixtures.ts
//
// Object builders for the P8 fun-mechanics store and UI suites. Nothing here is a real
// person's data; every value is arbitrary but internally consistent, and every physical
// quantity carries its canonical unit in a comment.
//
// Deviations from the P8 plan's Task 4 Step 1 literal, recorded here rather than by editing
// the plan:
//  - makeProfile and makePlan delegate to src/test/fixtures.ts and
//    src/test/migrationFactories.ts instead of restating a Profile and a PlanTemplate. The
//    plan's literals predate equipmentSteps.microPlateKg, hydration.weighInOptIn, readiness
//    and the 1-based PlannedSession.ordinal, so a copy of them would not parse.
//  - makeAppState overlays defaultState() rather than listing every root field, so a field
//    added to AppState reaches this fixture without an edit here.
//  - makeUiPrefs starts from defaultState().ui for the same reason; the plan's literal
//    predates videoInstanceHost and legacyMigration.
//  - Repo style: single quotes, [unit] comments.

import { defaultState } from '../domain/schema';
import { makeProfile as makeBaseProfile } from './fixtures';
import { makeAvailability, makePlan as makeBasePlan } from './migrationFactories';
import type {
  AppState,
  PlanTemplate,
  Profile,
  SpecimenInventory,
  UiPrefs,
} from '../domain/types';

/** The profile every fun-mechanics fixture is keyed by. */
export const FUN_PROFILE_ID = 'p1';

/** The shared profile fixture, keyed to FUN_PROFILE_ID. */
export function makeProfile(patch: Partial<Profile> = {}): Profile {
  return makeBaseProfile({ id: FUN_PROFILE_ID, timezone: 'Europe/Athens', ...patch });
}

/** The shared four-session plan fixture. Patchable; P8 only needs it to exist and validate. */
export function makePlan(patch: Partial<PlanTemplate> = {}): PlanTemplate {
  return makeBasePlan(patch);
}

/**
 * The shipped defaults with the boot sequence and the intro sequence already seen, which is the
 * usual test case: a suite about the boot, a view, or the app shell is not a suite about the
 * intro, and an unseen intro would overlay every one of them with its own Skip control (P10
 * Brief C).
 */
export function makeUiPrefs(patch: Partial<UiPrefs> = {}): UiPrefs {
  return { ...defaultState().ui, bootSeen: true, introSeen: true, ...patch };
}

/** An empty inventory: nothing collected, no set logged, no ordinal spent. */
export function makeInventory(patch: Partial<SpecimenInventory> = {}): SpecimenInventory {
  return { profileId: FUN_PROFILE_ID, acquired: {}, totalSetsLogged: 0 /* [sets] */, ...patch };
}

/**
 * A valid v3 document carrying one profile, one plan and one empty specimen inventory.
 *
 * Every array-valued per-profile log is seeded the way createProfile seeds it, so an action
 * under test reads them without a guard. `capsules` holds an explicit null: no capsule written.
 */
export function makeAppState(patch: Partial<AppState> = {}): AppState {
  const profile = makeProfile();
  const plan = makePlan();
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: { [profile.id]: makeAvailability() },
    plans: { [plan.id]: plan },
    cursors: {
      [profile.id]: {
        planId: plan.id,
        nextSessionIndex: 0, // [sessions] offset
        startedOn: '2026-09-07',
        completedOn: null,
      },
    },
    pauses: { [profile.id]: [] },
    assignments: { [profile.id]: [] },
    bodyMass: { [profile.id]: [] },
    hydration: { [profile.id]: [] },
    intake: { [profile.id]: [] },
    weeklyReviews: { [profile.id]: [] },
    specimens: { [profile.id]: makeInventory() },
    capsules: { [profile.id]: null },
    ui: makeUiPrefs(),
    ...patch,
  };
}
