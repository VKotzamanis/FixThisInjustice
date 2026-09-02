import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { READINESS_INSERT_INDEX, STEPS, SetupWizard } from './SetupWizard';
import { useAppStore } from '../../store';
import { parseState } from '../../domain/schema';
import { EXERCISES } from '../../domain/plan/library';
import { generatePlan, volumeReport } from '../../domain/plan/generator';
import { SPLIT_TEMPLATES } from '../../domain/plan/templates';
import { KG_PER_LB } from '../../domain/types';
import { FORMAT } from '../../content/copy';

/**
 * No medication, condition or biometric-identifier field exists anywhere in this wizard by
 * design (master plan section 3, "Personal data"). The pattern is asserted against every
 * field label and against the rendered text of every screen.
 *
 * `prescription` is deliberately NOT in the pattern. In this codebase it is the training term:
 * `Prescription` is a domain type (src/domain/types.ts) and the split templates quote the
 * content review's "highest-ranked hypertrophy prescription". The constraint being protected is
 * that no medication or condition value is ever collected or stored, which the structural test
 * above enforces directly; a word ban would only catch the training sense.
 */
const MEDICAL_PATTERN = /vyvanse|lisdexamfetamine|medicat|drug|dose of|stimulant/i;

/**
 * The clock is pinned because two numbers under test are read off it: the age derived from the
 * birth year, and `todayLocal`, which becomes the plan's start date. 12:00 UTC lands on
 * 2026-09-01 in every zone the suite runs in (`npm run test:tz`), so no assertion here depends
 * on the host zone.
 */
const FIXED_NOW = new Date('2026-09-01T12:00:00Z');

/** The imperial fixture, in the unit the user types. 135 lb x 0.45359237 = 61.23496995 kg. */
const IMPERIAL_MASS_LB = 135;
const IMPERIAL_MASS_KG = 61.23496995; // [kg] exact
const IMPERIAL_HEIGHT_CM = 180.34; // [cm] 5 ft 11 in = 71 in x 2.54 cm/in, exact

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  useAppStore.getState().wipeAll();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Click the primary Continue control. */
function next(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

function setValue(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Drive screens 1-7 with an imperial profile, leaving the review screen on show. */
function fillImperialWizard(): void {
  render(<SetupWizard />);
  // 1 - units
  fireEvent.click(screen.getByLabelText('Pounds (lb)'));
  next();
  // 2 - time zone
  setValue(/^time zone$/i, 'America/New_York');
  next();
  // 3 - body
  setValue(/^name$/i, 'Test subject');
  fireEvent.click(screen.getByLabelText('Male'));
  setValue(/birth year/i, '1996');
  setValue(/^feet$/i, '5');
  setValue(/^inches$/i, '11');
  setValue(/body mass \(lb\)/i, String(IMPERIAL_MASS_LB));
  next();
  // 4 - training context
  setValue(/activity level/i, 'moderate');
  setValue(/^experience$/i, 'intermediate');
  setValue(/^equipment$/i, 'full-gym');
  next();
  // 5 - goal
  setValue(/^goal$/i, 'fat-loss');
  next();
  // 6 - availability
  setValue(/sessions per week/i, '4');
  for (const day of ['Monday', 'Tuesday', 'Thursday', 'Friday']) {
    fireEvent.click(screen.getByLabelText(day));
  }
  next();
  // 7 - programme length
  setValue(/programme length/i, '12');
  next();
}

describe('step order', () => {
  it('exposes an ordered STEPS array with the readiness insertion point before Review', () => {
    expect([...STEPS]).toEqual([
      'units',
      'timezone',
      'body',
      'training',
      'goal',
      'availability',
      'programme',
      'review',
    ]);
    // P2 Task 9 splices its readiness step in here; Review stays last.
    expect(STEPS[READINESS_INSERT_INDEX]).toBe('review');
    expect(READINESS_INSERT_INDEX).toBe(STEPS.length - 1);
  });

  it('numbers the header from STEPS rather than a hard-coded count', () => {
    render(<SetupWizard />);
    expect(screen.getByText(FORMAT.stepOf(1, STEPS.length, 'Units'))).toBeInTheDocument();
    next();
    expect(screen.getByText(FORMAT.stepOf(2, STEPS.length, 'Time zone'))).toBeInTheDocument();
  });
});

describe('unit labelling', () => {
  it('labels body mass in kg for a metric user and lb for an imperial one', () => {
    const { unmount } = render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Kilograms (kg)'));
    next();
    next(); // accept the detected time zone
    expect(screen.getByLabelText(/body mass \(kg\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/height \(cm\)/i)).toBeInTheDocument();
    unmount();

    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    next();
    expect(screen.getByLabelText(/body mass \(lb\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^feet$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^inches$/i)).toBeInTheDocument();
  });

  it('seeds the equipment steps in the chosen unit', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    next();
    setValue(/birth year/i, '1996');
    setValue(/^feet$/i, '5');
    setValue(/^inches$/i, '11');
    setValue(/body mass \(lb\)/i, String(IMPERIAL_MASS_LB));
    next();
    expect(screen.getByLabelText(/barbell step \(lb\)/i)).toHaveValue(5);
    expect(screen.getByLabelText(/dumbbell step, per pair \(lb\)/i)).toHaveValue(10);
  });
});

describe('domain guards', () => {
  it('blocks progression and names the bound when the birth year puts age outside 18 to 80', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/height \(cm\)/i, '180');
    setValue(/body mass \(kg\)/i, '80');
    setValue(/birth year/i, '2020'); // age 6 at the pinned clock

    expect(screen.getByText('Age must be 18 to 80 years.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    next();
    // Still on the body screen: the guard held.
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();

    setValue(/birth year/i, '1996');
    expect(screen.queryByText('Age must be 18 to 80 years.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('blocks a body mass outside the validated adult domain', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/birth year/i, '1996');
    setValue(/height \(cm\)/i, '180');
    setValue(/body mass \(kg\)/i, '12');
    expect(screen.getByText('Body mass must be 30 to 300 kg.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('blocks an empty weekday selection', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/birth year/i, '1996');
    setValue(/height \(cm\)/i, '180');
    setValue(/body mass \(kg\)/i, '80');
    next(); // training
    next(); // goal
    next(); // availability
    expect(screen.getByText('Select at least one weekday.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('review screen', () => {
  it('shows the computed targets in the chosen units', () => {
    fillImperialWizard();
    const review = screen.getByTestId('review');
    // Mifflin-St Jeor, male 30 y: 10*61.23496995 + 6.25*180.34 - 5*30 + 5 = 1594.4747 kcal/day.
    // TDEE at PAL 1.70 = 2710.607; fat-loss target is a 10 % cut = 2439.546 -> 2440 kcal/day.
    expect(within(review).getByTestId('target-kcal')).toHaveTextContent('2440 kcal');
    // Protein, maintenance body-mass row (no body-fat estimate): 1.4-2.0 g/kg of 61.23497 kg.
    expect(within(review).getByTestId('target-protein')).toHaveTextContent('86-122 g');
    // Fluid: IOM beverage share 3000 mL for a male -> 101 fl oz.
    expect(within(review).getByTestId('target-fluid')).toHaveTextContent('101 fl oz');
    // Rate: -0.7 %BW/week of 135 lb = -0.945 lb/week -> -0.9 lb/week at 0.1 resolution.
    expect(within(review).getByTestId('target-rate')).toHaveTextContent('-0.9 lb/week');
  });

  it('names the maintenance-only muscle groups instead of hiding them', () => {
    fillImperialWizard();
    const summary = screen.getByTestId('split-summary').textContent ?? '';
    // Derived from the same generator the wizard calls, so an in-flight template fix moves the
    // expectation with the code instead of stranding a hard-coded muscle name here.
    const plan = generatePlan(
      {
        sessionsPerWeek: 4,
        weeks: 12,
        goal: 'fat-loss',
        experience: 'intermediate',
        equipment: 'full-gym',
        includeCardio: false,
      },
      EXERCISES,
    );
    const report = volumeReport(plan, EXERCISES);
    expect(summary).toContain(SPLIT_TEMPLATES[4].name);
    expect(summary).toContain('12 weeks');
    expect(summary).toContain('48 sessions');
    expect(summary).toContain('Maintenance only');
    for (const muscle of report.maintenance) expect(summary).toContain(muscle);
  });

  it('puts the basis strings behind a why disclosure, not inline', () => {
    fillImperialWizard();
    const review = screen.getByTestId('review');
    const why = within(review).getAllByText('why?')[0];
    expect(why).toBeDefined();
    expect(why?.closest('details')).not.toBeNull();
    expect(within(review).getByTestId('targets-basis').textContent).toContain('Mifflin-St Jeor');
  });

  it('reports no weekly rate for muscle gain instead of inventing one', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/birth year/i, '1996');
    setValue(/height \(cm\)/i, '180');
    setValue(/body mass \(kg\)/i, '80');
    next();
    next();
    setValue(/^goal$/i, 'muscle-gain');
    next();
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Wednesday'));
    setValue(/sessions per week/i, '2');
    next();
    next();
    expect(screen.getByTestId('target-rate')).toHaveTextContent(
      'Not established by the evidence base',
    );
  });
});

describe('submission', () => {
  it('converts imperial entries exactly and writes profile, availability and plan', () => {
    fillImperialWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

    const state = useAppStore.getState();
    const id = state.activeProfileId;
    expect(id).not.toBeNull();
    if (id === null) return;
    const p = state.profiles[id];
    expect(p).toBeDefined();
    if (p === undefined) return;

    expect(p.units).toBe('imperial');
    expect(p.timezone).toBe('America/New_York');
    expect(p.displayName).toBe('Test subject');
    expect(p.body.sex).toBe('male');
    expect(p.body.birthYear).toBe(1996);
    // 5 ft 11 in = 71 in x 2.54 cm/in = 180.34 cm exactly.
    expect(p.body.heightCm).toBeCloseTo(IMPERIAL_HEIGHT_CM, 10);
    // 135 lb x 0.45359237 kg/lb = 61.23496995 kg exactly.
    expect(p.body.baselineMassKg).toBeCloseTo(IMPERIAL_MASS_KG, 10);
    expect(p.body.baselineMassKg).toBe(IMPERIAL_MASS_LB * KG_PER_LB);
    expect(p.body.baselineBodyFatPct).toBeNull();
    expect(p.body.baselineAt).toBe('2026-09-01');
    // Steps are stored canonically in kg: 5 lb = 2.26796185 kg, 10 lb = 4.5359237 kg.
    expect(p.equipmentSteps.barbellKg).toBeCloseTo(2.26796185, 10);
    expect(p.equipmentSteps.dumbbellPairKg).toBeCloseTo(4.5359237, 10);
    expect(p.equipmentSteps.hasMicroPlates).toBe(false);
    expect(p.equipmentSteps.microPlateKg).toBeCloseTo(1 * KG_PER_LB, 10);
    // Hydration seeded from the IOM beverage share for the stated sex.
    expect(p.hydration.dailyTargetML).toBe(3000);
    expect(p.hydration.weighInOptIn).toBe(false);
    expect(p.supplements).toEqual({ creatine: false });
    // Task 9 fills this in on its own screen; the wizard creates it unscreened.
    expect(p.readiness).toEqual({ screenedAt: null, flagged: false });

    const availability = state.availability[id];
    expect(availability?.slots.map((s) => s.weekday)).toEqual([1, 2, 4, 5]);
    expect(availability?.weeklySessionTarget).toBe(4);
    expect(availability?.slots[0]?.expectedDurationS).toBe(3600); // [s] 60 min default

    const cursor = state.cursors[id];
    expect(cursor?.nextSessionIndex).toBe(0);
    expect(cursor?.startedOn).toBe('2026-09-01'); // todayLocal in America/New_York
    const plan = cursor ? state.plans[cursor.planId] : undefined;
    expect(plan?.sessions.length).toBe(48); // 12 weeks x 4 sessions
  });

  it('writes a document that passes parseState', () => {
    fillImperialWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

    const raw: unknown = JSON.parse(useAppStore.getState().exportJson());
    const result = parseState(raw);
    expect(result.ok ? null : result.error).toBeNull();
    expect(result.ok).toBe(true);
  });

  it('stores a metric entry with no conversion', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Kilograms (kg)'));
    next();
    next();
    setValue(/^name$/i, 'Metric subject');
    fireEvent.click(screen.getByLabelText('Female'));
    setValue(/birth year/i, '2000');
    setValue(/height \(cm\)/i, '165');
    setValue(/body mass \(kg\)/i, '62.5');
    next();
    next();
    next();
    setValue(/sessions per week/i, '3');
    for (const day of ['Monday', 'Wednesday', 'Friday']) {
      fireEvent.click(screen.getByLabelText(day));
    }
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

    const state = useAppStore.getState();
    const id = state.activeProfileId ?? '';
    expect(state.profiles[id]?.body.baselineMassKg).toBe(62.5);
    expect(state.profiles[id]?.body.heightCm).toBe(165);
    expect(state.profiles[id]?.hydration.dailyTargetML).toBe(2200); // female beverage share
    expect(state.profiles[id]?.equipmentSteps.barbellKg).toBe(2.5);
  });
});

describe('body fat by tape measure', () => {
  it('computes the Navy estimate and shows its standard error', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Kilograms (kg)'));
    next();
    next();
    setValue(/birth year/i, '1996');
    setValue(/height \(cm\)/i, '180');
    setValue(/body mass \(kg\)/i, '95.3');
    fireEvent.click(screen.getByLabelText('Estimate from tape measurements'));
    setValue(/^neck \(cm\)$/i, '40');
    setValue(/abdomen ii \(cm\)/i, '95');
    const estimate = screen.getByTestId('bodyfat-estimate').textContent ?? '';
    expect(estimate).toContain('21.9');
    expect(estimate).toContain('3.52');
    expect(screen.getByTestId('bodyfat-why').textContent).toMatch(/track change over time/i);
  });

  it('asks a female user for the hip girth and withholds the estimate until it is given', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Kilograms (kg)'));
    next();
    next();
    fireEvent.click(screen.getByLabelText('Female'));
    setValue(/birth year/i, '1996');
    setValue(/height \(cm\)/i, '165');
    setValue(/body mass \(kg\)/i, '62.5');
    fireEvent.click(screen.getByLabelText('Estimate from tape measurements'));
    setValue(/^neck \(cm\)$/i, '32');
    setValue(/abdomen i \(cm\)/i, '75');
    expect(screen.getByTestId('bodyfat-estimate').textContent).toMatch(/hip/i);
    setValue(/^hip \(cm\)$/i, '95');
    expect(screen.getByTestId('bodyfat-estimate').textContent).toContain('27.4');
  });
});

describe('no free-text medical field exists', () => {
  /** Minimum entry needed to pass each screen's Continue guard. */
  function unblock(stepIndex: number): void {
    if (STEPS[stepIndex] === 'body') {
      setValue(/birth year/i, '1996');
      setValue(/height \(cm\)/i, '180');
      setValue(/body mass \(kg\)/i, '80');
    }
    if (STEPS[stepIndex] === 'availability') {
      fireEvent.click(screen.getByLabelText('Monday'));
      // One day selected, so the weekly target cannot stay at the four-day default.
      setValue(/weekly session target/i, '1');
    }
  }

  it('renders no textarea and no text input outside name and time zone', () => {
    const { container } = render(<SetupWizard />);
    for (let stepIndex = 0; stepIndex < STEPS.length; stepIndex += 1) {
      unblock(stepIndex);
      expect(container.querySelectorAll('textarea')).toHaveLength(0);
      const freeText = [...container.querySelectorAll('input')].filter(
        (i) => (i.getAttribute('type') ?? 'text') === 'text',
      );
      expect(freeText.map((i) => i.id).sort()).toEqual(
        STEPS[stepIndex] === 'timezone' ? ['f-timezone'] : STEPS[stepIndex] === 'body' ? ['f-name'] : [],
      );
      const continueButton = screen.queryByRole('button', { name: 'Continue' });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('shows no medication input or copy on any screen', () => {
    render(<SetupWizard />);
    for (let stepIndex = 0; stepIndex < STEPS.length; stepIndex += 1) {
      unblock(stepIndex);
      for (const field of [
        ...screen.queryAllByRole('textbox'),
        ...screen.queryAllByRole('spinbutton'),
        ...screen.queryAllByRole('combobox'),
      ]) {
        expect(field.getAttribute('aria-label') ?? '').not.toMatch(MEDICAL_PATTERN);
      }
      expect(document.body.textContent ?? '').not.toMatch(MEDICAL_PATTERN);
      const continueButton = screen.queryByRole('button', { name: 'Continue' });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('offers exactly one supplement toggle, creatine', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/birth year/i, '1996');
    setValue(/height \(cm\)/i, '180');
    setValue(/body mass \(kg\)/i, '80');
    next();
    next();
    const names = screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent ?? '');
    expect(names.filter((t) => /creatine/i.test(t))).toHaveLength(1);
    expect(names.filter((t) => MEDICAL_PATTERN.test(t))).toHaveLength(0);
  });
});

describe('copy rules', () => {
  it('keeps every button to three words and uses no dash connector', () => {
    render(<SetupWizard />);
    for (let stepIndex = 0; stepIndex < STEPS.length; stepIndex += 1) {
      if (STEPS[stepIndex] === 'body') {
        setValue(/birth year/i, '1996');
        setValue(/height \(cm\)/i, '180');
        setValue(/body mass \(kg\)/i, '80');
      }
      if (STEPS[stepIndex] === 'availability') {
        fireEvent.click(screen.getByLabelText('Monday'));
        setValue(/weekly session target/i, '1');
      }
      for (const button of screen.getAllByRole('button')) {
        expect((button.textContent ?? '').trim().split(/\s+/).length).toBeLessThanOrEqual(3);
      }
      expect(document.body.textContent ?? '').not.toMatch(/[—–]/);
      const continueButton = screen.queryByRole('button', { name: 'Continue' });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
  });
});
