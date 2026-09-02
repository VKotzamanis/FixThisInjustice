import { Fragment, useRef, useState, type JSX } from 'react';
import { UnitInput, loadUnit, parseDecimal } from '../components/UnitInput';
import { FORMAT } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import { dailyBeverageTargetML } from '../../domain/nutrition';
import { ProfileSchema } from '../../domain/schema';
import type { ActivityLevel, Experience, GoalKind, Profile, UnitSystem } from '../../domain/types';
import { displayLoad, formatVolume, toStoredLoad } from '../../domain/units';
import { useAppStore } from '../../store';
import { useActiveProfile } from '../../store/selectors';
import { ReminderSettingsPanel } from '../components/ReminderSettingsPanel';
import { MotivationSettings } from '../motivation/MotivationSettings';
import { DataSection } from '../settings/DataSection';
import { SkinSettings } from '../settings/SkinSettings';
import { ReadinessScreen } from '../setup/ReadinessScreen';
import './views.css';

/**
 * Option lists, each paired with the copy key that names it. The VALUES are the domain union
 * members and are never translated; only the labels come from the copy table, so a skin can
 * reword an option without changing what it selects.
 *
 * The KEY is stored, not the resolved string. A module constant is evaluated once at import,
 * so a baked label would be whatever skin was active when the module first loaded and would
 * never move again; the view resolves it per render through `useCopy()`.
 */
const ACTIVITY_OPTIONS: { value: ActivityLevel; labelKey: CopyKey }[] = [
  { value: 'sedentary', labelKey: 'option.activitySedentary' },
  { value: 'moderate', labelKey: 'option.activityModerate' },
  { value: 'vigorous', labelKey: 'option.activityVigorous' },
];

const EXPERIENCE_OPTIONS: { value: Experience; labelKey: CopyKey }[] = [
  { value: 'novice', labelKey: 'option.experienceNovice' },
  { value: 'intermediate', labelKey: 'option.experienceIntermediate' },
  { value: 'advanced', labelKey: 'option.experienceAdvanced' },
];

const GOAL_OPTIONS: { value: GoalKind; labelKey: CopyKey }[] = [
  { value: 'fat-loss', labelKey: 'option.goalFatLoss' },
  { value: 'muscle-gain', labelKey: 'option.goalMuscleGain' },
  { value: 'recomposition', labelKey: 'option.goalRecomposition' },
  { value: 'maintenance', labelKey: 'option.goalMaintenance' },
];

/**
 * A settings entry that is a whole sub-screen rather than a field of the profile.
 *
 * INSERTION POINT. P2 Task 9 (the pre-participation readiness screen) appends its row to
 * SETTINGS_ROWS below and changes nothing else in this file. Later plans do the same. A row
 * receives the active profile because every such screen needs it and none of them may reach
 * into the store for a second copy of it.
 */
interface SettingsRow {
  id: string;
  render: (profile: Profile) => JSX.Element;
}

const SETTINGS_ROWS: readonly SettingsRow[] = [
  { id: 'readiness', render: (profile) => <ReadinessRow profile={profile} /> },
  { id: 'reminders', render: () => <ReminderSettingsPanel /> },
  { id: 'motivation-clip', render: () => <MotivationSettings /> },
  /*
   * Last, and deliberately: the section holds the two destructive controls (P7 Task 6),
   * and a wipe belongs at the bottom of the screen rather than above the fields a user
   * came here to edit. It also mounts ExportView, which is written to be one row and had
   * no mount point until now, so the backup is reachable from the same place.
   */
  { id: 'data', render: () => <DataSection /> },
  { id: 'skin', render: () => <SkinSettings /> },
];

/**
 * Redo the pre-participation screening (P2 Task 9, master plan section 10.4).
 *
 * A component rather than an inline fragment because the panel holds one piece of state: whether
 * the screen is open. Calling a hook inside `SettingsRow.render`, which is a plain function
 * invoked during another component's render, would break the rules of hooks.
 *
 * This is the call site master plan section 6.7 writes `recordReadiness` for: the profile
 * already exists, so the result is written straight to it. The wizard's path is the other one,
 * and it cannot use this action because during setup there is no profile id yet.
 */
function ReadinessRow(props: { profile: Profile }): JSX.Element {
  const t = useCopy();
  const [screening, setScreening] = useState(false);
  const { profile } = props;
  const screenedAt = profile.readiness.screenedAt;

  return (
    <>
      <h2>{t('hero.readiness')}</h2>
      <p className="view-note">
        {screenedAt === null
          ? t('status.notScreened')
          : FORMAT.screenedOn(
              screenedAt,
              profile.readiness.flagged
                ? t('status.readinessConsult')
                : t('status.readinessNoFlags'),
            )}
      </p>
      {screening ? (
        <ReadinessScreen
          timezone={profile.timezone}
          onComplete={(result) => {
            useAppStore.getState().recordReadiness(profile.id, result.screenedAt, result.flagged);
            setScreening(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setScreening(true);
          }}
        >
          {screenedAt === null ? t('button.startReadiness') : t('button.redoReadiness')}
        </button>
      )}
    </>
  );
}

/**
 * A numeric setting held as a local draft and written through to the store on BLUR or ENTER.
 *
 * The text is local for the length of the edit, because a controlled input fed straight from
 * the store cannot be cleared: deleting the last character produces "", the store refuses it,
 * and the old value snaps back under the cursor.
 *
 * Committing on every keystroke that happened to validate was the defect. Typing "2500" into
 * a target wrote 2, then 25, then 250, then 2500: three of those are values the user never
 * meant, each one a persisted document and each one a figure other screens would have read
 * had the user paused there. A digit is not a decision. The commit is therefore deferred to
 * the point where the user has finished with the field, and the draft is validated against
 * the schema first, so an entry the loader would later refuse never reaches storage.
 *
 * The caller remounts this with `key={profile.units}` so a change of display unit re-seeds the
 * text from the store rather than reinterpreting a kilogram figure as pounds.
 */
function NumberSetting(props: {
  id: string;
  quantity: string;
  unit: string;
  initial: string;
  /** null when the value is acceptable; otherwise the message to show beside the field. */
  validate: (value: number | null) => string | null;
  commit: (value: number) => void;
}): JSX.Element {
  const t = useCopy();
  const [draft, setDraft] = useState(props.initial);
  const [error, setError] = useState<string | null>(null);
  /*
   * The text last written through. A ref, not state: nothing renders from it. It exists so a
   * commit attempt that changes nothing writes nothing — the blur that follows an Enter, and
   * a focus-and-leave with no edit, would otherwise each repeat a write the store has taken.
   */
  const committed = useRef(props.initial);
  const errorId = `${props.id}-error`;

  const commitDraft = (): void => {
    if (draft === committed.current) {
      setError(null);
      return;
    }
    const parsed = parseDecimal(draft);
    const message = props.validate(parsed);
    if (parsed === null || message !== null) {
      // `?? t(...)` covers a validator that accepts an absent value: there is still no
      // number to commit, so the field is refused rather than silently left alone.
      setError(message ?? t('error.valueRequired'));
      return;
    }
    setError(null);
    committed.current = draft;
    props.commit(parsed);
  };

  return (
    <div
      className="view-setting"
      /*
       * React delivers onBlur through focusout, which bubbles, so this wrapper hears the
       * field lose focus without UnitInput having to grow a blur prop. onKeyDown does the
       * same for Enter, which has no default action outside a form.
       */
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft();
        }
      }}
    >
      <UnitInput
        id={props.id}
        quantity={props.quantity}
        unit={props.unit}
        value={draft}
        /*
         * The message is rendered HERE rather than by UnitInput. UnitInput's own `error`
         * carries .wiz-error, which is scoped to the setup wizard's stylesheet and is not
         * loaded by a view; a refusal in a view has to carry .view-error. `sharedErrorId` is
         * the documented seam for a caller-rendered message: it still sets aria-describedby
         * and aria-invalid on the field, so the wiring is unchanged.
         */
        error={null}
        sharedErrorId={error === null ? null : errorId}
        onChange={(next) => {
          setDraft(next);
          // The refusal clears while the user is fixing it, and comes back on the next
          // commit attempt if the new draft is still refused. A message that argues with
          // every keystroke is noise, not feedback.
          if (error !== null) setError(null);
        }}
      />
      {error !== null && (
        <p className="view-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Profile editing.
 *
 * Targets are derived and never stored (master plan section 6.3), so every change here
 * recomputes them on the next render of the targets view: there is no recalculate control to
 * forget to press, and no second copy of a number to go stale.
 *
 * Numeric fields are validated against the schema that will have to read them back rather
 * than against bounds restated here. The one persisted document is the thing at risk: a value
 * this screen accepts and the loader later refuses would cost the user the whole document.
 */
export function SettingsView(): JSX.Element {
  // Before the no-profile return, so the hook count does not depend on the store.
  const t = useCopy();
  const profile = useActiveProfile();
  const profiles = useAppStore((s) => s.profiles);

  if (profile === null) return <p>{t('advice.noProfileSetupFirst')}</p>;

  // Actions are read through getState() rather than subscribed to: they are created once and
  // never replaced, so a subscription only adds an unbound method to the render.
  const updateProfile = (patch: Partial<Profile>): void => {
    useAppStore.getState().updateProfile(profile.id, patch);
  };

  const units = profile.units;
  const profileIds = Object.keys(profiles);

  /** Reject what the schema would reject, in the same words for every numeric field. */
  const stepError = (value: number | null): string | null => {
    if (value === null) return t('error.valueRequired');
    if (!(value > 0)) return t('error.positive');
    const patched = { ...profile.equipmentSteps, barbellKg: toStoredLoad(value, units) }; // [kg]
    return ProfileSchema.shape.equipmentSteps.safeParse(patched).success
      ? null
      : t('error.outsideAccepted');
  };

  const fluidError = (value: number | null): string | null => {
    if (value === null) return t('error.valueRequired');
    // A zero or negative daily target is a broken DENOMINATOR, not a preference: P4 renders
    // hydration as volume/target. updateProfile throws on it, so it is caught here first.
    if (!(value > 0)) return t('error.positive');
    const patched = { ...profile.hydration, dailyTargetML: value }; // [mL/day]
    return ProfileSchema.shape.hydration.safeParse(patched).success
      ? null
      : t('error.outsideAccepted');
  };

  return (
    <section className="view">
      <h2>{t('hero.profile')}</h2>

      {profileIds.length > 1 && (
        <div className="view-field">
          <label htmlFor="settings-active-profile">{t('label.activeProfile')}</label>
          <select
            id="settings-active-profile"
            value={profile.id}
            onChange={(e) => {
              useAppStore.getState().setActiveProfile(e.target.value);
            }}
          >
            {profileIds.map((id) => (
              <option key={id} value={id}>
                {profiles[id]?.displayName ?? id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="view-field">
        <label htmlFor="settings-units">{t('label.displayUnit')}</label>
        <select
          id="settings-units"
          value={units}
          onChange={(e) => {
            // Display only. Storage stays canonical kg and mL (master plan section 3), so this
            // changes what is shown and never what is held.
            const next: UnitSystem = e.target.value === 'imperial' ? 'imperial' : 'metric';
            updateProfile({ units: next });
          }}
        >
          <option value="metric">{t('label.unitsMetric')}</option>
          <option value="imperial">{t('label.unitsImperial')}</option>
        </select>
      </div>
      <p className="view-note">{t('advice.storedUnitsUnchanged')}</p>

      <div className="view-field">
        <label htmlFor="settings-activity">{t('label.activity')}</label>
        <select
          id="settings-activity"
          value={profile.activity}
          onChange={(e) => {
            const next = ACTIVITY_OPTIONS.find((o) => o.value === e.target.value);
            if (next !== undefined) updateProfile({ activity: next.value });
          }}
        >
          {ACTIVITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="view-field">
        <label htmlFor="settings-experience">{t('label.experience')}</label>
        <select
          id="settings-experience"
          value={profile.experience}
          onChange={(e) => {
            const next = EXPERIENCE_OPTIONS.find((o) => o.value === e.target.value);
            if (next !== undefined) updateProfile({ experience: next.value });
          }}
        >
          {EXPERIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="view-field">
        <label htmlFor="settings-goal">{t('label.goal')}</label>
        <select
          id="settings-goal"
          value={profile.goal.kind}
          onChange={(e) => {
            const next = GOAL_OPTIONS.find((o) => o.value === e.target.value);
            // The whole sub-object: updateProfile merges shallowly by contract.
            if (next !== undefined) {
              updateProfile({ goal: { ...profile.goal, kind: next.value } });
            }
          }}
        >
          {GOAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <label className="view-inline">
        <input
          type="checkbox"
          checked={profile.supplements.creatine}
          onChange={(e) => {
            updateProfile({ supplements: { creatine: e.target.checked } });
          }}
        />
        {t('label.creatine')}
      </label>
      <p className="view-note">{t('advice.creatineOnly')}</p>

      <h2>{t('hero.equipmentSteps')}</h2>
      <NumberSetting
        key={`barbell-${units}`}
        id="settings-barbell-step"
        quantity={t('quantity.barbellStep')}
        unit={loadUnit(units)}
        initial={String(displayLoad(profile.equipmentSteps.barbellKg, units))}
        validate={stepError}
        commit={(value) => {
          updateProfile({
            equipmentSteps: {
              ...profile.equipmentSteps,
              barbellKg: toStoredLoad(value, units), // [kg] total on the bar, exact conversion
            },
          });
        }}
      />
      <label className="view-inline">
        <input
          type="checkbox"
          checked={profile.equipmentSteps.hasMicroPlates}
          onChange={(e) => {
            updateProfile({
              equipmentSteps: { ...profile.equipmentSteps, hasMicroPlates: e.target.checked },
            });
          }}
        />
        {t('label.microPlates')}
      </label>
      <p className="view-note">{t('advice.loadSteps')}</p>

      <h2>{t('hero.hydration')}</h2>
      <NumberSetting
        key="fluid"
        id="settings-fluid-target"
        quantity={t('quantity.dailyBeverageTarget')}
        /* Entered and stored in mL either way: the canonical volume unit has no display form
           in this field, because a fractional fluid ounce would round on every keystroke. */
        unit="mL"
        initial={String(profile.hydration.dailyTargetML)}
        validate={fluidError}
        commit={(value) => {
          updateProfile({
            hydration: { ...profile.hydration, dailyTargetML: value }, // [mL/day]
          });
        }}
      />
      <p className="view-note">
        {FORMAT.beverageDefault(formatVolume(dailyBeverageTargetML(profile.body.sex), units))}
      </p>
      {/* R9: the derivation of that default, and what it deliberately excludes. The litres
          come from the engine's mL/day constant rather than being restated in the copy
          table, so the sentence cannot describe a share the app does not prescribe. */}
      <details>
        <summary>{t('disclosure.why')}</summary>
        <p className="view-note">
          {FORMAT.beverageBasis(dailyBeverageTargetML('male'), dailyBeverageTargetML('female'))}
        </p>
      </details>

      {SETTINGS_ROWS.map((row) => (
        <Fragment key={row.id}>{row.render(profile)}</Fragment>
      ))}
    </section>
  );
}
