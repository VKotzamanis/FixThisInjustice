import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../app/App';
import { asciiBar } from '../components/AsciiBar';
import { TargetsView } from './TargetsView';
import { useAppStore } from '../../store';
import type { PlanTemplate, Profile } from '../../domain/types';

/**
 * The clock is pinned: the age term of Mifflin-St Jeor is derived from the civil year
 * (`nutritionInputFor`), and the check-in writes today's civil date. 12:00 UTC lands on
 * 2026-09-01 in every zone `npm run test:tz` runs in, so no number below depends on the host.
 */
const FIXED_NOW = new Date('2026-09-01T12:00:00Z');

const PROFILE: Profile = {
  id: 'p1',
  displayName: 'Test subject',
  timezone: 'Europe/Athens',
  units: 'metric',
  createdAt: 1_756_684_800_000, // [ms] 2025-09-01T00:00:00Z, irrelevant to every assertion here
  body: {
    sex: 'male',
    birthYear: 1996,
    heightCm: 180, // [cm]
    baselineMassKg: 80, // [kg]
    baselineAt: '2026-09-01',
    baselineBodyFatPct: null, // no body fat: Mifflin-St Jeor, and protein per kg BODY MASS
  },
  activity: 'moderate',
  experience: 'intermediate',
  equipment: 'full-gym',
  equipmentSteps: {
    barbellKg: 2.5, // [kg] total on the bar
    dumbbellPairKg: 5, // [kg] per pair
    stackKg: 5, // [kg] per pin
    hasMicroPlates: false,
    microPlateKg: 0.5, // [kg] total on the bar
  },
  goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
  supplements: { creatine: true },
  hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
  readiness: { screenedAt: null, flagged: false },
};

/*
 * Every number this file asserts, derived once here so a failure names the step that broke.
 *
 *   RMR    = 10*80 + 6.25*180 - 5*(2026-1996) + 5 = 1780 kcal/day  (Mifflin-St Jeor, male)
 *   TDEE   = 1780 * 1.70 (moderate PAL, FAO band floor)  = 3026 kcal/day
 *   target = 3026 * (1 - 0.10) = 2723.4 -> 2723 kcal/day  (10 % cut from TDEE)
 *   protein = 1.4-2.0 g/kg body mass * 80 kg = 112-160 g/day  (Jaeger 2017 fallback: no FFM)
 *   fluid  = 3000 mL/day  (IOM 2005 beverage share, male)
 *   creatine = max(3, 0.1 * 80) = 8 g/day
 *   rate   = -0.007 * 80 = -0.56 kg/week, inside the 0.5-1.0 %BW bound; displayed at 0.1
 */
const TARGET_KCAL = 2723; // [kcal/day]
const PROTEIN_LO = 112; // [g/day]
const PROTEIN_HI = 160; // [g/day]

/** The check-in the tests type. Chosen so neither bar lands on a bar-width boundary. */
const LOGGED_KCAL = 2100; // [kcal/day]
const LOGGED_PROTEIN_G = 150; // [g/day]

/*
 * 2100 / 2723 = 0.771208..., times the 20-character bar = 15.42 -> 15 filled.
 * 150 g is above the 112 g lower bound, so the protein ratio clamps to 1 and the bar fills.
 */
const KCAL_BAR = '[###############-----]';
const PROTEIN_BAR = '[####################]';

/** A one-exercise plan: every muscle bench press does not train is maintenance-only. */
const BENCH_ONLY_PLAN: PlanTemplate = {
  id: 'plan-fixture',
  version: 1,
  name: 'Bench only',
  sessionsPerWeek: 3, // [sessions/week]
  weeks: 12,
  sessions: [1, 2, 3].map((ordinal) => ({
    id: `s${String(ordinal)}`,
    ordinal,
    name: `Session ${String(ordinal)}`,
    kind: 'lift' as const,
    label: 'Push',
    exercises: [
      {
        exerciseId: 'barbell-bench-press',
        setsLo: 3, // [sets]
        setsHi: 4, // [sets]
        prescription: { kind: 'reps' as const, lo: 6, hi: 10 },
        restS: 120, // [s]
      },
    ],
  })),
  blocks: [
    {
      index: 0,
      firstSessionIndex: 0,
      sessionCount: 3,
      setModifier: 1,
      loadModifier: 1,
      isDeload: false,
    },
  ],
};

beforeEach(() => {
  // Date only: the persistence debounce uses setTimeout and must keep running on the real clock.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  useAppStore.getState().wipeAll();
  useAppStore.getState().createProfile(PROFILE);
});

afterEach(() => {
  vi.useRealTimers();
});

function typeIntake(kcal: string, proteinG: string): void {
  fireEvent.change(screen.getByLabelText(/energy consumed today \(kcal\)/i), {
    target: { value: kcal },
  });
  fireEvent.change(screen.getByLabelText(/protein consumed today \(g\)/i), {
    target: { value: proteinG },
  });
}

describe('asciiBar', () => {
  it('fills proportionally and clamps at both ends', () => {
    expect(asciiBar(0, 100, 10)).toBe('[----------]');
    expect(asciiBar(50, 100, 10)).toBe('[#####-----]');
    expect(asciiBar(100, 100, 10)).toBe('[##########]');
    expect(asciiBar(150, 100, 10)).toBe('[##########]');
    expect(asciiBar(-5, 100, 10)).toBe('[----------]');
  });

  it('returns an empty bar when the target is not positive or not finite', () => {
    expect(asciiBar(20, 0, 10)).toBe('[----------]');
    expect(asciiBar(20, -100, 10)).toBe('[----------]');
    expect(asciiBar(Number.NaN, 100, 10)).toBe('[----------]');
  });
});

describe('TargetsView', () => {
  it('shows the computed targets with their units', () => {
    render(<TargetsView />);
    expect(screen.getByTestId('target-kcal')).toHaveTextContent(`${String(TARGET_KCAL)} kcal`);
    expect(screen.getByTestId('target-protein')).toHaveTextContent(
      `${String(PROTEIN_LO)}-${String(PROTEIN_HI)} g`,
    );
    expect(screen.getByTestId('target-fluid')).toHaveTextContent('3000 mL');
    expect(screen.getByTestId('target-creatine')).toHaveTextContent('8 g');
    // Negative = loss (master plan section 3: delta is current minus reference).
    expect(screen.getByTestId('target-rate')).toHaveTextContent('-0.6 kg/week');
  });

  it('records a daily intake check-in and shows progress against the target', () => {
    render(<TargetsView />);
    typeIntake(String(LOGGED_KCAL), String(LOGGED_PROTEIN_G));
    fireEvent.click(screen.getByRole('button', { name: 'Record intake' }));

    expect(useAppStore.getState().intake['p1']).toEqual([
      { profileId: 'p1', date: '2026-09-01', kcal: LOGGED_KCAL, proteinG: LOGGED_PROTEIN_G },
    ]);
    expect(screen.getByTestId('kcal-bar')).toHaveTextContent(KCAL_BAR);
    expect(screen.getByTestId('protein-bar')).toHaveTextContent(PROTEIN_BAR);
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent(
      `${String(LOGGED_KCAL)} / ${String(TARGET_KCAL)} kcal`,
    );
    expect(screen.getByTestId('protein-progress')).toHaveTextContent(
      `${String(LOGGED_PROTEIN_G)} / ${String(PROTEIN_LO)}-${String(PROTEIN_HI)} g`,
    );
  });

  it('refuses a daily total the schema would reject, and stores nothing', () => {
    render(<TargetsView />);
    typeIntake('999999', '150');
    fireEvent.click(screen.getByRole('button', { name: 'Record intake' }));

    expect(useAppStore.getState().intake['p1']).toEqual([]);
    expect(screen.getByTestId('intake-error')).toBeInTheDocument();
  });

  it("reloads today's entry into the form so a correction replaces it", () => {
    useAppStore
      .getState()
      .logIntake('p1', { profileId: 'p1', date: '2026-09-01', kcal: 2000, proteinG: 140 });
    render(<TargetsView />);
    expect(screen.getByLabelText(/energy consumed today \(kcal\)/i)).toHaveValue(2000);

    typeIntake('2100', '140');
    fireEvent.click(screen.getByRole('button', { name: 'Record intake' }));

    const list = useAppStore.getState().intake['p1'] ?? [];
    expect(list.length).toBe(1); // one entry per civil date, replaced not appended
    expect(list[0]?.kcal).toBe(2100);
  });

  it('keeps the derivation behind a closed disclosure and shows it when opened', () => {
    render(<TargetsView />);
    const disclosure = screen.getByTestId('basis');
    expect(disclosure).not.toHaveAttribute('open');
    expect(screen.getByText('why?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('why?'));

    expect(disclosure).toHaveAttribute('open');
    const basis = disclosure.textContent ?? '';
    expect(basis).toContain('Mifflin-St Jeor');
    expect(basis).toContain('1.7'); // the PAL that produced TDEE
    expect(basis).toMatch(/Garthe 2011/);
    expect(basis).toMatch(/Jaeger 2017/);
  });

  it('names the maintenance-only muscles of the active plan rather than hiding them', () => {
    useAppStore.getState().setPlan('p1', BENCH_ONLY_PLAN, '2026-09-01');
    render(<TargetsView />);
    const line = screen.getByTestId('maintenance-only');
    expect(line).toHaveTextContent('Maintenance only:');
    // Bench press trains chest directly and front-delt and triceps indirectly. Nothing else
    // is trained at all, so the rest must be named.
    expect(line).toHaveTextContent('quads');
    expect(line).toHaveTextContent('calves');
    expect(line).not.toHaveTextContent('chest');
  });

  it('says so plainly when there is no profile instead of rendering empty targets', () => {
    useAppStore.getState().wipeAll();
    render(<TargetsView />);
    expect(screen.getByText('No profile. Complete setup first.')).toBeInTheDocument();
    expect(screen.queryByTestId('target-kcal')).toBeNull();
  });
});

describe('App wiring', () => {
  it('hides every view behind the setup wizard while no profile exists', () => {
    useAppStore.getState().wipeAll();
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Targets' })).toBeNull();
    expect(screen.queryByTestId('target-kcal')).toBeNull();
  });

  it('reaches the targets view from the navigation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Targets' }));
    expect(screen.getByTestId('target-kcal')).toHaveTextContent(`${String(TARGET_KCAL)} kcal`);
    // The chosen view is remembered, so a reload reopens where the user left off.
    expect(useAppStore.getState().ui.lastView).toBe('targets');
  });

  it('reaches the settings view and switches the display unit without changing storage', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Display unit'), { target: { value: 'imperial' } });

    // Display only: the stored baseline is still the canonical kilogram figure.
    expect(useAppStore.getState().profiles['p1']?.units).toBe('imperial');
    expect(useAppStore.getState().profiles['p1']?.body.baselineMassKg).toBe(80); // [kg]

    fireEvent.click(screen.getByRole('button', { name: 'Targets' }));
    expect(screen.getByTestId('target-fluid')).toHaveTextContent('101 fl oz'); // 3000 mL
  });

  it('offers no profile switcher while only one profile exists', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByLabelText('Active profile')).toBeNull();
  });
});
