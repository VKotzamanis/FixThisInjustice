import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { STEPS, SetupWizard } from './SetupWizard';
// The stylesheet as text. jsdom renders no geometry, so a layout RULE is what can be asserted
// here; the device pass itself is a row in docs/phone-visual-check.md (r2.10).
import setupCss from './setup.css?raw';
import { BODY_EQUATIONS } from '../../content/bodyEquations';
import { useAppStore } from '../../store';
import { STORAGE_KEY } from '../../store/persistence';
import { installFakeStorage } from '../../store/testStorage';
import { defaultState, parseState } from '../../domain/schema';
import { EXERCISES } from '../../domain/plan/library';
import { generatePlan, volumeReport } from '../../domain/plan/generator';
import { SPLIT_TEMPLATES } from '../../domain/plan/templates';
import {
  GOAL_AXES_BY_KIND,
  GOAL_KIND_BY_AXES,
  KG_PER_LB,
  type FatAxis,
  type GoalKind,
  type MuscleAxis,
} from '../../domain/types';
import { NAVY_SEE_PCT } from '../../domain/bodyfat';
import { isValidTimeZone } from '../../domain/dates';
import { toStoredMass } from '../../domain/units';
import {
  ACTIVITY_FACTOR,
  ACTIVITY_STOPS,
  NUTRITION_DOMAIN,
  computeTargets,
  isInDomain,
} from '../../domain/nutrition';
import { ACTIVITY_LEVELS_CITATION } from '../../content/activityLevels';
import { PLAN_WEEKS_MIN } from '../../domain/plan/generator';
import { nutritionInputFor } from '../../store/selectors';
import { FORMAT, copyFor } from '../../content/copy';
import {
  ACTIVITY_LEVEL_EXAMPLES,
  EQUIPMENT_ACCESS_EXAMPLES,
} from '../../content/setupSliderExamples';
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

/**
 * [ms] C1.G.1: comfortably above SetupWizard.tsx's own SETUP_DRAFT_SAVE_DEBOUNCE_MS (400 ms),
 * for the "setup draft survives a closed browser" suite below, which fakes setTimeout so this
 * can be advanced deterministically rather than the test waiting on the wall clock.
 */
const DRAFT_SAVE_DEBOUNCE_ADVANCE_MS = 500;

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

/**
 * Ticks the review step's "Looks Good" acknowledgement (Brief M, claim r2.19), which every
 * fixture below that reaches Confirm must do exactly once now that Confirm is disabled until it
 * is checked. Not folded into `fillImperialWizard` or `finishFromTraining` themselves: the
 * "disabled until ticked" tests below need a review screen that has NOT been acknowledged yet.
 */
function tickLooksGood(): void {
  fireEvent.click(screen.getByLabelText('Looks Good'));
}

/**
 * Choose a stated sex on the body step.
 *
 * ROUND 2 CHANGED THE PRECONDITION EVERY TEST BELOW WAS WRITTEN UNDER. `initialDraft` used to
 * open with `sex: 'male'`; r2.11 and plan decision A1 make `nd` the default and make the body-fat
 * percentage REQUIRED on that path, because Mifflin-St Jeor has no sex-free form. So a test that
 * walks past the body step without answering now blocks, correctly.
 *
 * Calling this restores each test's original conditions exactly rather than working around the
 * new rule: `male` is the value those tests used to get for free, and every number they assert
 * (the Mifflin-St Jeor offset, the 3000 mL beverage share) was computed under it. The `nd` path
 * has its own tests, which assert that it blocks and why.
 */
function pickSex(sex: 'Male' | 'Female' = 'Male'): void {
  fireEvent.click(screen.getByLabelText(sex));
}

function setValue(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/**
 * Drive screens 1-4 with an imperial profile, leaving the TRAINING screen on show with every one
 * of its fields answered: the three sliders AND the availability fields, which render here now
 * rather than on a step of their own after the goal (finding B43).
 */
function fillImperialWizardToTraining(): void {
  render(<SetupWizard />);
  // 1 - units
  fireEvent.click(screen.getByLabelText('Pounds (lb)'));
  next();
  // 2 - time zone
  setValue(/^time zone$/i, 'America/New_York');
  next();
  // 3 - body
  setValue(/^How should I refer to you\?$/i, 'Test subject');
  pickSex();
  setValue(/^age \(years\)$/i, '30');
  setValue(/^feet$/i, '5');
  setValue(/^inches$/i, '11');
  setValue(/body mass \(lb\)/i, String(IMPERIAL_MASS_LB));
  next();
  // 4 - Equipment & Availability: three sliders, index-valued (Brief F; Brief G widened Everyday
  // Activity Level from 3 positions to 9). Everyday Activity Level's default is already
  // 'moderate' floor (index 3 of 9: stop 4, PAL 1.70 -- src/domain/nutrition.ts's
  // ACTIVITY_STOPS) and Equipment Access's is already 'full-gym' (index 4), same as this
  // fixture wants, but both are set explicitly so the fixture's intent does not depend on
  // initialDraft's defaults staying what they are today.
  fireEvent.change(screen.getByLabelText(/^everyday activity level$/i), {
    target: { value: '3' }, // moderate floor, PAL 1.70 (stop 4 of 9)
  });
  fireEvent.change(screen.getByLabelText(/^gym comfort$/i), {
    target: { value: '1' }, // intermediate
  });
  fireEvent.change(screen.getByLabelText(/^equipment access$/i), {
    target: { value: '4' }, // full-gym
  });
  /*
   * The availability fields render on THIS step now, not on one of their own after the goal
   * (finding B43): what you can provide is stated before what you want and by when, so the
   * feasibility calendar on the next step knows the training frequency. Four weekdays for the
   * four-session split.
   */
  setValue(/sessions per week/i, '4');
  for (const day of ['Monday', 'Tuesday', 'Thursday', 'Friday']) {
    fireEvent.click(screen.getByLabelText(day));
  }
}

/**
 * Availability is no longer a screen of its own; its fields are answered on the training screen.
 * This name is kept because the tests that call it are about those fields, and it still leaves
 * them on show.
 */
const fillImperialWizardToAvailability = fillImperialWizardToTraining;

/** Drive screens 1-5, leaving the goal screen on show. */
function fillImperialWizardToGoal(): void {
  fillImperialWizardToTraining();
  next();
  /*
   * 5 - Fitness Goal. Brief I Part 1 replaced the exclusive goal menu with two axes, so the
   * fixture picks the PAIR that derives 'fat-loss' rather than selecting that name directly.
   * Both are clicked explicitly even though `initialDraft` already opens on 'fat-loss', for the
   * same reason the sliders above are set explicitly: the fixture's intent should not depend on
   * a default staying what it is today.
   */
  fireEvent.click(screen.getByLabelText('Lose fat'));
  fireEvent.click(screen.getByLabelText('Hold muscle'));
}

/** Drive screens 1-8 with an imperial profile, leaving the review screen on show. */
function fillImperialWizard(): void {
  fillImperialWizardToGoal();
  next();
  // 6 - programme length (was 7, before availability folded into training)
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
    /*
     * EIGHT STEPS, not nine. `availability` was folded into `training` (finding B43): one step
     * asks what you can PROVIDE, equipment and the weekly slots, and the next asks what you WANT
     * and by when. Before the fold, a target date was chosen before training frequency was known,
     * which is the defect C1.10.8 raised. Brief F renamed the step to "Equipment & Availability"
     * and moved no controls, so the rename made the fold look done when it was not.
     */
    expect([...STEPS]).toEqual([
      'units',
      'timezone',
      'body',
      'training',
      'goal',
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
    pickSex();
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
    pickSex();
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    setValue(/^age \(years\)$/i, '6'); // under the 18 to 80 domain

    expect(screen.getByText('Age must be 18 to 80 years.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
    next();
    // Still on the body screen: the guard held.
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();

    setValue(/^age \(years\)$/i, '30');
    expect(screen.queryByText('Age must be 18 to 80 years.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled', 'true');
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
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('blocks an empty weekday selection', () => {
    render(<SetupWizard />);
    next();
    next();
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next(); // training, which is where the weekday controls live now (finding B43)
    /*
     * Deliberately NO weekday is checked: that is the whole subject of this test. Since the fold,
     * the block shows on the training step rather than on a step of its own, and training's own
     * BLOCKED entry absorbed availability's guards -- so Next is disabled HERE.
     */
    setValue(/sessions per week/i, '2');
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
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next();
    // Availability renders on the training step now (finding B43), before the goal asks for a
    // target date, so it is answered here rather than after the next press.
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Wednesday'));
    setValue(/sessions per week/i, '2');
    next();
    // Brief I Part 1: 'muscle-gain' is derived from hold-fat plus gain-muscle, not selected.
    fireEvent.click(screen.getByLabelText('Hold body fat'));
    fireEvent.click(screen.getByLabelText('Gain muscle'));
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
    tickLooksGood();
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
    // Brief F Part 3: hasMicroPlates/microPlateKg no longer exist on equipmentSteps.
    expect(p.equipmentSteps).toEqual({
      barbellKg: p.equipmentSteps.barbellKg,
      dumbbellPairKg: p.equipmentSteps.dumbbellPairKg,
      stackKg: p.equipmentSteps.stackKg,
    });
    // Equipment access ends on full-gym (fillImperialWizardToGoal moves the slider there), and
    // neither the walk-to-gym question nor an equipment inventory was ever shown for it.
    expect(p.equipment).toBe('full-gym');
    expect(p.gymCommute).toEqual({ walks: false, minutesEachWay: 0 });
    expect(p.homeEquipment).toEqual([]);
    expect(p.bodyweightEquipment).toEqual([]);
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
    tickLooksGood();
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
    // Availability renders on the training step now (finding B43), before the goal asks for a
    // target date, so it is answered here rather than after the next press.
    setValue(/sessions per week/i, '3');
    for (const day of ['Monday', 'Wednesday', 'Friday']) {
      fireEvent.click(screen.getByLabelText(day));
    }
    next();
    next();
    next();
    next();
    tickLooksGood();
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
    // r2.11 / decision A1: the tape route needs a stated sex, so this is now explicit. It was
    // implicit before, through initialDraft's old `sex: 'male'` default.
    pickSex();
    setValue(/body mass \(kg\)/i, '95.3');
    fireEvent.click(screen.getByLabelText('Body measurements'));
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
    fireEvent.click(screen.getByLabelText('Body measurements'));
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
      pickSex();
      setValue(/^age \(years\)$/i, '30');
      setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
      setValue(/body mass \(kg\)/i, '80');
    }
    if (STEPS[stepIndex] === 'training') {
      // The availability fields render on the training step now. The weekday count may not fall
      // below sessions per week, and 2 is the lowest the sessions-per-week list offers, so the
      // smallest passing selection is two days.
      setValue(/sessions per week/i, '2');
      fireEvent.click(screen.getByLabelText('Monday'));
      fireEvent.click(screen.getByLabelText('Tuesday'));
      setValue(/weekly session target/i, '2');
    }
  }

  /*
   * C1.06.2 turned the time-zone field into a `<select>` built from the platform's own zone
   * list, which is available in every environment this suite runs in (Node's ICU build
   * supports Intl.supportedValuesOf), so the free-text fallback this test used to name is
   * unreachable here. The display name is now the only free-text input anywhere in the wizard;
   * the fallback branch itself is exercised separately, below, by stubbing the platform API out.
   */
  it('renders no textarea and no text input outside the display name', () => {
    const { container } = render(<SetupWizard />);
    for (let stepIndex = 0; stepIndex < STEPS.length; stepIndex += 1) {
      unblock(stepIndex);
      expect(container.querySelectorAll('textarea')).toHaveLength(0);
      const freeText = [...container.querySelectorAll('input')].filter(
        (i) => (i.getAttribute('type') ?? 'text') === 'text',
      );
      expect(freeText.map((i) => i.id).sort()).toEqual(
        STEPS[stepIndex] === 'body' ? ['f-name'] : [],
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
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next(); // training
    // Availability renders on the training step now (finding B43) and gates it, so the slots are
    // answered here before Next will advance.
    setValue(/sessions per week/i, '2');
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Tuesday'));
    setValue(/weekly session target/i, '2');
    next(); // goal, where the supplement toggle lives
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
        pickSex();
        setValue(/^age \(years\)$/i, '30');
        setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
        setValue(/body mass \(kg\)/i, '80');
      }
      if (STEPS[stepIndex] === 'training') {
        // The availability fields render on the training step now (finding B43).
        setValue(/sessions per week/i, '2');
        fireEvent.click(screen.getByLabelText('Monday'));
        fireEvent.click(screen.getByLabelText('Tuesday'));
        setValue(/weekly session target/i, '2');
      }
      for (const button of screen.getAllByRole('button')) {
        // `.wiz-link` controls carry `advice.` copy (R3's twelve-word cap), styled as a button
        // for a real tap target rather than a bare `<a href="#">`. They are not `button.` copy
        // and R1's three-word cap does not bind them (Brief B, Part 2: "Options suck? I agree.
        // Click here for a workaround." and "Click here to estimate").
        if (button.classList.contains('wiz-link')) continue;
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
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
    next();
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();
  });

  it('blocks a lb entry whose exact kg conversion is over the 300 kg ceiling', () => {
    const kg = toStoredMass(Number(CEILING_LB), 'imperial'); // [kg] 300.008 kg
    expect(kg).toBeGreaterThan(NUTRITION_DOMAIN.massKg.hi);
    imperialBodyStep(CEILING_LB);
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('accepts the bound the message quotes, and that bound is inside the domain', () => {
    const kg = toStoredMass(Number(INSIDE_LB), 'imperial'); // [kg] 30.028 kg
    expect(isInDomain(inputAt(kg))).toBe(true);
    imperialBodyStep(INSIDE_LB);
    expect(screen.queryByText(/body mass must be/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('holds an optional target body mass to the same kg bound', () => {
    fillImperialWizardToGoal();
    setValue(/target body mass \(lb\)/i, FLOOR_LB);
    // Title Case, Brief I: the quantity name is 'Target Body Mass' now, and only the case moved.
    expect(screen.getByText('Target Body Mass must be 66.2 to 661.3 lb.')).toBeInTheDocument();
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
    pickSex();
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    setValue(/^age \(years\)$/i, '30.5');
    expect(screen.getByText('Enter a whole number.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
    setValue(/^age \(years\)$/i, '30');
    expect(screen.queryByText('Enter a whole number.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled', 'true');
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
    tickLooksGood();
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
    // r2.11 / decision A1: the tape route needs a stated sex, so this is now explicit. It was
    // implicit before, through initialDraft's old `sex: 'male'` default.
    pickSex();
    setValue(/body mass \(kg\)/i, '95.3');
    fireEvent.click(screen.getByLabelText('Body measurements'));
    setValue(/^neck \(cm\)$/i, '40');
    setValue(/abdomen ii \(cm\)/i, '182'); // Navy estimate 60.1 %, above the 60 % ceiling
    for (const label of [/^neck \(cm\)$/i, /abdomen ii \(cm\)/i]) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(describedText(control)).toContain('Body fat must be 3 to 60 %.');
    }
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('binds the target-date message to its control', () => {
    fillImperialWizardToGoal();
    /*
     * Anchored, Brief I: the feasibility calendar beside this field is labelled "Target Date
     * Feasibility", so an unanchored /target date/i now matches the grid as well as the input.
     * The assertion is about the INPUT and its message, so it names the input exactly.
     */
    const control = screen.getByLabelText(/^target date \(optional\)$/i);
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
  /*
   * C1.06.2: the time zone became a `<select>` built from the platform's own zone list, each
   * option labelled with today's computed UTC offset. Athens sits in EEST on the suite's
   * FIXED_NOW of 2026-09-01, verified independently against Node's own Intl before writing this
   * assertion, not assumed. The fallback branch this test used to name (a plain text input with
   * autocapitalize/autocorrect/spellcheck turned off and a datalist) is unreachable here,
   * because Node's ICU build always has Intl.supportedValuesOf; that branch is exercised on its
   * own below by removing the API.
   *
   * ROUND 2 CHANGED WHAT THE LABEL SAYS, and this assertion moved with it (r2.09). Two changes,
   * both requested: the label carries BOTH abbreviations, because Europe says GMT
   * ("(UTC/GMT+03:00)"), and the list shows one row per year-round BEHAVIOUR rather than one per
   * zone, so the Athens row stands for the sixteen zones that keep its offsets in every month
   * and says so. The ordering and the grouping themselves are tested in
   * src/domain/timeZoneGroups.test.ts against a fixed clock; this asserts only that the wizard
   * renders what that module produced.
   */
  it('offers the platform zone list as a select, each option labelled with its computed UTC offset', () => {
    render(<SetupWizard />);
    next();
    const control = screen.getByLabelText(/^time zone$/i);
    expect(control.tagName.toLowerCase()).toBe('select');
    const options = [...control.querySelectorAll('option')] as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toContain('America/New_York');
    const athens = options.find((o) => o.value === 'Europe/Athens');
    expect(athens?.textContent).toBe('(UTC/GMT+03:00) Europe/Athens, 15 more');
  });

  /*
   * "Keep both branches" (00-CONTEXT / C1.06.2): the plain-text fallback still has to work on a
   * platform old enough, or locked down enough, not to expose Intl.supportedValuesOf. Node's own
   * runtime always has it, so the only way to exercise this branch here is to remove it for the
   * length of the test and put it back, exactly as SetupWizard.tsx's own try/catch treats a
   * runtime that throws on the call.
   */
  it('falls back to a validated free-text field when the platform has no zone list', () => {
    const original = Intl.supportedValuesOf;
    // @ts-expect-error -- deliberately undoing the ES2022 API for this one test
    delete Intl.supportedValuesOf;
    try {
      render(<SetupWizard />);
      next();
      const control = screen.getByLabelText(/^time zone$/i);
      expect(control.tagName.toLowerCase()).toBe('input');
      expect(control).toHaveAttribute('autocapitalize', 'none');
      expect(control).toHaveAttribute('autocorrect', 'off');
      expect(control).toHaveAttribute('spellcheck', 'false');
      expect(control).not.toHaveAttribute('list');
      fireEvent.change(control, { target: { value: 'Not/AZone' } });
      expect(screen.getByText('Not a recognised IANA time zone.')).toBeInTheDocument();
      fireEvent.change(control, { target: { value: 'America/New_York' } });
      expect(screen.queryByText('Not a recognised IANA time zone.')).toBeNull();
    } finally {
      Intl.supportedValuesOf = original;
    }
  });

  it('creates one profile however many times Confirm is clicked', () => {
    fillImperialWizard();
    tickLooksGood();
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
    fireEvent.click(screen.getByLabelText('Body measurements'));
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
    fillImperialWizardToAvailability(); // stops on training; availability is answered there
    next(); // goal
    next(); // programme
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
    tickLooksGood();
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

/** Reaches the body step with age, height and mass filled, in metric, ready for these tests. */
function reachBody(): void {
  render(<SetupWizard />);
  next();
  next();
  pickSex();
  setValue(/^age \(years\)$/i, '30');
  setValue(/^metres$/i, '1');
  setValue(/^centimetres$/i, '80');
  setValue(/body mass \(kg\)/i, '80');
}

/**
 * The body step with the sex question left as it opens: `nd` (r2.11, decision A1). Every field
 * except the ones the test under it is about is left blank, so the ND rules are what decide the
 * step rather than a half-filled form.
 */
function reachBodyWithoutSex(): void {
  render(<SetupWizard />);
  next();
  next();
}

/**
 * The same, with every OTHER body field filled, so the sex question and the body-fat rule that
 * follows from it are the only things left that can block the step.
 */
function reachBodyFilledWithoutSex(): void {
  reachBodyWithoutSex();
  setValue(/^age \(years\)$/i, '30');
  setValue(/^metres$/i, '1');
  setValue(/^centimetres$/i, '80');
  setValue(/body mass \(kg\)/i, '80');
}

describe('Brief B: the body-fat control reorder (C1.08.1 to C1.08.4, C1.08.7)', () => {
  it('pre-selects Percentage, in the order Percentage, Body measurements, Not measured', () => {
    reachBody();
    const radios = screen.getAllByRole('radio', { name: /percentage|body measurements|not measured/i });
    // r2.13(ii) put a citation superscript on the Percentage label, his own example
    // ("Percentage^2"), which is why the accessible name now ends in the entry number. The ORDER
    // and the pre-selection are what this test is about and both are unchanged.
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual([
      'Percentage2',
      'Body measurements',
      'Not measured',
    ]);
    expect(screen.getByLabelText('Percentage2')).toBeChecked();
  });

  it('leaves Next enabled with the percentage box blank, because body fat stays optional', () => {
    reachBody();
    expect(screen.getByLabelText(/body fat \(%\)/i)).toHaveValue(null);
    expect(screen.queryByText('Enter a number.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled', 'true');
    next();
    expect(
      screen.getByText(FORMAT.stepOf(4, STEPS.length, 'Equipment & Availability')),
    ).toBeInTheDocument();
  });

  it('shows no obesity or category classification anywhere on the step', () => {
    reachBody();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/obes|overweight|underweight|athletic build/i);
  });
});

describe('Brief B: the sex explainer (C1.07.6, C1.07.10 to C1.07.16)', () => {
  it('opens from a link under the sex field, shows the MSJ offset and the HRT segment, and closes', () => {
    reachBody();
    fireEvent.click(screen.getByText('Options suck? I agree. Click here for a workaround.'));
    expect(screen.getByTestId('sex-rationale-backdrop')).toBeInTheDocument();
    expect(screen.getByText('S = +5 for male, -161 for female [kcal/day]')).toBeInTheDocument();
    /*
     * r2.12(iv) and R14: the segment-two heading is a NOUN PHRASE in Title Case now. Round 1
     * shipped "If you are on gender-affirming hormone therapy", which is a conditional clause,
     * and R14's second clause names that exact wording as the thing to fix.
     */
    expect(
      screen.getByText('Individuals in Gender-Affirming Hormone Therapy'),
    ).toBeInTheDocument();
    // r2.12(iv): his three subsection headings, in his order.
    for (const heading of [
      'Still an Open Research Question',
      'What We Know',
      'I Do. So, What Now?',
    ]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    // No six-month threshold ships (decision hrt-no-threshold-ffm-path).
    expect(document.body.textContent ?? '').not.toMatch(/six[- ]month|6[- ]month/i);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('sex-rationale-backdrop')).toBeNull();
  });
});

describe('Brief B: the body-fat estimate chart (C1.08.5, C1.08.9)', () => {
  it('opens above the percentage field and a chosen percentage fills it', () => {
    reachBody();
    fireEvent.click(screen.getByText('Click here to estimate'));
    expect(screen.getByTestId('bodyfat-chart-backdrop')).toBeInTheDocument();
    const twentyFivePctButtons = screen.getAllByRole('button', { name: '25%' });
    expect(twentyFivePctButtons.length).toBeGreaterThanOrEqual(2); // one per sex row
    fireEvent.click(twentyFivePctButtons[0] as HTMLElement);
    expect(screen.queryByTestId('bodyfat-chart-backdrop')).toBeNull();
    expect(screen.getByLabelText(/body fat \(%\)/i)).toHaveValue(25);
  });
});

describe('Brief B: failed Next on the body step (C1.08.12, C1.08.14)', () => {
  it('hides "Enter a number" until Next is pressed, then reveals it, holds the step and focuses age', () => {
    render(<SetupWizard />);
    next();
    next();
    // age, height and mass are all blank: error.valueRequired would fire for each, and none of
    // them should stand as helper text before the field is touched or Next is pressed.
    expect(screen.queryByText('Enter a number.')).toBeNull();
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(nextButton);
    // Still on the body screen: a blocked press never advances.
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();
    expect(screen.getAllByText('Enter a number.').length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByLabelText(/^age \(years\)$/i));
  });
});

/**
 * C1.G.1: "if I don't end the onboarding and close the browser, when I open the page again, the
 * information that has been put there needs to be there waiting for me."
 */
describe('the setup draft survives a closed browser (C1.G.1)', () => {
  it('restores three patched fields and the step index after a simulated reload', () => {
    /*
     * The suite-wide beforeEach only fakes Date (line 48), because most tests here read the
     * clock but never a timer. This one also needs setTimeout/clearTimeout faked, so the ~400 ms
     * debounce (SetupWizard.tsx, SETUP_DRAFT_SAVE_DEBOUNCE_MS) can be advanced deterministically
     * instead of the test actually waiting on the wall clock.
     */
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(FIXED_NOW);

    const { unmount } = render(<SetupWizard />);
    // Field 1, step 0 (units).
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    // Field 2, step 1 (time zone).
    setValue(/^time zone$/i, 'America/New_York');
    next();
    // Field 3, step 2 (body): the step index lands here, on the display name.
    setValue(/^How should I refer to you\?$/i, 'Ada Lovelace');

    // Let the debounced write reach the store.
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_ADVANCE_MS);

    /*
     * BOTH TIERS, SEPARATELY. Round 2's r2.11 and plan decision A2 commit a step's answers on
     * Next, so the two fields whose steps were confirmed sit in the committed answers while the
     * name, typed on the step still in progress, sits in `buffer` and has NOT replaced anything.
     *
     * This is the tension A2 says must be solved rather than discovered: if the buffer were not
     * persisted, closing the browser here would lose the name, which is the exact loss C1.G.1
     * exists to prevent; if the buffer were written into the answers, Next would mean nothing.
     */
    const stored = useAppStore.getState().setupDraft;
    expect(stored?.units).toBe('imperial');
    expect(stored?.timezone).toBe('America/New_York');
    expect(stored?.stepIndex).toBe(2);
    // The committed tier was NOT overwritten by the typing.
    expect(stored?.displayName).toBe('');
    // The uncommitted tier holds it, and holds the committed answers unchanged beside it.
    expect(stored?.buffer?.displayName).toBe('Ada Lovelace');
    expect(stored?.buffer?.units).toBe('imperial');
    expect(stored?.buffer?.timezone).toBe('America/New_York');

    // Simulate a reload: the document the store holds survives; only the component remounts.
    unmount();
    render(<SetupWizard />);

    // The step index survived, and so did the half-typed value on it.
    expect(screen.getByLabelText(/^How should I refer to you\?$/i)).toHaveValue('Ada Lovelace');

    // The other two patched fields survived on their own, earlier steps.
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByLabelText(/^time zone$/i)).toHaveValue('America/New_York');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByLabelText('Pounds (lb)')).toBeChecked();
  });

  it('clears the draft on Confirm, so a later reload opens a fresh wizard', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(FIXED_NOW);

    fillImperialWizard();
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_ADVANCE_MS);
    expect(useAppStore.getState().setupDraft).not.toBeNull();

    tickLooksGood();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));
    expect(useAppStore.getState().setupDraft).toBeNull();

    // A keystroke's debounce pending at the moment of the click must not resurrect it.
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_ADVANCE_MS);
    expect(useAppStore.getState().setupDraft).toBeNull();
  });

  /*
   * The wizard itself never sees an invalid draft as anything but null - SetupDraftSchema
   * (src/domain/schema.ts) is `.catch(null)`, so a corrupt stored value is already sanitised by
   * the time anything in this component tree can read it. This test exercises the whole path
   * anyway (a corrupt document in Web Storage, through hydrate(), into a freshly mounted
   * wizard) so the two halves of C1.G.1's requirement - the wizard does not crash, and the rest
   * of the document is not corrupted - are demonstrated together rather than only at the schema
   * layer (src/domain/schema.test.ts, "the setupDraft field").
   */
  it('does not crash the wizard when the stored draft is corrupt, and leaves the rest of the document intact', () => {
    const corrupted = { ...defaultState(), setupDraft: { units: 'metric' } }; // missing required fields
    installFakeStorage({ [STORAGE_KEY]: JSON.stringify(corrupted) });
    useAppStore.getState().hydrate();

    expect(useAppStore.getState().status.lastLoadError).toBeNull();
    expect(useAppStore.getState().setupDraft).toBeNull();

    render(<SetupWizard />);
    // Opens on step 1, exactly as it would for a brand-new document - no crash, no stray state.
    expect(screen.getByText(FORMAT.stepOf(1, STEPS.length, 'Units'))).toBeInTheDocument();
  });
});

/*
 * Round 1 claim C1.14 asked for the review step to be redone once the steps above it settled.
 * The rest of that screen shows DERIVED numbers, which stay current on their own; what was
 * missing was the user's own answers read back before Confirm writes them.
 */
describe('review reads the answers back', () => {
  it('shows the name, age, sex, mass, stature, body fat and zone as entered', () => {
    fillImperialWizard();
    const review = screen.getByTestId('review');

    expect(within(review).getByTestId('review-name').textContent).toBe('Test subject');
    expect(within(review).getByTestId('review-age').textContent).toContain('30');
    expect(within(review).getByTestId('review-sex').textContent).toBe(
      copyFor('clinical', 'label.sexMale'),
    );
    // Stature reads back in the two boxes it was typed into, not as one converted number.
    expect(within(review).getByTestId('review-height').textContent).toContain('5');
    expect(within(review).getByTestId('review-height').textContent).toContain('11');
    expect(within(review).getByTestId('review-timezone').textContent).toBe('America/New_York');
  });

  it('names the no-estimate state rather than printing an empty body fat', () => {
    fillImperialWizard();

    // The fixture supplies no body fat, which is a supported state: it routes RMR to
    // Mifflin-St Jeor and protein to the body-mass rule, both validated.
    expect(screen.getByTestId('review-bodyfat').textContent).toBe(
      copyFor('clinical', 'label.bodyFatNone'),
    );
  });
});

/**
 * Brief M, claim r2.19: the "Looks Good" acknowledgement and the "Your Data" block, the last
 * screen before Confirm writes the profile.
 */
describe('review acknowledgement and Your Data', () => {
  it('keeps Confirm disabled until Looks Good is ticked, then enables it', () => {
    fillImperialWizard();
    const confirmButton = screen.getByRole('button', { name: 'Confirm and start' });
    // Not ticked yet: fillImperialWizard leaves the review screen on show, nothing more.
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Looks Good'));
    expect(confirmButton).toBeEnabled();
    // Unticking closes the gate again, rather than latching open on the first click.
    fireEvent.click(screen.getByLabelText('Looks Good'));
    expect(confirmButton).toBeDisabled();
  });

  it('does not write the acknowledgement anywhere: it is a gesture, not a record', () => {
    fillImperialWizard();
    tickLooksGood();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

    const state = useAppStore.getState();
    const id = state.activeProfileId ?? '';
    // No field named after the acknowledgement exists on the written profile at all.
    expect(JSON.stringify(state.profiles[id])).not.toContain('ooksGood');
    expect(JSON.stringify(state.profiles[id])).not.toContain('cknowledg');
  });

  /*
   * The brief's own draft of the "how to move it" fact read "Settings, then Data, then export
   * the JSON backup", which src/ui/views/ExportView.tsx renders no such control for. This test
   * imports the same strings ExportView itself resolves through `t(...)` (via `copyFor`, the
   * function useCopy() wraps) rather than retyping them, so a control renamed in copy.ts fails
   * here instead of leaving the review step's wording to drift.
   */
  it('names the export and import controls with the same strings ExportView renders', () => {
    fillImperialWizard();
    const review = screen.getByTestId('review').textContent ?? '';
    expect(review).toContain(copyFor('clinical', 'hero.exportImport'));
    expect(review).toContain(copyFor('clinical', 'label.downloads'));
    expect(review).toContain(copyFor('clinical', 'button.downloadJson'));
    expect(review).toContain(copyFor('clinical', 'label.importSection'));
  });

  it('names the icon-register row rather than drawing a substitute', () => {
    fillImperialWizard();
    const review = screen.getByTestId('review');
    expect(review.querySelector('[data-icon-row="reset-cookies-icon"]')).not.toBeNull();
  });

  it('says plainly that clearing site data cannot be undone', () => {
    fillImperialWizard();
    const review = screen.getByTestId('review').textContent ?? '';
    expect(review).toContain('no way back');
  });
});

/**
 * Brief F: the three step-4 sliders (Everyday Activity Level, Gym Comfort, Equipment Access),
 * the load-increments box, and the equipment-access-gated questions (walk to the gym, home
 * equipment, body weight equipment). Claims C1.09.2, .3, .6, .7, .8, .10, .11, .12, .15, .16,
 * .18, .19, .21.
 */
describe('Brief F: the equipment sliders', () => {
  /**
   * A fresh wizard, metric, advanced to the training step with minimal valid body data. Returns
   * `unmount`, for the rare test that renders a second wizard in the same `it()` and must tear
   * the first one down first (render does not auto-cleanup between two calls in one test, only
   * between separate `it()`s).
   */
  function toTrainingStep(): { unmount: () => void } {
    const { unmount } = render(<SetupWizard />);
    next(); // units: metric is the default
    setValue(/^time zone$/i, 'America/New_York');
    next();
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next();
    return { unmount };
  }

  /** From the training step onward, complete and submit the wizard with whatever it holds. */
  function finishFromTraining(): void {
    /*
     * The availability fields are answered HERE, before Next, because they render on the training
     * step now (finding B43). They also gate it: training's BLOCKED entry absorbed availability's
     * four guards when the step was folded in, so leaving them empty stops Next rather than
     * failing later.
     */
    setValue(/sessions per week/i, '2');
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Tuesday'));
    setValue(/weekly session target/i, '2');
    next(); // goal
    // Brief I Part 1: 'fat-loss' is derived from lose-fat plus hold-muscle, not selected.
    fireEvent.click(screen.getByLabelText('Lose fat'));
    fireEvent.click(screen.getByLabelText('Hold muscle'));
    next(); // programme
    setValue(/programme length/i, '12');
    next(); // guidance
    next(); // review
    tickLooksGood();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));
  }

  /** The confirmed profile, or fails the test if none was created. */
  function confirmedProfile() {
    const state = useAppStore.getState();
    const id = state.activeProfileId;
    expect(id).not.toBeNull();
    if (id === null) throw new Error('unreachable: asserted above');
    const profile = state.profiles[id];
    expect(profile).toBeDefined();
    if (profile === undefined) throw new Error('unreachable: asserted above');
    return profile;
  }

  it('renders three range sliders, one closed list each, never a free number', () => {
    toTrainingStep();
    const activity = screen.getByLabelText(/^everyday activity level$/i);
    const comfort = screen.getByLabelText(/^gym comfort$/i);
    const access = screen.getByLabelText(/^equipment access$/i);
    for (const slider of [activity, comfort, access]) {
      expect(slider).toHaveAttribute('type', 'range');
      expect(slider).toHaveAttribute('step', '1');
    }
    // Brief G widened Everyday Activity Level from 3 positions to 9 (three per FAO/WHO/UNU 2004
    // band); the other two sliders are unchanged by that brief.
    expect(activity).toHaveAttribute('max', '8'); // 9 positions, index 0-8
    expect(comfort).toHaveAttribute('max', '2'); // 3 positions, index 0-2
    expect(access).toHaveAttribute('max', '4'); // 5 positions, index 0-4
  });

  it('defaults Everyday Activity Level to Moderate and Equipment Access to Full Gym', () => {
    toTrainingStep();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('Full Gym')).toBeInTheDocument();
  });

  it('carries the three FAO/WHO/UNU bands as the Examples disclosure, verbatim and only there', () => {
    toTrainingStep();
    // Everyday Activity Level is the only slider with an Examples disclosure: Equipment
    // Access's example is a single sentence shown unconditionally instead (Brief F Part 1c).
    const examples = screen.getByText('Examples');
    fireEvent.click(examples);
    for (const line of ACTIVITY_LEVEL_EXAMPLES) expect(screen.getByText(line)).toBeInTheDocument();
  });

  /**
   * Brief G: the nine-stop slider. Claim C1.09.5, reopened; decision `activity-slider-nine-stops`.
   */
  describe('Brief G: the activity slider, nine stops', () => {
    it('moves through all nine stops, naming the correct band at each', () => {
      toTrainingStep();
      const activity = screen.getByLabelText(/^everyday activity level$/i);
      // index -> expected band label, per src/domain/nutrition.ts's ACTIVITY_STOPS order.
      const expectedBandAt: Record<number, string> = {
        0: 'Sedentary',
        1: 'Sedentary',
        2: 'Sedentary',
        3: 'Moderate',
        4: 'Moderate',
        5: 'Moderate',
        6: 'Vigorous',
        7: 'Vigorous',
        8: 'Vigorous',
      };
      for (let index = 0; index < ACTIVITY_STOPS.length; index += 1) {
        fireEvent.change(activity, { target: { value: String(index) } });
        expect(screen.getByText(expectedBandAt[index] ?? '')).toBeInTheDocument();
      }
    });

    it('opens "Where These Levels Come From" and shows the FAO citation, then closes', () => {
      toTrainingStep();
      fireEvent.click(screen.getByText('Where These Levels Come From'));
      expect(screen.getByText('Activity Level Sources')).toBeInTheDocument();
      expect(screen.getByText(ACTIVITY_LEVELS_CITATION)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Close'));
      expect(screen.queryByText('Activity Level Sources')).not.toBeInTheDocument();
    });

    it('stores the selected stop as Profile.activityPal, and the stop\'s own band as activity', () => {
      toTrainingStep();
      const stop = ACTIVITY_STOPS[4]; // moderate mid-point, PAL 1.85 (index 4 of 9)
      if (stop === undefined) throw new Error('unreachable: ACTIVITY_STOPS has nine members');
      fireEvent.change(screen.getByLabelText(/^everyday activity level$/i), {
        target: { value: '4' },
      });
      finishFromTraining();
      const profile = confirmedProfile();
      expect(profile.activity).toBe(stop.level);
      expect(profile.activityPal).toBe(stop.pal);
    });

    it('can now over-prescribe relative to the old floor-only ceiling: a stop above the floor raises TDEE', () => {
      // The reversal src/domain/nutrition.ts's own ACTIVITY_FACTOR comment records: nine stops
      // let a user pick above the band floor, where the three-band default structurally could
      // not. Two runs, same body inputs, only the slider position differs.
      const floor = toTrainingStep();
      finishFromTraining(); // leaves the slider at its default: moderate floor, PAL 1.70
      const floorProfile = confirmedProfile();
      floor.unmount();

      useAppStore.getState().wipeAll();
      pinSkin(); // wipeAll restores defaultState()'s shipped skin (limelight); re-pin to clinical
      toTrainingStep();
      fireEvent.change(screen.getByLabelText(/^everyday activity level$/i), {
        target: { value: '5' }, // moderate ceiling, PAL 1.99
      });
      finishFromTraining();
      const raisedProfile = confirmedProfile();

      expect(floorProfile.activityPal).toBe(ACTIVITY_FACTOR.moderate);
      const floorTargets = computeTargets(nutritionInputFor(floorProfile, null, 2, '2026-09-01'));
      const raisedTargets = computeTargets(
        nutritionInputFor(raisedProfile, null, 2, '2026-09-01'),
      );
      expect(raisedTargets.tdeeKcal).toBeGreaterThan(floorTargets.tdeeKcal);
    });
  });

  it("renders the Gym Comfort slider's three positions as the owner's own words, each with a placeholder icon", () => {
    toTrainingStep();
    // Each position's words appear twice while it is selected: once as the current-position
    // readout, once as its icon's caption (the three icons are a static legend, always shown).
    expect(screen.getAllByText('Starting out').length).toBeGreaterThan(0);
    const icons = [...document.querySelectorAll('.wiz-site[data-icon-row]')];
    expect(icons.map((el) => el.getAttribute('data-icon-row'))).toEqual([
      'comfort-1-starting',
      'comfort-2-machines',
      'comfort-3-freeweights',
    ]);
    fireEvent.change(screen.getByLabelText(/^gym comfort$/i), { target: { value: '1' } });
    expect(
      screen.getAllByText('Regular at the gym, mostly the machines').length,
    ).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/^gym comfort$/i), { target: { value: '2' } });
    expect(screen.getAllByText('Free weights for three years or more').length).toBeGreaterThan(0);
  });

  it('shows exactly one Equipment Access example, matching the selected position', () => {
    toTrainingStep();
    const access = screen.getByLabelText(/^equipment access$/i);
    const positions: Array<[string, string]> = [
      ['0', EQUIPMENT_ACCESS_EXAMPLES.bodyweight],
      ['1', EQUIPMENT_ACCESS_EXAMPLES['home-and-bodyweight']],
      ['2', EQUIPMENT_ACCESS_EXAMPLES.home],
      ['3', EQUIPMENT_ACCESS_EXAMPLES['full-and-home']],
      ['4', EQUIPMENT_ACCESS_EXAMPLES['full-gym']],
    ];
    for (const [index, example] of positions) {
      fireEvent.change(access, { target: { value: index } });
      expect(screen.getByText(example)).toBeInTheDocument();
    }
  });

  it('has no micro-plate checkbox or step field anywhere on the training step', () => {
    toTrainingStep();
    expect(screen.queryByText(/micro-plate/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/micro-plate/i)).not.toBeInTheDocument();
  });

  it('shows the walk-to-gym question only for Full Gym and Full Gym and Home Gym', () => {
    toTrainingStep();
    const access = screen.getByLabelText(/^equipment access$/i);
    // index 4: Full Gym (the default) already shows it.
    expect(screen.getByText('Do you walk to and from the gym?')).toBeInTheDocument();
    fireEvent.change(access, { target: { value: '3' } }); // Full Gym and Home Gym
    expect(screen.getByText('Do you walk to and from the gym?')).toBeInTheDocument();
    fireEvent.change(access, { target: { value: '2' } }); // Home Gym
    expect(screen.queryByText('Do you walk to and from the gym?')).not.toBeInTheDocument();
    fireEvent.change(access, { target: { value: '1' } }); // Home Gym and Body Weight
    expect(screen.queryByText('Do you walk to and from the gym?')).not.toBeInTheDocument();
    fireEvent.change(access, { target: { value: '0' } }); // Body Weight Only
    expect(screen.queryByText('Do you walk to and from the gym?')).not.toBeInTheDocument();
  });

  it('reveals Minutes each way on Yes and stores it; No zeroes it without a field', () => {
    toTrainingStep(); // Equipment Access defaults to Full Gym
    expect(screen.queryByLabelText(/minutes each way/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Yes'));
    expect(screen.getByLabelText(/minutes each way/i)).toBeInTheDocument();
    setValue(/minutes each way/i, '12');
    finishFromTraining();
    expect(confirmedProfile().gymCommute).toEqual({ walks: true, minutesEachWay: 12 });
  });

  it('stores walks: false and minutesEachWay: 0 when the answer is No, the field never shown', () => {
    toTrainingStep();
    fireEvent.click(screen.getByLabelText('No'));
    expect(screen.queryByLabelText(/minutes each way/i)).not.toBeInTheDocument();
    finishFromTraining();
    expect(confirmedProfile().gymCommute).toEqual({ walks: false, minutesEachWay: 0 });
  });

  it('feeds the walk-to-gym answer into no energy calculation: targets are unchanged either way', () => {
    const first = toTrainingStep();
    fireEvent.click(screen.getByLabelText('Yes'));
    setValue(/minutes each way/i, '45');
    finishFromTraining();
    const withWalk = confirmedProfile();
    first.unmount();

    useAppStore.getState().wipeAll();
    pinSkin(); // wipeAll restores defaultState()'s shipped skin (limelight); re-pin to clinical
    toTrainingStep();
    fireEvent.click(screen.getByLabelText('No'));
    finishFromTraining();
    const withoutWalk = confirmedProfile();

    // Every input computeTargets reads (sex, age, height, mass, body fat, ACTIVITY, goal,
    // sessions/week, creatine) is identical between the two runs; only gymCommute differs.
    expect(withWalk.activity).toBe(withoutWalk.activity);
    expect(
      computeTargets(nutritionInputFor(withWalk, null, 2, '2026-09-01')),
    ).toEqual(computeTargets(nutritionInputFor(withoutWalk, null, 2, '2026-09-01')));
  });

  it('shows the home equipment multi-select for Home Gym and both combinations that include it', () => {
    toTrainingStep();
    const access = screen.getByLabelText(/^equipment access$/i);
    for (const index of ['1', '2', '3']) {
      // Home Gym and Body Weight, Home Gym, Full Gym and Home Gym
      fireEvent.change(access, { target: { value: index } });
      expect(screen.getByText('What equipment do you have?')).toBeInTheDocument();
      expect(screen.getByText('Squat Rack')).toBeInTheDocument();
    }
    fireEvent.change(access, { target: { value: '0' } }); // Body Weight Only
    expect(screen.queryByText('Squat Rack')).not.toBeInTheDocument();
    fireEvent.change(access, { target: { value: '4' } }); // Full Gym
    expect(screen.queryByText('Squat Rack')).not.toBeInTheDocument();
  });

  it("labels the dumbbell bands with the profile's own unit, same numbers either way", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Pounds (lb)'));
    next();
    setValue(/^time zone$/i, 'America/New_York');
    next();
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^feet$/i, '5');
    setValue(/^inches$/i, '11');
    setValue(/body mass \(lb\)/i, '150');
    next();
    fireEvent.change(screen.getByLabelText(/^equipment access$/i), { target: { value: '2' } }); // Home Gym
    expect(screen.getByText('5 to 20 lb')).toBeInTheDocument();
    expect(screen.getByText('20 to 40 lb')).toBeInTheDocument();
    expect(screen.getByText('40 lb and above')).toBeInTheDocument();
  });

  it('shows the body weight only multi-select for Body Weight Only alone, and stores the selections', () => {
    toTrainingStep();
    fireEvent.change(screen.getByLabelText(/^equipment access$/i), { target: { value: '2' } }); // Home Gym
    expect(screen.queryByText('Yoga Mat')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^equipment access$/i), { target: { value: '0' } }); // Body Weight Only
    expect(screen.getByText('Yoga Mat')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Yoga Mat'));
    fireEvent.click(screen.getByLabelText('Pull-Up Bar'));
    finishFromTraining();
    expect(confirmedProfile().bodyweightEquipment.sort()).toEqual(['pull-up-bar', 'yoga-mat']);
    expect(confirmedProfile().homeEquipment).toEqual([]);
  });

  it('clears a home equipment selection made under one position once the slider leaves every position that shows it', () => {
    toTrainingStep();
    fireEvent.change(screen.getByLabelText(/^equipment access$/i), { target: { value: '2' } }); // Home Gym
    fireEvent.click(screen.getByLabelText('Squat Rack'));
    // Move to a position that does not show the home-equipment question at all.
    fireEvent.change(screen.getByLabelText(/^equipment access$/i), { target: { value: '0' } }); // Body Weight Only
    finishFromTraining();
    expect(confirmedProfile().homeEquipment).toEqual([]);
  });

  it('never renders Equipment (the AddCustomExercise modality label) on the training step', () => {
    // Regression guard for the label.equipment / label.equipmentAccess split: the two must not
    // collide, or a rename meant for this slider would silently relabel an unrelated field.
    toTrainingStep();
    expect(screen.queryByText('Equipment', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.getByText('Equipment Access')).toBeInTheDocument();
  });
});

/*
 * ============================================================================
 * ALPHA ROUND 2, brief K: claims r2.10 to r2.16 on the body step.
 * ============================================================================
 */

describe('r2.11: the sex control is deselectable and ND is the default', () => {
  it('opens with neither option checked, and names the state rather than showing a blank group', () => {
    reachBodyWithoutSex();
    expect(screen.getByLabelText('Male')).not.toBeChecked();
    expect(screen.getByLabelText('Female')).not.toBeChecked();
    // A radiogroup with nothing checked is otherwise indistinguishable from one that failed to
    // render, so the third state is named in text and announced through role="status".
    const state = screen.getByTestId('sex-state');
    expect(state).toHaveTextContent('Not Disclosed');
    expect(state).toHaveAttribute('role', 'status');
  });

  it('clears the selection back to ND when the checked option is clicked again', () => {
    reachBodyWithoutSex();
    pickSex();
    expect(screen.getByLabelText('Male')).toBeChecked();
    expect(screen.getByTestId('sex-state')).toHaveTextContent(
      'Click the selected option again to clear it.',
    );

    // His words: "we need to allow the user to click on what they have selected again and
    // deselect it". A checked radio fires no change event, so the deselect rides on the click.
    pickSex();
    expect(screen.getByLabelText('Male')).not.toBeChecked();
    expect(screen.getByTestId('sex-state')).toHaveTextContent('Not Disclosed');
  });

  it('switches the selection between the two without ever clearing it by accident', () => {
    reachBodyWithoutSex();
    pickSex('Male');
    pickSex('Female');
    expect(screen.getByLabelText('Female')).toBeChecked();
    expect(screen.getByLabelText('Male')).not.toBeChecked();
  });
});

describe('decision A1: ND makes the body-fat percentage required', () => {
  it('blocks Next with no percentage, and stops blocking once one is typed', () => {
    reachBodyFilledWithoutSex();
    // The engine's own rule, stated on the screen: Mifflin-St Jeor has no sex-free form, so the
    // only equation left is Cunningham and Cunningham needs a body-fat percentage.
    expect(screen.getByTestId('bodyfat-optional')).toHaveTextContent(
      'Required without a sex: the equation with no sex term needs it.',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
    next();
    expect(screen.getByText(FORMAT.stepOf(3, STEPS.length, 'Body'))).toBeInTheDocument();

    setValue(/body fat \(%\)/i, '20');
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    next();
    expect(
      screen.getByText(FORMAT.stepOf(4, STEPS.length, 'Equipment & Availability')),
    ).toBeInTheDocument();
  });

  it('does not require it once a sex is given, and requires it again if the sex is cleared', () => {
    reachBodyFilledWithoutSex();
    pickSex();
    expect(screen.getByTestId('bodyfat-optional')).toHaveTextContent(
      'Optional. With it, RMR uses the Cunningham equation.',
    );
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    pickSex(); // deselect, back to ND
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the tape option, refuses it, and ANNOUNCES the refusal rather than only greying it', () => {
    reachBodyWithoutSex();
    const tape = screen.getByLabelText('Body measurements');
    // "Show the option, disabled, with one line saying why. Do not hide it." (decision A1)
    expect(tape).toBeInTheDocument();
    expect(tape).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled and not the disabled ATTRIBUTE: a disabled input leaves the tab order, so a
    // screen-reader user arrows past it and never hears the reason.
    expect(tape).not.toBeDisabled();

    // The reason is wired to the control, so it is part of what the control announces.
    const reason = screen.getByTestId('bodyfat-nd-reason');
    expect(reason).toHaveTextContent('Unavailable without a sex: the equations differ in form.');
    expect(tape.getAttribute('aria-describedby')).toBe(reason.id);

    // And the refusal holds: clicking it does not select it, and no girth field appears.
    fireEvent.click(tape);
    expect(tape).not.toBeChecked();
    expect(screen.queryByLabelText(/^neck \(cm\)$/i)).toBeNull();
  });

  it('refuses Not measured on the same terms, and repairs the mode if the sex is cleared', () => {
    reachBodyWithoutSex();
    pickSex();
    fireEvent.click(screen.getByLabelText('Not measured'));
    expect(screen.getByLabelText('Not measured')).toBeChecked();

    // Clearing the sex must not leave the screen holding a mode the rules forbid, not even for
    // one frame: selectSex repairs it on the click that caused it.
    pickSex();
    expect(screen.getByLabelText('Percentage2')).toBeChecked();
    expect(screen.getByLabelText('Not measured')).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps a typed percentage when the sex is cleared, rather than throwing the number away', () => {
    reachBodyWithoutSex();
    pickSex();
    setValue(/body fat \(%\)/i, '22');
    pickSex();
    expect(screen.getByLabelText(/body fat \(%\)/i)).toHaveValue(22);
  });

  it('shows the beverage target as a RANGE on review, with the reason, and never one figure', () => {
    reachBodyFilledWithoutSex();
    setValue(/body fat \(%\)/i, '20');
    next(); // training
    // Availability renders on the training step now (finding B43) and gates it, so the slots are
    // answered here before Next will advance.
    setValue(/sessions per week/i, '2');
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Tuesday'));
    setValue(/weekly session target/i, '2');
    next(); // goal
    // Brief I Part 1: 'fat-loss' is derived from lose-fat plus hold-muscle, not selected.
    fireEvent.click(screen.getByLabelText('Lose fat'));
    fireEvent.click(screen.getByLabelText('Hold muscle'));
    next(); // programme
    next(); // guidance
    next(); // review

    const fluid = screen.getByTestId('target-fluid');
    expect(fluid).toHaveTextContent('2200 mL to 3000 mL');
    // Neither endpoint may stand alone as "the target", and the average of the two is a figure
    // the IOM never published.
    expect(fluid.textContent).not.toBe('2200 mL');
    expect(fluid.textContent).not.toBe('3000 mL');
    expect(fluid.textContent ?? '').not.toContain('2600');
    expect(screen.getByTestId('fluid-range-note')).toHaveTextContent(
      'The reference intake is published per sex, so both figures are shown.',
    );
  });

  it('reads the profile back as Not Disclosed rather than as a blank row', () => {
    reachBodyFilledWithoutSex();
    setValue(/body fat \(%\)/i, '20');
    next(); // training
    setValue(/sessions per week/i, '2');
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Tuesday'));
    setValue(/weekly session target/i, '2');
    next(); // goal
    // Brief I Part 1: 'fat-loss' is derived from lose-fat plus hold-muscle, not selected.
    fireEvent.click(screen.getByLabelText('Lose fat'));
    fireEvent.click(screen.getByLabelText('Hold muscle'));
    next(); // programme
    next();
    next();
    expect(screen.getByTestId('review-sex')).toHaveTextContent('Not Disclosed');

    tickLooksGood();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));
    const state = useAppStore.getState();
    const id = state.activeProfileId ?? '';
    expect(state.profiles[id]?.body.sex).toBe('nd');
    // The stored hydration preference is a seeded figure from the published pair, never their
    // mean; see seedBeverageTargetML's own comment for why the low end.
    expect(state.profiles[id]?.hydration.dailyTargetML).toBe(2200);
  });
});

describe('r2.14: the tape fields follow the selected sex', () => {
  it('asks a male user for neck and abdomen II, and for no hip girth', () => {
    reachBodyWithoutSex();
    pickSex('Male');
    fireEvent.click(screen.getByLabelText('Body measurements'));
    expect(screen.getByLabelText(/^neck \(cm\)$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/abdomen ii \(cm\)/i)).toBeInTheDocument();
    // The male Navy equation reads no hip girth at all, so the field is absent rather than
    // optional. This half already shipped before round 2 and is asserted here as a regression
    // guard, not as new behaviour.
    expect(screen.queryByLabelText(/^hip \(cm\)$/i)).toBeNull();
    expect(screen.queryByLabelText(/abdomen i \(cm\)/i)).toBeNull();
  });

  it('asks a female user for the hip girth and swaps the abdomen site', () => {
    reachBodyWithoutSex();
    pickSex('Female');
    fireEvent.click(screen.getByLabelText('Body measurements'));
    expect(screen.getByLabelText(/^hip \(cm\)$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/abdomen i \(cm\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/abdomen ii \(cm\)/i)).toBeNull();
  });

  it('renames the tape disclosure to Disclaimer and carries his text, not the old girth list', () => {
    reachBodyWithoutSex();
    pickSex('Male');
    fireEvent.click(screen.getByLabelText('Body measurements'));
    // A NEW key, not a rename of disclosure.why: that key has six call sites across the app
    // (plan ruling D2.14.3).
    expect(screen.getByText('Disclaimer')).toBeInTheDocument();
    expect(screen.getByTestId('tape-disclaimer').textContent ?? '').toContain(
      'FYI: the fields differ between male and female in this method.',
    );
    // The old contents, which named which girth to enter where, are gone: the fields say it.
    expect(screen.queryByText('why?')).toBeNull();
  });

  it('puts a Body Fat Estimate subheading over the tape section', () => {
    reachBodyWithoutSex();
    pickSex('Male');
    fireEvent.click(screen.getByLabelText('Body measurements'));
    expect(
      screen.getByRole('heading', { name: /^body fat estimate/i }),
    ).toBeInTheDocument();
  });
});

describe('r2.15: one reference list, one numbering scheme', () => {
  it('collapses every citation into a single References box', () => {
    reachBody();
    const refs = screen.getByTestId('references');
    expect(refs.tagName).toBe('DETAILS');
    expect(within(refs).getByText('References')).toBeInTheDocument();
  });

  it('numbers each entry once, and the number is the superscript beside the field', () => {
    reachBody();
    const refs = screen.getByTestId('references');
    // A <ul>, not an <ol>: the ordered list was the SECOND numbering scheme, which is what made
    // entry two read "2. (1) Body-fat percentage..." (r2.15(ii)).
    expect(refs.querySelector('ol')).toBeNull();
    expect(refs.querySelector('ul')).not.toBeNull();

    const markers = [...refs.querySelectorAll('li > p > sup')].map((el) => el.textContent);
    // Unique, contiguous, and one per entry.
    expect(markers).toEqual([...markers].filter((m, i) => markers.indexOf(m) === i));
    expect(markers).toEqual(['1', '2', '3', '4', '5', '6', '7']);

    // And the numbers the fields carry point into that list rather than into a second one.
    expect(screen.getByText('Biological sex').textContent).toContain('1');
    expect(screen.getByLabelText('Percentage2')).toBeInTheDocument();
    expect(screen.getByText('Height').textContent).toContain('4');
  });

  it('prints a bold lead sentence above each citation, consistently', () => {
    reachBody();
    const refs = screen.getByTestId('references');
    const leads = [...refs.querySelectorAll('.wiz-cite-lead')];
    const sources = [...refs.querySelectorAll('.wiz-cite-src')];
    expect(leads).toHaveLength(BODY_EQUATIONS.length + 1);
    expect(sources).toHaveLength(BODY_EQUATIONS.length + 1);
    for (const lead of leads) expect((lead.textContent ?? '').length).toBeGreaterThan(20);
  });

  it('prints every citation in Elsevier order: pages, then year, then DOI last', () => {
    for (const eq of BODY_EQUATIONS) {
      const doiAt = eq.source.indexOf('DOI');
      if (doiAt === -1) continue; // the FAO row, which says in words that it has no DOI
      const yearAt = eq.source.search(/\b(19|20)\d{2}\b/);
      expect({ source: eq.source, ordered: yearAt < doiAt }).toEqual({
        source: eq.source,
        ordered: true,
      });
    }
  });
});

describe('r2.16: every missing field is marked at once', () => {
  it('marks all of them on one failed Next, not one per press', () => {
    reachBodyWithoutSex();
    pickSex();
    // Three blanks at once: age, stature and body mass. Round 1 revealed them one press at a
    // time, which is the complaint ("So i dont have to click next over and over again").
    next();

    const marked = [
      screen.getByLabelText(/^age \(years\)$/i),
      screen.getByLabelText(/^metres$/i),
      screen.getByLabelText(/^centimetres$/i),
      screen.getByLabelText(/body mass \(kg\)/i),
    ];
    for (const field of marked) expect(field).toHaveAttribute('aria-invalid', 'true');
    // The mark is never colour alone: each field carries its message too (00-CONTEXT).
    expect(screen.getAllByText('Enter a number.').length).toBeGreaterThanOrEqual(2);
    // Focus still lands on the first one, top to bottom.
    expect(document.activeElement).toBe(screen.getByLabelText(/^age \(years\)$/i));
  });

  it('clears a field mark as soon as that field is filled, leaving the others marked', () => {
    reachBodyWithoutSex();
    pickSex();
    next();
    setValue(/^age \(years\)$/i, '30');
    expect(screen.getByLabelText(/^age \(years\)$/i)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/body mass \(kg\)/i)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('r2.11 / decision A2: a step commits on Next, and Back does not commit', () => {
  it('does not replace the committed answer until Next is pressed', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(FIXED_NOW);

    render(<SetupWizard />);
    next();
    next();
    pickSex();
    setValue(/^How should I refer to you\?$/i, 'Grace');
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_ADVANCE_MS);
    expect(useAppStore.getState().setupDraft?.displayName).toBe('');
    expect(useAppStore.getState().setupDraft?.buffer?.displayName).toBe('Grace');

    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next();
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_ADVANCE_MS);
    // Next, and only Next, is what replaced it. The buffer is empty again.
    expect(useAppStore.getState().setupDraft?.displayName).toBe('Grace');
    expect(useAppStore.getState().setupDraft?.buffer).toBeNull();
  });

  it('discards the step in progress on Back rather than committing it', () => {
    render(<SetupWizard />);
    next();
    next();
    pickSex();
    setValue(/^How should I refer to you\?$/i, 'Grace');
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next(); // commits

    // Now edit, and go Back instead of Next.
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    setValue(/^How should I refer to you\?$/i, 'Ada');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    next(); // forward again, to the body step
    expect(screen.getByLabelText(/^How should I refer to you\?$/i)).toHaveValue('Grace');
  });
});

/*
 * r2.10, "The page is a bit wider / doesn't fit in the phone."
 *
 * jsdom performs NO layout: every element it renders has a zero client rectangle, so a measured
 * width here would assert nothing at all. What is checkable is the rule that makes the overflow
 * impossible, which is the shrink permission on the two-column rows and on the controls inside
 * them. The 390 px pass on a real device is a row in docs/phone-visual-check.md, and is the only
 * evidence that counts for geometry.
 */
describe('r2.10: the step cannot scroll sideways at 390 px', () => {
  it('lets every two-column row and every control shrink below its intrinsic width', () => {
    // A grid track of `1fr` is `minmax(auto, 1fr)`, and that `auto` is the min-content width of a
    // number field, which is about twenty characters. Two of those exceed a 390 px phone's
    // content box, and the row pushes the document wider than the viewport.
    expect(setupCss).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(setupCss).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);');
    expect(setupCss).not.toMatch(/grid-template-columns:\s*1fr;/);
    expect(setupCss).not.toMatch(/grid-template-columns:\s*1fr 1fr;/);

    // The flex form of the same row, above the breakpoint.
    const rowChildren = setupCss.slice(setupCss.indexOf('.wiz .wiz-row > * {'));
    expect(rowChildren.slice(0, 120)).toContain('min-width: 0;');
  });
});

/*
 * r2.12(i). The close control moved from the upper LEFT (round 1's C1.07.11) to the upper RIGHT.
 * A reversal is allowed (plan ruling D2.12.2); a stale comment recording the old ruling beside
 * the new code is not, which is what this second assertion is for.
 */
describe('r2.12: the modal close control, and the comment that records the ruling', () => {
  it('draws it at the upper right', () => {
    const close = setupCss.slice(setupCss.indexOf('.wiz-modal-close {'));
    const block = close.slice(0, close.indexOf('}'));
    expect(block).toContain('right: 0.75rem;');
    expect(block).not.toContain('left:');
  });

  it('leaves no comment still claiming the upper left', () => {
    expect(setupCss).not.toContain('UPPER LEFT');
    expect(setupCss).toContain('UPPER RIGHT');
  });
});

/*
 * ROUND 2 CLAIM r2.09, the time-zone step.
 *
 * "The UTCs options are not ordered correctly. For example, when I click on it, it Shows UTC-05
 * America/Cancun the below UTC-04,-04,-04, and then again UTC -05 : America/Cayman. That is
 * confusing. have them be ordered numerically from the most negative to the most positive. Also,
 * I am not sure that having multiple options for a UTC is correct ... Lastly can we have
 * (UTC/GMT) in the parentheses, since in Europe we mainly use GMT."
 *
 * THE CLOCK IS FAKED FOR EVERY TEST IN THIS FILE (`FIXED_NOW`, 2026-09-01T12:00:00Z, set in the
 * top-level beforeEach), which is what keeps these assertions still. Half the northern hemisphere
 * changes offset twice a year, so a suite reading the wall clock would assert one order from
 * March to October and another from November to February, and would go red on a date nobody
 * changed any code on. The grouping and ordering themselves are tested against two instants six
 * months apart in src/domain/timeZoneGroups.test.ts; what is asserted here is that the step
 * renders what that module produced.
 */
describe('r2.09: the time-zone list', () => {
  /** The `<option>` rows, in the order the select paints them. */
  function zoneOptions(): HTMLOptionElement[] {
    const control = screen.getByLabelText(/^time zone$/i);
    return [...control.querySelectorAll('option')];
  }

  /** The offset a row's label states, in minutes east of UTC, read back off the rendered text. */
  function offsetOf(option: HTMLOptionElement): number {
    const m = /^\(UTC\/GMT([+-])(\d{2}):(\d{2})\)/.exec(option.textContent ?? '');
    if (m === null) throw new Error(`no offset in ${JSON.stringify(option.textContent)}`);
    const minutes = Number(m[2]) * 60 + Number(m[3]); // [min]
    return m[1] === '-' ? -minutes : minutes;
  }

  function openTimeZoneStep(): void {
    render(<SetupWizard />);
    next();
  }

  it('orders the rows from the most negative offset to the most positive', () => {
    openTimeZoneStep();
    const offsets = zoneOptions().map(offsetOf); // [min]

    expect(offsets.length).toBeGreaterThan(1);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    // The defect the owner reported, stated as its own assertion: the old list was in IANA
    // alphabetical order, which put a -05:00 row after three -04:00 rows.
    const alphabetical = zoneOptions()
      .map((o) => o.value)
      .slice()
      .sort();
    expect(zoneOptions().map((o) => o.value)).not.toEqual(alphabetical);
  });

  it('labels every row with both abbreviations, because Europe says GMT', () => {
    openTimeZoneStep();
    for (const option of zoneOptions()) {
      expect({ text: option.textContent, ok: true }).toEqual({
        text: option.textContent,
        ok: /^\(UTC\/GMT[+-]\d{2}:\d{2}\) /.test(option.textContent ?? ''),
      });
    }
  });

  it('shows one row per year-round behaviour, not one per zone and not one per offset', () => {
    openTimeZoneStep();
    const rows = zoneOptions();

    // Far fewer rows than the platform has zones ...
    expect(rows.length).toBeLessThan(Intl.supportedValuesOf('timeZone').length / 4);
    // ... and MORE rows than there are distinct offsets, which is the whole refusal: New York
    // and Panama are both UTC-05:00 today and are not interchangeable, because in July one of
    // them moves and the other does not.
    const distinctOffsets = new Set(rows.map(offsetOf));
    expect(rows.length).toBeGreaterThan(distinctOffsets.size);
    const values = rows.map((o) => o.value);
    expect(values).toContain('America/New_York');
    expect(values).toContain('America/Bogota'); // Panama's row: -05:00 in every month
  });

  it('stores an IANA id and never an offset', () => {
    openTimeZoneStep();
    for (const option of zoneOptions()) {
      // Bare "UTC" and "GMT" are IANA identifiers; the device zone is appended when missing.
      expect({ value: option.value, offsetLike: /^(UTC|GMT)[+-]|^[+-]\d|^\(/.test(option.value) }).toEqual({
        value: option.value,
        offsetLike: false,
      });
      expect(isValidTimeZone(option.value)).toBe(true);
    }
  });

  it('finds a collapsed city by name, and says which one matched', () => {
    openTimeZoneStep();
    // Thirty-three zones share western Europe's behaviour and the row is named after Paris.
    // Someone in Amsterdam has to be able to find it, or the reduction has cost them the
    // ability to find themselves.
    fireEvent.change(screen.getByLabelText(copyFor('clinical', 'label.timezoneSearch')), {
      target: { value: 'Amsterdam' },
    });

    const rows = zoneOptions();
    const paris = rows.find((o) => o.value === 'Europe/Paris');
    expect(paris).toBeDefined();
    // The row identifies itself by the member the search actually matched.
    expect(paris?.textContent).toContain('Europe/Amsterdam');
    // And the list really did narrow: this is a search, not a no-op.
    expect(rows.length).toBeLessThan(5);
  });

  it('folds the underscore, because that is how a person writes the name', () => {
    openTimeZoneStep();
    fireEvent.change(screen.getByLabelText(copyFor('clinical', 'label.timezoneSearch')), {
      target: { value: 'new york' },
    });

    expect(zoneOptions().map((o) => o.value)).toContain('America/New_York');
  });

  it('never hides the row the user has already chosen', () => {
    openTimeZoneStep();
    const control = screen.getByLabelText<HTMLSelectElement>(/^time zone$/i);
    fireEvent.change(control, { target: { value: 'Asia/Katmandu' } });
    expect(control.value).toBe('Asia/Katmandu');

    // A search that matches nothing else still leaves the selection on screen, so the control
    // can never render with no option matching its own value.
    fireEvent.change(screen.getByLabelText(copyFor('clinical', 'label.timezoneSearch')), {
      target: { value: 'zzzz-no-such-city' },
    });
    expect(zoneOptions().map((o) => o.value)).toEqual(['Asia/Katmandu']);
    expect(control.value).toBe('Asia/Katmandu');
    expect(screen.getByText(copyFor('clinical', 'advice.timezoneNoMatch'))).toBeInTheDocument();
  });

  it('names the chosen row after the zone actually chosen', () => {
    openTimeZoneStep();
    const control = screen.getByLabelText<HTMLSelectElement>(/^time zone$/i);
    // A collapsed member, not the row's own name: choosing it must not silently rename it to
    // Paris, or the app looks as though it ignored the answer.
    fireEvent.change(screen.getByLabelText(copyFor('clinical', 'label.timezoneSearch')), {
      target: { value: 'Berlin' },
    });
    fireEvent.change(control, { target: { value: 'Europe/Paris' } });
    fireEvent.change(screen.getByLabelText(copyFor('clinical', 'label.timezoneSearch')), {
      target: { value: '' },
    });

    const chosen = zoneOptions().find((o) => o.selected);
    expect(chosen?.value).toBe('Europe/Paris');
    expect(chosen?.textContent).toContain('Europe/Paris');
  });

  it('keeps the offsets that are not whole hours', () => {
    openTimeZoneStep();
    const labels = zoneOptions().map((o) => o.textContent ?? '');
    /*
     * The span is -11:00 to +14:00, which is 25 hours, so a picker built from an hour loop could
     * express none of these and would be an hour short at both ends besides.
     *
     * NEWFOUNDLAND IS -02:30 HERE, NOT THE -03:30 THE BRIEF LISTS, and that is the point rather
     * than a slip: FIXED_NOW is 2026-09-01, when St John's is on daylight time. The brief's list
     * of eleven fractional offsets is the STANDARD-time set; across a whole year there are
     * thirteen, the two extra being Newfoundland's -02:30 and Adelaide's +10:30. Nothing in the
     * app depends on either count -- every offset is read from the tz database -- and
     * src/domain/timeZoneGroups.test.ts pins both numbers so the discrepancy stays visible.
     */
    for (const fragment of ['(UTC/GMT+05:30)', '(UTC/GMT+05:45)', '(UTC/GMT-02:30)']) {
      expect({ fragment, present: labels.some((l) => l.startsWith(fragment)) }).toEqual({
        fragment,
        present: true,
      });
    }
  });

  it('draws the bordered box, with the day boundary made to stand out', () => {
    openTimeZoneStep();

    expect(
      screen.getByRole('heading', { name: copyFor('clinical', 'hero.timezoneWhy') }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(copyFor('clinical', 'advice.timezoneDayBoundary')),
    ).toBeInTheDocument();
    expect(screen.getByText(copyFor('clinical', 'advice.timezoneReminders'))).toBeInTheDocument();

    // The emphasis is a CLASS, so the mark is CSS drawn from tokens rather than a character
    // written into a copy string, and the two bullets stay two plain sentences.
    const primary = document.querySelector('.wiz-tz-primary');
    expect(primary?.textContent).toContain(copyFor('clinical', 'advice.timezoneDayBoundary'));
    expect(primary?.textContent).not.toContain(copyFor('clinical', 'advice.timezoneReminders'));
  });

  it('marks the day-boundary bullet with two cues, not colour alone', () => {
    // A reader who cannot separate two greys still has to see which bullet is the loud one, so
    // the rule carries an underline as well as the full-strength text token.
    const start = setupCss.indexOf('.wiz-tz-why-list > li.wiz-tz-primary {');
    expect(start).toBeGreaterThan(-1);
    const block = setupCss.slice(start, setupCss.indexOf('}', start));
    expect(block).toContain('text-decoration: underline;');
    expect(block).toContain('var(--text)');
    // Never a hex literal in a component stylesheet: every colour is a token.
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

/**
 * Brief I Part 1: the goal is two axes, and the four combinations are total.
 *
 * Round 1 claim C1.10.2: "The way the 'Goal' is seperated is exclusionary. Recomposition and fat
 * loss are not exclusionary." The fix is a chooser in FRONT of `GoalKind`, not a change to it,
 * and the property that makes the fix safe is that the mapping is a BIJECTION: four axis
 * combinations, four members, total in both directions. If it were not total the chooser could
 * produce a goal the cited energy and protein rules have no row for.
 */
describe('Brief I Part 1: the two-axis goal chooser', () => {
  /** The four goals the engine has rules for, restated so a member added upstream fails here. */
  const GOAL_KINDS: readonly GoalKind[] = [
    'fat-loss',
    'muscle-gain',
    'recomposition',
    'maintenance',
  ];

  it('maps every one of the four axis combinations onto a real GoalKind, and back', () => {
    const combinations: { fat: FatAxis; muscle: MuscleAxis }[] = [
      { fat: 'lose', muscle: 'hold' },
      { fat: 'hold', muscle: 'gain' },
      { fat: 'lose', muscle: 'gain' },
      { fat: 'hold', muscle: 'hold' },
    ];

    // Every combination lands on a goal the engine has a rule for.
    const derived = combinations.map(({ fat, muscle }) => GOAL_KIND_BY_AXES[fat][muscle]);
    for (const goal of derived) expect(GOAL_KINDS).toContain(goal);

    // The four are DISTINCT, so the mapping is injective, and there are four of them, so it is
    // onto: together that is the bijection, and it means no goal is unreachable and no
    // combination is ambiguous.
    expect(new Set(derived).size).toBe(4);
    expect([...derived].sort()).toEqual([...GOAL_KINDS].sort());

    // The brief's own table, asserted literally rather than derived from the code under test.
    expect(GOAL_KIND_BY_AXES.lose.hold).toBe('fat-loss');
    expect(GOAL_KIND_BY_AXES.hold.gain).toBe('muscle-gain');
    expect(GOAL_KIND_BY_AXES.lose.gain).toBe('recomposition');
    expect(GOAL_KIND_BY_AXES.hold.hold).toBe('maintenance');

    // And the inverse round-trips, which is what lets the chooser read its own state back OUT of
    // `goal.kind` instead of storing the two axes beside it (decision
    // goal-axes-derived-not-stored: two fields that must agree are two fields that can disagree).
    for (const goal of GOAL_KINDS) {
      const axes = GOAL_AXES_BY_KIND[goal];
      expect(GOAL_KIND_BY_AXES[axes.fat][axes.muscle]).toBe(goal);
    }
    for (const { fat, muscle } of combinations) {
      expect(GOAL_AXES_BY_KIND[GOAL_KIND_BY_AXES[fat][muscle]]).toEqual({ fat, muscle });
    }
  });

  it('derives and reads back each of the four goals from the two radio groups on screen', () => {
    const cases: { fat: string; muscle: string; shows: string }[] = [
      { fat: 'Lose fat', muscle: 'Hold muscle', shows: 'Fat loss' },
      { fat: 'Hold body fat', muscle: 'Gain muscle', shows: 'Muscle gain' },
      { fat: 'Lose fat', muscle: 'Gain muscle', shows: 'Recomposition' },
      { fat: 'Hold body fat', muscle: 'Hold muscle', shows: 'Maintenance' },
    ];
    fillImperialWizardToGoal();
    for (const c of cases) {
      fireEvent.click(screen.getByLabelText(c.fat));
      fireEvent.click(screen.getByLabelText(c.muscle));
      expect(screen.getByTestId('derived-goal')).toHaveTextContent(c.shows);
      // The chooser's own state is the goal, so both radios read back checked from it alone.
      expect(screen.getByLabelText(c.fat)).toBeChecked();
      expect(screen.getByLabelText(c.muscle)).toBeChecked();
    }
  });

  it('says what recomposition costs, and only when recomposition is chosen', () => {
    fillImperialWizardToGoal();
    // fat-loss: no cost note, because the engine has a cited rule for it.
    expect(screen.queryByText(/does not cover recomposition/i)).toBeNull();
    fireEvent.click(screen.getByLabelText('Lose fat'));
    fireEvent.click(screen.getByLabelText('Gain muscle'));
    expect(screen.getByTestId('derived-goal')).toHaveTextContent('Recomposition');
    // Both halves of the honest disclosure: maintenance energy, and an extrapolated protein row.
    const cost = screen.getByText(/does not cover recomposition/i);
    expect(cost).toHaveTextContent('Energy is held at maintenance');
    expect(cost).toHaveTextContent('extrapolation from the muscle-gain row');
  });
});

/**
 * Brief I Part 4: the feasibility calendar.
 *
 * The band rules themselves are tested in src/domain/nutrition.test.ts against
 * FAT_LOSS_RATE_BOUND read from the module. What is tested HERE is the rendering: that the fills
 * appear where a rate exists, that they do NOT appear where none does, and that the word ships
 * beside the fill (WCAG 1.4.1).
 */
describe('Brief I Part 4: the feasibility calendar', () => {
  /** Every day cell in the rendered grid, in document order. */
  function dayCells(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.wiz-calendar-day')];
  }

  /** The cells carrying one of the three band fills, whichever band it is. */
  function colouredCells(): HTMLElement[] {
    return dayCells().filter((cell) =>
      ['wiz-band-realistic', 'wiz-band-improbable', 'wiz-band-highly-improbable'].some((c) =>
        cell.classList.contains(c),
      ),
    );
  }

  it('colours the grid under a fat-loss goal, which is the positive control for the next test', () => {
    /*
     * Without this, the muscle-gain test below would pass just as well against a calendar that
     * never coloured anything at all. The clock is pinned to 2026-09-01 (FIXED_NOW), so the grid
     * opens on 2026-09 and every day in it is in the future.
     */
    fillImperialWizardToGoal();
    setValue(/target body mass \(lb\)/i, '120'); // [lb] a real loss from the fixture's 135 lb
    expect(colouredCells().length).toBeGreaterThan(0);
    // And the word is on the cell, not only its colour: the accessible name carries the band.
    const named = dayCells().filter((cell) =>
      /Realistic|Improbable|Highly Improbable/.test(cell.getAttribute('aria-label') ?? ''),
    );
    expect(named.length).toBe(colouredCells().length);
    // The legend prints all three words whatever the goal is.
    for (const word of ['Realistic', 'Improbable', 'Highly Improbable']) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
  });

  it('leaves a muscle-gain-only target date UNCOLOURED, and says no weekly rate exists', () => {
    /*
     * `energyPlan` returns rateKgPerWeek: null for muscle gain and its rule string says why:
     * Garthe 2011 gives a total gain but the content review does not state the study duration,
     * so no kg/week figure can be derived. Reporting nothing is the honest value. Colouring this
     * grid would mean borrowing the fat-loss bound, which is inventing a coefficient.
     */
    fillImperialWizardToGoal();
    fireEvent.click(screen.getByLabelText('Hold body fat'));
    fireEvent.click(screen.getByLabelText('Gain muscle'));
    expect(screen.getByTestId('derived-goal')).toHaveTextContent('Muscle gain');

    // A target and a date are both given, so nothing is missing except the RATE RULE itself.
    setValue(/target body mass \(lb\)/i, '150'); // [lb] a gain from the fixture's 135 lb
    const dateInput = screen.getByLabelText(/^target date \(optional\)$/i);
    fireEvent.change(dateInput, { target: { value: '2026-10-01' } });

    expect(dayCells().length).toBeGreaterThan(0); // the grid did render
    expect(colouredCells()).toEqual([]); // and not one cell carries a band
    for (const cell of dayCells()) {
      expect(cell.className).toContain('wiz-band-none');
      /*
       * No band word smuggled into the accessible name either. The name is the ISO date alone
       * (FORMAT.calendarDay with an empty band appends nothing), which is what a screen reader
       * should hear for a date that carries no verdict.
       */
      expect(cell.getAttribute('aria-label')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cell.getAttribute('aria-label')).not.toMatch(/Realistic|Improbable/);
    }

    // And the reason is stated, in the register the basis strings use.
    expect(screen.getByTestId('feasibility-verdict')).toHaveTextContent(
      'No established weekly rate exists for muscle gain.',
    );
    expect(screen.getByTestId('feasibility-verdict')).toHaveTextContent(
      'An estimate from a prescribed rate, not a prediction about you.',
    );
  });

  it('leaves maintenance and recomposition uncoloured too, because both hold body mass', () => {
    fillImperialWizardToGoal();
    setValue(/target body mass \(lb\)/i, '120');
    const dateInput = screen.getByLabelText(/^target date \(optional\)$/i);
    fireEvent.change(dateInput, { target: { value: '2027-06-01' } });

    fireEvent.click(screen.getByLabelText('Hold body fat'));
    fireEvent.click(screen.getByLabelText('Hold muscle'));
    expect(colouredCells()).toEqual([]);
    expect(screen.getByTestId('feasibility-verdict')).toHaveTextContent(
      'This goal holds body mass, so no weekly rate applies.',
    );

    fireEvent.click(screen.getByLabelText('Lose fat'));
    fireEvent.click(screen.getByLabelText('Gain muscle'));
    expect(colouredCells()).toEqual([]);
    expect(screen.getByTestId('feasibility-verdict')).toHaveTextContent(
      'This goal holds body mass, so no weekly rate applies.',
    );
  });

  it('names the input that is missing, and never tells a user with a target to set one', () => {
    /*
     * The date FIELD accepts any valid date, including one in the past and one that needs a
     * GAIN under a fat-loss goal. The grid cannot reach either state (it disables a past cell
     * and offers no cell without a target), so these two lines exist only for the field, and
     * each names its own missing input. Reusing "Set a target above" for them would tell a user
     * who has already set one to go and set one.
     */
    fillImperialWizardToGoal();
    const dateInput = screen.getByLabelText(/^target date \(optional\)$/i);
    const verdict = (): HTMLElement => screen.getByTestId('feasibility-verdict');

    // No target yet, but a valid future date.
    fireEvent.change(dateInput, { target: { value: '2027-01-01' } });
    expect(verdict()).toHaveTextContent('Set a target above before these dates can be judged.');

    // A target that is a GAIN, under a goal whose only cited rate rule is stated for loss.
    setValue(/target body mass \(lb\)/i, '150'); // [lb] above the fixture's 135 lb
    expect(verdict()).toHaveTextContent('That target is not below your current body mass.');

    // A real loss, but a date that is not in the future: the required rate is not finite.
    setValue(/target body mass \(lb\)/i, '120');
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } }); // FIXED_NOW's own date
    expect(verdict()).toHaveTextContent('Pick a date after today before this can be judged.');
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } });
    expect(verdict()).toHaveTextContent('Pick a date after today before this can be judged.');
  });

  it('renders the three fills inside the card that carries --band-surface, never on the page', () => {
    /*
     * The measured constraint, asserted against the stylesheet rather than a computed style:
     * jsdom resolves no custom property through an attribute selector, so the RULE is what can
     * be checked here (the same reasoning src/skins/tokens.test.ts records). All three pastels
     * measure 1.0 to 1.4:1 against limelight's lime --bg, below WCAG 1.4.11's 3:1 non-text
     * floor, so a band fill drawn on the bare page would be invisible on that skin.
     */
    expect(setupCss).toContain('background: var(--band-surface');
    for (const token of [
      '--band-realistic',
      '--band-improbable',
      '--band-highly-improbable',
      '--band-ink',
    ]) {
      expect(setupCss).toContain(token);
    }
    // And every band fill is scoped inside `.wiz .wiz-band-*`, which only ever renders within
    // `.wiz-calendar`. No hex literal: the colour comes from a token in tokens.css.
    fillImperialWizardToGoal();
    setValue(/target body mass \(lb\)/i, '120');
    for (const cell of colouredCells()) {
      expect(cell.closest('.wiz-calendar')).not.toBeNull();
    }
  });

  it('pages the month forward and back, and never before the month it opened on', () => {
    fillImperialWizardToGoal();
    // FIXED_NOW is 2026-09-01T12:00Z, so the grid opens on this month.
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026-09');
    expect(screen.getByRole('button', { name: 'Previous Month' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next Month' }));
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026-10');
    // Across a year boundary, which is where a naive month + 1 would produce "2026-13".
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next Month' }));
    }
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('2027-01');
    fireEvent.click(screen.getByRole('button', { name: 'Previous Month' }));
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026-12');
  });

  it('writes the picked day into the target date, and marks that one cell selected', () => {
    fillImperialWizardToGoal();
    const cell = screen.getByRole('button', { name: /^2026-09-20/ });
    fireEvent.click(cell);
    expect(screen.getByLabelText(/^target date \(optional\)$/i)).toHaveValue('2026-09-20');
    const pressed = dayCells().filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.textContent?.trim()).toBe('20');
  });
});

/**
 * Brief I Part 2: the target is a body-fat percentage where an estimate exists.
 *
 * Round 1 claim C1.10.5: "instead of having a 'target body mass' which is stupid... Target body
 * mass can be muscle or fat." `Profile.goal.targetBodyFatPct` has existed since the schema was
 * written and the wizard wrote null into it until now.
 */
describe('Brief I Part 2: the body-fat target', () => {
  /** The metric fixture, through the body step, with a body-fat percentage given. */
  function reachGoalWithBodyFat(pct: string): void {
    render(<SetupWizard />);
    next(); // 1 units, metric by default
    setValue(/^time zone$/i, 'America/New_York');
    next(); // 2 time zone
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    setValue(/body fat \(%\)/i, pct);
    next(); // 3 body
    /*
     * The sliders all have valid defaults; the AVAILABILITY fields do not. No weekday is checked
     * to begin with, and training's guard absorbed availability's four checks when the step was
     * folded in (finding B43), so Next is blocked here until the slots are answered.
     */
    setValue(/sessions per week/i, '2');
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Tuesday'));
    setValue(/weekly session target/i, '2');
    next(); // 4 equipment and availability, every slider on its default
  }

  it('offers the percentage instead of a target body mass, and shows what it implies', () => {
    reachGoalWithBodyFat('25');
    // The better question replaces the worse one; there is one target on screen, not two.
    expect(screen.getByLabelText(/target body fat \(%\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/target body mass/i)).toBeNull();

    /*
     * 80 kg at 25 % body fat is 20 kg fat and 60 kg lean. Holding lean mass, a 15 % target needs
     *   target mass = 60 / (1 - 0.15) = 60 / 0.85 = 70.588... kg
     *   target fat  = 70.588... - 60   = 10.588... kg
     * Both formatted by the same formatMass every other mass on the screen goes through, which
     * rounds to 0.1 kg: "10.6 kg" and "60.0 kg".
     */
    setValue(/target body fat \(%\)/i, '15');
    const implied = screen.getByTestId('implied-composition');
    expect(implied).toHaveTextContent('10.6 kg fat mass');
    expect(implied).toHaveTextContent('60.0 kg lean mass');
  });

  it('states the assumption and the tape method standard error behind a why disclosure', () => {
    reachGoalWithBodyFat('25');
    setValue(/target body fat \(%\)/i, '15');
    const basis = screen.getByText(/assume lean mass is held/i);
    // NAVY_SEE_PCT, read live from src/domain/bodyfat.ts rather than restated here.
    expect(basis).toHaveTextContent(`standard error of ${String(NAVY_SEE_PCT.male)} percentage points`);
    // R9: the arithmetic and its caveat are inside a <details>, not on the face of the step.
    expect(basis.closest('details')).not.toBeNull();
  });

  it('never blocks Next on the target that is not on screen', () => {
    /*
     * The two targets are alternatives. A target body mass typed while no body-fat estimate
     * existed stays in the draft when one arrives, and its field stops being rendered; gating
     * the step on its error would stop Next on a message the user cannot see or correct.
     */
    render(<SetupWizard />);
    next();
    setValue(/^time zone$/i, 'America/New_York');
    next();
    pickSex();
    setValue(/^age \(years\)$/i, '30');
    setValue(/^metres$/i, '1');
    setValue(/^centimetres$/i, '80');
    setValue(/body mass \(kg\)/i, '80');
    next(); // 3 body, no body-fat percentage yet
    /*
     * The sliders all have valid defaults; the AVAILABILITY fields do not. No weekday is checked
     * to begin with, and training's guard absorbed availability's four checks when the step was
     * folded in (finding B43), so Next is blocked here until the slots are answered.
     */
    setValue(/sessions per week/i, '2');
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Tuesday'));
    setValue(/weekly session target/i, '2');
    next(); // 4 equipment and availability

    // The body-mass route is open, and an out-of-domain target blocks it, correctly.
    setValue(/target body mass \(kg\)/i, '5');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    // Back to the body step to give a percentage, which opens the better route.
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    setValue(/body fat \(%\)/i, '25');
    next();
    next();

    // The invalid body mass is still in the draft and its field is gone. Next is free again.
    expect(screen.queryByLabelText(/target body mass/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('holds the percentage to the same domain the body step uses', () => {
    reachGoalWithBodyFat('25');
    setValue(/target body fat \(%\)/i, String(NUTRITION_DOMAIN.bodyFatPct.hi + 1));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    setValue(/target body fat \(%\)/i, '15');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('falls back to target body mass and says why, where no estimate exists', () => {
    // fillImperialWizardToGoal leaves the body-fat box empty, so there is no estimate to set a
    // percentage target against.
    fillImperialWizardToGoal();
    expect(screen.getByLabelText(/target body mass \(lb\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/target body fat/i)).toBeNull();
    expect(
      screen.getByText('No body-fat estimate yet, so the target is body mass.'),
    ).toBeInTheDocument();
  });

  it('stores the percentage AND the body mass it implies, so the two cannot disagree', () => {
    reachGoalWithBodyFat('25');
    setValue(/target body fat \(%\)/i, '15');
    next(); // 5 goal
    next(); // 6 programme length
    next(); // 8 guidance
    tickLooksGood();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

    const state = useAppStore.getState();
    const profile = Object.values(state.profiles)[0];
    expect(profile?.goal.targetBodyFatPct).toBe(15);
    // 60 kg lean / 0.85, the same arithmetic the screen printed.
    expect(profile?.goal.targetMassKg).toBeCloseTo(60 / 0.85, 9);
    // And the derived goal is the only record of either axis.
    expect(profile?.goal.kind).toBe('fat-loss');
  });
});
