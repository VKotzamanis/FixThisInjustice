import type { JSX } from 'react';
import type { UnitSystem } from '../../domain/types';
import { UNIT_LABEL, toStoredLoad, toStoredMass } from '../../domain/units';
import { FORMAT } from '../../content/copy';

/**
 * One numeric field, labelled with the quantity it collects and the unit that quantity is
 * entered in (master plan section 3, copy contract R11: the quantity is named, never a
 * colloquial stand-in, and the unit is part of the contract rather than of the skin).
 *
 * Master plan section 10, "P4 item 11": this component is created by the first executed plan
 * that needs it and reused thereafter. P2's setup wizard is that plan. It is deliberately the
 * ONLY numeric input in the wizard, so three properties hold everywhere by construction:
 *
 *   - `inputMode="decimal"` puts a phone keypad under every number, with no letter keys.
 *   - the label reads "<quantity> (<unit>)" and the unit for a mass or a load comes from
 *     UNIT_LABEL, so it flips with the profile's unit system and never with a literal.
 *   - the validation message is rendered as text beside the field it belongs to and is wired
 *     to it with aria-describedby, so it is not a colour cue a screen reader would miss.
 *
 * Conversion is NOT done here. A value is held as typed for as long as the user is editing it,
 * because rounding the string through a number on every keystroke makes "6." or "0.0" unenterable.
 * The exact conversion happens at submit, through `storedMassKg` / `storedLoadKg` below, which
 * delegate to src/domain/units.ts: the storage boundary is exact by contract (1 lb = 0.45359237 kg).
 */
export interface UnitInputProps {
  /** DOM id; the label's `for` target, so the accessible name is the visible label. */
  id: string;
  /** The quantity name, from src/content/copy.ts. Never a unit and never a sentence. */
  quantity: string;
  /** Display unit label, e.g. "kg", "lb", "cm". null for a dimensionless count. */
  unit: string | null;
  /** The value as the user typed it, in the display unit. */
  value: string;
  onChange: (next: string) => void;
  /** Visible, specific validation message, or null when the entry is acceptable. */
  error: string | null;
  /** "any" (default) for a measured quantity; "1" for a count. */
  step?: string;
  /**
   * DOM id of a message that this field shares with others and that the CALLER renders, for a
   * quantity no single field owns: feet and inches produce one stature, and the three girths
   * produce one body-fat estimate. Pass the id while that message is on screen and null while
   * it is not, so both the description and the invalid state track it. A shared message is not
   * rendered here, because rendering it once per field would announce it once per field.
   */
  sharedErrorId?: string | null;
}

export function UnitInput(props: UnitInputProps): JSX.Element {
  const label = props.unit === null ? props.quantity : FORMAT.quantityWithUnit(props.quantity, props.unit);
  const errorId = `${props.id}-error`;
  const sharedErrorId = props.sharedErrorId ?? null;
  /*
   * Both messages are described, and either one marks the control invalid. A field that is
   * refused by a message it does not itself render is still a refused field: leaving
   * aria-invalid false there would make the block invisible to a screen reader.
   */
  const describedIds = [props.error === null ? null : errorId, sharedErrorId].filter(
    (id): id is string => id !== null,
  );
  return (
    <div className="wiz-field">
      <label htmlFor={props.id}>{label}</label>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        step={props.step ?? 'any'}
        value={props.value}
        aria-invalid={props.error !== null || sharedErrorId !== null}
        aria-describedby={describedIds.length === 0 ? undefined : describedIds.join(' ')}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
      />
      {props.error !== null && (
        <p className="wiz-error" id={errorId}>
          {props.error}
        </p>
      )}
    </div>
  );
}

/** The unit a body mass is entered in for this profile: "kg" or "lb". */
export function massUnit(units: UnitSystem): string {
  return UNIT_LABEL[units].mass;
}

/** The unit a load or a load step is entered in for this profile: "kg" or "lb". */
export function loadUnit(units: UnitSystem): string {
  return UNIT_LABEL[units].load;
}

/**
 * The number as typed, or null when the field is empty or does not hold a finite number.
 * An empty field is null rather than 0: a missing entry and a zero entry are different facts,
 * and only the caller knows which of them blocks progression.
 */
export function parseDecimal(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Body mass as typed in the display unit, converted exactly to canonical kg. */
export function storedMassKg(text: string, units: UnitSystem): number | null {
  const entered = parseDecimal(text);
  return entered === null ? null : toStoredMass(entered, units); // [kg]
}

/** A load, or a load step, as typed in the display unit, converted exactly to canonical kg. */
export function storedLoadKg(text: string, units: UnitSystem): number | null {
  const entered = parseDecimal(text);
  return entered === null ? null : toStoredLoad(entered, units); // [kg]
}
