// src/ui/measurements/BodyMassForm.tsx
//
// The one body-mass field (spec R9): Today's any-day weigh-in, the Log list's edit row and Train's
// pre/post weigh-ins all render this, so the bound, the plausibility question and the role are
// stated once. It never writes the store: `onSubmit` does, and reports a refusal.
//
// Units: mass typed in the profile's display unit, converted exactly to [kg] (src/domain/units.ts).
import { useState, type ReactElement } from 'react';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { implausibleMass } from '../../domain/measurements';
import type { BodyMassRole, Kg, Profile } from '../../domain/types';
import { displayMass } from '../../domain/units';
import { UnitInput, massUnit, storedMassKg } from '../components/UnitInput';
import { bodyMassEntryError } from '../setup/fieldRules';
import './measurements.css';

export interface BodyMassFormProps {
  profile: Profile;
  /** DOM id prefix; unique per instance on a screen. */
  idPrefix: string;
  /** The resolved field name, e.g. c('quantity.bodyMass'). */
  quantity: string;
  /** A fixed role, or 'choose' to show the role select. */
  role: BodyMassRole | 'choose';
  /** [kg] What a new mass is compared against (spec R4); null = never questioned. */
  referenceKg: Kg | null;
  /** [kg] An edit's stored mass: prefilled, and kept exactly while its text is untouched. */
  initialKg?: Kg | null;
  /** An edit's stored role (null = untagged); only read when role is 'choose'. */
  initialRole?: BodyMassRole | null;
  /** The resolved submit label. */
  submitLabel: string;
  /** Stores the mass. Returns false when the store refused it. [kg] */
  onSubmit: (massKg: Kg, role: BodyMassRole | null) => boolean;
  onCancel?: () => void;
}

/** The option word for each stored role; the Log list prints it beside an entry (Task 6). */
export const MASS_ROLE_KEY: Record<BodyMassRole, CopyKey> = {
  morning: 'option.massRoleMorning',
  pre: 'option.massRolePre',
  post: 'option.massRolePost',
};

/** The select's values: the three roles, and '' for an untagged entry. */
type RoleChoice = BodyMassRole | '';

const ROLE_OPTIONS: readonly { value: RoleChoice; key: CopyKey }[] = [
  { value: 'morning', key: MASS_ROLE_KEY.morning },
  { value: 'pre', key: MASS_ROLE_KEY.pre },
  { value: 'post', key: MASS_ROLE_KEY.post },
  { value: '', key: 'option.massRoleNone' },
];

/** A stored mass as the user would type it: the display unit at its 0.1 resolution. */
function massText(kg: Kg, profile: Profile): string {
  return String(displayMass(kg, profile.units)); // [kg] or [lb]
}

export function BodyMassForm(props: BodyMassFormProps): ReactElement {
  const { profile, idPrefix, quantity, role, referenceKg, submitLabel, onSubmit, onCancel } = props;
  const initialKg = props.initialKg ?? null;
  const c = useCopy();
  const overrides = useCopyOverrides();
  const initialText = initialKg === null ? '' : massText(initialKg, profile);
  const [text, setText] = useState(initialText); // as typed, display unit
  const [choice, setChoice] = useState<RoleChoice>(
    role === 'choose' ? (props.initialKg === undefined ? 'morning' : (props.initialRole ?? '')) : role,
  );
  const [error, setError] = useState<string | null>(null);
  /** [kg] The mass the form has asked about once (spec R4); null when no question stands. */
  const [questionedKg, setQuestionedKg] = useState<Kg | null>(null);
  const errorId = `${idPrefix}-error`;

  const submit = (confirmed: boolean): void => {
    const refusal = bodyMassEntryError(quantity, text, profile.units, overrides);
    if (refusal !== null) {
      setError(refusal);
      setQuestionedKg(null);
      return;
    }
    // Review R2's rule: an untouched edit keeps the stored kg, never the 0.1-rounded display.
    const typedKg = storedMassKg(text, profile.units); // [kg] exact conversion
    const massKg = initialKg !== null && text === initialText ? initialKg : typedKg; // [kg]
    if (massKg === null) return; // unreachable: the bound check above refused null
    if (!confirmed && implausibleMass(massKg, referenceKg)) {
      setQuestionedKg(massKg);
      setError(null);
      return;
    }
    const stored = onSubmit(massKg, choice === '' ? null : choice);
    if (!stored) {
      setError(c('error.outsideAccepted'));
      return;
    }
    setError(null);
    setQuestionedKg(null);
    if (initialKg === null) setText('');
  };

  return (
    <div className="mass-form">
      <div
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          submit(false);
        }}
      >
        <UnitInput
          id={`${idPrefix}-mass`}
          quantity={quantity}
          unit={massUnit(profile.units)}
          value={text}
          error={null}
          sharedErrorId={error === null ? null : errorId}
          onChange={(next) => {
            setText(next);
            setError(null);
            setQuestionedKg(null);
          }}
        />
      </div>
      {role === 'choose' && (
        <div className="view-field">
          <label htmlFor={`${idPrefix}-role`}>{c('label.massRole')}</label>
          <select
            id={`${idPrefix}-role`}
            value={choice}
            onChange={(e) => {
              const next = ROLE_OPTIONS.find((o) => o.value === e.target.value);
              if (next !== undefined) setChoice(next.value);
            }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.key} value={o.value}>
                {c(o.key)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mass-form-actions">
        <button
          type="button"
          onClick={() => {
            submit(false);
          }}
        >
          {submitLabel}
        </button>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel}>
            {c('button.cancel')}
          </button>
        )}
      </div>
      {error !== null && (
        <p className="view-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      {questionedKg !== null && (
        <div className="mass-form-question">
          <p role="alert">{c('advice.massLooksOff')}</p>
          <button
            type="button"
            onClick={() => {
              submit(true);
            }}
          >
            {c('button.logAnyway')}
          </button>
        </div>
      )}
    </div>
  );
}
