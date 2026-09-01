import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AppStateSchema, CURRENT_SCHEMA_VERSION, defaultState, parseState } from './schema';
import { anyAppState } from './arbitraries';
import type { AppState } from './types';

/**
 * Every captured fixture, loaded through Vite rather than node:fs so the test
 * needs no Node type declarations in the app TypeScript project (security
 * constraint 4: a test that every fixture migrates to the current schema).
 */
const FIXTURES: Record<string, { default: unknown }> = import.meta.glob(
  './migrations/fixtures/*.json',
  { eager: true },
);

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

  it('backfills the fields added after the fixture was captured', () => {
    // v3-minimal.json predates the section 5 amendments, so it exercises every
    // Zod default. A document written before a field existed must still load.
    const result = parseState(FIXTURES['./migrations/fixtures/v3-minimal.json']?.default);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.customExercises).toEqual({});
    expect(result.state.notes).toEqual({});
    expect(result.state.ui.videoInstanceHost).toBeNull();
    expect(result.state.ui.legacyMigration).toBe('pending');
    expect(result.state.ui.lastBlockSeenByProfile).toEqual({});
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

describe('round trip', () => {
  it('parse(serialize(state)) deep-equals state over 500 generated documents', () => {
    fc.assert(
      fc.property(anyAppState, (state: AppState) => {
        const result = parseState(throughJson(state));
        if (!result.ok) {
          throw new Error(`generated state failed validation: ${result.error}`);
        }
        expect(result.state).toEqual(state);
        return true;
      }),
      { numRuns: 500 },
    );
  });
});
