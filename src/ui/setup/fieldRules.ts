// src/ui/setup/fieldRules.ts
//
// The profile field rules the setup wizard checks, in one module so the Settings profile editor
// refuses exactly what setup refuses (spec R9, audit G06, AGENTS rule 2). Moved verbatim out of
// SetupWizard.tsx; the two wrappers at the bottom are the wizard's former inline age and height
// checks. Every bound is NUTRITION_DOMAIN's (src/domain/nutrition.ts); nothing here is new.
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import { MAX_MASS_KG } from '../../domain/schema';
import { KG_PER_LB, type LocalDate, type UnitSystem } from '../../domain/types';
import { massUnit, parseDecimal, storedMassKg } from '../components/UnitInput';

/*
 * Units, not copy: a unit label is part of the contract and never changes with a skin
 * (copy contract, "Numbers, units and quantity names are part of the contract"). The mass and
 * load labels come from UNIT_LABEL through UnitInput; these are the ones UNIT_LABEL does not
 * carry because they are the same in both unit systems.
 */
export const UNIT = { years: 'years', weeks: 'weeks', minutes: 'min', m: 'm', cm: 'cm', ft: 'ft', inch: 'in', pct: '%' };

export const CM_PER_INCH = 2.54; // [cm/in] exact by definition
export const CM_PER_METRE = 100; // [cm/m]
export const INCHES_PER_FOOT = 12; // [in/ft]

type Overrides = Readonly<Partial<Record<CopyKey, string>>>;

/** Round to 0.1 for a bound shown in a message. Display resolution only, never storage. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface Bound {
  lo: number;
  hi: number;
}

/**
 * A bound rounded INWARD to 0.1, for message text.
 *
 * Rounding to nearest prints a bound that is itself refused: the 30 kg floor is 66.1387 lb,
 * which rounds to 66.1 lb, and 66.1 lb converts back to 29.98 kg. Every endpoint this returns
 * converts to a value strictly inside the bound it came from, so a user who types the number
 * the message names is accepted.
 */
export function inwardBound(bound: Bound): Bound {
  return { lo: Math.ceil(bound.lo * 10) / 10, hi: Math.floor(bound.hi * 10) / 10 };
}

/**
 * A canonical kg bound expressed in the display unit, for message text only. The conversion is
 * the exact inverse of toStoredMass (1 lb = 0.45359237 kg exactly, master plan section 3), not
 * displayMass, because displayMass rounds to nearest and a message bound must round inward.
 */
export function massBoundInDisplayUnit(kgBound: Bound, units: UnitSystem): Bound {
  if (units === 'metric') return inwardBound(kgBound); // [kg]
  return inwardBound({ lo: kgBound.lo / KG_PER_LB, hi: kgBound.hi / KG_PER_LB }); // [lb]
}

/** The stature domain in inches, inward-rounded, for the imperial height message. */
export const HEIGHT_BOUND_IN: Bound = inwardBound({
  lo: NUTRITION_DOMAIN.heightCm.lo / CM_PER_INCH, // [in]
  hi: NUTRITION_DOMAIN.heightCm.hi / CM_PER_INCH, // [in]
});

/** Required numeric field: empty is an error, and so is a value outside the bound. */
export function requiredInRange(
  quantity: string,
  text: string,
  bound: Bound,
  overrides: Overrides,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/**
 * Required whole-number count. `Math.round` is never applied to a user value: the schema stores
 * `birthYear`, `weeklySessionTarget` and the plan's `weeks` as `z.int()`, so a fraction is
 * refused here, visibly, rather than rounded into the document behind the user's back.
 */
export function requiredIntegerInRange(
  quantity: string,
  text: string,
  bound: Bound,
  overrides: Overrides,
  unit?: string,
): string | null {
  const value = parseDecimal(text);
  if (value === null) return copy('error.valueRequired', overrides);
  if (!Number.isInteger(value)) return copy('error.wholeNumber', overrides);
  if (value < bound.lo || value > bound.hi) {
    return FORMAT.outOfRange(quantity, bound.lo, bound.hi, unit);
  }
  return null;
}

/**
 * A body mass entered in the display unit, validated in CANONICAL kg after the exact conversion.
 *
 * This is not the same test as comparing the entered number against a rounded display bound, and
 * the difference is a crash: 66.1 lb clears a 66.1 lb floor, converts to 29.98 kg, and
 * computeTargets throws RangeError on it while Review renders (master plan section 6.3). The
 * rounded bound appears in the message text and nowhere else.
 */
export function massDomainError(
  quantity: string,
  text: string,
  units: UnitSystem,
  overrides: Overrides,
): string | null {
  const kg = storedMassKg(text, units); // [kg] exact
  if (kg === null) return copy('error.valueRequired', overrides);
  if (kg < NUTRITION_DOMAIN.massKg.lo || kg > NUTRITION_DOMAIN.massKg.hi) {
    const shown = massBoundInDisplayUnit(NUTRITION_DOMAIN.massKg, units); // [lb] or [kg]
    return FORMAT.outOfRange(quantity, shown.lo, shown.hi, massUnit(units));
  }
  return null;
}

/**
 * Stature from two whole-number fields, in both unit systems. Round 1 claims C1.07.20 and
 * C1.07.21: metres and centimetres, or feet and inches. Either field may be blank and counts as
 * zero, so 1 m 78 and 5 ft 0 both work; both blank is null, a missing entry rather than a zero.
 *
 * @returns [cm] exact, or null
 */
export function heightCmFromParts(
  units: UnitSystem,
  parts: { m: string; cm: string; ft: string; inch: string },
): number | null {
  if (units === 'metric') {
    const metres = parseDecimal(parts.m);
    const centimetres = parseDecimal(parts.cm);
    if (metres === null && centimetres === null) return null;
    return (metres ?? 0) * CM_PER_METRE + (centimetres ?? 0); // [cm]
  }
  const feet = parseDecimal(parts.ft);
  const inches = parseDecimal(parts.inch);
  if (feet === null && inches === null) return null;
  return ((feet ?? 0) * INCHES_PER_FOOT + (inches ?? 0)) * CM_PER_INCH; // [cm] exact
}

/** Age [years]: required, whole, inside NUTRITION_DOMAIN.ageYears. */
export function ageYearsError(ageYears: number | null, overrides: Overrides): string | null {
  if (ageYears === null) return copy('error.valueRequired', overrides);
  if (!Number.isInteger(ageYears)) return copy('error.wholeNumber', overrides);
  if (ageYears < NUTRITION_DOMAIN.ageYears.lo || ageYears > NUTRITION_DOMAIN.ageYears.hi) {
    return FORMAT.outOfRange(
      copy('quantity.age', overrides),
      NUTRITION_DOMAIN.ageYears.lo,
      NUTRITION_DOMAIN.ageYears.hi,
      UNIT.years,
    );
  }
  return null;
}

/** Height [cm]: required, inside NUTRITION_DOMAIN.heightCm; the message names the display unit. */
export function heightCmError(
  heightCm: number | null,
  units: UnitSystem,
  overrides: Overrides,
): string | null {
  if (heightCm === null) return copy('error.valueRequired', overrides);
  if (heightCm >= NUTRITION_DOMAIN.heightCm.lo && heightCm <= NUTRITION_DOMAIN.heightCm.hi) return null;
  return units === 'metric'
    ? FORMAT.outOfRange(
        copy('quantity.height', overrides),
        NUTRITION_DOMAIN.heightCm.lo,
        NUTRITION_DOMAIN.heightCm.hi,
        UNIT.cm,
      )
    : FORMAT.outOfRange(copy('quantity.height', overrides), HEIGHT_BOUND_IN.lo, HEIGHT_BOUND_IN.hi, UNIT.inch);
}

/**
 * A body mass typed into a MEASUREMENT field (spec R9, audit G08): the loader's own bound,
 * 0 < mass <= MAX_MASS_KG, stated in words in the display unit (inward-rounded, so the number the
 * message names is accepted). Wider than NUTRITION_DOMAIN on purpose: a mass the equations do not
 * cover is still a real measurement, and Targets names the field instead (G09). A slip inside the
 * bound is caught by the plausibility question (src/domain/measurements.ts).
 */
export function bodyMassEntryError(
  quantity: string,
  text: string,
  units: UnitSystem,
  overrides: Overrides,
): string | null {
  const kg = storedMassKg(text, units); // [kg] exact
  if (kg === null) return copy('error.valueRequired', overrides);
  if (!(kg > 0)) return copy('error.positive', overrides);
  if (kg > MAX_MASS_KG) {
    const shown = massBoundInDisplayUnit({ lo: 0, hi: MAX_MASS_KG }, units); // [kg] or [lb]
    return FORMAT.atMost(quantity, shown.hi, massUnit(units));
  }
  return null;
}

/**
 * [year] The birth years whose age THIS calendar year (the age nutritionInputFor computes) lies
 * inside NUTRITION_DOMAIN.ageYears. For the Settings editor, which stores the year directly.
 */
export function birthYearBound(todayIso: LocalDate): Bound {
  const year = Number(todayIso.slice(0, 4)); // [year]
  return { lo: year - NUTRITION_DOMAIN.ageYears.hi, hi: year - NUTRITION_DOMAIN.ageYears.lo };
}
