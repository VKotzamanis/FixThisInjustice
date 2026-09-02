import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { selectState, useAppStore } from './index';
import { importJson as parseDocument } from './persistence';
import {
  latestBodyMassEntry,
  nutritionInputFor,
  useActivePlan,
  useIntakeForDate,
  useNutritionTargets,
} from './selectors';
import type {
  Availability,
  BodyMassEntry,
  IntakeEntry,
  LoggedSet,
  PlanPause,
  PlanTemplate,
  Profile,
  SessionAssignment,
} from '../domain/types';
// Type-only, so it is erased before the module mock below ever matters.
import type { NutritionInput } from '../domain/nutrition';

/**
 * The nutrition engine, real in every respect except that one test can make
 * computeTargets fail on demand.
 *
 * useNutritionTargets gates on isInDomain and no longer wraps the call in a
 * try/catch, and the difference between those two designs is invisible from
 * outside unless the engine throws on an input the gate accepted. That is what
 * this switch produces: a defect in the engine, not a domain refusal. Everything
 * else — dailyBeverageTargetML, which the store calls from createProfile, and
 * the arithmetic every other assertion in this file depends on — is the real
 * module, passed through.
 */
const nutritionMock = vi.hoisted(() => ({ failWith: null as Error | null }));

vi.mock('../domain/nutrition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/nutrition')>();
  return {
    ...actual,
    computeTargets: (input: NutritionInput): ReturnType<typeof actual.computeTargets> => {
      if (nutritionMock.failWith !== null) throw nutritionMock.failWith;
      return actual.computeTargets(input);
    },
  };
});

/**
 * The clock is pinned because two numbers under test are read off it: the age
 * the nutrition input derives from `birthYear`, and `todayLocal` inside the
 * targets selector. Left on the real clock, every age assertion here would
 * change silently on 1 January and the failure would look like a regression in
 * the engine rather than a stale fixture.
 *
 * Only Date is faked. React's scheduler and the store's save debounce use the
 * real timers, and neither has anything to do with what these tests assert.
 */
const FIXED_NOW = new Date('2026-09-01T09:00:00Z'); // 2026-09-01 12:00 in Europe/Athens

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    displayName: 'Test subject',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: 1_756_684_800_000, // [ms] 2026-09-01T00:00:00Z
    body: {
      sex: 'male',
      birthYear: 1996, // [year]
      heightCm: 180, // [cm]
      baselineMassKg: 80, // [kg]
      baselineAt: '2026-09-01',
      baselineBodyFatPct: null, // [%]
    },
    activity: 'moderate',
    experience: 'intermediate',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
      hasMicroPlates: false,
      microPlateKg: 0.5, // [kg] total for a micro-plate pair
    },
    goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: null, flagged: false },
    ...over,
  };
}

/**
 * A minimal but schema-valid plan. The store stores whatever the generator
 * produced without inspecting it, so a two-session template exercises every
 * branch a 48-session one would and keeps this file independent of
 * src/domain/plan/generator.ts.
 */
function planTemplate(over: Partial<PlanTemplate> = {}): PlanTemplate {
  return {
    id: 'incoming-plan-id',
    version: 1,
    name: 'Upper/Lower',
    sessionsPerWeek: 4, // [sessions/week]
    weeks: 12, // [weeks]
    sessions: [
      {
        id: 'sess-upper',
        ordinal: 1,
        name: 'Upper A',
        kind: 'lift',
        label: 'Upper',
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
        id: 'sess-lower',
        ordinal: 2,
        name: 'Lower A',
        kind: 'lift',
        label: 'Lower',
        exercises: [
          {
            exerciseId: 'barbell-back-squat',
            setsLo: 3, // [sets]
            setsHi: 4, // [sets]
            prescription: { kind: 'reps', lo: 5, hi: 8 }, // [reps]
            restS: 210, // [s]
          },
        ],
      },
    ],
    blocks: [
      {
        index: 0,
        firstSessionIndex: 0, // [sessions] offset
        sessionCount: 2, // [sessions]
        setModifier: 1, // dimensionless
        loadModifier: 1, // dimensionless
        isDeload: false,
      },
    ],
    ...over,
  };
}

/**
 * A replacement plan that shares NO session id with planTemplate().
 *
 * Re-planning keeps the plan it replaces because logged sets name their session
 * by id and nothing else can resolve that id. A replacement reusing the same
 * ids would let a set resolve against the new plan and hide the very failure the
 * retention exists to prevent, so the ids are disjoint on purpose.
 */
function replacementTemplate(): PlanTemplate {
  const shape = planTemplate();
  return {
    ...shape,
    id: 'incoming-replacement-id',
    name: 'Push/Pull/Legs',
    sessions: shape.sessions.map((session, i) => ({
      ...session,
      id: `repl-${session.id}`,
      name: `Replacement ${String(i + 1)}`,
    })),
  };
}

/**
 * One row of a profile's schedule. P3 owns the writers; these tests seed the map
 * directly because setPlan's contract is about what it does to whatever is
 * already there, not about how it got there.
 */
function assignment(over: Partial<SessionAssignment> = {}): SessionAssignment {
  return {
    date: '2026-09-07',
    sessionId: 'sess-upper',
    sourceIndex: 0, // [sessions] index into the plan's session list
    status: 'planned',
    startedAt: null, // [ms]
    completedAt: null, // [ms]
    skipReason: null,
    ...over,
  };
}

/** A pause of the current plan; `to: null` means still paused (half-open [from, to)). */
function pause(over: Partial<PlanPause> = {}): PlanPause {
  return { id: 'pause-1', from: '2026-09-10', to: null, reason: 'travel', ...over };
}

function loggedSet(over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: 'set-1',
    profileId: 'p1',
    assignmentDate: '2026-09-07',
    sessionId: 'sess-upper',
    exerciseId: 'barbell-bench-press',
    setNumber: 1,
    isBonus: false,
    loadKg: 60, // [kg]
    enteredUnit: 'metric',
    reps: 8, // [reps]
    durationS: null, // [s]
    rpe: 8,
    loggedAt: 1_757_232_000_000, // [ms]
    ...over,
  };
}

function intakeEntry(over: Partial<IntakeEntry> = {}): IntakeEntry {
  return {
    profileId: 'p1',
    date: '2026-09-01',
    kcal: 2400, // [kcal/day]
    proteinG: 150, // [g/day]
    ...over,
  };
}

function bodyMass(date: string, massKg: number, loggedAt: number): BodyMassEntry {
  return {
    id: `bm-${date}-${String(loggedAt)}`,
    profileId: 'p1',
    date,
    massKg, // [kg]
    enteredUnit: 'metric',
    bodyFatPct: null, // [%]
    loggedAt, // [ms]
  };
}

/**
 * Every action's result has to survive the trip the document actually makes:
 * serialise, re-read, revalidate. The invariants the root refinement enforces
 * (master plan section 5) come with it — `profiles[id].id === id`, per-profile
 * maps keyed by a known profile, `activeProfileId` a known profile — so a
 * record written under a wrong key fails here rather than at the next reload.
 *
 * `plans` is keyed by the plan's own id and the schema deliberately leaves it
 * alone (it is not a per-profile map), so the last two assertions carry that key
 * agreement and the one direction of reference that is actually an invariant.
 *
 * The other direction is NOT asserted, and its absence is the point: a plan with
 * no cursor pointing at it is a plan the profile has finished with, kept because
 * every LoggedSet logged under it names one of its sessions by id and `plans` is
 * the only record that resolves that id. Requiring every plan to be referenced
 * would be requiring setPlan to delete history.
 */
function expectDocumentConsistent(): void {
  const snapshot = selectState(useAppStore.getState());
  const parsed = parseDocument(useAppStore.getState().exportJson());
  expect(parsed.ok ? null : parsed.error).toBeNull();

  for (const [key, plan] of Object.entries(snapshot.plans)) {
    expect(plan.id).toBe(key);
  }
  for (const cursor of Object.values(snapshot.cursors)) {
    expect(snapshot.plans[cursor.planId]).toBeDefined(); // no cursor without a plan
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  nutritionMock.failWith = null;
  useAppStore.getState().wipeAll();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createProfile', () => {
  it('stores the profile and makes the first one active', () => {
    useAppStore.getState().createProfile(profile());
    const s = useAppStore.getState();
    expect(s.profiles['p1']?.displayName).toBe('Test subject');
    expect(s.activeProfileId).toBe('p1');
    expectDocumentConsistent();
  });

  it('seeds empty log arrays so later writes never index undefined', () => {
    useAppStore.getState().createProfile(profile());
    const s = useAppStore.getState();
    expect(s.intake['p1']).toEqual([]);
    expect(s.bodyMass['p1']).toEqual([]);
    expect(s.hydration['p1']).toEqual([]);
    expect(s.weeklyReviews['p1']).toEqual([]);
    expect(s.pauses['p1']).toEqual([]);
    expect(s.assignments['p1']).toEqual([]);
  });

  it('does not steal the active slot from an existing profile', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().createProfile(profile({ id: 'p2' }));
    expect(useAppStore.getState().activeProfileId).toBe('p1');
    expect(Object.keys(useAppStore.getState().profiles).sort()).toEqual(['p1', 'p2']);
    expectDocumentConsistent();
  });

  it('seeds the hydration target from the IOM beverage figure when the caller left it 0', () => {
    useAppStore.getState().createProfile(
      profile({ hydration: { dailyTargetML: 0, cupSizeML: 250, weighInOptIn: false } }),
    );
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(3000); // [mL/day] male
    expectDocumentConsistent();
  });

  it('refuses a second profile under an id that already exists', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake('p1', intakeEntry());
    expect(() => {
      useAppStore.getState().createProfile(profile({ displayName: 'Overwriter' }));
    }).toThrow(/already exists/);
    // The stored profile and its logs are untouched: a create that silently
    // became an overwrite would leave this history under someone else's name.
    const s = useAppStore.getState();
    expect(s.profiles['p1']?.displayName).toBe('Test subject');
    expect(s.intake['p1']?.length).toBe(1);
    expectDocumentConsistent();
  });

  it('keeps a caller-supplied hydration target', () => {
    useAppStore.getState().createProfile(
      profile({ hydration: { dailyTargetML: 2500, cupSizeML: 250, weighInOptIn: false } }),
    );
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(2500); // [mL/day]
  });
});

describe('updateProfile', () => {
  it('patches the named fields and leaves the rest', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().updateProfile('p1', { units: 'imperial', activity: 'vigorous' });
    const p = useAppStore.getState().profiles['p1'];
    expect(p?.units).toBe('imperial');
    expect(p?.activity).toBe('vigorous');
    expect(p?.body.baselineMassKg).toBe(80); // [kg]
    expectDocumentConsistent();
  });

  it('ignores an unknown id', () => {
    useAppStore.getState().updateProfile('nope', { units: 'imperial' });
    expect(useAppStore.getState().profiles['nope']).toBeUndefined();
    expectDocumentConsistent();
  });

  it('refuses a daily fluid target that is not positive', () => {
    useAppStore.getState().createProfile(profile());
    // 0 makes the progress ratio divide by zero and a negative target makes the
    // bar run backwards; NaN does both silently. createProfile substitutes the
    // IOM figure for a 0, so the patch path is the remaining way in.
    for (const dailyTargetML of [0, -1, Number.NaN]) {
      expect(() => {
        useAppStore
          .getState()
          .updateProfile('p1', { hydration: { dailyTargetML, cupSizeML: 250, weighInOptIn: false } });
      }).toThrow(/dailyTargetML/);
    }
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(3000); // [mL/day]
    expectDocumentConsistent();
  });

  it('accepts a positive daily fluid target', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore
      .getState()
      .updateProfile('p1', { hydration: { dailyTargetML: 2800, cupSizeML: 250, weighInOptIn: true } });
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(2800); // [mL/day]
  });
});

describe('setActiveProfile', () => {
  it('moves the active slot to another stored profile', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().createProfile(profile({ id: 'p2', displayName: 'Second' }));
    expect(useAppStore.getState().activeProfileId).toBe('p1');
    useAppStore.getState().setActiveProfile('p2');
    expect(useAppStore.getState().activeProfileId).toBe('p2');
    expectDocumentConsistent();
  });

  it('refuses an id no profile owns rather than pointing the app at nothing', () => {
    useAppStore.getState().createProfile(profile());
    expect(() => {
      useAppStore.getState().setActiveProfile('nope');
    }).toThrow(/not a known profile/);
    // An unknown id would make every active-profile selector return null, which
    // the app shell reads as "no profile yet" and answers with the setup wizard.
    expect(useAppStore.getState().activeProfileId).toBe('p1');
    expectDocumentConsistent();
  });
});

describe('recordReadiness', () => {
  it('writes the screening date and the flag onto the profile', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().recordReadiness('p1', '2026-09-01', true);
    expect(useAppStore.getState().profiles['p1']?.readiness).toEqual({
      screenedAt: '2026-09-01',
      flagged: true,
    });
    expectDocumentConsistent();
  });

  it('refuses an unknown profile rather than dropping the screen', () => {
    expect(() => {
      useAppStore.getState().recordReadiness('nope', '2026-09-01', true);
    }).toThrow(/not a known profile/);
  });
});

describe('setPlan', () => {
  it('stores the plan under a fresh id and starts a cursor at session zero', () => {
    useAppStore.getState().createProfile(profile());
    const plan = planTemplate();
    useAppStore.getState().setPlan('p1', plan, '2026-09-07');

    const s = useAppStore.getState();
    const cursor = s.cursors['p1'];
    expect(cursor?.nextSessionIndex).toBe(0);
    expect(cursor?.startedOn).toBe('2026-09-07');
    expect(cursor?.completedOn).toBeNull();
    // A PlanTemplate belongs to exactly one profile (types.ts section 5), so the
    // id the caller handed in is not the id it is stored under.
    expect(cursor?.planId).not.toBe(plan.id);
    expect(s.plans[cursor?.planId ?? '']?.sessions.length).toBe(2);
    expect(s.plans[plan.id]).toBeUndefined();
    expectDocumentConsistent();
  });

  it('gives two profiles two plan records from one template', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().createProfile(profile({ id: 'p2' }));
    const plan = planTemplate();
    useAppStore.getState().setPlan('p1', plan, '2026-09-07');
    useAppStore.getState().setPlan('p2', plan, '2026-09-07');

    const s = useAppStore.getState();
    expect(s.cursors['p1']?.planId).not.toBe(s.cursors['p2']?.planId);
    expect(Object.keys(s.plans).length).toBe(2);
    expectDocumentConsistent();
  });

  it('resets the cursor onto the new plan and keeps the plan it replaced', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    const started = useAppStore.getState().cursors['p1'];
    const first = started?.planId ?? '';
    expect(started).toBeDefined();
    if (started !== undefined) {
      // Advance the cursor so "reset to 0" is a change and not the initial value.
      useAppStore.setState((s) => ({
        cursors: { ...s.cursors, p1: { ...started, nextSessionIndex: 5 } },
      }));
    }

    useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');

    const s = useAppStore.getState();
    // Two records, not one. The cursor says which is current; the other is the
    // history that already-logged sets point into.
    expect(Object.keys(s.plans).length).toBe(2);
    expect(s.plans[first]?.name).toBe('Upper/Lower');
    expect(s.cursors['p1']?.planId).not.toBe(first);
    expect(s.cursors['p1']?.nextSessionIndex).toBe(0);
    expect(s.cursors['p1']?.startedOn).toBe('2026-10-05');
    expect(s.plans[s.cursors['p1']?.planId ?? '']?.name).toBe('Push/Pull/Legs');
    expectDocumentConsistent();
  });

  it('leaves a logged set able to name its session after the plan is replaced', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    const first = useAppStore.getState().cursors['p1']?.planId ?? '';
    const logged = loggedSet({ sessionId: 'sess-upper' });
    useAppStore.setState({ sets: { [logged.id]: logged } });

    // The replacement shares no session id with the plan it replaces, so the
    // replaced record is the only thing that can resolve this set's session.
    useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');

    const s = useAppStore.getState();
    expect(s.sets[logged.id]).toBeDefined();
    const resolved = Object.values(s.plans)
      .flatMap((p) => p.sessions)
      .find((session) => session.id === logged.sessionId);
    expect(resolved?.name).toBe('Upper A');
    expect(s.plans[first]?.sessions.some((session) => session.id === 'sess-upper')).toBe(true);
    expectDocumentConsistent();
  });

  it('refuses to re-plan while a session is in progress', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    const before = useAppStore.getState().cursors['p1']?.planId;
    useAppStore.setState((s) => ({
      assignments: {
        ...s.assignments,
        p1: [
          assignment({ date: '2026-09-07', status: 'completed', completedAt: 1 }), // [ms]
          assignment({ date: '2026-09-09', status: 'in-progress', startedAt: 2 }), // [ms]
        ],
      },
    }));

    expect(() => {
      useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');
    }).toThrow(/a session is in progress/);

    // Nothing moved: the refusal is the whole action, not a partial one.
    const s = useAppStore.getState();
    expect(s.cursors['p1']?.planId).toBe(before);
    expect(Object.keys(s.plans).length).toBe(1);
    expect(s.assignments['p1']?.length).toBe(2);
    expectDocumentConsistent();
  });

  it('clears planned and terminal assignments left over from the replaced plan', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    useAppStore.setState((s) => ({
      assignments: {
        ...s.assignments,
        p1: [
          assignment({ date: '2026-09-07', status: 'completed', completedAt: 1 }), // [ms]
          assignment({ date: '2026-09-09', status: 'skipped', skipReason: 'ill' }),
          assignment({ date: '2026-09-11', status: 'planned' }),
        ],
      },
    }));

    useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');

    // Every row named a sessionId and a sourceIndex into the replaced plan, so a
    // surviving row would resolve against whatever now sits at that index.
    expect(useAppStore.getState().assignments['p1']).toEqual([]);
    // The sets are the record of what was done, and they are not the schedule.
    expect(useAppStore.getState().sets).toEqual({});
    expectDocumentConsistent();
  });

  it('clears an open pause so the new plan does not start suspended', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    useAppStore.setState((s) => ({
      pauses: { ...s.pauses, p1: [pause({ to: '2026-09-14' }), pause({ id: 'pause-2', to: null })] },
    }));

    useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');

    expect(useAppStore.getState().pauses['p1']).toEqual([]);
    expectDocumentConsistent();
  });

  it('touches no other profile when one re-plans', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().createProfile(profile({ id: 'p2' }));
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    useAppStore.getState().setPlan('p2', planTemplate(), '2026-09-07');
    const otherPlan = useAppStore.getState().cursors['p2']?.planId;
    useAppStore.setState((s) => ({
      assignments: { ...s.assignments, p2: [assignment({ status: 'in-progress', startedAt: 3 })] },
      pauses: { ...s.pauses, p2: [pause()] },
    }));

    // p2 is mid-session; that must not stop p1 re-planning, and p1 re-planning
    // must not clear p2's schedule.
    useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');

    const s = useAppStore.getState();
    expect(s.cursors['p2']?.planId).toBe(otherPlan);
    expect(s.assignments['p2']?.length).toBe(1);
    expect(s.pauses['p2']?.length).toBe(1);
    expect(s.assignments['p1']).toEqual([]);
    expectDocumentConsistent();
  });

  it('refuses a profile that does not exist', () => {
    expect(() => {
      useAppStore.getState().setPlan('nope', planTemplate(), '2026-09-07');
    }).toThrow(/not a known profile/);
    expect(useAppStore.getState().plans).toEqual({});
    expect(useAppStore.getState().cursors).toEqual({});
  });
});

describe('logIntake', () => {
  it('appends one entry per date', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake('p1', intakeEntry());
    useAppStore.getState().logIntake('p1', intakeEntry({ date: '2026-09-02', kcal: 2500 }));
    expect(useAppStore.getState().intake['p1']?.length).toBe(2);
    expectDocumentConsistent();
  });

  it('replaces the entry for a date that is logged twice', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake('p1', intakeEntry());
    useAppStore.getState().logIntake('p1', intakeEntry({ kcal: 2600, proteinG: 175 }));
    const list = useAppStore.getState().intake['p1'] ?? [];
    expect(list.length).toBe(1);
    expect(list[0]).toEqual({
      profileId: 'p1',
      date: '2026-09-01',
      kcal: 2600, // [kcal/day]
      proteinG: 175, // [g/day]
    });
    expectDocumentConsistent();
  });

  it('keeps the list in date order however it was entered', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake('p1', intakeEntry({ date: '2026-09-03' }));
    useAppStore.getState().logIntake('p1', intakeEntry({ date: '2026-09-01' }));
    useAppStore.getState().logIntake('p1', intakeEntry({ date: '2026-09-02' }));
    expect((useAppStore.getState().intake['p1'] ?? []).map((e) => e.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('refuses an unknown profile and an entry filed under someone else', () => {
    useAppStore.getState().createProfile(profile());
    expect(() => {
      useAppStore.getState().logIntake('nope', intakeEntry({ profileId: 'nope' }));
    }).toThrow(/not a known profile/);
    expect(() => {
      useAppStore.getState().logIntake('p1', intakeEntry({ profileId: 'p2' }));
    }).toThrow(/profileId/);
    expect(useAppStore.getState().intake['p1']).toEqual([]);
    expectDocumentConsistent();
  });
});

describe('setAvailability', () => {
  const availability: Availability = {
    slots: [
      { weekday: 1, startTime: '07:30', expectedDurationS: 3600 }, // [s]
      { weekday: 4, startTime: '07:30', expectedDurationS: 3600 }, // [s]
    ],
    weeklySessionTarget: 2, // [sessions/week]
  };

  it('stores slots and the weekly session target', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setAvailability('p1', availability);
    expect(useAppStore.getState().availability['p1']).toEqual(availability);
    expectDocumentConsistent();
  });

  it('refuses an unknown profile rather than orphaning the record', () => {
    expect(() => {
      useAppStore.getState().setAvailability('nope', availability);
    }).toThrow(/not a known profile/);
    expect(useAppStore.getState().availability).toEqual({});
  });
});

describe('latestBodyMassEntry', () => {
  it('returns null when nothing has been logged', () => {
    useAppStore.getState().createProfile(profile());
    expect(latestBodyMassEntry(useAppStore.getState(), 'p1')).toBeNull();
  });

  it('orders by civil date through compareLocalDate, not by array position', () => {
    // The ordering contract, pinned independently of how it is implemented: the
    // newest date wins wherever it sits in the array, and a later date never
    // loses to an earlier one with a larger loggedAt. compareLocalDate is a
    // lexical comparison on zero-padded ISO dates, so this passes both before
    // and after that swap; it exists so a future change to the date
    // representation fails here rather than silently reordering weigh-ins.
    useAppStore.getState().createProfile(profile());
    useAppStore.setState((s) => ({
      bodyMass: {
        ...s.bodyMass,
        p1: [
          bodyMass('2026-12-31', 77, 900), // [kg], [ms]
          bodyMass('2027-01-01', 82, 100), // newest date, oldest loggedAt
          bodyMass('2026-09-08', 79, 500),
        ],
      },
    }));
    expect(latestBodyMassEntry(useAppStore.getState(), 'p1')?.massKg).toBe(82); // [kg]
  });

  it('picks the newest civil date, breaking ties on loggedAt', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.setState((s) => ({
      bodyMass: {
        ...s.bodyMass,
        p1: [
          bodyMass('2026-09-01', 80, 10),
          bodyMass('2026-09-08', 79, 20),
          bodyMass('2026-09-08', 78.5, 30),
        ],
      },
    }));
    expect(latestBodyMassEntry(useAppStore.getState(), 'p1')?.massKg).toBe(78.5); // [kg]
  });
});

describe('nutritionInputFor', () => {
  it('prefers the latest logged mass and body fat over the baseline', () => {
    const input = nutritionInputFor(
      profile({ body: { ...profile().body, baselineMassKg: 80, baselineBodyFatPct: 30 } }),
      {
        id: 'x',
        profileId: 'p1',
        date: '2026-09-08',
        massKg: 76, // [kg]
        enteredUnit: 'metric',
        bodyFatPct: 24, // [%]
        loggedAt: 1, // [ms]
      },
      4,
      '2026-09-08',
    );
    expect(input.massKg).toBe(76); // [kg]
    expect(input.bodyFatPct).toBe(24); // [%]
    expect(input.ageYears).toBe(30); // [year] 2026 - 1996
    expect(input.sessionsPerWeek).toBe(4); // [sessions/week]
  });

  it('falls back to the profile baseline when nothing is logged', () => {
    const input = nutritionInputFor(profile(), null, 3, '2026-09-01');
    expect(input.massKg).toBe(80); // [kg]
    expect(input.bodyFatPct).toBeNull();
  });
});

describe('useNutritionTargets', () => {
  it('returns null with no active profile', () => {
    const { result } = renderHook(() => useNutritionTargets());
    expect(result.current).toBeNull();
  });

  it('computes from the active profile and keeps the same object across re-renders', () => {
    useAppStore.getState().createProfile(profile());
    const { result, rerender } = renderHook(() => useNutritionTargets());
    const first = result.current;
    expect(first?.rmrKcal).toBe(1780); // [kcal/day] 10*80 + 6.25*180 - 5*30 + 5
    expect(first?.targetKcal).toBe(2723); // [kcal/day] round(1780 * 1.70 * 0.90)
    rerender();
    expect(result.current).toBe(first); // memoised: same reference, no recomputation
  });

  it('recomputes when the profile changes', () => {
    useAppStore.getState().createProfile(profile());
    const { result } = renderHook(() => useNutritionTargets());
    const before = result.current;
    act(() => {
      useAppStore.getState().updateProfile('p1', { activity: 'sedentary' });
    });
    expect(result.current).not.toBe(before);
    expect(result.current?.tdeeKcal).toBe(2492); // [kcal/day] round(1780 * 1.40)
  });

  it('recomputes when body mass is logged', () => {
    useAppStore.getState().createProfile(profile());
    const { result } = renderHook(() => useNutritionTargets());
    const before = result.current;
    act(() => {
      useAppStore.setState((s) => ({
        bodyMass: { ...s.bodyMass, p1: [bodyMass('2026-09-08', 76, 10)] },
      }));
    });
    expect(result.current).not.toBe(before);
    // 10*76 + 6.25*180 - 5*30 + 5, i.e. the logged mass replaced the baseline.
    expect(result.current?.rmrKcal).toBe(1740); // [kcal/day]
  });

  it('returns null instead of throwing for a profile outside the nutrition domain', () => {
    // 100 cm is a valid Profile per the schema and outside NUTRITION_DOMAIN.heightCm
    // (120-230). The wizard blocks it; the selector must not take the UI down.
    useAppStore
      .getState()
      .createProfile(profile({ body: { ...profile().body, heightCm: 100 } })); // [cm]
    const { result } = renderHook(() => useNutritionTargets());
    expect(result.current).toBeNull();
  });

  it('decides the domain by asking, so an engine failure is not reported as no targets', () => {
    // The profile is well inside NUTRITION_DOMAIN, so isInDomain says yes and the
    // engine is called. A throw from there is a defect in the engine, and the two
    // designs disagree about it: a try/catch on RangeError cannot tell it apart
    // from a legitimate domain refusal and reports both as null, which is a wrong
    // diagnosis the user never sees. The gate makes it surface.
    useAppStore.getState().createProfile(profile());
    nutritionMock.failWith = new RangeError('nutrition engine defect');
    // React logs an uncaught render error; the assertion is the throw itself.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useNutritionTargets())).toThrow(/nutrition engine defect/);
    } finally {
      logged.mockRestore();
    }
  });

  it('does not go on serving last year\'s age after the civil year rolls over', () => {
    // Age is (current year - birthYear), so the arithmetic depends on the clock.
    // Keyed only on the profile and the logs, the memo would hold December's
    // value all through January: nothing in the store changes at midnight.
    useAppStore.getState().createProfile(profile()); // birthYear 1996, Europe/Athens
    const { result, rerender } = renderHook(() => useNutritionTargets());
    // [kcal/day] age 30: 10*80 + 6.25*180 - 5*30 + 5
    expect(result.current?.rmrKcal).toBe(1780);

    vi.setSystemTime(new Date('2027-01-01T12:00:00Z')); // 14:00 in Europe/Athens
    rerender();

    // [kcal/day] age 31: the Mifflin-St Jeor age term is -5 kcal/day per year.
    expect(result.current?.rmrKcal).toBe(1775);
  });

  it('still memoises within a civil day', () => {
    useAppStore.getState().createProfile(profile());
    const { result, rerender } = renderHook(() => useNutritionTargets());
    const first = result.current;
    // Same civil date in Europe/Athens, five hours later: the memo key is the
    // LocalDate, not the instant, so no arithmetic re-runs.
    vi.setSystemTime(new Date('2026-09-01T14:00:00Z'));
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useActivePlan', () => {
  it('returns null before a plan is set', () => {
    useAppStore.getState().createProfile(profile());
    expect(renderHook(() => useActivePlan()).result.current).toBeNull();
  });

  it('follows the active profile cursor to its plan', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    const { result } = renderHook(() => useActivePlan());
    expect(result.current?.name).toBe('Upper/Lower');
    expect(result.current?.id).toBe(useAppStore.getState().cursors['p1']?.planId);
  });

  it("returns the cursor's plan while the plans it replaced are still stored", () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    useAppStore.getState().setPlan('p1', replacementTemplate(), '2026-10-05');
    useAppStore.getState().setPlan('p1', planTemplate({ name: 'Full body' }), '2026-11-02');

    // Three records in `plans`, one of them current. Nothing here searches the
    // map: the cursor is what makes the answer unambiguous.
    const { result } = renderHook(() => useActivePlan());
    expect(Object.keys(useAppStore.getState().plans).length).toBe(3);
    expect(result.current?.name).toBe('Full body');
    expect(result.current?.id).toBe(useAppStore.getState().cursors['p1']?.planId);
  });
});

describe('useIntakeForDate', () => {
  it('returns the entry for that date and null for any other', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().logIntake('p1', intakeEntry());
    expect(renderHook(() => useIntakeForDate('2026-09-01')).result.current?.kcal).toBe(2400);
    expect(renderHook(() => useIntakeForDate('2026-09-02')).result.current).toBeNull();
  });

  it('returns null with no active profile', () => {
    expect(renderHook(() => useIntakeForDate('2026-09-01')).result.current).toBeNull();
  });
});
