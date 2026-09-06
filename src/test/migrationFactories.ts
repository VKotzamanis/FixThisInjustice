// src/test/migrationFactories.ts
//
// Fixtures for the P7 legacy-migration suites. Deliberately explicit about the two
// things the migration actually reads from its inputs: the profile id (every migrated
// record is keyed by it) and the plan's session labels and kinds (the only thing
// `resolveSessionId` matches on).
//
// Deviations from the P7 plan's Task 2 Step 6 literal, recorded here rather than by
// editing the plan:
//  - Profile is built from src/test/fixtures.ts rather than copied, so it cannot drift
//    from the shipped Profile type. The plan's literal predates hydration.weighInOptIn,
//    readiness, gymCommute, homeEquipment and bodyweightEquipment, and used activity
//    'light', which is not one of the three FAO/WHO/UNU bands ActivityLevel admits.
//    equipmentSteps.hasMicroPlates/.microPlateKg, also predating the plan's literal, were
//    removed rather than added (Brief F Part 3).
//  - PlannedSession.ordinal is 1-based (types.ts: plan.sessions[i].ordinal === i + 1);
//    the plan's literal numbered them from 0, which PlannedSessionSchema rejects.
//  - AppState carries ui.videoInstanceHost and ui.lastBlockSeenByProfile, both added
//    after the plan was written.
//  - Repo style: single quotes, [unit] comments.

import { CURRENT_SCHEMA_VERSION } from '../domain/schema';
import type {
  AppState,
  Availability,
  PlanTemplate,
  Profile,
} from '../domain/types';
import { makeProfile as makeBaseProfile } from './fixtures';

/** The profile every migration fixture is keyed by. */
export const MIGRATION_PROFILE_ID = 'p1';

/**
 * The shared profile fixture, re-keyed to 'p1' and given the Athens zone the migration
 * suites use for their instant arithmetic.
 */
export function makeProfile(patch: Partial<Profile> = {}): Profile {
  return makeBaseProfile({ id: MIGRATION_PROFILE_ID, timezone: 'Europe/Athens', ...patch });
}

/**
 * A four-session upper/lower-style plan whose labels are exactly the labels
 * V2_DAY_LABEL claims for legacy days 1, 2 and 3, plus one cardio session. It is the
 * best case for `resolveSessionId`: a plan built by src/domain/plan/templates.ts labels
 * its sessions 'Push A', 'Push B', 'Legs A' and so on and matches none of them, which
 * is the designed outcome (a legacy set predating the current plan carries
 * LEGACY_SESSION_ID). This fixture exists so both branches are exercised.
 */
export function makePlan(patch: Partial<PlanTemplate> = {}): PlanTemplate {
  const base: PlanTemplate = {
    id: 'plan-upper-lower',
    version: 1,
    name: 'Upper / Lower x2',
    sessionsPerWeek: 4, // [sessions/week]
    weeks: 12, // [weeks]
    sessions: [
      {
        id: 's-push',
        ordinal: 1,
        name: 'Push',
        kind: 'lift',
        label: 'Push',
        exercises: [
          {
            exerciseId: 'barbell-bench-press',
            setsLo: 3, // [sets]
            setsHi: 4, // [sets]
            prescription: { kind: 'reps', lo: 6, hi: 8 }, // [reps]
            restS: 180, // [s]
          },
        ],
      },
      {
        id: 's-pull',
        ordinal: 2,
        name: 'Pull',
        kind: 'lift',
        label: 'Pull',
        exercises: [
          {
            exerciseId: 'barbell-row-pendlay',
            setsLo: 3, // [sets]
            setsHi: 4, // [sets]
            prescription: { kind: 'reps', lo: 6, hi: 8 }, // [reps]
            restS: 180, // [s]
          },
        ],
      },
      {
        id: 's-legs',
        ordinal: 3,
        name: 'Legs',
        kind: 'lift',
        label: 'Legs',
        exercises: [
          {
            exerciseId: 'barbell-back-squat',
            setsLo: 3, // [sets]
            setsHi: 4, // [sets]
            prescription: { kind: 'reps', lo: 6, hi: 8 }, // [reps]
            restS: 180, // [s]
          },
        ],
      },
      {
        id: 's-cardio',
        ordinal: 4,
        name: 'Conditioning',
        // The legacy cardio day is matched on this, never on the label: no shipped
        // template fixes the label of a conditioning session.
        kind: 'cardio',
        label: 'Conditioning',
        exercises: [
          {
            exerciseId: 'rower-intervals',
            setsLo: 1, // [sets]
            setsHi: 1, // [sets]
            prescription: { kind: 'duration', targetS: 1200 }, // [s]
            restS: 0, // [s]
          },
        ],
      },
    ],
    blocks: [
      {
        index: 0,
        firstSessionIndex: 0, // [sessions] offset
        sessionCount: 20, // [sessions]
        setModifier: 1, // dimensionless
        loadModifier: 1, // dimensionless
        isDeload: false,
      },
      {
        index: 1,
        firstSessionIndex: 20, // [sessions] offset
        sessionCount: 4, // [sessions]
        setModifier: 0.5, // dimensionless
        loadModifier: 1, // dimensionless
        isDeload: true,
      },
    ],
  };
  return { ...base, ...patch };
}

export function makeAvailability(patch: Partial<Availability> = {}): Availability {
  const base: Availability = {
    slots: [
      { weekday: 1, startTime: '09:00', expectedDurationS: 4200 }, // [s]
      { weekday: 3, startTime: '09:00', expectedDurationS: 4200 }, // [s]
      { weekday: 5, startTime: '09:00', expectedDurationS: 4200 }, // [s]
      { weekday: 6, startTime: '10:00', expectedDurationS: 3600 }, // [s]
    ],
    weeklySessionTarget: 4, // [sessions/week]
  };
  return { ...base, ...patch };
}

/** A valid, empty v3 state carrying one profile and one plan. */
export function makeBlankState(profile = makeProfile(), plan = makePlan()): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: { [profile.id]: makeAvailability() },
    plans: { [plan.id]: plan },
    cursors: {
      [profile.id]: {
        planId: plan.id,
        nextSessionIndex: 0, // [sessions] offset
        startedOn: '2026-01-05',
        completedOn: null,
      },
    },
    pauses: {},
    assignments: {},
    sets: {},
    notes: {},
    customExercises: {},
    // Additive (C1.G.1): a migrated document has no in-progress P1 wizard to resume.
    setupDraft: null,
    bodyMass: {},
    hydration: {},
    intake: {},
    weeklyReviews: {},
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: {},
    capsules: {},
    ui: {
      bootSeen: true,
      // Additive, mirroring src/domain/migrations/v2.ts's blankState(): a migrated document is
      // an existing user, so the intro sequence is not shown to them either.
      introSeen: true,
      lastView: 'today',
      accent: '#a3e635',
      scanlines: true,
      flicker: false,
      density: 'normal',
      videoInstanceHost: null,
      legacyMigration: 'pending',
      lastBlockSeenByProfile: {},
      // P8 Task 12. Additive, so this literal only has to name them because it is a whole
      // UiPrefs rather than a patch; the values are defaultState()'s own.
      skin: 'limelight',
      sounds: false,
      // Additive, same rule: a migrated document has announced no milestone.
      milestoneFloorByProfile: {},
      // Additive, same rule again: a migrated document has never switched the keyboard
      // shortcuts off, and true is the state every document before the switch was in.
      hotkeys: true,
    },
  };
}
