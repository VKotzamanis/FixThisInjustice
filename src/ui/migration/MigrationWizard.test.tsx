import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import raw from '../../domain/migrations/fixtures/v2-sample.json';
import { FORMAT, copy } from '../../content/copy';
import { migrateV2 } from '../../domain/migrations/v2';
import type { MigrationReport } from '../../domain/migrations/v2';
import { makeBlankState, makePlan, makeProfile } from '../../test/migrationFactories';
import { cancelPendingSave, useAppStore } from '../../store';
import { LEGACY_V2_KEY, STORAGE_KEY, deleteLegacyV2 } from '../../store/persistence';
import { downloadText } from '../../app/download';
import {
  domExceptionWithCode,
  installFakeStorage,
  makeStorageFull,
} from '../../store/testStorage';
import { MigrationWizard } from './MigrationWizard';
import type { SkinId } from '../../domain/types';

/*
 * jsdom implements neither URL.createObjectURL nor a download, so the real downloadText
 * throws. The same seam App.test.tsx uses.
 */
vi.mock('../../app/download', () => ({ downloadText: vi.fn() }));

/*
 * persistence is spied on, not replaced: the store reads and writes through the same module,
 * and a stub would take the document with it. Only deleteLegacyV2 is wrapped, and it still
 * calls through, so "called once" and "the keys are gone" are both real assertions about the
 * same call.
 */
vi.mock('../../store/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/persistence')>();
  return { ...actual, deleteLegacyV2: vi.fn(actual.deleteLegacyV2) };
});

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
const DELETE_WORD = 'DELETE';

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

/** Open the delete panel from the applied phase. */
function openDelete(): void {
  fireEvent.click(button(copy('button.legacyDeleteOld')));
}

/** Download the legacy backup, which is the first of the delete step's two gates. */
function takeBackup(): void {
  fireEvent.click(button(copy('button.downloadLegacyJson')));
}

/** Type into the delete panel's confirmation field. */
function typeDeleteWord(value: string): void {
  fireEvent.change(screen.getByLabelText(FORMAT.typeToConfirm(DELETE_WORD)), {
    target: { value },
  });
}

/** Type the confirmation word and commit. */
function apply(): void {
  fireEvent.change(screen.getByLabelText(FORMAT.typeToConfirm(CONFIRMATION_WORD)), {
    target: { value: CONFIRMATION_WORD },
  });
  fireEvent.click(button(copy('button.legacyApply')));
}

let storage: Map<string, string>;

beforeEach(() => {
  // The module mocks above are vi.fn()s, not spies: vitest.config.ts's restoreMocks restores
  // spies after each test and leaves their call history in place, so it is cleared here.
  vi.clearAllMocks();
  storage = seed();
});

afterEach(() => {
  // The persistence subscription debounces its write; a timer left armed would fire into the
  // next test's storage mock.
  cancelPendingSave();
  vi.restoreAllMocks();
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('MigrationWizard: the explanation', () => {
  it('states what will be imported and what is not deleted before asking anything', () => {
    renderWizard();
    expect(screen.getByRole('heading', { name: copy('hero.legacyImport') })).toBeTruthy();
    expect(screen.getByText(copy('advice.legacyFound'))).toBeTruthy();
    expect(screen.getByText(copy('advice.legacyNothingDeleted'))).toBeTruthy();
    expect(screen.getByText(copy('disclosure.whatTransfers'))).toBeTruthy();
    expect(screen.getByText(copy('disclosure.legacyTransfers'))).toBeTruthy();
  });

  it('shows the body-mass unit as an assumption, with the evidence for it', () => {
    renderWizard();
    expect(screen.getByText(FORMAT.legacyBodyMassAssumed('lb'))).toBeTruthy();
    expect(screen.getByText(copy('disclosure.legacyBodyMassEvidence'))).toBeTruthy();
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
    const field = screen.getByLabelText(FORMAT.typeToConfirm(CONFIRMATION_WORD));
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
    openDelete();
    takeBackup();
    typeDeleteWord(DELETE_WORD);
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

describe('MigrationWizard: the panel itself', () => {
  /*
   * Code review finding 4. The wizard appears over a screen the user was already reading, so
   * without this the caret stays on a control the panel now covers and a keyboard or
   * screen-reader user is told nothing. The recovery screen already moves focus for the same
   * reason (src/app/RootErrorBoundary.tsx).
   */
  it('takes focus when it appears', () => {
    renderWizard();
    const region = screen.getByRole('region', { name: copy('hero.legacyImport') });
    expect(document.activeElement).toBe(region);
  });

  it('announces the applied phase politely from a region that was already there', () => {
    renderWizard();
    preview('kg');
    apply();
    const line = screen.getByText(copy('advice.legacyStored'));
    const live = line.closest('[aria-live]');
    expect(live).not.toBeNull();
    expect(live?.getAttribute('aria-live')).toBe('polite');
    // The outcome of the delete lands in the SAME region, so it is announced too.
    openDelete();
    takeBackup();
    typeDeleteWord(DELETE_WORD);
    fireEvent.click(button(copy('button.legacyDeleteOld')));
    expect(screen.getByText(copy('advice.legacyOldDataDeleted')).closest('[aria-live]')).toBe(live);
  });
});

describe('MigrationWizard: the delete is gated', () => {
  /*
   * Code review finding 1. The delete removed all three legacy keys on one click. It is a
   * destructive action, so the master plan (section 3) puts two gates on it: the untouched
   * legacy text downloaded from this panel, then the word typed exactly.
   */
  function reachDeletePanel(): void {
    renderWizard();
    preview('kg');
    apply();
    openDelete();
  }

  it('holds the delete before the backup has been downloaded', () => {
    reachDeletePanel();
    typeDeleteWord(DELETE_WORD);
    expect(button(copy('button.legacyDeleteOld'))).toBeDisabled();
    expect(storage.get(LEGACY_V2_KEY)).toBe(LEGACY_JSON);
  });

  it('holds the delete after the backup when the word does not match', () => {
    reachDeletePanel();
    takeBackup();
    typeDeleteWord('delete');
    expect(button(copy('button.legacyDeleteOld'))).toBeDisabled();
  });

  it('releases the delete once the backup is taken and the word matches exactly', () => {
    reachDeletePanel();
    takeBackup();
    typeDeleteWord(DELETE_WORD);
    expect(button(copy('button.legacyDeleteOld'))).toBeEnabled();
  });

  it('exports every legacy key as one bundle, untouched, not the migrated document', () => {
    reachDeletePanel();
    takeBackup();
    expect(downloadText).toHaveBeenCalledTimes(1);
    /*
     * Security recommendation 10 / M5. The gate exported `fti.console.v2` alone while the
     * confirmed action removes all three legacy keys, so two of them were destroyed with no
     * copy taken. The v2 payload is carried as the RAW text it was read as, never a parse of
     * it and never the migrated document: this is the last copy of whatever the migration
     * refused, and the report the user was just shown lists exactly that.
     */
    const [, text] = vi.mocked(downloadText).mock.calls[0] ?? [];
    expect(JSON.parse(text ?? 'null')).toEqual({
      'fti.console.v2': LEGACY_JSON,
      'fti.plan.v1': null,
      'fti.video.instance': null,
    });
  });

  it('stamps the bundle with the civil date in the profile timezone, not the device one', () => {
    // 2026-09-01T21:30:00Z is already 2026-09-02 in Europe/Athens (UTC+3), which the fixture
    // profile carries. A filename dated in UTC, or from the CI runner's own zone, would read
    // 2026-09-01 here, so the stamp cannot pass by coincidence.
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 1, 21, 30, 0)); // [ms]
    reachDeletePanel();
    takeBackup();
    expect(vi.mocked(downloadText).mock.calls[0]?.[0]).toBe('fti-legacy-bundle-2026-09-02.json');
  });

  it('names the panel, so it is not an anonymous set of destructive controls', () => {
    reachDeletePanel();
    expect(
      screen.getByRole('group', { name: copy('label.confirmDeleteLegacy') }),
    ).toBeTruthy();
  });

  it('removes the legacy keys once, on the confirmation', () => {
    reachDeletePanel();
    takeBackup();
    typeDeleteWord(DELETE_WORD);
    fireEvent.click(button(copy('button.legacyDeleteOld')));
    expect(deleteLegacyV2).toHaveBeenCalledTimes(1);
    expect(storage.get(LEGACY_V2_KEY)).toBeUndefined();
  });

  it('keeps every legacy key when the panel is cancelled', () => {
    reachDeletePanel();
    takeBackup();
    typeDeleteWord(DELETE_WORD);
    fireEvent.click(button(copy('button.cancel')));
    expect(deleteLegacyV2).not.toHaveBeenCalled();
    expect(storage.get(LEGACY_V2_KEY)).toBe(LEGACY_JSON);
    // The offer is still there: cancelling backs out of the confirmation, it decides nothing.
    expect(button(copy('button.legacyDeleteOld'))).toBeTruthy();
    expect(button(copy('button.legacyKeepOld'))).toBeTruthy();
  });

  it('asks for the backup again after a cancel', () => {
    reachDeletePanel();
    takeBackup();
    fireEvent.click(button(copy('button.cancel')));
    openDelete();
    typeDeleteWord(DELETE_WORD);
    // The export is a fact about the open panel, not about the session.
    expect(button(copy('button.legacyDeleteOld'))).toBeDisabled();
  });
});

describe('MigrationWizard: the decision follows the write', () => {
  /*
   * Code review finding 7. applyMigration stamps ui.legacyMigration = 'done' into the document
   * it returns, so the decision used to be recorded whether or not anything was written. It
   * closes the offer permanently, so a failed save would have taken the import and the offer
   * with it.
   */
  it('leaves the decision pending when the save failed', () => {
    renderWizard();
    preview('kg');
    makeStorageFull(domExceptionWithCode('QuotaExceededError', 22));
    apply();
    expect(useAppStore.getState().status.lastSaveError).not.toBeNull();
    expect(useAppStore.getState().ui.legacyMigration).toBe('pending');
    expect(screen.getByText(copy('advice.legacyStoreUnconfirmed'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.legacyDeleteOld') })).toBeNull();
  });

  it('leaves the decision pending when the store refused to write at all', () => {
    useAppStore.setState({ status: { ...useAppStore.getState().status, hydrated: false } });
    renderWizard();
    preview('kg');
    apply();
    expect(useAppStore.getState().ui.legacyMigration).toBe('pending');
  });
});

describe('FORMAT: the migration counts', () => {
  /*
   * Code review finding 6. "1 sets" in a preview a user is reading before an irreversible
   * import invites doubt about every other number on the screen. The pattern is the one
   * FORMAT.sessionSummary already uses.
   */
  it('singularises each count at one', () => {
    expect(FORMAT.legacySets(1)).toBe('1 set');
    expect(FORMAT.legacySessions(1)).toBe('1 session');
    expect(FORMAT.legacyDropped(1)).toBe('1 record not imported');
    expect(FORMAT.legacyFallbacks(1)).toBe('1 day not matched to a session');
  });

  it('pluralises at zero and above one', () => {
    expect(FORMAT.legacySets(0)).toBe('0 sets');
    expect(FORMAT.legacySessions(0)).toBe('0 sessions');
    expect(FORMAT.legacyDropped(0)).toBe('0 records not imported');
    expect(FORMAT.legacyFallbacks(0)).toBe('0 days not matched to a session');
    expect(FORMAT.legacySets(2)).toBe('2 sets');
    expect(FORMAT.legacyFallbacks(3)).toBe('3 days not matched to a session');
  });

  it('names the typed word in the label that asks for it', () => {
    expect(FORMAT.typeToConfirm('IMPORT')).toBe('Type IMPORT to confirm');
    expect(FORMAT.typeToConfirm('DELETE')).toBe('Type DELETE to confirm');
  });
});
