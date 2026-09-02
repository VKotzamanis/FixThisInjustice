// The Log view: body-mass chart, compliance grid, weekly AMRAP sparklines and personal records.
//
// Deviations from the P7 plan's Task 4 Step 19 literal (recorded here; the plan is not edited):
//  - src/ui/views/LogView.tsx did not exist, so this task creates it rather than modifying it.
//  - The view reads NutritionTargets through the store's own useNutritionTargets selector
//    instead of calling computeTargets during render. computeTargets THROWS outside its
//    validated domain (nutrition.ts), and a throw during render takes the whole tree down;
//    the selector returns null instead, which is a state the view can draw.
//  - The compliance grid is passed the profile's civil today and its weekly session target,
//    for the reason ComplianceGrid.test.tsx records.
//
// The clock is pinned: every civil date below is read in the profile's zone (Europe/Athens),
// and the age term of Mifflin-St Jeor is derived from the civil year. 09:00 UTC on 2026-03-02
// is 11:00 the same day in Athens, so no assertion here depends on the host zone.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FORMAT, copy } from '../../content/copy';
import { computeTargets } from '../../domain/nutrition';
import { EXERCISE_BY_ID } from '../../domain/plan/library';
import { defaultState } from '../../domain/schema';
import type {
  AppState,
  BodyMassEntry,
  LoggedSet,
  PlanTemplate,
  SessionAssignment,
} from '../../domain/types';
import { formatLoad, formatMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { latestBodyMassEntry, nutritionInputFor } from '../../store/selectors';
import { makeProfile, makeSet, resetFixtureIds } from '../../test/fixtures';
import { LogView } from './LogView';

const NOW_MS = Date.UTC(2026, 2, 2, 9, 0); // [ms] epoch, UTC; 2026-03-02 11:00 in Athens
const TODAY = '2026-03-02'; // Monday
const STARTED_ON = '2026-02-09'; // Monday, three weeks before today
const TARGET = 3; // [sessions/week]

const PROFILE_ID = 'profile-1';
const PUSH_UP = EXERCISE_BY_ID['push-up'];
const BENCH = EXERCISE_BY_ID['barbell-bench-press'];

const PLAN: PlanTemplate = {
  id: 'plan-1',
  version: 1,
  name: 'Test programme',
  sessionsPerWeek: TARGET,
  weeks: 4, // [weeks]
  sessions: [],
  blocks: [],
};

function assignment(date: string, status: SessionAssignment['status']): SessionAssignment {
  return {
    date,
    sessionId: 'session-1',
    sourceIndex: 0,
    status,
    startedAt: null, // [ms] epoch, UTC
    completedAt: null, // [ms] epoch, UTC
    skipReason: null,
  };
}

function mass(date: string, massKg: number, id: string): BodyMassEntry {
  return {
    id,
    profileId: PROFILE_ID,
    date,
    massKg, // [kg]
    enteredUnit: 'metric',
    bodyFatPct: null, // [%]
    loggedAt: Date.UTC(2026, 0, 5, 7, 0), // [ms] epoch, UTC
  };
}

function byId(sets: LoggedSet[]): Record<string, LoggedSet> {
  return Object.fromEntries(sets.map((s) => [s.id, s]));
}

/** A profile three weeks into a programme, with a weigh-in history and a logged set history. */
function seed(patch: Partial<AppState> = {}): AppState {
  const profile = makeProfile();
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: {
      [profile.id]: {
        // Monday, Wednesday, Friday. ISO weekdays, Monday-first.
        slots: [
          { weekday: 1, startTime: '18:00', expectedDurationS: 3600 }, // [s]
          { weekday: 3, startTime: '18:00', expectedDurationS: 3600 }, // [s]
          { weekday: 5, startTime: '18:00', expectedDurationS: 3600 }, // [s]
        ],
        weeklySessionTarget: TARGET,
      },
    },
    plans: { [PLAN.id]: PLAN },
    cursors: {
      [profile.id]: {
        planId: PLAN.id,
        nextSessionIndex: 0,
        startedOn: STARTED_ON,
        completedOn: null,
      },
    },
    assignments: {
      [profile.id]: [
        assignment('2026-02-09', 'completed'),
        assignment('2026-02-11', 'skipped'),
        assignment('2026-02-13', 'planned'), // passed unfinished: a miss
      ],
    },
    bodyMass: {
      [profile.id]: [mass('2026-01-05', 95, 'bm-1'), mass('2026-02-16', 93.5, 'bm-2')], // [kg]
    },
    sets: byId([
      makeSet({ id: 'set-bench', loadKg: 90, reps: 3, assignmentDate: '2026-02-09' }), // [kg]
      makeSet({
        id: 'set-pushup-a',
        exerciseId: 'push-up',
        loadKg: 0, // [kg] bodyweight
        reps: 22,
        assignmentDate: '2026-02-11',
      }),
      makeSet({
        id: 'set-pushup-b',
        exerciseId: 'push-up',
        loadKg: 0, // [kg]
        reps: 25,
        assignmentDate: '2026-02-18',
      }),
    ]),
    ...patch,
  };
}

/** The rate the engine gives for this fixture, derived rather than restated. */
function expectedRateKgPerWeek(state: AppState): number | null {
  const profile = state.profiles[PROFILE_ID];
  if (!profile) throw new Error('fixture has no profile');
  const input = nutritionInputFor(
    profile,
    latestBodyMassEntry(state, PROFILE_ID),
    state.availability[PROFILE_ID]?.weeklySessionTarget ?? 0,
    TODAY,
  );
  return computeTargets(input).expectedRateKgPerWeek; // [kg/week]
}

function yLabels(): string[] {
  return screen.getAllByTestId('y-label').map((n) => n.textContent ?? '');
}

beforeEach(() => {
  resetFixtureIds();
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  useAppStore.setState(seed());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LogView without a profile', () => {
  it('says setup has to come first', () => {
    useAppStore.setState(defaultState());
    render(<LogView />);
    expect(screen.getByText(copy('advice.noProfileSetupFirst'))).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});

describe('LogView body mass', () => {
  it('labels the mass axis in kg for a metric profile', () => {
    render(<LogView />);
    const ticks = yLabels().filter((l) => l.endsWith(' kg'));
    expect(ticks.length).toBeGreaterThan(0);
    // The newest weigh-in, formatted at the 0.1 resolution units.ts fixes.
    expect(screen.getByRole('img', { name: /93\.5 kg/ })).toBeTruthy();
  });

  it('labels the mass axis in lb for an imperial profile, from the same stored kg', () => {
    const state = seed();
    const profile = state.profiles[PROFILE_ID];
    if (!profile) throw new Error('fixture has no profile');
    useAppStore.setState(seed({ profiles: { [profile.id]: { ...profile, units: 'imperial' } } }));
    render(<LogView />);
    const ticks = yLabels().filter((l) => l.endsWith(' lb'));
    expect(ticks.length).toBeGreaterThan(0);
    // 93.5 kg is 206.1 lb at 0.1 resolution; nothing in the document changed.
    expect(formatMass(93.5, 'imperial')).toBe('206.1 lb');
    expect(screen.getByRole('img', { name: /206\.1 lb/ })).toBeTruthy();
  });

  it('puts the projection rate behind the why disclosure, never inline', () => {
    const rate = expectedRateKgPerWeek(seed()); // [kg/week]
    render(<LogView />);
    const details = screen.getByTestId('body-mass-basis');
    expect(details.querySelector('summary')?.textContent).toBe(copy('disclosure.why'));
    expect(details.textContent).toContain(
      rate === null
        ? copy('status.rateUnknown')
        : FORMAT.bodyMassProjection(formatMass(rate, 'metric')),
    );
  });

  it('says so when no body mass has been logged', () => {
    useAppStore.setState(seed({ bodyMass: {} }));
    render(<LogView />);
    expect(screen.getByText(copy('advice.noBodyMassLogged'))).toBeTruthy();
  });
});

describe('LogView compliance', () => {
  it('marks completed, skipped and missed days of the weeks since the plan started', () => {
    render(<LogView />);
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-02-09', copy('status.markCompleted'))),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-02-11', copy('status.markSkipped'))),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-02-13', copy('status.markMissed'))),
    ).toBeTruthy();
  });

  it('shows one row per week from the plan start through today, and no earlier', () => {
    render(<LogView />);
    const rows = screen.getAllByRole('rowheader').map((n) => n.textContent);
    expect(rows).toEqual([
      FORMAT.complianceWeek('2026-02-09', 1, TARGET),
      FORMAT.complianceWeek('2026-02-16', 0, TARGET),
      FORMAT.complianceWeek('2026-02-23', 0, TARGET),
      FORMAT.complianceWeek('2026-03-02', 0, TARGET),
    ]);
  });

  it('says so before any week exists', () => {
    // No cursor and no availability: nothing has been scheduled, so there is nothing to grade.
    useAppStore.setState(seed({ cursors: {}, availability: {}, assignments: {} }));
    render(<LogView />);
    expect(screen.getByText(copy('advice.noWeeksYet'))).toBeTruthy();
  });
});

describe('LogView records', () => {
  it('shows the heaviest set and the estimated 1RM in the profile unit', () => {
    render(<LogView />);
    expect(screen.getByText(FORMAT.loggedSet(formatLoad(90, 'metric'), '3'))).toBeTruthy();
    // Epley on 90 kg for 3 reps: 90 * (1 + 3/30) = 99 kg.
    expect(screen.getByText(FORMAT.estimated1RM(formatLoad(99, 'metric')))).toBeTruthy();
  });

  it('orders the records by date, most recent first', () => {
    render(<LogView />);
    expect(screen.getAllByTestId('pr-date').map((n) => n.textContent)).toEqual([
      '2026-02-18', // the push-up record
      '2026-02-09', // the bench press record
    ]);
  });

  it('says so when nothing has been logged', () => {
    useAppStore.setState(seed({ sets: {} }));
    render(<LogView />);
    expect(screen.getByText(copy('advice.noSetsLogged'))).toBeTruthy();
  });
});

describe('LogView weekly AMRAP', () => {
  it('draws a sparkline for each bodyweight exercise the log mentions', () => {
    render(<LogView />);
    expect(PUSH_UP).toBeDefined();
    expect(screen.getByText(FORMAT.amrapBest(PUSH_UP?.name ?? '', 25))).toBeTruthy();
    // Bench press is not a bodyweight exercise, so it gets no rep sparkline.
    expect(screen.queryByText(FORMAT.amrapBest(BENCH?.name ?? '', 3))).toBeNull();
  });

  it('draws no sparkline section when nothing bodyweight has been logged', () => {
    useAppStore.setState(
      seed({ sets: byId([makeSet({ id: 'only-bench', loadKg: 90, reps: 3 })]) }), // [kg]
    );
    render(<LogView />);
    expect(screen.queryByText(copy('hero.repsPerWeek'))).toBeNull();
  });
});
