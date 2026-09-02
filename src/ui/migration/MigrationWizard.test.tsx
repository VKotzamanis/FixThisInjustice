import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import raw from '../../domain/migrations/fixtures/v2-sample.json';
import { FORMAT, copy } from '../../content/copy';
import { migrateV2 } from '../../domain/migrations/v2';
import type { MigrationReport } from '../../domain/migrations/v2';
import { makeBlankState, makePlan, makeProfile } from '../../test/migrationFactories';
import { cancelPendingSave, useAppStore } from '../../store';
import { LEGACY_V2_KEY, STORAGE_KEY } from '../../store/persistence';
import { installFakeStorage } from '../../store/testStorage';
import { MigrationWizard } from './MigrationWizard';

/**
 * The wizard is handed the legacy document as TEXT, exactly as persistence.ts reads it, so the
 * suite exercises the same parse a device would.
 *
 * The round trip is not cosmetic. The fixture carries `"weight": 1e999` as a hostile input for
 * the domain suite, and `JSON.stringify` writes a non-finite number back as `null`. Text is
 * therefore the only faithful stand-in for a stored legacy document: the legacy app wrote its
 * store with `JSON.stringify` too (legacy/console-store.jsx:50), so no such value could ever
 * have reached the key. Every expectation below is computed from this same text, never from
 * the in-memory fixture, or it would be asserting against a document that cannot exist.
 */
const LEGACY_JSON = JSON.stringify(raw);

/** The legacy document as the wizard will see it: parsed back from the stored text. */
const LEGACY_PAYLOAD: unknown = JSON.parse(LEGACY_JSON);

const CONFIRMATION_WORD = 'IMPORT';

/**
 * The report the migration actually produces for the fixture under the answers these tests
 * give. Computed rather than transcribed: every count below is then an assertion that the
 * wizard SHOWS what the migration produced, not that the fixture still holds some number a
 * later edit could move.
 */
function reportFor(units: 'kg' | 'lb'): MigrationReport {
  const result = migrateV2(LEGACY_PAYLOAD, {
    units,
    timezone: 'Europe/Athens',
    profile: makeProfile(),
    plan: makePlan(),
  });
  if (!result.ok) throw new Error(`the fixture did not migrate: ${result.reason}`);
  return result.report;
}

/** A hydrated store holding a blank document, plus a legacy key in fake storage. */
function seed(legacy: string | null = LEGACY_JSON): Map<string, string> {
  const data = installFakeStorage(legacy === null ? {} : { [LEGACY_V2_KEY]: legacy });
  // hydrate() first: retrySave() refuses to write until the store has read storage once, and
  // the wizard's persistence check reads exactly that flag.
  useAppStore.getState().hydrate();
  useAppStore.getState().replaceState(makeBlankState());
  return data;
}

function renderWizard(legacyRaw: string = LEGACY_JSON): ReturnType<typeof vi.fn> {
  const onFinished = vi.fn();
  render(
    <MigrationWizard
      legacyRaw={legacyRaw}
      profile={makeProfile()}
      plan={makePlan()}
      onFinished={onFinished}
    />,
  );
  return onFinished;
}

/**
 * The persisted document, read back out of the fake store.
 *
 * The decision has to survive a reload, not merely reach memory: 'dismissed' that lived only
 * in the store would offer the import again on the next open, which is the one thing the
 * dismissal promises will not happen.
 */
function storedUiDecision(): unknown {
  const text = storage.get(STORAGE_KEY);
  if (text === undefined) throw new Error('nothing was written to the document key');
  const doc: unknown = JSON.parse(text);
  if (typeof doc !== 'object' || doc === null) throw new Error('the stored document is not an object');
  const ui: unknown = Reflect.get(doc, 'ui');
  if (typeof ui !== 'object' || ui === null) throw new Error('the stored document has no ui slice');
  return Reflect.get(ui, 'legacyMigration');
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Answer the load-unit question and move to the preview. */
function preview(unit: 'kg' | 'lb' = 'kg'): void {
  fireEvent.click(
    screen.getByLabelText(unit === 'kg' ? copy('label.legacyUnitKg') : copy('label.legacyUnitLb')),
  );
  fireEvent.click(button(copy('button.legacyPreview')));
}

/** Type the confirmation word and commit. */
function apply(): void {
  fireEvent.change(screen.getByLabelText(copy('label.legacyConfirm')), {
    target: { value: CONFIRMATION_WORD },
  });
  fireEvent.click(button(copy('button.legacyApply')));
}

let storage: Map<string, string>;

beforeEach(() => {
  storage = seed();
});

afterEach(() => {
  // The persistence subscription debounces its write; a timer left armed would fire into the
  // next test's storage mock.
  cancelPendingSave();
  vi.restoreAllMocks();
});

describe('MigrationWizard: the explanation', () => {
  it('states what will be imported and what is not deleted before asking anything', () => {
    renderWizard();
    expect(screen.getByRole('heading', { name: copy('hero.legacyImport') })).toBeTruthy();
    expect(screen.getByText(copy('advice.legacyFound'))).toBeTruthy();
    expect(screen.getByText(copy('advice.legacyNothingDeleted'))).toBeTruthy();
    expect(screen.getByText(copy('disclosure.whatTransfers'))).toBeTruthy();
    expect(screen.getByText(copy('advice.legacyTransfers'))).toBeTruthy();
  });

  it('shows the body-mass unit as an assumption, with the evidence for it', () => {
    renderWizard();
    expect(screen.getByText(FORMAT.legacyBodyMassAssumed('lb'))).toBeTruthy();
    expect(screen.getByText(copy('advice.legacyBodyMassEvidence'))).toBeTruthy();
  });

  it('refuses to preview until the load unit has been answered', () => {
    renderWizard();
    expect(screen.getByText(copy('advice.legacyUnitRequired'))).toBeTruthy();
    expect(button(copy('button.legacyPreview'))).toBeDisabled();
    fireEvent.click(screen.getByLabelText(copy('label.legacyUnitKg')));
    expect(button(copy('button.legacyPreview'))).toBeEnabled();
  });
});

describe('MigrationWizard: the preview', () => {
  it('reports the counts the migration produced, and the units it read', () => {
    const report = reportFor('kg');
    renderWizard();
    preview('kg');
    expect(screen.getByRole('heading', { name: copy('hero.legacyPreview') })).toBeTruthy();
    expect(screen.getByText(FORMAT.legacySets(report.setsMigrated))).toBeTruthy();
    expect(screen.getByText(FORMAT.legacySessions(report.sessionsMigrated))).toBeTruthy();
    expect(screen.getByText(FORMAT.legacyDropped(report.setsSkipped.length))).toBeTruthy();
    expect(screen.getByText(FORMAT.legacyFallbacks(report.sessionFallbacks.length))).toBeTruthy();
    expect(screen.getByText(FORMAT.legacyUnitsAssumed('kg', 'lb'))).toBeTruthy();
  });

  it('lists every refused record with the reason the migration gave', () => {
    const report = reportFor('kg');
    renderWizard();
    preview('kg');
    expect(report.setsSkipped.length).toBeGreaterThan(0);
    for (const skip of report.setsSkipped) {
      expect(screen.getByText(FORMAT.legacySkip(skip.key, skip.reason))).toBeTruthy();
    }
    for (const fallback of report.sessionFallbacks) {
      expect(screen.getByText(FORMAT.legacySkip(fallback.key, fallback.reason))).toBeTruthy();
    }
  });

  it('carries the answered unit into the migration', () => {
    renderWizard();
    preview('lb');
    expect(screen.getByText(FORMAT.legacyUnitsAssumed('lb', 'lb'))).toBeTruthy();
  });

  it('holds the apply until the confirmation word is typed exactly', () => {
    renderWizard();
    preview('kg');
    const field = screen.getByLabelText(copy('label.legacyConfirm'));
    expect(button(copy('button.legacyApply'))).toBeDisabled();
    fireEvent.change(field, { target: { value: 'import' } });
    expect(button(copy('button.legacyApply'))).toBeDisabled();
    fireEvent.change(field, { target: { value: CONFIRMATION_WORD } });
    expect(button(copy('button.legacyApply'))).toBeEnabled();
  });

  it('writes nothing while the preview is on screen', () => {
    renderWizard();
    preview('kg');
    expect(Object.keys(useAppStore.getState().sets)).toHaveLength(0);
    expect(useAppStore.getState().ui.legacyMigration).toBe('pending');
  });
});

describe('MigrationWizard: applying', () => {
  it('installs a document whose set count equals the report', () => {
    const report = reportFor('kg');
    renderWizard();
    preview('kg');
    apply();
    expect(Object.keys(useAppStore.getState().sets)).toHaveLength(report.setsMigrated);
    expect(screen.getByRole('heading', { name: copy('hero.legacyDone') })).toBeTruthy();
  });

  it('records the decision so the offer is not made again', () => {
    renderWizard();
    preview('kg');
    apply();
    expect(useAppStore.getState().ui.legacyMigration).toBe('done');
    // The apply forces the write rather than waiting on the persistence debounce, so the
    // decision is already in the document by the time the delete is offered.
    expect(storedUiDecision()).toBe('done');
  });

  it('keeps the legacy key until the delete step, then removes it', () => {
    renderWizard();
    preview('kg');
    apply();
    expect(storage.get(LEGACY_V2_KEY)).toBe(LEGACY_JSON);
    expect(screen.getByText(copy('advice.legacyStored'))).toBeTruthy();
    fireEvent.click(button(copy('button.legacyDeleteOld')));
    expect(storage.get(LEGACY_V2_KEY)).toBeUndefined();
    expect(screen.getByText(copy('advice.legacyOldDataDeleted'))).toBeTruthy();
  });

  it('leaves the legacy key alone when the user keeps it', () => {
    const onFinished = renderWizard();
    preview('kg');
    apply();
    fireEvent.click(button(copy('button.legacyKeepOld')));
    expect(screen.getByText(copy('advice.legacyOldDataKept'))).toBeTruthy();
    expect(storage.get(LEGACY_V2_KEY)).toBe(LEGACY_JSON);
    fireEvent.click(button(copy('button.legacyClose')));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('withholds the delete when the write could not be confirmed', () => {
    // An unhydrated store refuses every write, so nothing reached storage and the legacy copy
    // is the only complete one left. The delete must not be offered.
    useAppStore.setState({ status: { ...useAppStore.getState().status, hydrated: false } });
    renderWizard();
    preview('kg');
    apply();
    expect(screen.getByText(copy('advice.legacyStoreUnconfirmed'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.legacyDeleteOld') })).toBeNull();
  });
});

describe('MigrationWizard: refusal and dismissal', () => {
  it('shows the reason for a payload that is not JSON, and offers to start clean', () => {
    renderWizard('{not json');
    expect(screen.getByText(copy('advice.legacyRefused'))).toBeTruthy();
    expect(screen.getByText(/Reason:/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.legacyPreview') })).toBeNull();
    expect(button(copy('button.legacyDismiss'))).toBeTruthy();
  });

  it('shows the migration reason for a payload it refuses', () => {
    renderWizard('[1,2,3]');
    fireEvent.click(screen.getByLabelText(copy('label.legacyUnitKg')));
    fireEvent.click(button(copy('button.legacyPreview')));
    expect(screen.getByText(copy('advice.legacyRefused'))).toBeTruthy();
    expect(screen.getByText(FORMAT.legacyRefusedReason('the legacy payload is not a JSON object')))
      .toBeTruthy();
  });

  it('records a dismissal in the document and leaves the legacy key in place', () => {
    const onFinished = renderWizard();
    fireEvent.click(button(copy('button.legacyDismiss')));
    expect(useAppStore.getState().ui.legacyMigration).toBe('dismissed');
    expect(storage.get(LEGACY_V2_KEY)).toBe(LEGACY_JSON);
    expect(onFinished).toHaveBeenCalledTimes(1);
    // Dismissing does not force a write, so the debounced one is issued here. What matters is
    // that the decision is in the document that a reload would read, not when it got there.
    useAppStore.getState().retrySave();
    expect(storedUiDecision()).toBe('dismissed');
  });

  it('dismisses from the refusal screen too, without touching the legacy key', () => {
    renderWizard('{not json');
    fireEvent.click(button(copy('button.legacyDismiss')));
    expect(useAppStore.getState().ui.legacyMigration).toBe('dismissed');
    expect(storage.get(LEGACY_V2_KEY)).toBe(LEGACY_JSON);
  });
});
