import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../app/App';
import { FORMAT, copy } from '../../content/copy';
import { dailyBeverageTargetML } from '../../domain/nutrition';
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

function kcalField(): HTMLElement {
  return screen.getByLabelText(/energy consumed today \(kcal\)/i);
}

function proteinField(): HTMLElement {
  return screen.getByLabelText(/protein consumed today \(g\)/i);
}

function typeIntake(kcal: string, proteinG: string): void {
  fireEvent.change(kcalField(), { target: { value: kcal } });
  fireEvent.change(proteinField(), { target: { value: proteinG } });
}

function recordIntake(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Record intake' }));
}

/** Today's stored entry for the fixture profile, or null when nothing is recorded. */
function storedToday(): unknown {
  return (useAppStore.getState().intake['p1'] ?? []).find((e) => e.date === '2026-09-01') ?? null;
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

  /*
   * Zero-coercion. `parseDecimal(text) ?? 0` reads an empty or non-numeric field as a
   * recorded zero, and a zero passes IntakeEntrySchema (kcal and proteinG are min(0)), so the
   * refusal never fires and the zero is UPSERTED over the entry already stored for today. A
   * missing total and a zero total are different facts; only one of them may be written.
   */
  it('leaves the stored entry untouched when both fields are cleared', () => {
    useAppStore
      .getState()
      .logIntake('p1', { profileId: 'p1', date: '2026-09-01', kcal: 2000, proteinG: 140 });
    render(<TargetsView />);

    typeIntake('', '');
    recordIntake();

    expect(storedToday()).toEqual({
      profileId: 'p1',
      date: '2026-09-01',
      kcal: 2000,
      proteinG: 140,
    });
    expect(screen.getByTestId('intake-error')).toBeInTheDocument();
  });

  it('refuses a non-numeric entry rather than reading it as zero', () => {
    render(<TargetsView />);

    typeIntake('abc', '150');
    recordIntake();

    expect(useAppStore.getState().intake['p1']).toEqual([]);
    expect(screen.getByTestId('intake-error')).toBeInTheDocument();
  });

  it('refuses a check-in with one field left empty', () => {
    render(<TargetsView />);

    typeIntake('2100', '');
    recordIntake();

    expect(useAppStore.getState().intake['p1']).toEqual([]);
    expect(screen.getByTestId('intake-error')).toBeInTheDocument();
  });

  /*
   * A refusal that is only a colour and a paragraph somewhere on the page is invisible to a
   * screen reader. The message is announced, and both fields point at it, because the entry
   * is refused as a pair rather than field by field.
   */
  it('wires the refusal to both intake fields and announces it', () => {
    render(<TargetsView />);

    typeIntake('999999', '150');
    recordIntake();

    const message = screen.getByTestId('intake-error');
    expect(message).toHaveAttribute('role', 'alert');
    expect(message.id).not.toBe('');
    for (const field of [kcalField(), proteinField()]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
    }
  });

  /*
   * The bar glyphs read out as punctuation, one character at a time. A bare aria-label on a
   * generic span does not stop that, because a generic element takes no accessible name;
   * role="img" is what makes the label the name and the glyphs inert.
   */
  it('names each bar as an image instead of leaving the glyphs to be read out', () => {
    render(<TargetsView />);

    expect(screen.getByRole('img', { name: copy('label.energyProgress') })).toBe(
      screen.getByTestId('kcal-bar'),
    );
    expect(screen.getByRole('img', { name: copy('label.proteinProgress') })).toBe(
      screen.getByTestId('protein-bar'),
    );
  });

  /*
   * A bar is a report on the record, not on the form. Drawing the draft made the bar move
   * under every keystroke and, worse, collapse to empty the moment the user cleared a field
   * to correct a total that is still recorded.
   */
  it('draws the bars from the stored entry, not from an unrecorded draft', () => {
    useAppStore.getState().logIntake('p1', {
      profileId: 'p1',
      date: '2026-09-01',
      kcal: LOGGED_KCAL,
      proteinG: LOGGED_PROTEIN_G,
    });
    render(<TargetsView />);
    expect(screen.getByTestId('kcal-bar')).toHaveTextContent(KCAL_BAR);

    // Typed and deliberately not recorded.
    typeIntake('500', '10');

    expect(screen.getByTestId('kcal-bar')).toHaveTextContent(KCAL_BAR);
    expect(screen.getByTestId('protein-bar')).toHaveTextContent(PROTEIN_BAR);
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent(
      `${String(LOGGED_KCAL)} / ${String(TARGET_KCAL)} kcal`,
    );
  });

  /*
   * The litres in the basis sentence are the engine's beverage constant, divided, not a pair
   * of numbers restated in the copy table where they could drift from what is prescribed.
   */
  it('derives the beverage-basis litres from the engine constant', () => {
    render(<TargetsView />);
    fireEvent.click(screen.getByText('why?'));

    expect(screen.getByTestId('basis').textContent ?? '').toContain(
      FORMAT.beverageBasis(dailyBeverageTargetML('male'), dailyBeverageTargetML('female')),
    );
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

  it('gives the view navigation an accessible name', () => {
    render(<App />);
    // Without a name the landmark is announced as an unlabelled "navigation", which tells a
    // screen-reader user nothing about what the six buttons inside it switch between. The
    // name is asserted to EXIST before it is matched: getByRole ignores an undefined name,
    // so a missing copy key would otherwise make this test pass against a nameless landmark.
    const name = copy('nav.label');
    expect(typeof name).toBe('string');
    expect(screen.getByRole('navigation', { name })).toBeInTheDocument();
  });

  it('offers no profile switcher while only one profile exists', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByLabelText('Active profile')).toBeNull();
  });
});
