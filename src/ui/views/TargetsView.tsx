import { useMemo, useState, type JSX } from 'react';
import { displayClass } from '../format/display';
import { NO_VALUE } from '../format/plan';
import { AsciiBar } from '../components/AsciiBar';
import { massUnit, parseDecimal } from '../components/UnitInput';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { RMR_EQUATION_NAME } from '../../content/rmrEquations';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { addDays } from '../../domain/dates';
import { nutritionDomainIssue, type DomainField } from '../../domain/measurements';
import { statedBeverageTargetML, type NutritionTargets } from '../../domain/nutrition';
import { volumeReport } from '../../domain/plan/generator';
import { EXERCISES } from '../../domain/plan/library';
import { IntakeEntrySchema } from '../../domain/schema';
import type { IntakeEntry, LocalDate, Profile } from '../../domain/types';
import { displayMass, formatBeverageTarget, formatVolume } from '../../domain/units';
import { useAppStore } from '../../store';
import {
  useActivePlan,
  useActiveProfile,
  useCivilToday,
  useIntakeForDate,
  useMinuteClock,
  useNutritionInput,
  useNutritionTargets,
} from '../../store/selectors';
import './views.css';

/**
 * DOM id of the intake refusal message. Both fields point at it with aria-describedby: the
 * check-in is refused as a PAIR (an entry needs both totals), so a message owned by one field
 * would leave the other looking acceptable to a screen reader.
 */
const INTAKE_ERROR_ID = 'intake-error';

/** [d] The check-in day select and the history list: today and the six days before it. */
const INTAKE_DAYS = 7;

/** The quantity each domain refusal names (audit G09). */
const DOMAIN_FIELD_KEY: Record<DomainField, CopyKey> = {
  massKg: 'quantity.bodyMass',
  heightCm: 'quantity.height',
  ageYears: 'quantity.age',
  bodyFatPct: 'quantity.bodyFat',
  sessionsPerWeek: 'quantity.weeklySessionTarget',
};

/**
 * "-0.6 kg/week", or the honest statement that the evidence base gives no rate.
 *
 * `overrides` is the active skin's table, passed in rather than read here: this is a plain
 * function and a hook inside it would be a rules-of-hooks violation.
 */
function rateText(
  targets: NutritionTargets,
  profile: Profile,
  overrides: Readonly<Partial<Record<CopyKey, string>>>,
): string {
  if (targets.expectedRateKgPerWeek === null) return copy('status.rateUnknown', overrides);
  // Sign convention: negative = mass loss. displayMass rounds to 0.1 in the display unit.
  return FORMAT.signedRate(
    displayMass(targets.expectedRateKgPerWeek, profile.units),
    massUnit(profile.units),
  );
}

/**
 * One day's intake check-in. Keyed on its date by the caller (audit G13): the fields are seeded
 * from THAT day's stored entry when the form mounts, and a new date is a new form, so a value
 * typed for one day can never be recorded under another.
 */
function IntakeCheckIn(props: { profile: Profile; date: LocalDate; targets: NutritionTargets }): JSX.Element {
  const { profile, date, targets } = props;
  const t = useCopy();
  const existing = useIntakeForDate(date);
  // Held as typed, not as a number: an in-progress "1." must stay enterable.
  const [kcalText, setKcalText] = useState(existing === null ? '' : String(existing.kcal));
  const [proteinText, setProteinText] = useState(existing === null ? '' : String(existing.proteinG));
  const [rejected, setRejected] = useState(false);

  // The bars report the STORED entry, never the draft: zero means "nothing recorded".
  const loggedKcal = existing?.kcal ?? 0; // [kcal/day]
  const loggedProteinG = existing?.proteinG ?? 0; // [g/day]

  const record = (): void => {
    // BOTH fields must hold a number: a missing total is not a zero total.
    const kcal = parseDecimal(kcalText); // [kcal/day], or null
    const proteinG = parseDecimal(proteinText); // [g/day], or null
    if (kcal === null || proteinG === null) {
      setRejected(true);
      return;
    }
    const entry: IntakeEntry = { profileId: profile.id, date, kcal, proteinG };
    // Validated against the schema that reads it back: a refused value costs one correction,
    // a stored one the user's whole document.
    if (!IntakeEntrySchema.safeParse(entry).success) {
      setRejected(true);
      return;
    }
    setRejected(false);
    useAppStore.getState().logIntake(profile.id, entry);
  };

  // Carries the date, a numeral, so displayClass keeps it out of the display cut.
  const checkInHeading = FORMAT.headingWithDate(t('hero.intakeCheckIn'), date);

  return (
    <>
      <h2 className={displayClass(checkInHeading)}>{checkInHeading}</h2>
      <div className="view-field">
        <label htmlFor="intake-kcal">{FORMAT.quantityWithUnit(t('quantity.energyIntake'), 'kcal')}</label>
        <input
          id="intake-kcal"
          /* Spec R4: text parsed by parseDecimal, so "2,100" is refused, never read as 2.1. */
          type="text"
          inputMode="numeric"
          aria-invalid={rejected}
          aria-describedby={rejected ? INTAKE_ERROR_ID : undefined}
          value={kcalText}
          onChange={(e) => {
            setKcalText(e.target.value);
          }}
        />
      </div>
      <div className="view-field">
        <label htmlFor="intake-protein">{FORMAT.quantityWithUnit(t('quantity.proteinIntake'), 'g')}</label>
        <input
          id="intake-protein"
          /* Spec R4: text parsed by parseDecimal, so "2,100" is refused, never read as 2.1. */
          type="text"
          inputMode="numeric"
          aria-invalid={rejected}
          aria-describedby={rejected ? INTAKE_ERROR_ID : undefined}
          value={proteinText}
          onChange={(e) => {
            setProteinText(e.target.value);
          }}
        />
      </div>
      {rejected && (
        <p className="view-error" id={INTAKE_ERROR_ID} role="alert" data-testid="intake-error">
          {t('advice.intakeRejected')}
        </p>
      )}
      <button type="button" className="is-primary" onClick={record}>
        {t('button.recordIntake')}
      </button>
      {/* Bar and totals on two lines: together they wrapped at 320 px (owner report on 4a27393). */}
      <p className="view-progress">
        <AsciiBar value={loggedKcal} target={targets.targetKcal} label={t('label.energyProgress')} testId="kcal-bar" />
      </p>
      <p className="view-progress-totals">
        <span data-testid="kcal-progress">
          {FORMAT.valueOfTarget(String(loggedKcal), FORMAT.kcal(targets.targetKcal))}
        </span>
      </p>
      <p className="view-progress">
        {/* The denominator is the LOWER bound of the protein range: "is the requirement met". */}
        <AsciiBar value={loggedProteinG} target={targets.proteinG.lo} label={t('label.proteinProgress')} testId="protein-bar" />
      </p>
      <p className="view-progress-totals">
        <span data-testid="protein-progress">
          {FORMAT.valueOfTarget(String(loggedProteinG), FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi))}
        </span>
      </p>
    </>
  );
}

/**
 * The daily targets, and the one screen that writes against them. Every number is DERIVED from
 * the profile and the newest measurements on every render (master plan section 6.3); the
 * arithmetic sits behind the one `why?` disclosure (copy contract R9).
 */
export function TargetsView(): JSX.Element {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const profile = useActiveProfile();
  // Audit G13: one ticking clock for the age term and the civil date.
  const now = useMinuteClock(); // [ms] epoch UTC
  const input = useNutritionInput(now);
  const targets = useNutritionTargets(now);
  const plan = useActivePlan();
  const today = useCivilToday() ?? '';
  // Audit G17: the day the check-in is for; null follows today, including across midnight.
  const [pickedDay, setPickedDay] = useState<LocalDate | null>(null);
  const days = useMemo<LocalDate[]>(
    () => (today === '' ? [] : Array.from({ length: INTAKE_DAYS }, (_, i) => addDays(today, -i))),
    [today],
  );
  const checkInDay = pickedDay !== null && days.includes(pickedDay) ? pickedDay : today;
  const intake = useAppStore((s) => (s.activeProfileId === null ? null : (s.intake[s.activeProfileId] ?? null)));
  // Memoised on the plan object: recomputed when the plan changes, not on every keystroke.
  const volume = useMemo(() => (plan === null ? null : volumeReport(plan, EXERCISES)), [plan]);

  if (profile === null) return <p>{t('advice.noProfileSetupFirst')}</p>;
  if (targets === null) {
    // Audit G09: a profile whose inputs left the equations' domain is told WHICH input.
    const issue = input === null ? null : nutritionDomainIssue(input);
    return (
      <p role="status">
        {issue === null
          ? t('advice.noProfileSetupFirst')
          : FORMAT.withSlots('advice.outsideEquations', { field: t(DOMAIN_FIELD_KEY[issue]) }, overrides)}
      </p>
    );
  }

  return (
    <section className="view targets">
      <h2 className={displayClass(t('hero.dailyTargets'))}>{t('hero.dailyTargets')}</h2>
      <dl className="view-dl">
        <dt>{t('label.energy')}</dt>
        <dd data-testid="target-kcal">{FORMAT.kcal(targets.targetKcal)}</dd>
        <dt>{t('label.protein')}</dt>
        <dd data-testid="target-protein">{FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi)}</dd>
        <dt>{t('label.fluid')}</dt>
        {/* Audit G14: ONE fluid target, the stored and editable one the quick add and the banner
            measure against; the IOM 2005 figure is the reference beside it. */}
        <dd data-testid="target-fluid">{formatVolume(profile.hydration.dailyTargetML, profile.units)}</dd>
        <dt>{t('label.expectedRate')}</dt>
        <dd data-testid="target-rate">{rateText(targets, profile, overrides)}</dd>
        <dt>{t('label.creatineDose')}</dt>
        <dd data-testid="target-creatine">
          {targets.creatineG === null ? t('label.none') : FORMAT.grams(targets.creatineG)}
        </dd>
      </dl>
      <p className="view-note" data-testid="fluid-reference">
        {targets.fluidML.kind === 'stated'
          ? FORMAT.beverageDefault(formatBeverageTarget(targets.fluidML, profile.units))
          : FORMAT.beveragePerSex(formatBeverageTarget(targets.fluidML, profile.units))}
      </p>

      {/* R9: the derivation, and the intermediate quantities it passes through. */}
      <details data-testid="basis">
        <summary>{t('disclosure.why')}</summary>
        <div className="view-note">
          <dl className="view-dl">
            <dt>{t('label.rmr')}</dt>
            <dd>{FORMAT.kcal(targets.rmrKcal)}</dd>
            <dt>{t('label.tdee')}</dt>
            <dd>{FORMAT.kcal(targets.tdeeKcal)}</dd>
          </dl>
          <p>{FORMAT.rmrBasis(RMR_EQUATION_NAME[targets.basis.rmr], targets.basis.activityFactor)}</p>
          <p>{targets.basis.proteinRule}</p>
          <p>{targets.basis.deficitRule}</p>
          <p>{targets.basis.rateRule}</p>
          <p>{FORMAT.beverageBasis(statedBeverageTargetML('male'), statedBeverageTargetML('female'))}</p>
        </div>
      </details>

      <div className="view-field">
        <label htmlFor="intake-day">{t('label.checkInDay')}</label>
        <select
          id="intake-day"
          value={checkInDay}
          onChange={(e) => {
            setPickedDay(e.target.value === today ? null : e.target.value);
          }}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {checkInDay !== '' && (
        <IntakeCheckIn key={checkInDay} profile={profile} date={checkInDay} targets={targets} />
      )}

      <h3>{t('hero.intakeHistory')}</h3>
      <ul className="view-list" data-testid="intake-history">
        {days.map((d) => {
          const e = (intake ?? []).find((x) => x.date === d) ?? null;
          return (
            <li key={d}>
              {`${d}  ${e === null ? NO_VALUE : FORMAT.kcal(e.kcal)}  ${e === null ? NO_VALUE : FORMAT.grams(e.proteinG)}`}
            </li>
          );
        })}
      </ul>

      {volume !== null && (
        <p className="view-note" data-testid="maintenance-only">
          {FORMAT.muscleList(t('label.maintenanceOnly'), volume.maintenance, t('label.none'))}
        </p>
      )}
    </section>
  );
}
