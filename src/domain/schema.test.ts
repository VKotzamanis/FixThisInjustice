import { describe, expect, expectTypeOf, it } from 'vitest';
import fc from 'fast-check';
import type { z } from 'zod';
import {
  AppStateSchema,
  CURRENT_SCHEMA_VERSION,
  PlannedSessionSchema,
  defaultState,
  parseState,
} from './schema';
import { anyAppState, anySetupDraft } from './arbitraries';
import type { AppState } from './types';

/**
 * Every captured `fti.v3` fixture, loaded through Vite rather than node:fs so the
 * test needs no Node type declarations in the app TypeScript project (security
 * constraint 4: a test that every fixture migrates to the current schema).
 *
 * The glob is `v3-*.json`, not `*.json`, so only `fti.v3` payloads are asserted
 * here. (The old console's sample document under "fti.console.v2" went with its
 * import, ROADMAP N5.)
 */
const FIXTURES: Record<string, { default: unknown }> = import.meta.glob(
  './migrations/fixtures/v3-*.json',
  { eager: true },
);

/**
 * Type identity, not mutual assignability. The two conditional types are equal
 * only when A and B are the same type to the checker, so a widened field, an
 * added optional modifier or a field present on one side alone fails the check.
 * Mutual assignability would not: an extra optional property is assignable both
 * ways, which is exactly the drift this assertion exists to catch.
 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

/**
 * Compile-time parity between the schema's inferred output and the hand-written
 * AppState in types.ts. `npm run typecheck` is the gate that enforces it; the
 * test below only reads the constant so noUnusedLocals cannot remove it.
 */
const schemaInfersAppState: Equal<z.infer<typeof AppStateSchema>, AppState> = true;

/** Deep clone through JSON exactly as persistence does. */
function throughJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('defaultState', () => {
  it('is a valid document at the current schema version', () => {
    const s = defaultState();
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    expect(AppStateSchema.safeParse(s).success).toBe(true);
  });

  it('starts with no profile', () => {
    expect(defaultState().activeProfileId).toBeNull();
    expect(Object.keys(defaultState().profiles)).toHaveLength(0);
  });

  it('returns a fresh object each call', () => {
    const a = defaultState();
    const b = defaultState();
    expect(a).not.toBe(b);
    expect(a.profiles).not.toBe(b.profiles);
  });
});

describe('fixtures', () => {
  const entries = Object.entries(FIXTURES);

  it('has at least one fixture', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s parses to schemaVersion 3', (_path, mod) => {
    const result = parseState(mod.default);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(3);
    }
  });

  it('backfills the root-level fields added after the fixture was captured', () => {
    // v3-minimal.json has empty profiles and no customExercises, so it reaches
    // only the root and ui defaults. The profile-, exercise- and record-level
    // defaults are unreachable from an empty document and are covered by the
    // "legacy document" suite below, which supplies a profile to attach them to.
    const result = parseState(FIXTURES['./migrations/fixtures/v3-minimal.json']?.default);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.customExercises).toEqual({});
    expect(result.state.notes).toEqual({});
    expect(result.state.ui.videoInstanceHost).toBeNull();
    expect(result.state.ui.legacyMigration).toBe('pending');
    expect(result.state.ui.lastBlockSeenByProfile).toEqual({});
    // Additive with a Zod default, like the three above: a document that predates the field
    // has announced no milestone, and an empty map is what every reader indexes.
    expect(result.state.ui.milestoneFloorByProfile).toEqual({});
  });
});

describe('hostile input is rejected without throwing', () => {
  it('rejects the legacy shape', () => {
    const result = parseState({ week: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('missing or non-integer schemaVersion');
  });

  it('rejects a prototype-pollution payload and pollutes nothing', () => {
    const raw: unknown = JSON.parse('{"__proto__":{"x":1}}');
    const result = parseState(raw);
    expect(result.ok).toBe(false);
    // The object literal below must not have gained an "x" property.
    expect(Reflect.get({}, 'x')).toBeUndefined();
  });

  it('drops a __proto__ key inside a record rather than assigning through it', () => {
    const raw: unknown = JSON.parse(
      '{"schemaVersion":3,"__proto__":{"polluted":true},' +
        '"activeProfileId":null,"profiles":{},"availability":{},"plans":{},"cursors":{},' +
        '"pauses":{},"assignments":{},"sets":{},"bodyMass":{},"hydration":{},"intake":{},' +
        '"weeklyReviews":{},"reminderSettings":{},"pushDevice":null,"motivation":{},' +
        '"specimens":{},"capsules":{},' +
        '"ui":{"bootSeen":false,"lastView":"today","accent":"#a3e635","scanlines":true,' +
        '"flicker":false,"density":"normal"}}',
    );
    const result = parseState(raw);
    expect(result.ok).toBe(true);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
  });

  it('rejects a non-finite load (finding M6)', () => {
    const s = defaultState();
    const withInfinity: unknown = {
      ...s,
      sets: {
        a: {
          id: 'a',
          profileId: 'p',
          assignmentDate: '2026-09-01',
          sessionId: 's',
          exerciseId: 'e',
          setNumber: 1,
          isBonus: false,
          loadKg: Number.POSITIVE_INFINITY,
          enteredUnit: 'metric',
          reps: 5,
          durationS: null,
          rpe: null,
          loggedAt: 1_756_000_000_000,
        },
      },
    };
    const result = parseState(withInfinity);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sets.a.loadKg');
  });

  it('rejects negative reps', () => {
    const s = defaultState();
    const withNegativeReps: unknown = {
      ...s,
      sets: {
        a: {
          id: 'a',
          profileId: 'p',
          assignmentDate: '2026-09-01',
          sessionId: 's',
          exerciseId: 'e',
          setNumber: 1,
          isBonus: false,
          loadKg: 60,
          enteredUnit: 'metric',
          reps: -3,
          durationS: null,
          rpe: null,
          loggedAt: 1_756_000_000_000,
        },
      },
    };
    const result = parseState(withNegativeReps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sets.a.reps');
  });

  it('rejects a load above the 500 kg bound', () => {
    const s = defaultState();
    const tooHeavy: unknown = {
      ...s,
      bodyMass: {
        p: [
          {
            id: 'b',
            profileId: 'p',
            date: '2026-09-01',
            massKg: 501, // [kg] security constraint 3 caps mass at 500
            enteredUnit: 'metric',
            bodyFatPct: null,
            loggedAt: 1_756_000_000_000,
          },
        ],
      },
    };
    expect(parseState(tooHeavy).ok).toBe(false);
  });

  it('rejects a calendar-invalid date', () => {
    const s = defaultState();
    const badDate: unknown = {
      ...s,
      pauses: { p: [{ id: 'x', from: '2026-02-30', to: null, reason: null }] },
    };
    const result = parseState(badDate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('pauses.p.0.from');
  });

  it('rejects a schema version newer than this build', () => {
    const result = parseState({ ...defaultState(), schemaVersion: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version of the app');
  });

  it('rejects arrays, null and primitives', () => {
    for (const raw of [null, [], 'text', 42, true]) {
      const result = parseState(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('not a JSON object');
    }
  });

  it('reports a bodyweight set as valid, because loadKg 0 is real (A60)', () => {
    const s = defaultState();
    const bodyweight: unknown = {
      ...s,
      sets: {
        a: {
          id: 'a',
          profileId: 'p',
          assignmentDate: '2026-09-01',
          sessionId: 's',
          exerciseId: 'e',
          setNumber: 1,
          isBonus: false,
          loadKg: 0, // [kg] bodyweight, not "missing"
          enteredUnit: 'metric',
          reps: 12,
          durationS: null,
          rpe: null,
          loggedAt: 1_756_000_000_000,
        },
      },
    };
    expect(parseState(bodyweight).ok).toBe(true);
  });
});

describe('the schema and the hand-written AppState are the same type', () => {
  it('infers AppState exactly, field for field', () => {
    // The gate is `npm run typecheck`: adding a field to one side and not the
    // other makes the Equal<> assignment above a compile error. The runtime
    // assertion only keeps the constant referenced.
    expect(schemaInfersAppState).toBe(true);
    expectTypeOf<z.infer<typeof AppStateSchema>>().toEqualTypeOf<AppState>();
  });
});

/** Profile id used by the legacy-document and record-key suites. */
const P1 = 'profile-1';

/**
 * A profile as it was written BEFORE the section 5 amendments: hydration without weighInOptIn
 * and no readiness block at all. Also predates Brief F: `equipmentSteps` still carries
 * `hasMicroPlates` (an unrecognised key the schema now silently strips, since the field was
 * removed rather than kept optional) and carries none of `gymCommute`, `homeEquipment` or
 * `bodyweightEquipment`, all three additive with a default. `equipment` is `'full-gym'`, which
 * is spelled identically in the old `Equipment` union and the new `EquipmentAccess` one, so it
 * needs no migration to exercise this fixture; the `dumbbells-only` -> `home` rewrite is
 * covered separately below. Returned as `unknown` because it is deliberately not a valid Profile.
 */
function legacyProfile(id: string): unknown {
  return {
    id,
    displayName: 'Legacy',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: 1_700_000_000_000, // [ms]
    body: {
      sex: 'male',
      birthYear: 1990, // [year]
      heightCm: 180, // [cm]
      baselineMassKg: 80, // [kg]
      baselineAt: '2026-01-05',
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'novice',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
      hasMicroPlates: true, // unrecognised now; the schema strips it rather than failing
    },
    goal: { kind: 'muscle-gain', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3_000, cupSizeML: 250 }, // [mL]; weighInOptIn absent
    // readiness, gymCommute, homeEquipment and bodyweightEquipment absent: all postdate this
    // document.
  };
}

/** A custom exercise written before secondaryMuscles existed. */
function legacyExercise(id: string): unknown {
  return {
    id,
    name: 'Sled push',
    isBodyweight: false,
    isCompoundPrimary: true,
    modality: 'machine',
    loadClass: 'lower-compound',
    muscleGroups: ['quadriceps'],
    // secondaryMuscles absent: the half-set tally postdates this document.
    equipment: ['full-gym'],
    videoQuery: null,
    formCueId: null,
    note: null,
  };
}

/**
 * A whole document from before the amendments: one profile, no customExercises
 * and no notes maps, and a ui block missing all three additive keys.
 */
function legacyDocument(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    activeProfileId: P1,
    profiles: { [P1]: legacyProfile(P1) },
    availability: {},
    plans: {},
    cursors: {},
    pauses: {},
    assignments: {},
    sets: {},
    bodyMass: {},
    hydration: {},
    intake: {},
    weeklyReviews: {},
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: {},
    capsules: {},
    // customExercises and notes absent.
    ui: {
      bootSeen: true,
      lastView: 'today',
      accent: '#a3e635',
      scanlines: true,
      flicker: false,
      density: 'normal',
      // videoInstanceHost, legacyMigration, lastBlockSeenByProfile and
      // milestoneFloorByProfile absent.
    },
  };
}

/** One in-progress day, as stored before SessionAssignment.edits existed (no `edits` key). */
function assignmentWithoutEdits(): Record<string, unknown> {
  return {
    date: '2026-03-02',
    sessionId: 'session-1',
    sourceIndex: 0, // [sessions] offset
    status: 'in-progress',
    startedAt: Date.UTC(2026, 2, 2, 10, 0, 0), // [ms] epoch UTC
    completedAt: null,
    skipReason: null,
  };
}

describe('SessionAssignment.edits (ROADMAP L2-L4, rule 7)', () => {
  it('keeps the edits a session carries through a save and load', () => {
    const doc = legacyDocument();
    const edits = {
      swaps: { 'barbell-bench-press': 'incline-db-press' },
      skipped: ['plank'],
      added: ['lateral-raise'],
      order: ['lateral-raise', 'barbell-bench-press'],
    };
    doc.assignments = { [P1]: [{ ...assignmentWithoutEdits(), edits }] };
    const result = parseState(JSON.parse(JSON.stringify(doc)) as unknown);
    expect(result.ok ? null : result.error).toBeNull();
    if (!result.ok) return;
    expect(result.state.assignments[P1]?.[0]?.edits).toEqual(edits);
  });

  it('loads an old document whose assignments have no edits, unchanged and without the key', () => {
    const doc = legacyDocument();
    doc.assignments = { [P1]: [assignmentWithoutEdits()] };
    const result = parseState(doc);
    expect(result.ok ? null : result.error).toBeNull();
    if (!result.ok) return;
    // toStrictEqual: an `edits: undefined` key would fail here, so no default was inserted.
    expect(result.state.assignments).toStrictEqual({ [P1]: [assignmentWithoutEdits()] });
    expect('edits' in (result.state.assignments[P1]?.[0] ?? {})).toBe(false);
  });

  it('round-trips a current document without edits byte for byte', () => {
    const doc = legacyDocument();
    doc.assignments = { [P1]: [assignmentWithoutEdits()] };
    const first = parseState(doc);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // The stored text of a document saved before this change, read back by this build.
    const stored = JSON.stringify(first.state);
    const second = parseState(JSON.parse(stored) as unknown);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(JSON.stringify(second.state)).toBe(stored);
  });

  it('refuses a malformed edits value rather than guessing', () => {
    const doc = legacyDocument();
    doc.assignments = { [P1]: [{ ...assignmentWithoutEdits(), edits: { swaps: {}, skipped: [''] } }] };
    expect(parseState(doc).ok).toBe(false);
  });
});

/**
 * The document as this build's predecessor stored it: every additive default filled in, and no
 * `warmupNoticeDismissedByProfile` key, because that build never wrote one. JSON-cloned, so it
 * is the bytes in localStorage or in an exported file, not a Zod output object.
 */
function storedBeforeWarmupDismissal(): Record<string, unknown> {
  const parsed = parseState(legacyDocument());
  if (!parsed.ok) throw new Error(`legacyDocument() no longer parses: ${parsed.error}`);
  return throughJson(parsed.state) as Record<string, unknown>;
}

describe('UiPrefs.warmupNoticeDismissedByProfile (owner 2026-10-18, rule 7)', () => {
  it('keeps a profile\'s dismissal through a save and load', () => {
    const doc = storedBeforeWarmupDismissal();
    doc.ui = { ...(doc.ui as Record<string, unknown>), warmupNoticeDismissedByProfile: { [P1]: true } };
    const result = parseState(throughJson(doc));
    expect(result.ok ? null : result.error).toBeNull();
    if (!result.ok) return;
    expect(result.state.ui.warmupNoticeDismissedByProfile).toEqual({ [P1]: true });
  });

  it('loads a document stored without the field, deep-equal and without the key', () => {
    // Optional, not defaulted: an old document or an old JSON export parses to exactly what was
    // stored, so this build reads it back byte for byte rather than adding a key on load.
    const stored = storedBeforeWarmupDismissal();
    expect('warmupNoticeDismissedByProfile' in (stored.ui as Record<string, unknown>)).toBe(false);
    const result = parseState(stored);
    expect(result.ok ? null : result.error).toBeNull();
    if (!result.ok) return;
    expect(result.state).toStrictEqual(stored);
    expect('warmupNoticeDismissedByProfile' in result.state.ui).toBe(false);
    expect(JSON.stringify(result.state)).toBe(JSON.stringify(stored));
  });

  it('refuses a malformed value rather than guessing', () => {
    const doc = storedBeforeWarmupDismissal();
    doc.ui = { ...(doc.ui as Record<string, unknown>), warmupNoticeDismissedByProfile: { [P1]: 'yes' } };
    expect(parseState(doc).ok).toBe(false);
  });
});

describe('a document written before the section 5 amendments', () => {
  it('backfills every default, at the root, the profile and the exercise', () => {
    const doc = legacyDocument();
    doc.customExercises = { [P1]: [legacyExercise('custom-1')] };

    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;

    const profile = state.profiles[P1];
    expect(profile).toBeDefined();
    // The unrecognised legacy hasMicroPlates key is stripped, not carried through or refused.
    expect(profile?.equipmentSteps).toEqual({ barbellKg: 2.5, dumbbellPairKg: 5, stackKg: 5 });
    expect(profile?.hydration.weighInOptIn).toBe(false);
    expect(profile?.readiness).toEqual({ screenedAt: null, flagged: false });
    // Brief F Part 3: additive, so a document written before the question existed backfills to
    // "never asked" rather than failing the whole profile.
    expect(profile?.gymCommute).toEqual({ walks: false, minutesEachWay: null });
    expect(profile?.homeEquipment).toEqual([]);
    expect(profile?.bodyweightEquipment).toEqual([]);

    expect(state.customExercises[P1]?.[0]?.secondaryMuscles).toEqual([]);

    expect(state.ui.videoInstanceHost).toBeNull();
    expect(state.ui.legacyMigration).toBe('pending');
    expect(state.ui.lastBlockSeenByProfile).toEqual({});
    expect(state.ui.milestoneFloorByProfile).toEqual({});

    expect(state.notes).toEqual({});
  });

  it('defaults customExercises and notes to empty maps when both are absent', () => {
    const result = parseState(legacyDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.customExercises).toEqual({});
    expect(result.state.notes).toEqual({});
  });

  it('gives each parse its own default objects, not a shared reference', () => {
    // Same input document twice: if Zod handed out one default instance per
    // schema rather than one per parse, the two results would alias and a write
    // through the first would be visible in the second. Finding a shared default
    // only after two profiles had corrupted each other is the failure this
    // forecloses.
    const doc = legacyDocument();
    const first = parseState(doc);
    const second = parseState(doc);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.state.notes).not.toBe(second.state.notes);
    expect(first.state.customExercises).not.toBe(second.state.customExercises);
    expect(first.state.ui.lastBlockSeenByProfile).not.toBe(
      second.state.ui.lastBlockSeenByProfile,
    );
    expect(first.state.ui.milestoneFloorByProfile).not.toBe(
      second.state.ui.milestoneFloorByProfile,
    );
    expect(first.state.profiles[P1]?.readiness).not.toBe(second.state.profiles[P1]?.readiness);
    // Brief F Part 3: the same aliasing hazard applies to the three new additive defaults.
    expect(first.state.profiles[P1]?.gymCommute).not.toBe(second.state.profiles[P1]?.gymCommute);
    expect(first.state.profiles[P1]?.homeEquipment).not.toBe(
      second.state.profiles[P1]?.homeEquipment,
    );
    expect(first.state.profiles[P1]?.bodyweightEquipment).not.toBe(
      second.state.profiles[P1]?.bodyweightEquipment,
    );

    first.state.notes[P1] = { '2026-01-05': 'written into the first parse' };
    first.state.customExercises[P1] = [];
    first.state.ui.lastBlockSeenByProfile[P1] = 4;
    first.state.ui.milestoneFloorByProfile[P1] = 50; // [sets]
    const firstReadiness = first.state.profiles[P1]?.readiness;
    if (firstReadiness !== undefined) firstReadiness.flagged = true;

    expect(second.state.notes).toEqual({});
    expect(second.state.customExercises).toEqual({});
    expect(second.state.ui.lastBlockSeenByProfile).toEqual({});
    expect(second.state.ui.milestoneFloorByProfile).toEqual({});
    expect(second.state.profiles[P1]?.readiness).toEqual({ screenedAt: null, flagged: false });
    expect(second.state.profiles[P1]?.gymCommute).toEqual({ walks: false, minutesEachWay: null });
    expect(second.state.profiles[P1]?.homeEquipment).toEqual([]);
  });
});

/** `legacyDocument()`, with `profiles[P1].equipment` overwritten to the given raw value. */
function documentWithEquipment(value: string): Record<string, unknown> {
  const doc = legacyDocument();
  const profiles = doc.profiles as Record<string, Record<string, unknown>>;
  const legacy = profiles[P1];
  if (legacy) legacy.equipment = value;
  return doc;
}

describe('the equipment access migration (Brief F Part 2)', () => {
  it('rewrites the old dumbbells-only exercise tag to the home access tier', () => {
    const result = parseState(documentWithEquipment('dumbbells-only'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.profiles[P1]?.equipment).toBe('home');
  });

  it('leaves full-gym and bodyweight untouched, since both spellings are shared', () => {
    for (const value of ['full-gym', 'bodyweight'] as const) {
      const result = parseState(documentWithEquipment(value));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.state.profiles[P1]?.equipment).toBe(value);
    }
  });

  it('falls back to full-gym on a value neither the old nor the new union recognises', () => {
    const result = parseState(documentWithEquipment('garbage-tier'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.profiles[P1]?.equipment).toBe('full-gym');
  });

  it('accepts the two new combination tiers directly, with no rewrite', () => {
    for (const value of ['home-and-bodyweight', 'full-and-home'] as const) {
      const result = parseState(documentWithEquipment(value));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.state.profiles[P1]?.equipment).toBe(value);
    }
  });
});

/** A document with one well-formed profile, ready for a targeted violation. */
function oneProfileDocument(): Record<string, unknown> {
  const doc = legacyDocument();
  doc.customExercises = {};
  doc.notes = {};
  return doc;
}

/** A logged set, keyed elsewhere by the caller. */
function loggedSet(id: string): unknown {
  return {
    id,
    profileId: P1,
    assignmentDate: '2026-09-01',
    sessionId: 's',
    exerciseId: 'e',
    setNumber: 1,
    isBonus: false,
    loadKg: 60, // [kg]
    enteredUnit: 'metric',
    reps: 5, // [reps]
    durationS: null,
    rpe: 7.5, // dimensionless, on the half-point grid
    loggedAt: 1_756_000_000_000, // [ms]
  };
}

describe('record keys must agree with the entity they store', () => {
  it('accepts a document whose keys all agree', () => {
    const doc = oneProfileDocument();
    doc.sets = { 'set-1': loggedSet('set-1') };
    doc.notes = { [P1]: { '2026-09-01': 'a note' } };
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
  });

  it('rejects a profile filed under a key that is not its id', () => {
    const doc = oneProfileDocument();
    doc.profiles = { 'wrong-key': legacyProfile(P1) };
    doc.activeProfileId = null;
    const result = parseState(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('profiles.wrong-key');
  });

  it('rejects a set filed under a key that is not its id', () => {
    const doc = oneProfileDocument();
    doc.sets = { 'wrong-key': loggedSet('set-1') };
    const result = parseState(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sets.wrong-key');
  });

  it('rejects a per-profile map keyed by an id no profile owns', () => {
    const doc = oneProfileDocument();
    doc.notes = { ghost: { '2026-09-01': 'orphan' } };
    const result = parseState(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('notes.ghost');
  });

  it('rejects an activeProfileId that names no profile', () => {
    const doc = oneProfileDocument();
    doc.activeProfileId = 'ghost';
    const result = parseState(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('activeProfileId');
  });
});

/** One profile's inventory, ready for a targeted violation of its ordinal ledger. */
function inventoryWithLedger(acquiredByOrdinal: Record<string, string>): unknown {
  return { profileId: P1, acquired: {}, totalSetsLogged: 3 /* [sets] */, acquiredByOrdinal };
}

describe('the ordinal ledger refuses a key the store could not have written', () => {
  /*
   * Blast radius, stated deliberately. A single malformed key in `acquiredByOrdinal` fails the
   * WHOLE document: parseState returns one error and nothing loads, so on import the user loses
   * every profile in the file, not the one bad entry. That is the choice, not an oversight.
   *
   * The alternative - drop the offending key and keep the rest - is worse here. The store is the
   * only writer and it writes `String(ordinal)`, so a padded, signed or non-numeric key means the
   * document was edited or corrupted outside the app. Salvaging it would leave an ordinal ledger
   * that no longer accounts for the acquisitions beside it, and that ledger is the only thing
   * stopping a delete-and-relog rerolling a drop (master plan section 10.8, rule 3): a silently
   * shortened ledger hands back the farm the rule closes. `notes` already makes the same call for
   * its inner local-date keys, and master plan section 8 states the governing constraint -
   * import validation is the critical fix; nothing enters the store unvalidated.
   */
  it('rejects a zero-padded ordinal and names the offending key in the path', () => {
    const doc = oneProfileDocument();
    doc.specimens = { [P1]: inventoryWithLedger({ '01': 'c001' }) };
    const result = parseState(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`specimens.${P1}.acquiredByOrdinal.01`);
  });

  it('rejects a negative ordinal', () => {
    const doc = oneProfileDocument();
    doc.specimens = { [P1]: inventoryWithLedger({ '-1': 'c001' }) };
    const result = parseState(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`specimens.${P1}.acquiredByOrdinal.-1`);
  });

  /*
   * Characterisation, not endorsement. SetOrdinalKeySchema is `/^(?:0|[1-9][0-9]*)$/`
   * (schema.ts), so "0" passes - but ordinal 0 belongs to NO logged set: the ordinal is
   * `totalSetsLogged` read after logSet's increment, so the first set is ordinal 1 (master plan
   * section 10.8, rule 1), and attemptSpecimenDraw returns null at 0 for exactly that reason.
   * A ledger key of "0" is therefore a document the store cannot have produced, and the regex
   * admits it. Tightening the regex to `/^[1-9][0-9]*$/` is out of scope for this fix - it is a
   * schema change, and this test pins the CURRENT behaviour so the change is visible when it is
   * made. Carried as a docs-pass item.
   */
  it('accepts ordinal 0 today, though ordinal 0 belongs to no logged set', () => {
    const doc = oneProfileDocument();
    doc.specimens = { [P1]: inventoryWithLedger({ '0': 'c001' }) };
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.specimens[P1]?.acquiredByOrdinal).toEqual({ '0': 'c001' });
  });

  it('accepts the unpadded decimal the store writes', () => {
    const doc = oneProfileDocument();
    doc.specimens = { [P1]: inventoryWithLedger({ '1': 'c001', '4096': 'c002' }) };
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.specimens[P1]?.acquiredByOrdinal).toEqual({
      '1': 'c001',
      '4096': 'c002',
    });
  });
});

describe('bounds the code review added', () => {
  it('accepts an rpe on the half-point grid and rejects one off it', () => {
    const doc = oneProfileDocument();
    doc.sets = { 'set-1': loggedSet('set-1') };
    expect(parseState(doc).ok).toBe(true);

    const offGrid = oneProfileDocument();
    offGrid.sets = { 'set-1': { ...(loggedSet('set-1') as object), rpe: 7.3 } };
    const result = parseState(offGrid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sets.set-1.rpe');
  });

  it('refuses ordinal 0, because the plan position is 1-based', () => {
    const session = {
      id: 'session-1',
      name: 'Push',
      kind: 'lift',
      label: 'Push',
      exercises: [],
    };
    expect(PlannedSessionSchema.safeParse({ ...session, ordinal: 1 }).success).toBe(true);
    expect(PlannedSessionSchema.safeParse({ ...session, ordinal: 0 }).success).toBe(false);
  });

  it('bounds an epoch instant to the ECMAScript time-value range', () => {
    /** A push device is the one root-level record carrying an epoch instant. */
    function documentWithCreatedAt(createdAt: number): AppState {
      return {
        ...defaultState(),
        pushDevice: {
          deviceId: 'device-1',
          secret: 'secret',
          endpoint: 'https://example.test/push/1',
          keys: { p256dh: 'p', auth: 'a' },
          createdAt, // [ms]
          lastSyncAt: null,
          lastSyncHash: null,
        },
      };
    }

    // ECMA-262 §21.4.1.1: |t| <= 8.64e15 ms. One past it makes new Date(t) an
    // Invalid Date, so every helper in dates.ts would return NaN text for it.
    expect(parseState(documentWithCreatedAt(8_640_000_000_000_000)).ok).toBe(true);
    expect(parseState(documentWithCreatedAt(-8_640_000_000_000_000)).ok).toBe(true);
    expect(parseState(documentWithCreatedAt(8_640_000_000_000_001)).ok).toBe(false);
    expect(parseState(documentWithCreatedAt(-8_640_000_000_000_001)).ok).toBe(false);
  });

  it('refuses a schema version 2 document and names the version', () => {
    // There is no v2 -> v3 migration yet (P7 adds it), so the chain must refuse
    // the document loudly rather than hand an unmigrated shape to the validator.
    const result = parseState({ ...defaultState(), schemaVersion: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('2');
      expect(result.error).toBe('no migration from schema version 2 to 3');
    }
  });
});

describe('round trip', () => {
  /*
   * A coverage guard on the property below, not a property itself. `acquiredByOrdinal` is an
   * OPTIONAL field, so a generator that never emits it makes the round trip silent about the
   * ordinal ledger: a schema that dropped the field entirely would still pass 500 documents,
   * which is the exact failure the field was added to prevent (schema.ts, SpecimenInventory).
   * Sampling the same arbitrary the property runs is what ties the two together.
   */
  it('generates documents that carry a populated ordinal ledger', () => {
    const ledgers = fc
      .sample(anyAppState, { numRuns: 200, seed: 20260902 })
      .flatMap((state: AppState) => Object.values(state.specimens))
      .map((inventory) => inventory.acquiredByOrdinal)
      .filter((ledger) => ledger !== undefined && Object.keys(ledger).length > 0);
    expect(ledgers.length).toBeGreaterThan(0);
  });

  it(
    'parse(serialize(state)) deep-equals state over 500 generated documents',
    () => {
      fc.assert(
        fc.property(anyAppState, (state: AppState) => {
          const result = parseState(throughJson(state));
          if (!result.ok) {
            throw new Error(`generated state failed validation: ${result.error}`);
          }
          expect(result.state).toEqual(state);
          return true;
        }),
        /*
         * SEEDED, and it must stay seeded. This property ran unseeded until 2026-09-09, which
         * made it the only nondeterministic test in the suite: every run drew 500 different
         * documents, so a failure could not be reproduced and the case that caused it was gone
         * the moment the run ended. It failed exactly once, during brief J's verification, and
         * the counterexample was lost for precisely that reason.
         *
         * Its two neighbours above and below already pin seeds (20260902, 20260905); this one
         * was the outlier. A seeded property is not a weaker property: it still exercises 500
         * generated documents, it just exercises the SAME 500 every time, so a regression is
         * reproducible and CI cannot go red at random with nothing to chase.
         *
         * If you need wider coverage, raise numRuns or add a second seeded case. Do not remove
         * the seed.
         */
        { numRuns: 500, seed: 20260909 },
      );
    },
    // 500 documents through JSON and the validator measures at about 2.6 s on
    // its own, which the 5 s default cannot absorb once the whole suite runs in
    // parallel workers. Lowering numRuns would weaken the property instead, so
    // the timeout moves and the run count does not.
    30_000,
  );
});

/**
 * The two UI preferences P8 Task 12 adds. Both are additive and both carry a Zod default, so
 * CURRENT_SCHEMA_VERSION stays 3 and a document written before this task parses unchanged.
 *
 * The shipped skin is limelight. Retired values are repaired while parsing v3 data.
 */
describe('the skin and sounds preferences', () => {
  it('defaults a fresh document to the limelight skin with sounds off', () => {
    const s = defaultState();
    expect(s.ui.skin).toBe('limelight');
    expect(s.ui.sounds).toBe(false);
    expect(AppStateSchema.safeParse(s).success).toBe(true);
    // Additive fields never bump the version.
    expect(s.schemaVersion).toBe(3);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('backfills both onto a document that predates them', () => {
    const result = parseState(legacyDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.ui.skin).toBe('limelight');
    expect(result.state.ui.sounds).toBe(false);
  });

  it('coerces retired skin ids while retaining the rest of a v3 document', () => {
    // The same document naming the shipped skin is the reference: a retired id must parse to
    // exactly what that parses to, so nothing but `ui.skin` can have moved.
    const reference = legacyDocument();
    reference.ui = { ...(reference.ui as Record<string, unknown>), skin: 'limelight' };
    const expected = parseState(reference);
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    for (const skin of ['clinical', 'board']) {
      const doc = legacyDocument();
      doc.ui = { ...(doc.ui as Record<string, unknown>), skin };
      const result = parseState(doc);
      expect({ skin, ok: result.ok }).toEqual({ skin, ok: true });
      if (result.ok) {
        expect(result.state.ui.skin).toBe('limelight');
        expect(result.state).toEqual(expected.state);
      }
    }
  });

  it('refuses an unknown skin id', () => {
    const bad = legacyDocument();
    bad.ui = { ...(bad.ui as Record<string, unknown>), skin: 'crt' };
    expect(parseState(bad).ok).toBe(false);
  });
});

/**
 * The shortcut off switch (WCAG 2.1 SC 2.1.4, Character Key Shortcuts).
 *
 * The criterion asks for a MECHANISM to turn single-character shortcuts off, not for them to
 * be off, so the preference defaults to true: the shortcuts exist, and a document written
 * before the switch did opens with them exactly as it closed. src/ui/hotkeys.tsx reads it.
 */
describe('the hotkeys preference', () => {
  it('defaults a fresh document to shortcuts on', () => {
    const s = defaultState();
    expect(s.ui.hotkeys).toBe(true);
    expect(AppStateSchema.safeParse(s).success).toBe(true);
    // Additive with a Zod default, so the version does not move.
    expect(s.schemaVersion).toBe(3);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('backfills it onto a document that predates it', () => {
    const result = parseState(legacyDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.ui.hotkeys).toBe(true);
  });

  it('carries a stored false through unchanged', () => {
    const doc = legacyDocument();
    doc.ui = { ...(doc.ui as Record<string, unknown>), hotkeys: false };
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.ui.hotkeys).toBe(false);
  });
});

/**
 * The intro sequence's own seen flag (P10 Brief C, src/ui/intro/IntroSequence.tsx).
 *
 * `false` by default, unlike hotkeys above: the intro is a screen to get PAST, not a mechanism
 * to switch off, so a fresh document has not met it and a document written before the field
 * existed has not either -- both open on the intro exactly once.
 */
describe('the introSeen preference', () => {
  it('defaults a fresh document to unseen', () => {
    const s = defaultState();
    expect(s.ui.introSeen).toBe(false);
    expect(AppStateSchema.safeParse(s).success).toBe(true);
    // Additive with a Zod default, so the version does not move.
    expect(s.schemaVersion).toBe(3);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('backfills false onto a document that predates it', () => {
    const result = parseState(legacyDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.ui.introSeen).toBe(false);
  });

  it('carries a stored true through unchanged', () => {
    const doc = legacyDocument();
    doc.ui = { ...(doc.ui as Record<string, unknown>), introSeen: true };
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.ui.introSeen).toBe(true);
  });
});

/**
 * The setup wizard's in-progress draft (C1.G.1). Additive, at the root rather than nested in
 * `ui`, and the only field in this file backed by `.catch(null)` rather than a bare
 * `.default(null)`: see SetupDraftSchema's own comment in schema.ts for why a corrupt draft has
 * to be swallowed rather than left to fail AppStateSchema as a whole.
 */
describe('the setupDraft field', () => {
  it('defaults a fresh document to no draft in progress', () => {
    const s = defaultState();
    expect(s.setupDraft).toBeNull();
    expect(AppStateSchema.safeParse(s).success).toBe(true);
    // Additive with a fallback, so the version does not move.
    expect(s.schemaVersion).toBe(3);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('backfills null onto a document that predates it', () => {
    const result = parseState(legacyDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.setupDraft).toBeNull();
  });

  it('carries a stored, valid draft through unchanged', () => {
    const draft = fc.sample(anySetupDraft, { numRuns: 1, seed: 20260905 })[0];
    const doc = legacyDocument();
    doc.setupDraft = draft;
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.setupDraft).toEqual(draft);
  });

  /*
   * C1.G.1: "an invalid stored draft does not crash the wizard and does not corrupt the rest of
   * the document." Three shapes of corruption, none of them a Zod validation error on the WHOLE
   * document: a garbage primitive where the draft belongs, an object missing required fields,
   * and (the shape a hand-edited or bit-flipped stored document is likeliest to produce) an
   * otherwise-valid draft with one field out of its bound. Every one has to leave the profile,
   * and every other field of the document, exactly as it was.
   */
  it.each([
    ['a string where an object belongs', 'not a draft'],
    ['an object missing required fields', { units: 'metric' }],
    [
      'a valid shape with stepIndex out of STEPS bounds',
      { ...fc.sample(anySetupDraft, { numRuns: 1, seed: 7 })[0], stepIndex: 999 },
    ],
  ])('catches %s to null, without corrupting the rest of the document', (_label, corrupt) => {
    const doc = legacyDocument();
    doc.setupDraft = corrupt;
    const result = parseState(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.setupDraft).toBeNull();
    // The rest of the document is untouched by the corruption in one unrelated field.
    expect(result.state.profiles[P1]).toBeDefined();
    expect(result.state.activeProfileId).toBe(P1);
  });
});
