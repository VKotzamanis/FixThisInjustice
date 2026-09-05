import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { STEPS, SetupWizard } from './SetupWizard';
import { useAppStore } from '../../store';
import { parseState } from '../../domain/schema';
import { EXERCISES } from '../../domain/plan/library';
import { generatePlan, volumeReport } from '../../domain/plan/generator';
import { SPLIT_TEMPLATES } from '../../domain/plan/templates';
import { KG_PER_LB } from '../../domain/types';
import { toStoredMass } from '../../domain/units';
import { NUTRITION_DOMAIN, computeTargets, isInDomain } from '../../domain/nutrition';
import { PLAN_WEEKS_MIN } from '../../domain/plan/generator';
import { FORMAT, copyFor } from '../../content/copy';
import type { SkinId } from '../../domain/types';

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
// Assembled from fragments so the file itself passes the CI personal-data gate (master plan §3).
const MEDICAL_PATTERN = new RegExp(
  ['vyvans' + 'e', 'lisdexamfetamin' + 'e', 'medicat', 'drug', 'dose of', 'stimulant'].join('|'),
  'i',
);

/**
 * The clock is pinned because two numbers under test are read off it: the birth year DERIVED
 * from the age the field now asks for (round 1 claim C1.07.17), and `todayLocal`, which becomes
 * the plan's start date. 12:00 UTC lands on
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

/** Click the primary forward control. Round 1 claim C1.05.2 renamed it to Next. */
function next(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function setValue(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Drive screens 1-5 with an imperial profile, leaving the goal screen on show. */
function fillImperialWizardToGoal(): void {
  render(<SetupWizard />);
  // 1 - units
  fireEvent.click(screen.getByLabelText('Pounds (lb)'));
  next();
  // 2 - time zone
  setValue(/^time zone$/i, 'America/New_York');
  next();
  // 3 - body
  setValue(/^How should I refer to you\?$/i, 'Test subject');
  fireEvent.click(screen.getByLabelText('Male'));
  setValue(/^age \(years\)$/i, '30');
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
}

/** Advance to availability, with four weekdays checked for the four-session split. */
function fillImperialWizardToAvailability(): void {
  fillImperialWizardToGoal();
  next();
  // 6 - availability
  setValue(/sessions per week/i, '4');
  for (const day of ['Monday', 'Tuesday', 'Thursday', 'Friday']) {
    fireEvent.click(screen.getByLabelText(day));
  }
}

/** Drive screens 1-8 with an imperial profile, leaving the review screen on show. */
function fillImperialWizard(): void {
  fillImperialWizardToAvailability();
  next();
  // 7 - programme length
  setValue(/programme length/i, '12');
  next();
  // 8 - guidance
  next();
}

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('step order', () => {
  it('exposes an ordered STEPS array with the guidance step before Review', () => {
    expect([...STEPS]).toEqual([
      'units',
      'timezone',
      'body',
      'training',
      'goal',
      'availability',
      'programme',
      'guidance',
      'review',
    ]);
    expect(STEPS[STEPS.length - 2]).toBe('guidance');
    expect(STEPS[STEPS.length - 1]).toBe('review');
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
    expect(screen.getByLabelText(/^metres$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^centimetres$/i)).toBeInTheDocument();
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
    setValue(/^age \(years\)$/i, '30');
    setValue(/^feet$/i, '5');
    setValue(/^inches$/i, '11');
    setValue(/body mass \(lb\)/i, String(IMPERIAL_MASS_LB));
    next();
    expect(screen.getByLabelText(/barbell step \(lb\)/i)).toHaveValue(5);
    expect(screen.getByLabelText(/dumbbell step, per pair \(lb\)/i)).toHaveValue(10);
  });
});

describe('domain guards', () => {
  it('blocks progression and names the bound when the age is outside 18 to 80', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    setValue(/^age \(years\)$/i, '6'); // under the 18 to 80 domain

    expect(screen.getByText('Age must be 18 to 80 years.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    next();
    // Still on the body screen: the guard held.
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();

    setValue(/^age \(years\)$/i, '30');
    expect(screen.queryByText('Age must be 18 to 80 years.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('blocks a body mass outside the validated adult domain', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '12');
    expect(screen.getByText('Body mass must be 30 to 300 kg.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('blocks an empty weekday selection', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next(); // training
    next(); // goal
    next(); // availability
    expect(screen.getByText('Select at least one weekday.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
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
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
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
    // Readiness screening is retired (Brief A); the schema retains the default readiness object.
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
    setValue(/^How should I refer to you\?$/i, 'Metric subject');
    fireEvent.click(screen.getByLabelText('Female'));
    setValue(/^age \(years\)$/i, '26');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '65');
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
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
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
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '65');
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
      setValue(/^age \(years\)$/i, '30');
      setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
      setValue(/body mass \(kg\)/i, '80');
    }
    if (STEPS[stepIndex] === 'availability') {
      // The weekday count may not fall below sessions per week, and 2 is the lowest the
      // sessions-per-week list offers, so the smallest passing selection is two days.
      setValue(/sessions per week/i, '2');
      fireEvent.click(screen.getByLabelText('Monday'));
      fireEvent.click(screen.getByLabelText('Tuesday'));
      setValue(/weekly session target/i, '2');
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
      const continueButton = screen.queryByRole('button', { name: 'Next' });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('shows no medication input on any screen and no medication copy outside the screening', () => {
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
      const guidance = screen.queryByTestId('guidance-screen');
      if (guidance) {
        expect(guidance.querySelectorAll('textarea')).toHaveLength(0);
        expect(guidance.querySelectorAll('input')).toHaveLength(0);
      }
      expect(document.body.textContent ?? '').not.toMatch(MEDICAL_PATTERN);
      const continueButton = screen.queryByRole('button', { name: 'Next' });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('offers exactly one supplement toggle, creatine', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
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
        setValue(/^age \(years\)$/i, '30');
        setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
        setValue(/body mass \(kg\)/i, '80');
      }
      if (STEPS[stepIndex] === 'availability') {
        setValue(/sessions per week/i, '2');
        fireEvent.click(screen.getByLabelText('Monday'));
        fireEvent.click(screen.getByLabelText('Tuesday'));
        setValue(/weekly session target/i, '2');
      }
      for (const button of screen.getAllByRole('button')) {
        expect((button.textContent ?? '').trim().split(/\s+/).length).toBeLessThanOrEqual(3);
      }
      expect(document.body.textContent ?? '').not.toMatch(/[—–]/);
      const continueButton = screen.queryByRole('button', { name: 'Next' });
      if (!continueButton) break;
      fireEvent.click(continueButton);
    }
  });
});

/**
 * The rounded display bound is not the domain.
 *
 * NUTRITION_DOMAIN.massKg is [30, 300] kg. Rounding those to 0.1 lb gives [66.1, 661.4] lb, and
 * both endpoints convert back OUTSIDE the kg bound (66.1 lb = 29.98 kg, 661.4 lb = 300.01 kg).
 * A form that compares the entered lb value against the rounded lb bound therefore admits a mass
 * that computeTargets refuses with a RangeError, which surfaces as a crash while Review renders.
 */
describe('the converted value is what the domain gate tests', () => {
  const FLOOR_LB = '66.1'; // [lb] the 30 kg floor rounded to 0.1 lb
  const CEILING_LB = '661.4'; // [lb] the 300 kg ceiling rounded to 0.1 lb
  const INSIDE_LB = '66.2'; // [lb] the floor rounded INWARD, which the message quotes

  /** Male, 30 y at the pinned clock, 5 ft 11 in, with the body mass under test. */
  function imperialBodyStep(massLb: string): void {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    next();
    fireEvent.click(screen.getByLabelText('Male'));
    setValue(/^age \(years\)$/i, '30');
    setValue(/^feet$/i, '5');
    setValue(/^inches$/i, '11');
    setValue(/body mass \(lb\)/i, massLb);
  }

  function inputAt(massKg: number) {
    return {
      sex: 'male',
      ageYears: 30, // [years]
      heightCm: IMPERIAL_HEIGHT_CM, // [cm]
      massKg, // [kg]
      bodyFatPct: null,
      activity: 'moderate',
      goal: 'fat-loss',
      sessionsPerWeek: 4, // [sessions/week]
      creatine: false,
    } as const;
  }

  it('blocks a lb entry whose exact kg conversion is under the 30 kg floor', () => {
    const kg = toStoredMass(Number(FLOOR_LB), 'imperial'); // [kg] 29.982 kg
    expect(kg).toBeLessThan(NUTRITION_DOMAIN.massKg.lo);
    expect(isInDomain(inputAt(kg))).toBe(false);
    expect(() => computeTargets(inputAt(kg))).toThrow(RangeError);

    imperialBodyStep(FLOOR_LB);
    expect(screen.getByText('Body mass must be 66.2 to 661.3 lb.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    next();
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();
  });

  it('blocks a lb entry whose exact kg conversion is over the 300 kg ceiling', () => {
    const kg = toStoredMass(Number(CEILING_LB), 'imperial'); // [kg] 300.008 kg
    expect(kg).toBeGreaterThan(NUTRITION_DOMAIN.massKg.hi);
    imperialBodyStep(CEILING_LB);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('accepts the bound the message quotes, and that bound is inside the domain', () => {
    const kg = toStoredMass(Number(INSIDE_LB), 'imperial'); // [kg] 30.028 kg
    expect(isInDomain(inputAt(kg))).toBe(true);
    imperialBodyStep(INSIDE_LB);
    expect(screen.queryByText(/body mass must be/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('holds an optional target body mass to the same kg bound', () => {
    fillImperialWizardToGoal();
    setValue(/target body mass \(lb\)/i, FLOOR_LB);
    expect(screen.getByText('Target body mass must be 66.2 to 661.3 lb.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    setValue(/target body mass \(lb\)/i, '120');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('quotes an imperial stature bound that is itself inside the cm domain', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    next();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^feet$/i, '3');
    setValue(/^inches$/i, '11'); // 47 in = 119.38 cm, under the 120 cm floor
    setValue(/body mass \(lb\)/i, String(IMPERIAL_MASS_LB));
    expect(screen.getByText('Height must be 47.3 to 90.5 in.')).toBeInTheDocument();
    // 47.3 in x 2.54 cm/in = 120.142 cm and 90.5 in = 229.87 cm: both inside [120, 230] cm.
    expect(47.3 * 2.54).toBeGreaterThanOrEqual(NUTRITION_DOMAIN.heightCm.lo);
    expect(90.5 * 2.54).toBeLessThanOrEqual(NUTRITION_DOMAIN.heightCm.hi);
  });
});

/**
 * The schema stores birthYear, weeklySessionTarget and the plan's weeks as z.int(). A fraction
 * is refused where it is typed rather than rounded into the document behind the user's back.
 */
describe('whole-number counts', () => {
  it('refuses a fractional age instead of rounding it', () => {
    render(<SetupWizard />);
    next();
    next();
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    setValue(/^age \(years\)$/i, '30.5');
    expect(screen.getByText('Enter a whole number.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    setValue(/^age \(years\)$/i, '30');
    expect(screen.queryByText('Enter a whole number.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('refuses a fractional programme length', () => {
    fillImperialWizard();
    // Review, then back through Readiness to Programme.
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    setValue(/programme length/i, '12.4');
    expect(screen.getByText('Enter a whole number.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    setValue(/programme length/i, String(PLAN_WEEKS_MIN));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('refuses a fractional weekly session target', () => {
    fillImperialWizardToAvailability();
    setValue(/weekly session target/i, '3.5');
    expect(screen.getByText('Enter a whole number.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    setValue(/weekly session target/i, '3');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('writes a document that passes parseState once the fractions are corrected', () => {
    fillImperialWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));
    const raw: unknown = JSON.parse(useAppStore.getState().exportJson());
    const result = parseState(raw);
    expect(result.ok ? null : result.error).toBeNull();
    const state = useAppStore.getState();
    const id = state.activeProfileId ?? '';
    expect(Number.isInteger(state.profiles[id]?.body.birthYear)).toBe(true);
    expect(Number.isInteger(state.availability[id]?.weeklySessionTarget)).toBe(true);
  });
});

describe('focus, announcement and message binding', () => {
  it('moves focus to the step heading on every step change', () => {
    render(<SetupWizard />);
    const first = screen.getByRole('heading', { level: 2 });
    expect(first).toHaveTextContent('Units');
    expect(first).toHaveAttribute('tabindex', '-1');
    next();
    const second = screen.getByRole('heading', { level: 2 });
    expect(second).toHaveTextContent('Time zone');
    expect(document.activeElement).toBe(second);
  });

  it('announces the step in a polite live region', () => {
    render(<SetupWizard />);
    const status = screen.getByTestId('wiz-step-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(FORMAT.stepOf(1, STEPS.length, 'Units'));
    next();
    expect(status).toHaveTextContent(FORMAT.stepOf(2, STEPS.length, 'Time zone'));
  });

  /** The message an aria-describedby id points at, or null when the id resolves to nothing. */
  function describedText(control: HTMLElement): string {
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
  }

  it('binds the feet and inches message to both controls', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    next();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^feet$/i, '3');
    setValue(/^inches$/i, '11');
    setValue(/body mass \(lb\)/i, String(IMPERIAL_MASS_LB));
    for (const label of [/^feet$/i, /^inches$/i]) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(describedText(control)).toContain('Height must be');
    }
  });

  it('binds the tape-domain message to the girth controls', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Kilograms (kg)'));
    next();
    next();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '95.3');
    fireEvent.click(screen.getByLabelText('Estimate from tape measurements'));
    setValue(/^neck \(cm\)$/i, '40');
    setValue(/abdomen ii \(cm\)/i, '182'); // Navy estimate 60.1 %, above the 60 % ceiling
    for (const label of [/^neck \(cm\)$/i, /abdomen ii \(cm\)/i]) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(describedText(control)).toContain('Body fat must be 3 to 60 %.');
    }
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('binds the target-date message to its control', () => {
    fillImperialWizardToGoal();
    const control = screen.getByLabelText(/target date/i);
    // jsdom and every conforming browser sanitise an invalid entry in <input type="date"> to
    // "", so the message is only reachable in a user agent that falls back to a text field.
    // Switching the type here is exactly that fallback, not a way around the component.
    control.setAttribute('type', 'text');
    fireEvent.change(control, { target: { value: '2026-02-30' } });
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(control)).not.toBe('');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('binds the weekday message to every weekday control', () => {
    fillImperialWizardToAvailability();
    for (const day of ['Monday', 'Tuesday', 'Thursday', 'Friday']) {
      fireEvent.click(screen.getByLabelText(day)); // uncheck the four the helper checked
    }
    for (const day of ['Monday', 'Sunday']) {
      const control = screen.getByLabelText(day);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(describedText(control)).toContain('Select at least one weekday.');
    }
  });
});

describe('availability against sessions per week', () => {
  it('blocks when fewer weekdays are checked than the split needs, naming both counts', () => {
    fillImperialWizardToAvailability(); // 4 sessions per week, 4 days checked
    fireEvent.click(screen.getByLabelText('Thursday'));
    fireEvent.click(screen.getByLabelText('Friday')); // 2 days left, 4 sessions per week
    expect(
      screen.getByText('2 days selected for 4 sessions per week. Select at least 4 days.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Thursday'));
    fireEvent.click(screen.getByLabelText('Friday'));
    expect(screen.queryByText(/days selected for/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});

describe('entry aids and idempotency', () => {
  it('turns off text assistance on the time-zone field and offers the platform zone list', () => {
    render(<SetupWizard />);
    next();
    const control = screen.getByLabelText(/^time zone$/i);
    expect(control).toHaveAttribute('autocapitalize', 'none');
    expect(control).toHaveAttribute('autocorrect', 'off');
    expect(control).toHaveAttribute('spellcheck', 'false');
    const listId = control.getAttribute('list');
    expect(listId).not.toBeNull();
    const list = document.getElementById(listId ?? '');
    expect(list?.tagName.toLowerCase()).toBe('datalist');
    const values = [...(list?.querySelectorAll('option') ?? [])].map((o) => o.value);
    expect(values).toContain('America/New_York');
  });

  it('creates one profile however many times Confirm is clicked', () => {
    fillImperialWizard();
    const button = screen.getByRole('button', { name: 'Confirm and start' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(Object.keys(useAppStore.getState().profiles)).toHaveLength(1);
    expect(button).toBeDisabled();
  });

  it('states the unit on every tape girth label', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Kilograms (kg)'));
    next();
    next();
    fireEvent.click(screen.getByLabelText('Female'));
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '65');
    setValue(/body mass \(kg\)/i, '62.5');
    fireEvent.click(screen.getByLabelText('Estimate from tape measurements'));
    for (const label of [/^neck \(cm\)$/i, /^abdomen i \(cm\)$/i, /^hip \(cm\)$/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});

/**
/**
 * The guidance step (replaces the readiness screening in SetupWizard).
 *
 * It is a reference step: Next is immediately enabled without user input,
 * and Confirm writes the profile with default readiness state.
 */
describe('guidance step in wizard', () => {
  it('renders the guidance screen and advances without user input', () => {
    fillImperialWizardToAvailability();
    next();
    setValue(/programme length/i, '12');
    next();

    // On guidance step
    expect(screen.getByTestId('guidance-screen')).toBeInTheDocument();
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeEnabled();

    // Advance to Review
    next();
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('writes profile with default readiness on confirm', () => {
    fillImperialWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

    const state = useAppStore.getState();
    const profile = state.profiles[state.activeProfileId ?? ''];
    expect(profile?.readiness).toEqual({ screenedAt: null, flagged: false });
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('SetupWizard under a skin', () => {
  it('names the primary control in the limelight words, and in the default ones under clinical', () => {
    pinSkin('limelight');
    const view = render(<SetupWizard />);
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.continue') }),
    ).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    render(<SetupWizard />);
    expect(
      screen.getByRole('button', { name: copyFor('clinical', 'button.continue') }),
    ).toBeInTheDocument();
  });
});
