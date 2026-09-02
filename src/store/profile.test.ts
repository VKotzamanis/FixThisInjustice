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
  PlanTemplate,
  Profile,
} from '../domain/types';

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
 * alone (it is not a per-profile map), so the last three assertions carry that
 * key agreement and the no-orphan rule this task adds to setPlan.
 */
function expectDocumentConsistent(): void {
  const snapshot = selectState(useAppStore.getState());
  const parsed = parseDocument(useAppStore.getState().exportJson());
  expect(parsed.ok ? null : parsed.error).toBeNull();

  for (const [key, plan] of Object.entries(snapshot.plans)) {
    expect(plan.id).toBe(key);
  }
  const referenced = new Set(Object.values(snapshot.cursors).map((c) => c.planId));
  for (const planId of Object.keys(snapshot.plans)) {
    expect(referenced.has(planId)).toBe(true); // no plan without a cursor
  }
  for (const planId of referenced) {
    expect(snapshot.plans[planId]).toBeDefined(); // no cursor without a plan
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
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

  it('replaces the plan, resets the cursor, and leaves no orphan behind', () => {
    useAppStore.getState().createProfile(profile());
    useAppStore.getState().setPlan('p1', planTemplate(), '2026-09-07');
    const started = useAppStore.getState().cursors['p1'];
    const first = started?.planId;
    expect(started).toBeDefined();
    if (started !== undefined) {
      // Advance the cursor so "reset to 0" is a change and not the initial value.
      useAppStore.setState((s) => ({
        cursors: { ...s.cursors, p1: { ...started, nextSessionIndex: 5 } },
      }));
    }

    useAppStore.getState().setPlan('p1', planTemplate({ name: 'Push/Pull/Legs' }), '2026-10-05');

    const s = useAppStore.getState();
    expect(Object.keys(s.plans).length).toBe(1);
    expect(first === undefined ? undefined : s.plans[first]).toBeUndefined();
    expect(s.cursors['p1']?.nextSessionIndex).toBe(0);
    expect(s.cursors['p1']?.startedOn).toBe('2026-10-05');
    expect(s.plans[s.cursors['p1']?.planId ?? '']?.name).toBe('Push/Pull/Legs');
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
