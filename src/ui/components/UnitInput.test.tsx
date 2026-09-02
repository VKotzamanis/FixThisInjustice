import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnitInput, loadUnit, massUnit, parseDecimal, storedLoadKg, storedMassKg } from './UnitInput';

/**
 * P4 task 9 lists this component as a file to create; P2 shipped it first (commits 08a2059,
 * 8c13f3a) with the setup wizard's API. These tests pin the four properties P4's train view
 * depends on, against the component as shipped:
 *
 *   1. the label reads "<quantity> (<unit>)" with the unit taken from UNIT_LABEL, so it flips
 *      with the profile's unit system rather than with a literal at the call site;
 *   2. inputMode="decimal", so a phone shows a numeric keypad;
 *   3. the conversion to canonical kg at the storage boundary is exact, never rounded;
 *   4. sharedErrorId marks the field invalid and describes it with a message the CALLER
 *      renders, which is how a view (train, settings) attaches its own refusal.
 */

/** 135 lb x 0.45359237 kg/lb, exact. */
const LB_135_IN_KG = 61.23496995; // [kg]

describe('UnitInput labelling', () => {
  it('labels a load with the display unit of an imperial profile', () => {
    render(
      <UnitInput
        id="set-1-load"
        quantity="Set 1 load"
        unit={loadUnit('imperial')}
        value=""
        onChange={() => undefined}
        error={null}
      />,
    );
    expect(screen.getByLabelText('Set 1 load (lb)')).toBeTruthy();
  });

  it('labels a body mass with the display unit of a metric profile', () => {
    render(
      <UnitInput
        id="mass"
        quantity="Body mass"
        unit={massUnit('metric')}
        value=""
        onChange={() => undefined}
        error={null}
      />,
    );
    expect(screen.getByLabelText('Body mass (kg)')).toBeTruthy();
  });

  it('labels a dimensionless count with the quantity alone', () => {
    render(
      <UnitInput id="reps" quantity="Set 1 reps" unit={null} value="" onChange={() => undefined} error={null} step="1" />,
    );
    expect(screen.getByLabelText('Set 1 reps')).toBeTruthy();
  });

  it('uses a decimal input mode so phones show a numeric keypad', () => {
    render(
      <UnitInput
        id="mass"
        quantity="Body mass"
        unit={massUnit('metric')}
        value=""
        onChange={() => undefined}
        error={null}
      />,
    );
    expect(screen.getByLabelText('Body mass (kg)').getAttribute('inputmode')).toBe('decimal');
  });
});

describe('UnitInput conversion at the storage boundary', () => {
  it('converts an imperial entry exactly, with no rounding', () => {
    expect(storedLoadKg('135', 'imperial')).toBe(LB_135_IN_KG); // [kg]
    expect(storedMassKg('135', 'imperial')).toBe(LB_135_IN_KG); // [kg]
  });

  it('passes a metric entry through unchanged', () => {
    expect(storedLoadKg('60', 'metric')).toBe(60); // [kg]
    expect(storedMassKg('82.4', 'metric')).toBe(82.4); // [kg]
  });

  it('reads an empty or non-numeric entry as null rather than as zero', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(storedLoadKg('', 'imperial')).toBeNull();
    expect(storedMassKg('abc', 'metric')).toBeNull();
  });
});

describe('UnitInput refusal wiring', () => {
  it('describes the field with its own message and marks it invalid', () => {
    render(
      <UnitInput
        id="mass"
        quantity="Body mass"
        unit={massUnit('metric')}
        value="0"
        onChange={() => undefined}
        error="Enter a body mass between 30 and 300 kg."
      />,
    );
    const field = screen.getByLabelText('Body mass (kg)');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')?.split(' ')).toContain('mass-error');
    expect(screen.getByText('Enter a body mass between 30 and 300 kg.')).toBeTruthy();
  });

  it('marks the field invalid for a message the caller renders (sharedErrorId)', () => {
    render(
      <>
        <UnitInput
          id="mass"
          quantity="Body mass"
          unit={massUnit('metric')}
          value="0"
          onChange={() => undefined}
          error={null}
          sharedErrorId="view-error"
        />
        <p id="view-error">Enter a body mass.</p>
      </>,
    );
    const field = screen.getByLabelText('Body mass (kg)');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')?.split(' ')).toContain('view-error');
  });

  it('leaves an acceptable field valid and undescribed', () => {
    render(
      <UnitInput
        id="mass"
        quantity="Body mass"
        unit={massUnit('metric')}
        value="82.4"
        onChange={() => undefined}
        error={null}
      />,
    );
    const field = screen.getByLabelText('Body mass (kg)');
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(field.getAttribute('aria-describedby')).toBeNull();
  });
});
