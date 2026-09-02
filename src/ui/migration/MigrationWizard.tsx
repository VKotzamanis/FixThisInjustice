import { useMemo, useState, type JSX } from 'react';

import { FORMAT, copy } from '../../content/copy';
import { applyMigration, migrateV2 } from '../../domain/migrations/v2';
import type { LegacyUnit, MigrateV2Result, MigrationSkip } from '../../domain/migrations/v2';
import type { PlanTemplate, Profile } from '../../domain/types';
import { selectState, useAppStore } from '../../store';
import { deleteLegacyV2 } from '../../store/persistence';
import '../views/views.css';
import './migration.css';

/**
 * The word typed before the one step that writes. The same shape as the recovery screen's
 * DELETE (src/app/RootErrorBoundary.tsx): capitals, one verb, matched exactly.
 */
const CONFIRMATION_WORD = 'IMPORT';

/** The unit the wizard assumes for body mass unless the user overrules it (v2.ts). */
const DEFAULT_BODY_MASS_UNIT: LegacyUnit = 'lb';

export interface MigrationWizardProps {
  /** The legacy document as text, exactly as persistence.ts read it. Never pre-parsed. */
  legacyRaw: string;
  /** The profile every migrated record is keyed by. The migration cannot run without one. */
  profile: Profile;
  /** The plan the migrated sets are matched against. */
  plan: PlanTemplate;
  /**
   * The wizard has nothing further to do and its host should stop rendering it.
   *
   * A function-typed property, not a method shorthand: the component destructures it off the
   * props object, and a method declared with shorthand is flagged by @typescript-eslint's
   * unbound-method rule for exactly that reason (the same argument ToastQueue.tsx records).
   */
  onFinished: () => void;
}

/** explain: the offer and the unit question. preview: the report. applied: the delete offer. */
type Phase = 'explain' | 'preview' | 'applied';

/** What the user decided about the legacy copy after the import was written. */
type LegacyDecision = 'deleted' | 'kept';

/**
 * The thrown value's message, read structurally rather than through `instanceof Error`: a
 * value thrown across realms is not an instance of this realm's Error, and String(e) would
 * silently degrade a real message to "Name: message".
 */
function messageOf(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const message: unknown = Reflect.get(e, 'message');
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return String(e);
}

/** One radio in a unit question. */
function UnitRadio(props: {
  name: string;
  unit: LegacyUnit;
  label: string;
  selected: LegacyUnit | null;
  onSelect(next: LegacyUnit): void;
}): JSX.Element {
  return (
    <label className="view-inline">
      <input
        type="radio"
        name={props.name}
        value={props.unit}
        checked={props.selected === props.unit}
        onChange={() => {
          props.onSelect(props.unit);
        }}
      />
      {props.label}
    </label>
  );
}

/** A refused-record list, rendered behind its own disclosure. */
function SkipList(props: { summary: string; skips: MigrationSkip[] }): JSX.Element | null {
  if (props.skips.length === 0) return null;
  return (
    <details>
      <summary>{props.summary}</summary>
      <ul>
        {props.skips.map((skip, index) => (
          // The key is composed with the index: the migration does not promise that two
          // refusals from different origins carry different identifiers.
          <li key={`${skip.key}-${String(index)}`}>{FORMAT.legacySkip(skip.key, skip.reason)}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The one-way import of the legacy console document.
 *
 * Three properties hold at every step, and each is a decision the review asked for:
 *
 *  1. The legacy key is never written or removed until the migrated document has been written
 *     AND that write has been read back as successful. Until then the legacy text is the only
 *     complete copy of the records the migration refused, which the report has just listed.
 *  2. The load unit is asked for and never defaulted. The legacy store held a bare number, so
 *     the wrong answer rescales the entire load history by the pound-to-kilogram factor, and a
 *     default would make that the silent case. Body mass IS defaulted, because the legacy app
 *     carried three independent pieces of evidence for pounds (v2.ts); the assumption is shown
 *     with its evidence and can be overruled.
 *  3. Nothing is committed before the typed confirmation, and the preview the user confirms is
 *     the report of the migration that will be installed, not a second run of it.
 *
 * The wizard adds no store action. It installs through `importJson`, which is the store's own
 * replace path and runs `parseState` on the way in, so a document this component could not
 * have produced is refused rather than stored.
 */
export function MigrationWizard(props: MigrationWizardProps): JSX.Element {
  const { legacyRaw, profile, plan, onFinished } = props;

  const [phase, setPhase] = useState<Phase>('explain');
  const [loadUnit, setLoadUnit] = useState<LegacyUnit | null>(null);
  const [bodyMassUnit, setBodyMassUnit] = useState<LegacyUnit>(DEFAULT_BODY_MASS_UNIT);
  const [outcome, setOutcome] = useState<MigrateV2Result | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [stored, setStored] = useState(false);
  const [decision, setDecision] = useState<LegacyDecision | null>(null);

  /**
   * The legacy text is parsed here rather than in persistence.ts, which is forbidden to look
   * inside it, and `migrateV2` takes a value rather than a string. A parse failure is reported
   * as a refusal with its own reason, in the same shape the migration returns.
   */
  const parsed = useMemo<{ ok: true; value: unknown } | { ok: false; reason: string }>(() => {
    try {
      return { ok: true, value: JSON.parse(legacyRaw) as unknown };
    } catch (e) {
      return { ok: false, reason: `the legacy document is not JSON: ${messageOf(e)}` };
    }
  }, [legacyRaw]);

  const dismiss = (): void => {
    // 'dismissed', not a deletion: the offer is not made again, and the legacy key survives so
    // the user can change their mind from Settings.
    useAppStore.getState().setUi({ legacyMigration: 'dismissed' });
    onFinished();
  };

  const runPreview = (): void => {
    if (loadUnit === null || !parsed.ok) return;
    setOutcome(
      migrateV2(parsed.value, {
        units: loadUnit,
        bodyMassUnits: bodyMassUnit,
        timezone: profile.timezone,
        profile,
        plan,
      }),
    );
    setPhase('preview');
  };

  const commit = (): void => {
    if (outcome === null || !outcome.ok) return;
    setApplyError(null);

    const merged = applyMigration(selectState(useAppStore.getState()), outcome.state, profile.id);
    if (!merged.ok) {
      setApplyError(merged.reason);
      return;
    }

    // Serialised here, before it is installed. save() would hit the same JSON.stringify a
    // moment later, and a document that cannot be serialised must not become the in-memory
    // state of an app that can then never write it.
    let text: string;
    try {
      text = JSON.stringify(merged.state);
    } catch (e) {
      setApplyError(messageOf(e));
      return;
    }

    const installed = useAppStore.getState().importJson(text);
    if (!installed.ok) {
      setApplyError(installed.error);
      return;
    }

    // applyMigration already writes ui.legacyMigration = 'done'. Checked rather than assumed,
    // and patched only when it is absent: an unconditional setUi would mint a new `ui` object
    // and cost a second write for nothing.
    if (useAppStore.getState().ui.legacyMigration !== 'done') {
      useAppStore.getState().setUi({ legacyMigration: 'done' });
    }

    // The write goes now rather than on the persistence debounce, so its outcome can be read
    // back before the legacy copy is offered for deletion.
    useAppStore.getState().retrySave();
    const status = useAppStore.getState().status;
    // retrySave() returns without writing when the store has not hydrated or is holding an
    // unreadable document, and reports nothing in that case. A null lastSaveError is therefore
    // not on its own evidence of a write; all three conditions are.
    setStored(status.hydrated && status.lastLoadError === null && status.lastSaveError === null);
    setPhase('applied');
  };

  const removeLegacy = (): void => {
    deleteLegacyV2();
    setDecision('deleted');
  };

  const dismissButton = (
    <button type="button" onClick={dismiss}>
      {copy('button.legacyDismiss')}
    </button>
  );

  const refusal: string | null = !parsed.ok
    ? parsed.reason
    : outcome !== null && !outcome.ok
      ? outcome.reason
      : null;

  if (refusal !== null) {
    return (
      <section className="view migration" aria-labelledby="migration-hero">
        <h2 id="migration-hero">{copy('hero.legacyImport')}</h2>
        <p role="alert">{copy('advice.legacyRefused')}</p>
        <p className="view-error">{FORMAT.legacyRefusedReason(refusal)}</p>
        <p>{copy('advice.legacyNothingDeleted')}</p>
        <div className="migration-actions">{dismissButton}</div>
      </section>
    );
  }

  if (phase === 'explain') {
    return (
      <section className="view migration" aria-labelledby="migration-hero">
        <h2 id="migration-hero">{copy('hero.legacyImport')}</h2>
        <p>{copy('advice.legacyFound')}</p>
        <details>
          <summary>{copy('disclosure.whatTransfers')}</summary>
          <p>{copy('advice.legacyTransfers')}</p>
        </details>

        <fieldset className="view-field">
          <legend>{copy('label.legacyLoadUnit')}</legend>
          <p className="view-note">{copy('advice.legacyUnitRequired')}</p>
          <UnitRadio
            name="legacy-load-unit"
            unit="kg"
            label={copy('label.legacyUnitKg')}
            selected={loadUnit}
            onSelect={setLoadUnit}
          />
          <UnitRadio
            name="legacy-load-unit"
            unit="lb"
            label={copy('label.legacyUnitLb')}
            selected={loadUnit}
            onSelect={setLoadUnit}
          />
        </fieldset>

        <p>{FORMAT.legacyBodyMassAssumed(bodyMassUnit)}</p>
        <details>
          <summary>{copy('disclosure.why')}</summary>
          <p>{copy('advice.legacyBodyMassEvidence')}</p>
          <fieldset className="view-field">
            <legend>{copy('label.legacyBodyMassUnit')}</legend>
            <UnitRadio
              name="legacy-mass-unit"
              unit="kg"
              label={copy('label.legacyMassUnitKg')}
              selected={bodyMassUnit}
              onSelect={setBodyMassUnit}
            />
            <UnitRadio
              name="legacy-mass-unit"
              unit="lb"
              label={copy('label.legacyMassUnitLb')}
              selected={bodyMassUnit}
              onSelect={setBodyMassUnit}
            />
          </fieldset>
        </details>

        <p>{copy('advice.legacyNothingDeleted')}</p>
        <div className="migration-actions">
          <button type="button" disabled={loadUnit === null} onClick={runPreview}>
            {copy('button.legacyPreview')}
          </button>
          {dismissButton}
        </div>
      </section>
    );
  }

  if (outcome === null || !outcome.ok) {
    // Unreachable: `refusal` above covers the failed migration and `phase` only leaves
    // 'explain' through runPreview, which sets `outcome`. Rendered rather than thrown so a
    // future edit that breaks the invariant does not take the tree down.
    return (
      <section className="view migration" aria-labelledby="migration-hero">
        <h2 id="migration-hero">{copy('hero.legacyImport')}</h2>
        <p role="alert">{copy('advice.legacyApplyFailed')}</p>
        <div className="migration-actions">{dismissButton}</div>
      </section>
    );
  }

  const { report } = outcome;

  if (phase === 'preview') {
    return (
      <section className="view migration" aria-labelledby="migration-hero">
        <h2 id="migration-hero">{copy('hero.legacyPreview')}</h2>
        <ul className="migration-report">
          <li>{FORMAT.legacySets(report.setsMigrated)}</li>
          <li>{FORMAT.legacySessions(report.sessionsMigrated)}</li>
          <li>{FORMAT.legacyDropped(report.setsSkipped.length)}</li>
          <li>{FORMAT.legacyFallbacks(report.sessionFallbacks.length)}</li>
        </ul>
        <p>{FORMAT.legacyUnitsAssumed(report.unitsAssumed.loads, report.unitsAssumed.bodyMass)}</p>

        <SkipList summary={copy('disclosure.whatWasRefused')} skips={report.setsSkipped} />
        <SkipList summary={copy('disclosure.whatWasNotMatched')} skips={report.sessionFallbacks} />

        <p>{copy('advice.legacyNothingDeleted')}</p>
        {applyError !== null && (
          <p className="view-error" role="alert">
            {copy('advice.legacyApplyFailed')} {FORMAT.legacyRefusedReason(applyError)}
          </p>
        )}

        <div className="view-field">
          <label htmlFor="migration-confirm">{copy('label.legacyConfirm')}</label>
          <input
            id="migration-confirm"
            type="text"
            autoComplete="off"
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
            }}
          />
        </div>

        <div className="migration-actions">
          <button type="button" disabled={confirmation !== CONFIRMATION_WORD} onClick={commit}>
            {copy('button.legacyApply')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('explain');
            }}
          >
            {copy('button.back')}
          </button>
          {dismissButton}
        </div>
      </section>
    );
  }

  return (
    <section className="view migration" aria-labelledby="migration-hero">
      <h2 id="migration-hero">{copy('hero.legacyDone')}</h2>
      <ul className="migration-report">
        <li>{FORMAT.legacySets(report.setsMigrated)}</li>
        <li>{FORMAT.legacySessions(report.sessionsMigrated)}</li>
        <li>{FORMAT.legacyDropped(report.setsSkipped.length)}</li>
      </ul>
      <p>{stored ? copy('advice.legacyStored') : copy('advice.legacyStoreUnconfirmed')}</p>
      {decision === 'deleted' && <p>{copy('advice.legacyOldDataDeleted')}</p>}
      {decision === 'kept' && <p>{copy('advice.legacyOldDataKept')}</p>}

      <div className="migration-actions">
        {decision === null && stored && (
          <>
            <button type="button" onClick={removeLegacy}>
              {copy('button.legacyDeleteOld')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision('kept');
              }}
            >
              {copy('button.legacyKeepOld')}
            </button>
          </>
        )}
        <button type="button" onClick={onFinished}>
          {copy('button.legacyClose')}
        </button>
      </div>
    </section>
  );
}
