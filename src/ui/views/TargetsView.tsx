import { useMemo, useState, type JSX } from 'react';
import { AsciiBar } from '../components/AsciiBar';
import { massUnit, parseDecimal } from '../components/UnitInput';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { todayLocal } from '../../domain/dates';
import { dailyBeverageTargetML, type NutritionTargets } from '../../domain/nutrition';
import { volumeReport } from '../../domain/plan/generator';
import { EXERCISES } from '../../domain/plan/library';
import { IntakeEntrySchema } from '../../domain/schema';
import type { IntakeEntry, Profile } from '../../domain/types';
import { displayMass, formatVolume } from '../../domain/units';
import { useAppStore } from '../../store';
import {
  useActivePlan,
  useActiveProfile,
  useIntakeForDate,
  useNutritionTargets,
} from '../../store/selectors';
import './views.css';

/**
 * Display name of each RMR equation. A proper noun, not skin copy, which is why it is not a
 * CopyKey. SetupWizard.tsx holds an identical private map for its review screen: neither file
 * may reach into the other, and these are citations rather than sentences, so they cannot
 * drift in meaning the way a phrasing could.
 */
const RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
};

/**
 * DOM id of the intake refusal message. Both fields point at it with aria-describedby: the
 * check-in is refused as a PAIR (an entry needs both totals), so a message owned by one field
 * would leave the other looking acceptable to a screen reader.
 */
const INTAKE_ERROR_ID = 'intake-error';

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
 * The daily targets, and the one screen that writes against them.
 *
 * Every number here is DERIVED, never stored: `useNutritionTargets` recomputes it from the
 * profile and the latest body-mass entry on every render, so an edit in Settings or a new
 * weigh-in moves these figures with no recalculate control to forget (master plan section 6.3).
 *
 * Copy contract R9: the arithmetic that produced them is not inline. It sits behind the one
 * `why?` disclosure, and the intermediate quantities (RMR, TDEE) sit there with it, because
 * the user acts on the target and not on its inputs.
 */
export function TargetsView(): JSX.Element {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const profile = useActiveProfile();
  const targets = useNutritionTargets();
  const plan = useActivePlan();

  // "" only while there is no profile, in which case nothing below is rendered. Reading the
  // civil date in the profile's own zone is what makes "today" mean the user's today.
  const today = profile === null ? '' : todayLocal(profile.timezone);
  const existing = useIntakeForDate(today);

  // Held as typed, not as a number: rounding the string through Number on every keystroke
  // makes an in-progress "1." unenterable. Seeded from today's stored entry, so a correction
  // edits what is already recorded instead of starting blank and replacing it with less.
  const [kcalText, setKcalText] = useState(existing === null ? '' : String(existing.kcal));
  const [proteinText, setProteinText] = useState(
    existing === null ? '' : String(existing.proteinG),
  );
  const [rejected, setRejected] = useState(false);

  // Memoised on the plan object, which setPlan replaces wholesale, so the weekly set counts
  // are recomputed when the plan changes and not on every keystroke in the check-in form.
  const volume = useMemo(() => (plan === null ? null : volumeReport(plan, EXERCISES)), [plan]);

  if (profile === null || targets === null) return <p>{t('advice.noProfileSetupFirst')}</p>;

  /*
   * What the bars and the read-outs report is the STORED entry for today, never the draft in
   * the fields. A draft is not a record: drawing it moved the bars under every keystroke and,
   * worse, collapsed them to empty the moment the user cleared a field to correct a total
   * that is still recorded. Zero here means "nothing recorded today", which is what an empty
   * bar states.
   */
  const loggedKcal = existing?.kcal ?? 0; // [kcal/day]
  const loggedProteinG = existing?.proteinG ?? 0; // [g/day]

  const record = (): void => {
    /*
     * BOTH fields must hold a finite number before an entry exists at all. parseDecimal
     * returns null for an empty or non-numeric field, and reading that null as 0 wrote a
     * total the user never typed: 0 kcal is inside IntakeEntrySchema's bounds, so the
     * refusal never fired, and logIntake upserts by date, so the zero REPLACED whatever was
     * already recorded for today. A missing total and a zero total are different facts.
     */
    const kcal = parseDecimal(kcalText); // [kcal/day], or null when absent or non-numeric
    const proteinG = parseDecimal(proteinText); // [g/day], same
    if (kcal === null || proteinG === null) {
      setRejected(true);
      return;
    }

    const entry: IntakeEntry = {
      profileId: profile.id,
      date: today,
      kcal, // [kcal/day]
      proteinG, // [g/day]
    };
    /*
     * Validated against the schema that will have to read it back, not against bounds
     * repeated here. A daily total outside those bounds is not a display problem: it goes
     * into the single persisted document, and the next hydrate() would refuse that whole
     * document over it. Refusing the entry costs the user one correction; accepting it costs
     * them every record they have.
     */
    if (!IntakeEntrySchema.safeParse(entry).success) {
      setRejected(true);
      return;
    }
    setRejected(false);
    // Actions are read through getState() rather than subscribed to: they are created once
    // and never replaced, so a subscription only adds an unbound method to the render.
    useAppStore.getState().logIntake(profile.id, entry);
  };

  return (
    <section className="view">
      <h2>{t('hero.dailyTargets')}</h2>
      <dl className="view-dl">
        <dt>{t('label.energy')}</dt>
        <dd data-testid="target-kcal">{FORMAT.kcal(targets.targetKcal)}</dd>
        <dt>{t('label.protein')}</dt>
        <dd data-testid="target-protein">
          {FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi)}
        </dd>
        <dt>{t('label.fluid')}</dt>
        <dd data-testid="target-fluid">{formatVolume(targets.fluidML, profile.units)}</dd>
        <dt>{t('label.expectedRate')}</dt>
        <dd data-testid="target-rate">{rateText(targets, profile, overrides)}</dd>
        <dt>{t('label.creatineDose')}</dt>
        <dd data-testid="target-creatine">
          {targets.creatineG === null ? t('label.none') : FORMAT.grams(targets.creatineG)}
        </dd>
      </dl>

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
          <p>
            {FORMAT.rmrBasis(RMR_EQUATION_NAME[targets.basis.rmr], targets.basis.activityFactor)}
          </p>
          <p>{targets.basis.proteinRule}</p>
          <p>{targets.basis.deficitRule}</p>
          <p>{targets.basis.rateRule}</p>
          {/* Litres derived from the engine's mL/day constant, not restated in the copy
              table where they could drift from what the app actually prescribes. */}
          <p>
            {FORMAT.beverageBasis(dailyBeverageTargetML('male'), dailyBeverageTargetML('female'))}
          </p>
        </div>
      </details>

      <h2>{FORMAT.headingWithDate(t('hero.intakeCheckIn'), today)}</h2>
      <div className="view-field">
        <label htmlFor="intake-kcal">
          {FORMAT.quantityWithUnit(t('quantity.energyIntake'), 'kcal')}
        </label>
        <input
          id="intake-kcal"
          type="number"
          /* A daily total is a whole count, so "numeric" (a keypad with no decimal key). */
          inputMode="numeric"
          step="1"
          min="0"
          aria-invalid={rejected}
          aria-describedby={rejected ? INTAKE_ERROR_ID : undefined}
          value={kcalText}
          onChange={(e) => {
            setKcalText(e.target.value);
          }}
        />
      </div>
      <div className="view-field">
        <label htmlFor="intake-protein">
          {FORMAT.quantityWithUnit(t('quantity.proteinIntake'), 'g')}
        </label>
        <input
          id="intake-protein"
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          aria-invalid={rejected}
          aria-describedby={rejected ? INTAKE_ERROR_ID : undefined}
          value={proteinText}
          onChange={(e) => {
            setProteinText(e.target.value);
          }}
        />
      </div>
      {rejected && (
        /* role="alert" so the refusal is announced when it appears; the button that caused
           it does not move focus, so nothing else would say it. */
        <p className="view-error" id={INTAKE_ERROR_ID} role="alert" data-testid="intake-error">
          {t('advice.intakeRejected')}
        </p>
      )}
      <button type="button" onClick={record}>
        {t('button.recordIntake')}
      </button>

      <p className="view-progress">
        <AsciiBar
          value={loggedKcal}
          target={targets.targetKcal}
          label={t('label.energyProgress')}
          testId="kcal-bar"
        />{' '}
        <span data-testid="kcal-progress">
          {FORMAT.valueOfTarget(String(loggedKcal), FORMAT.kcal(targets.targetKcal))}
        </span>
      </p>
      <p className="view-progress">
        {/*
         * The denominator is the LOWER bound of the protein range, not its middle or its top.
         * The range is a floor with headroom above it, so the bar answers "is the requirement
         * met", and the read-out beside it carries the whole range.
         */}
        <AsciiBar
          value={loggedProteinG}
          target={targets.proteinG.lo}
          label={t('label.proteinProgress')}
          testId="protein-bar"
        />{' '}
        <span data-testid="protein-progress">
          {FORMAT.valueOfTarget(
            String(loggedProteinG),
            FORMAT.gramsRange(targets.proteinG.lo, targets.proteinG.hi),
          )}
        </span>
      </p>

      {volume !== null && (
        <p className="view-note" data-testid="maintenance-only">
          {FORMAT.muscleList(t('label.maintenanceOnly'), volume.maintenance, t('label.none'))}
        </p>
      )}
    </section>
  );
}
