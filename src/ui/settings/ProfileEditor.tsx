// src/ui/settings/ProfileEditor.tsx
//
// Spec R9 / audit G06: the setup facts that had no editor (height, birth year, sex, setup body
// fat, target mass, target date), checked by the wizard's own rules (src/ui/setup/fieldRules.ts),
// and the dated body-fat re-measure (G05). Units: height [cm], mass [kg], body fat [% of body mass],
// dates LocalDate in the profile's zone.
import { useState, type JSX } from 'react';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { isValidLocalDate, todayLocal } from '../../domain/dates';
import { latestBodyMassEntry } from '../../domain/measurements';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import type { Profile, Sex } from '../../domain/types';
import { displayMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { UnitInput, massUnit, parseDecimal, storedMassKg } from '../components/UnitInput';
import {
  CM_PER_INCH,
  CM_PER_METRE,
  INCHES_PER_FOOT,
  UNIT,
  birthYearBound,
  bodyMassEntryError,
  heightCmError,
  heightCmFromParts,
  massDomainError,
  requiredInRange,
  requiredIntegerInRange,
  round1,
} from '../setup/fieldRules';

const SEX_OPTIONS: readonly { value: Sex; key: 'label.sexMale' | 'label.sexFemale' | 'label.sexNotDisclosed' }[] = [
  { value: 'male', key: 'label.sexMale' },
  { value: 'female', key: 'label.sexFemale' },
  { value: 'nd', key: 'label.sexNotDisclosed' },
];

/** The two height fields as setup shows them, from the stored cm. [cm] -> m + cm, or ft + in. */
function heightParts(heightCm: number, units: Profile['units']): { a: string; b: string } {
  if (units === 'metric') {
    const m = Math.floor(heightCm / CM_PER_METRE); // [m]
    return { a: String(m), b: String(round1(heightCm - m * CM_PER_METRE)) }; // [cm]
  }
  const totalIn = heightCm / CM_PER_INCH; // [in]
  const ft = Math.floor(totalIn / INCHES_PER_FOOT); // [ft]
  return { a: String(ft), b: String(round1(totalIn - ft * INCHES_PER_FOOT)) }; // [in]
}

/** A stored mass as typed: display unit at 0.1, '' for none. */
function massText(kg: number | null, units: Profile['units']): string {
  return kg === null ? '' : String(displayMass(kg, units)); // [kg] or [lb]
}

export function ProfileEditor(props: { profile: Profile }): JSX.Element {
  const { profile } = props;
  const t = useCopy();
  const overrides = useCopyOverrides();
  const units = profile.units;
  const today = todayLocal(profile.timezone);
  const initialHeight = heightParts(profile.body.heightCm, units);
  const [heightA, setHeightA] = useState(initialHeight.a); // [m] or [ft], as typed
  const [heightB, setHeightB] = useState(initialHeight.b); // [cm] or [in], as typed
  const [birthYear, setBirthYear] = useState(String(profile.body.birthYear)); // [year]
  const [sex, setSex] = useState<Sex>(profile.body.sex);
  const [bodyFat, setBodyFat] = useState(
    profile.body.baselineBodyFatPct === null ? '' : String(profile.body.baselineBodyFatPct),
  ); // [%]
  const [targetMass, setTargetMass] = useState(massText(profile.goal.targetMassKg, units));
  const [targetDate, setTargetDate] = useState(profile.goal.targetDate ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const heightUntouched = heightA === initialHeight.a && heightB === initialHeight.b;
  const heightCm = heightUntouched
    ? profile.body.heightCm // [cm] review R2: the stored value, not its 0.1 display
    : heightCmFromParts(units, {
        m: heightA,
        cm: heightB,
        ft: heightA,
        inch: heightB,
      });
  const errors = {
    height: heightCmError(heightCm, units, overrides),
    birthYear: requiredIntegerInRange(t('quantity.birthYear'), birthYear, birthYearBound(today), overrides),
    // Decision A1: with no stated sex only Cunningham remains, which needs body fat (isInDomain).
    bodyFat:
      bodyFat.trim() === ''
        ? sex === 'nd'
          ? t('error.valueRequired')
          : null
        : requiredInRange(t('quantity.bodyFat'), bodyFat, NUTRITION_DOMAIN.bodyFatPct, overrides, UNIT.pct),
    targetMass:
      targetMass.trim() === '' ? null : massDomainError(t('quantity.targetBodyMass'), targetMass, units, overrides),
    targetDate: targetDate === '' || isValidLocalDate(targetDate) ? null : t('error.valueRequired'),
  };
  const shown = (message: string | null): string | null => (submitted ? message : null);

  const save = (): void => {
    setSubmitted(true);
    setStatus(null);
    if (Object.values(errors).some((e) => e !== null) || heightCm === null) return;
    const birth = parseDecimal(birthYear); // [year], an integer by the rule above
    if (birth === null) return;
    try {
      useAppStore.getState().updateProfile(profile.id, {
        body: {
          ...profile.body,
          heightCm, // [cm]
          birthYear: birth, // [year]
          sex,
          baselineBodyFatPct: bodyFat.trim() === '' ? null : parseDecimal(bodyFat), // [%]
        },
        goal: {
          ...profile.goal,
          targetMassKg: targetMass.trim() === '' ? null : storedMassKg(targetMass, units), // [kg]
          targetDate: targetDate === '' ? null : targetDate,
        },
      });
    } catch {
      // Spec R5: the store refused; nothing was written.
      setStatus(t('error.outsideAccepted'));
      return;
    }
    setSubmitted(false);
    setStatus(t('status.profileSaved'));
  };

  return (
    <section className="view-section">
      <h3>{t('hero.editBody')}</h3>
      <div className="view-field">
        <p className="view-label">{t('quantity.height')}</p>
        <div className="mass-form">
          <UnitInput
            id="profile-height-a"
            quantity={t(units === 'metric' ? 'label.metres' : 'label.feet')}
            unit={null}
            inputMode="numeric"
            value={heightA}
            error={null}
            onChange={setHeightA}
          />
          <UnitInput
            id="profile-height-b"
            quantity={t(units === 'metric' ? 'label.centimetres' : 'label.inches')}
            unit={null}
            value={heightB}
            error={null}
            onChange={setHeightB}
          />
        </div>
        {shown(errors.height) !== null && <p className="view-error" role="alert">{errors.height}</p>}
      </div>
      <UnitInput
        id="profile-birth-year"
        quantity={t('quantity.birthYear')}
        unit={null}
        inputMode="numeric"
        value={birthYear}
        error={null}
        onChange={setBirthYear}
      />
      {shown(errors.birthYear) !== null && <p className="view-error" role="alert">{errors.birthYear}</p>}
      <div className="view-field">
        <label htmlFor="profile-sex">{t('label.sex')}</label>
        <select
          id="profile-sex"
          value={sex}
          onChange={(e) => {
            const next = SEX_OPTIONS.find((o) => o.value === e.target.value);
            if (next !== undefined) setSex(next.value);
          }}
        >
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.key)}
            </option>
          ))}
        </select>
      </div>
      <UnitInput id="profile-bodyfat" quantity={t('quantity.bodyFat')} unit={UNIT.pct} value={bodyFat} error={null} onChange={setBodyFat} />
      {shown(errors.bodyFat) !== null && <p className="view-error" role="alert">{errors.bodyFat}</p>}
      <UnitInput
        id="profile-target-mass"
        quantity={t('quantity.targetBodyMass')}
        unit={massUnit(units)}
        value={targetMass}
        error={null}
        onChange={setTargetMass}
      />
      {shown(errors.targetMass) !== null && <p className="view-error" role="alert">{errors.targetMass}</p>}
      <div className="view-field">
        <label htmlFor="profile-target-date">{t('label.targetDate')}</label>
        <input
          id="profile-target-date"
          type="date"
          value={targetDate}
          onChange={(e) => {
            setTargetDate(e.target.value);
          }}
        />
      </div>
      {shown(errors.targetDate) !== null && <p className="view-error" role="alert">{errors.targetDate}</p>}
      <button type="button" onClick={save}>
        {t('button.saveProfile')}
      </button>
      {status !== null && <p className="view-note" role="status">{status}</p>}
      <BodyFatRemeasure profile={profile} today={today} />
    </section>
  );
}

/**
 * Audit G05 / ROADMAP L10: body fat re-measured as a dated weigh-in carrying the percentage
 * (role `morning`), so targets read it as the newest body fat instead of the setup value.
 */
function BodyFatRemeasure(props: { profile: Profile; today: string }): JSX.Element {
  const { profile, today } = props;
  const t = useCopy();
  const overrides = useCopyOverrides();
  const latest = useAppStore((s) => latestBodyMassEntry(s, profile.id));
  const [pct, setPct] = useState(''); // [%] as typed
  const [mass, setMass] = useState(() => massText(latest?.massKg ?? profile.body.baselineMassKg, profile.units));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const log = (): void => {
    setStatus(null);
    const pctError =
      pct.trim() === ''
        ? t('error.valueRequired')
        : requiredInRange(t('quantity.bodyFat'), pct, NUTRITION_DOMAIN.bodyFatPct, overrides, UNIT.pct);
    const massError = bodyMassEntryError(t('quantity.bodyMass'), mass, profile.units, overrides);
    const bodyFatPct = parseDecimal(pct); // [%]
    const massKg = storedMassKg(mass, profile.units); // [kg]
    if (pctError !== null || massError !== null || bodyFatPct === null || massKg === null) {
      setError(pctError ?? massError ?? t('error.valueRequired'));
      return;
    }
    try {
      useAppStore.getState().logBodyMass(
        { profileId: profile.id, date: today, massKg, enteredUnit: profile.units, bodyFatPct, role: 'morning' },
        Date.now(), // [ms] epoch UTC
      );
    } catch {
      setError(t('error.outsideAccepted'));
      return;
    }
    setError(null);
    setPct('');
    setStatus(t('status.massLogged'));
  };

  return (
    <div className="view-field">
      <h3>{t('hero.bodyFatRemeasure')}</h3>
      <UnitInput id="bodyfat-remeasure-pct" quantity={t('quantity.bodyFat')} unit={UNIT.pct} value={pct} error={null} onChange={setPct} />
      <UnitInput
        id="bodyfat-remeasure-mass"
        quantity={t('quantity.bodyMass')}
        unit={massUnit(profile.units)}
        value={mass}
        error={null}
        onChange={setMass}
      />
      <button type="button" onClick={log}>
        {t('button.logBodyFat')}
      </button>
      {error !== null && <p className="view-error" role="alert">{error}</p>}
      {status !== null && <p className="view-note" role="status">{status}</p>}
    </div>
  );
}
