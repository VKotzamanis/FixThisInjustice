import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';

import { FORMAT } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import { applyMigration, migrateV2 } from '../../domain/migrations/v2';
import type { LegacyUnit, MigrateV2Result, MigrationSkip } from '../../domain/migrations/v2';
import type { PlanTemplate, Profile } from '../../domain/types';
import { todayLocal } from '../../domain/dates';
import { selectState, useAppStore } from '../../store';
import { deleteLegacyV2, readLegacyBundle } from '../../store/persistence';
import { ConfirmDestructive } from '../components/ConfirmDestructive';
import '../views/views.css';
import './migration.css';

/**
 * The word typed before the one step that writes. The same shape as the recovery screen's
 * DELETE (src/app/RootErrorBoundary.tsx): capitals, one verb, matched exactly.
 */
const CONFIRMATION_WORD = 'IMPORT';

/**
 * The word typed before the one step that destroys. Both words reach their labels through
 * FORMAT.typeToConfirm, so no skin can name a word the control does not accept (finding 3).
 */
const DELETE_WORD = 'DELETE';


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
 * Five properties hold at every step, and each is a decision a review asked for:
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
 *  4. The delete is a destructive action and takes both of the gates the master plan puts on
 *     one (section 3): the untouched legacy keys downloaded from this panel as one bundle,
 *     then the word typed exactly. It is ConfirmDestructive that holds them, not this component, so the
 *     wipe controls in Settings inherit the same two gates rather than a second reading of
 *     them (code review finding 1).
 *  5. ui.legacyMigration = 'done' is written only after the write it describes has been read
 *     back. The decision closes the offer permanently, so it must not survive a save that
 *     failed and took the imported records with it (code review finding 7).
 *
 * The wizard adds no store action. It installs through `importJson`, which is the store's own
 * replace path and runs `parseState` on the way in, so a document this component could not
 * have produced is refused rather than stored.
 */
export function MigrationWizard(props: MigrationWizardProps): JSX.Element {
  const t = useCopy();
  const { legacyRaw, profile, plan, onFinished } = props;

  const [phase, setPhase] = useState<Phase>('explain');
  const [loadUnit, setLoadUnit] = useState<LegacyUnit | null>(null);
  const [bodyMassUnit, setBodyMassUnit] = useState<LegacyUnit>(DEFAULT_BODY_MASS_UNIT);
  const [outcome, setOutcome] = useState<MigrateV2Result | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [stored, setStored] = useState(false);
  const [decision, setDecision] = useState<LegacyDecision | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  /**
   * The panel, focused when it appears.
   *
   * The wizard is mounted beside the view switch over a screen the user was already reading,
   * so without this the caret stays wherever it was, on a control the wizard now covers, and a
   * keyboard or screen-reader user is given nothing to tab from. The same move the recovery
   * screen makes (src/app/RootErrorBoundary.tsx), for the same reason.
   *
   * Mount only. Focusing on every phase change would be defensible, but focusing on every
   * render would pull the caret out of the confirmation field on each keystroke, and the two
   * are one edit apart.
   */
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

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

    const base = selectState(useAppStore.getState());
    const merged = applyMigration(base, outcome.state, profile.id);
    if (!merged.ok) {
      setApplyError(merged.reason);
      return;
    }

    /*
     * Code review finding 7. applyMigration stamps ui.legacyMigration = 'done' into the
     * document it returns, so installing that document records the decision before a single
     * byte has been written. The decision means "the offer has been answered and will not be
     * made again"; it must not outlive a write that never landed, or a failed save would take
     * the import AND the offer with it. So it is staged back to whatever it already was, and
     * set below, once the write has been read back.
     */
    const staged = {
      ...merged.state,
      ui: { ...merged.state.ui, legacyMigration: base.ui.legacyMigration },
    };

    // Serialised here, before it is installed. save() would hit the same JSON.stringify a
    // moment later, and a document that cannot be serialised must not become the in-memory
    // state of an app that can then never write it.
    let text: string;
    try {
      text = JSON.stringify(staged);
    } catch (e) {
      setApplyError(messageOf(e));
      return;
    }

    const installed = useAppStore.getState().importJson(text);
    if (!installed.ok) {
      setApplyError(installed.error);
      return;
    }

    // The write goes now rather than on the persistence debounce, so its outcome can be read
    // back before the decision is recorded and the legacy copy is offered for deletion.
    useAppStore.getState().retrySave();
    const afterData = useAppStore.getState().status;
    // retrySave() returns without writing when the store has not hydrated or is holding an
    // unreadable document, and reports nothing in that case. A null lastSaveError is therefore
    // not on its own evidence of a write; all three conditions are.
    const written =
      afterData.hydrated && afterData.lastLoadError === null && afterData.lastSaveError === null;

    /*
     * The second write is the price of the ordering, and it is worth it. The alternative is
     * one write carrying data and decision together, which cannot be undone if it fails: the
     * decision would already be in the document the next load reads. Here the data lands
     * first, then the decision that describes it. A process killed between the two
     * synchronous writes leaves a stored document holding the imported records with the offer
     * still open, and the next run re-merges them by identity, reporting every one as
     * "already present" rather than duplicating it (applyMigration).
     */
    if (written) {
      useAppStore.getState().setUi({ legacyMigration: 'done' });
      useAppStore.getState().retrySave();
    }
    const afterDecision = useAppStore.getState().status;
    setStored(written && afterDecision.lastSaveError === null);
    setPhase('applied');
  };

  const removeLegacy = (): void => {
    deleteLegacyV2();
    setDecision('deleted');
  };

  /*
   * The backup's filename carries the PROFILE's own civil date, through the same `todayLocal`
   * every other export in the app uses. Findings A8 and A10 forbid the UTC serialisation
   * shortcut: it names the day in Greenwich, not the day the user was living in. The profile is
   * a required property here, so unlike the Settings section there is always a zone to date
   * the file in.
   */
  const legacyFilename = `fti-legacy-bundle-${todayLocal(profile.timezone, Date.now())}.json`;

  const dismissButton = (
    <button type="button" onClick={dismiss}>
      {t('button.legacyDismiss')}
    </button>
  );

  /**
   * Every phase renders the same container, so the focus target and the heading association
   * survive a phase change rather than being re-declared five times and drifting.
   */
  const panel = (heading: string, body: ReactNode): JSX.Element => (
    <section
      className="view migration"
      tabIndex={-1}
      ref={panelRef}
      aria-labelledby="migration-hero"
    >
      <h2 id="migration-hero">{heading}</h2>
      {body}
    </section>
  );

  const refusal: string | null = !parsed.ok
    ? parsed.reason
    : outcome !== null && !outcome.ok
      ? outcome.reason
      : null;

  if (refusal !== null) {
    return panel(
      t('hero.legacyImport'),
      <>
        <p role="alert">{t('advice.legacyRefused')}</p>
        <p className="view-error">{FORMAT.legacyRefusedReason(refusal)}</p>
        <p>{t('advice.legacyNothingDeleted')}</p>
        <div className="migration-actions">{dismissButton}</div>
      </>,
    );
  }

  if (phase === 'explain') {
    return panel(
      t('hero.legacyImport'),
      <>
        <p>{t('advice.legacyFound')}</p>
        <details>
          <summary>{t('disclosure.whatTransfers')}</summary>
          <p>{t('disclosure.legacyTransfers')}</p>
        </details>

        <fieldset className="view-field">
          <legend>{t('label.legacyLoadUnit')}</legend>
          <p className="view-note">{t('advice.legacyUnitRequired')}</p>
          <UnitRadio
            name="legacy-load-unit"
            unit="kg"
            label={t('label.legacyUnitKg')}
            selected={loadUnit}
            onSelect={setLoadUnit}
          />
          <UnitRadio
            name="legacy-load-unit"
            unit="lb"
            label={t('label.legacyUnitLb')}
            selected={loadUnit}
            onSelect={setLoadUnit}
          />
        </fieldset>

        <p>{FORMAT.legacyBodyMassAssumed(bodyMassUnit)}</p>
        <details>
          <summary>{t('disclosure.why')}</summary>
          <p>{t('disclosure.legacyBodyMassEvidence')}</p>
          <fieldset className="view-field">
            <legend>{t('label.legacyBodyMassUnit')}</legend>
            <UnitRadio
              name="legacy-mass-unit"
              unit="kg"
              label={t('label.legacyMassUnitKg')}
              selected={bodyMassUnit}
              onSelect={setBodyMassUnit}
            />
            <UnitRadio
              name="legacy-mass-unit"
              unit="lb"
              label={t('label.legacyMassUnitLb')}
              selected={bodyMassUnit}
              onSelect={setBodyMassUnit}
            />
          </fieldset>
        </details>

        <p>{t('advice.legacyNothingDeleted')}</p>
        <div className="migration-actions">
          <button type="button" disabled={loadUnit === null} onClick={runPreview}>
            {t('button.legacyPreview')}
          </button>
          {dismissButton}
        </div>
      </>,
    );
  }

  if (outcome === null || !outcome.ok) {
    // Unreachable: `refusal` above covers the failed migration and `phase` only leaves
    // 'explain' through runPreview, which sets `outcome`. Rendered rather than thrown so a
    // future edit that breaks the invariant does not take the tree down.
    return panel(
      t('hero.legacyImport'),
      <>
        <p role="alert">{t('advice.legacyApplyFailed')}</p>
        <div className="migration-actions">{dismissButton}</div>
      </>,
    );
  }

  const { report } = outcome;

  if (phase === 'preview') {
    return panel(
      t('hero.legacyPreview'),
      <>
        <ul className="migration-report">
          <li>{FORMAT.legacySets(report.setsMigrated)}</li>
          <li>{FORMAT.legacySessions(report.sessionsMigrated)}</li>
          <li>{FORMAT.legacyDropped(report.setsSkipped.length)}</li>
          <li>{FORMAT.legacyFallbacks(report.sessionFallbacks.length)}</li>
        </ul>
        <p>{FORMAT.legacyUnitsAssumed(report.unitsAssumed.loads, report.unitsAssumed.bodyMass)}</p>

        <SkipList summary={t('disclosure.whatWasRefused')} skips={report.setsSkipped} />
        <SkipList summary={t('disclosure.whatWasNotMatched')} skips={report.sessionFallbacks} />

        <p>{t('advice.legacyNothingDeleted')}</p>
        {applyError !== null && (
          <p className="view-error" role="alert">
            {t('advice.legacyApplyFailed')} {FORMAT.legacyRefusedReason(applyError)}
          </p>
        )}

        <div className="view-field">
          {/* One frame, one word: the label cannot name what the check does not accept. */}
          <label htmlFor="migration-confirm">{FORMAT.typeToConfirm(CONFIRMATION_WORD)}</label>
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
            {t('button.legacyApply')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('explain');
            }}
          >
            {t('button.back')}
          </button>
          {dismissButton}
        </div>
      </>,
    );
  }

  const offerDelete = decision === null && stored;

  return panel(
    t('hero.legacyDone'),
    <>
      <ul className="migration-report">
        <li>{FORMAT.legacySets(report.setsMigrated)}</li>
        <li>{FORMAT.legacySessions(report.sessionsMigrated)}</li>
        <li>{FORMAT.legacyDropped(report.setsSkipped.length)}</li>
      </ul>

      {/*
        * The status line. Polite rather than assertive, and a region rather than one
        * paragraph: what changes here is which sentences are present, and a live region has to
        * be in the document before its content changes for the change to be announced at all.
        */}
      <div className="migration-status" aria-live="polite">
        <p>{stored ? t('advice.legacyStored') : t('advice.legacyStoreUnconfirmed')}</p>
        {decision === 'deleted' && <p>{t('advice.legacyOldDataDeleted')}</p>}
        {decision === 'kept' && <p>{t('advice.legacyOldDataKept')}</p>}
      </div>

      {/*
        * The delete, behind both gates the master plan requires of a destructive action
        * (section 3): the untouched legacy keys have to have been downloaded from this panel,
        * and the word typed exactly. It replaced a single button that removed all three
        * legacy keys on one click (code review finding 1).
        */}
      {offerDelete && deleteOpen && (
        <ConfirmDestructive
          titleKey="label.confirmDeleteLegacy"
          word={DELETE_WORD}
          exportLabelKey="button.downloadLegacyJson"
          exportFilename={legacyFilename}
          /*
           * All THREE legacy keys, as raw text in one envelope, because all three are what the
           * confirmed action removes (security recommendation 10 / M5). It used to export the
           * v2 text alone, so the dead prototype store and the video-instance preference were
           * destroyed with no copy taken. Still not the migrated document, and still byte for
           * byte: what the delete destroys is precisely the records the migration refused, and
           * those are in the old text and nowhere else.
           *
           * Read from storage at the moment the user asks, rather than from `legacyRaw`, so
           * the backup covers the other two keys as well; the v2 value it carries is the same
           * text this component was handed. The empty string covers every key having gone
           * since the wizard read one: the gate still has to be passable, and an empty backup
           * of nothing is honest about what was there.
           */
          exportText={() => readLegacyBundle() ?? ''}
          confirmLabelKey="button.legacyDeleteOld"
          onConfirm={removeLegacy}
          onCancel={() => {
            setDeleteOpen(false);
          }}
        />
      )}

      <div className="migration-actions">
        {offerDelete && !deleteOpen && (
          <>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(true);
              }}
            >
              {t('button.legacyDeleteOld')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision('kept');
              }}
            >
              {t('button.legacyKeepOld')}
            </button>
          </>
        )}
        <button type="button" onClick={onFinished}>
          {t('button.legacyClose')}
        </button>
      </div>
    </>,
  );
}
