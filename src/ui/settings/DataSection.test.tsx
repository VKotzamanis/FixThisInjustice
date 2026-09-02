import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { FORMAT, copy, copyFor } from '../../content/copy';
import { clearAssetStorage } from '../../domain/motivation/assets';
import { makeBlankState } from '../../test/migrationFactories';
import { useAppStore } from '../../store';
import { LEGACY_KEYS, LEGACY_V2_KEY, STORAGE_KEY } from '../../store/persistence';
import { installFakeStorage } from '../../store/testStorage';
import { DataSection } from './DataSection';
import { SettingsView } from '../views/SettingsView';
import type { SkinId } from '../../domain/types';

/*
 * The asset store is mocked, and only the one export the wipe calls: the module is a real
 * IndexedDB client and jsdom ships no IndexedDB, so a call through to it hangs rather than
 * failing. Partial, through importOriginal, because the same module backs the motivation-clip
 * row this view also mounts (MotivationSettings), and a full stub would take that row down.
 */
vi.mock('../../domain/motivation/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/motivation/assets')>();
  return { ...actual, clearAssetStorage: vi.fn(() => Promise.resolve()) };
});

/**
 * The instant every filename is dated from: 2026-09-01T12:00:00Z, which is 2026-09-01 in the
 * fixture profile's Europe/Athens. The stamp comes from the PROFILE's zone, never the device's
 * (master plan section 3), so a stubbed clock is enough to fix it.
 */
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // [ms]
const STAMP = '2026-09-01';

/**
 * The Data section is exercised THROUGH SettingsView rather than by rendering DataSection
 * directly. The row wiring is half of what this task adds: a section that renders correctly
 * but is never appended to SETTINGS_ROWS is exactly the state the ExportView was already in
 * (written in P7 Task 5, mounted nowhere). Rendering the view proves both.
 *
 * The store is the real one, over an in-memory Web Storage (installFakeStorage). A mocked
 * wipe would assert that a function was called; what has to hold is that the stored document
 * is gone afterwards, which only the real action over a real backing can show.
 */

/** The stored document the wipe has to remove. Not parsed by anything here. */
const STORED_DOCUMENT = '{"schemaVersion":3}';

/** What each synthetic download carried. jsdom implements neither of the two APIs it needs. */
let downloads: { name: string; blob: Blob | null }[] = [];
let storage: Map<string, string>;

beforeEach(() => {
  storage = installFakeStorage({ [STORAGE_KEY]: STORED_DOCUMENT });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  /*
   * The module mock is a vi.fn() created once by the factory, and vitest.config.ts's
   * restoreMocks only restores vi.spyOn spies: without this, both the call count and an
   * implementation one test installed (mockRejectedValue) leak into the next.
   */
  vi.mocked(clearAssetStorage).mockReset();
  vi.mocked(clearAssetStorage).mockResolvedValue(undefined);
  downloads = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    downloads.push({ name: '', blob: blob instanceof Blob ? blob : null });
    return 'blob:fti/1';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const last = downloads.at(-1);
    if (last !== undefined) last.name = this.download;
  });
  useAppStore.getState().replaceState(makeBlankState());
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function click(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

/**
 * The open confirmation panel. Queries are scoped to it because ExportView, which is mounted
 * in the same section, now renders its Replace confirmation through the same component, so a
 * second field labelled 'Type DELETE to confirm' can be on screen and an unscoped
 * getByLabelText could not stay unambiguous. The panels are told apart by their group names
 * where the test needs to name one; this helper takes the only one these tests ever open.
 */
function panel(): HTMLElement {
  const found = document.querySelector('.confirm-destructive');
  if (!(found instanceof HTMLElement)) throw new Error('no confirmation panel is open');
  return found;
}

/** The text of the one download taken so far. Read from the Blob the anchor was handed. */
async function onlyDownloadText(): Promise<string> {
  expect(downloads).toHaveLength(1);
  const blob = downloads[0]?.blob;
  if (!(blob instanceof Blob)) throw new Error('the download carried no Blob');
  return blob.text();
}

function typeWord(value: string): void {
  fireEvent.change(within(panel()).getByLabelText(FORMAT.typeToConfirm('DELETE')), {
    target: { value },
  });
}

function confirmButton(labelKey: 'button.wipeConfirm' | 'button.legacyDeleteOld'): HTMLElement {
  return within(panel()).getByRole('button', { name: copy(labelKey) });
}

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

describe('SettingsView data section', () => {
  it('mounts the export view as a settings row', () => {
    render(<SettingsView />);
    expect(screen.getByRole('heading', { name: copy('hero.exportImport') })).toBeTruthy();
    expect(screen.getByRole('heading', { name: copy('hero.dataOnDevice') })).toBeTruthy();
  });

  it('holds the wipe until the backup is taken and the word matches', () => {
    render(<SettingsView />);
    click(copy('button.wipeAll'));

    // The word alone is not the gate: master plan section 3 requires the export as well.
    typeWord('DELETE');
    expect(confirmButton('button.wipeConfirm')).toBeDisabled();

    // ... and the export alone is not the gate either.
    typeWord('');
    click(copy('button.downloadBackup'));
    expect(downloads.map((d) => d.name)).toEqual([`fti-state-${STAMP}.json`]);
    expect(confirmButton('button.wipeConfirm')).toBeDisabled();

    typeWord('DELETE');
    expect(confirmButton('button.wipeConfirm')).not.toBeDisabled();
  });

  it('wipes the document and leaves the app at setup', async () => {
    render(<SettingsView />);
    click(copy('button.wipeAll'));
    click(copy('button.downloadBackup'));
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.wipeConfirm'));

    // Awaited, not immediate: the clip store is cleared first and that is a promise, so the
    // document is emptied on the continuation rather than inside the click handler.
    // The stored document is gone, and the store did not write it back: wipeAll suppresses
    // the write for its own reset (P1), which is the behaviour this asserts is still held.
    await waitFor(() => {
      expect(storage.has(STORAGE_KEY)).toBe(false);
    });
    expect(useAppStore.getState().activeProfileId).toBeNull();
    expect(Object.keys(useAppStore.getState().profiles)).toEqual([]);
    // With no profile the view has nothing to edit; App renders SetupWizard on the same fact.
    // Read through the ACTIVE skin: the wipe replaced `ui`, so the shipped skin is back and the
    // limelight table has carried a row for this key since P9 Task 12.
    expect(
      screen.getByText(copyFor(useAppStore.getState().ui.skin, 'advice.noProfileSetupFirst')),
    ).toBeTruthy();
  });

  /*
   * Security recommendation 10 / M5. The wipe called wipeAll() and nothing else, so the
   * user-chosen motivation clip -- a video the user picked, in IndexedDB -- survived a wipe
   * that told them everything on the device had been removed. Constraint 10 requires the wipe
   * to cover everything the app owns.
   */
  it('clears the clip store before it empties the document', async () => {
    const order: string[] = [];
    vi.mocked(clearAssetStorage).mockImplementation(() => {
      order.push('clip');
      return Promise.resolve();
    });
    render(<SettingsView />);
    const wipeAll = vi.spyOn(useAppStore.getState(), 'wipeAll').mockImplementation(() => {
      order.push('document');
    });

    click(copy('button.wipeAll'));
    click(copy('button.downloadBackup'));
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.wipeConfirm'));

    await waitFor(() => {
      expect(wipeAll).toHaveBeenCalledTimes(1);
    });
    expect(clearAssetStorage).toHaveBeenCalledTimes(1);
    // The order is the point: a clip cleared after the document is emptied would be cleared
    // out of a store the wipe has already stopped writing to.
    expect(order).toEqual(['clip', 'document']);
  });

  it('empties the document even when the clip store refuses, and says which part is left', async () => {
    vi.mocked(clearAssetStorage).mockRejectedValue(new Error('quota'));
    /*
     * DataSection is rendered on its own here, not through SettingsView. A successful wipe
     * leaves no profile, and SettingsView renders a bare 'set up first' paragraph in that
     * case, so the section carrying this line is unmounted the moment the wipe lands. The
     * component is what is under test; where its host chooses to keep it mounted is not.
     */
    render(<DataSection />);
    click(copy('button.wipeAll'));
    click(copy('button.downloadBackup'));
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.wipeConfirm'));

    // The refusal must not hold the wipe back: a document left intact because a clip could
    // not be removed is the failure mode this branch exists to prevent.
    await waitFor(() => {
      expect(storage.has(STORAGE_KEY)).toBe(false);
    });
    expect(screen.getByRole('alert').textContent).toBe(copy('advice.clipClearFailed'));
  });

  it('says nothing about the clip when it was cleared', async () => {
    render(<DataSection />);
    click(copy('button.wipeAll'));
    click(copy('button.downloadBackup'));
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.wipeConfirm'));

    await waitFor(() => {
      expect(storage.has(STORAGE_KEY)).toBe(false);
    });
    expect(screen.queryByText(copy('advice.clipClearFailed'))).toBeNull();
  });

  it('hides the legacy delete when no legacy document is on the device', () => {
    render(<SettingsView />);
    expect(screen.queryByRole('button', { name: copy('button.deleteLegacy') })).toBeNull();
  });

  it('deletes every legacy key behind the same two gates', async () => {
    for (const key of LEGACY_KEYS) storage.set(key, '{}');
    render(<SettingsView />);

    click(copy('button.deleteLegacy'));
    typeWord('DELETE');
    expect(confirmButton('button.legacyDeleteOld')).toBeDisabled();

    click(copy('button.downloadLegacyJson'));
    expect(downloads.map((d) => d.name)).toEqual([`fti-legacy-bundle-${STAMP}.json`]);
    /*
     * Security recommendation 10 / M5. The gate used to export `fti.console.v2` alone while
     * the confirmed action removed three keys, so two of them were destroyed with no copy
     * taken. The backup now covers exactly what the delete removes.
     */
    expect(JSON.parse(await onlyDownloadText())).toEqual({
      'fti.console.v2': '{}',
      'fti.plan.v1': '{}',
      'fti.video.instance': '{}',
    });
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.legacyDeleteOld'));

    for (const key of LEGACY_KEYS) expect(storage.has(key)).toBe(false);
    // The v3 document is not a legacy key and must survive the legacy delete.
    expect(storage.get(STORAGE_KEY)).toBe(STORED_DOCUMENT);
    expect(screen.queryByRole('button', { name: copy('button.deleteLegacy') })).toBeNull();
  });

  it('offers the import again only when a legacy document exists and no offer is open', () => {
    const { unmount } = render(<SettingsView />);
    // No legacy document: nothing to reopen, whatever the decision says.
    useAppStore.getState().setUi({ legacyMigration: 'done' });
    expect(screen.queryByRole('button', { name: copy('button.legacyReopen') })).toBeNull();
    unmount();

    // A legacy document, but the offer is already open: reopening it is not an action, and
    // writing 'pending' over 'pending' would not reach MigrationGate's transition anyway.
    storage.set(LEGACY_V2_KEY, '{}');
    useAppStore.getState().setUi({ legacyMigration: 'pending' });
    render(<SettingsView />);
    expect(screen.queryByRole('button', { name: copy('button.legacyReopen') })).toBeNull();
  });

  it('puts the migration decision back to pending', () => {
    storage.set(LEGACY_V2_KEY, '{}');
    useAppStore.getState().setUi({ legacyMigration: 'dismissed' });
    render(<SettingsView />);

    click(copy('button.legacyReopen'));
    expect(useAppStore.getState().ui.legacyMigration).toBe('pending');
    // The offer is now open (MigrationGate renders it), so the button that opens it is gone.
    expect(screen.queryByRole('button', { name: copy('button.legacyReopen') })).toBeNull();
  });

  it('closes the panel on cancel and re-arms both gates', () => {
    render(<SettingsView />);
    click(copy('button.wipeAll'));
    click(copy('button.downloadBackup'));
    typeWord('DELETE');
    expect(confirmButton('button.wipeConfirm')).not.toBeDisabled();

    click(copy('button.cancel'));
    expect(document.querySelector('.confirm-destructive')).toBeNull();
    expect(storage.get(STORAGE_KEY)).toBe(STORED_DOCUMENT);

    // Reopened, the panel asks for the backup again: the export is a fact about THIS panel.
    click(copy('button.wipeAll'));
    typeWord('DELETE');
    expect(confirmButton('button.wipeConfirm')).toBeDisabled();
  });
});

describe('SettingsView data section: a device with no importable legacy document', () => {
  /*
   * P7 Task 6 review, item 3. `hasLegacyV2` stays keyed on `fti.console.v2` because the
   * MIGRATION needs that document, and the delete control used to be keyed on the same fact.
   * A device carrying only one of the other two legacy keys therefore had legacy data it was
   * offered no way to remove.
   */
  it('offers the delete for a device holding only the dead prototype key', async () => {
    storage.set('fti.plan.v1', '{"plan":1}');
    render(<SettingsView />);

    // Nothing to import: the reopen control is keyed on the document the wizard needs.
    expect(screen.queryByRole('button', { name: copy('button.legacyReopen') })).toBeNull();

    click(copy('button.deleteLegacy'));
    click(copy('button.downloadLegacyJson'));
    expect(JSON.parse(await onlyDownloadText())).toEqual({
      'fti.console.v2': null,
      'fti.plan.v1': '{"plan":1}',
      'fti.video.instance': null,
    });
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.legacyDeleteOld'));

    expect(storage.has('fti.plan.v1')).toBe(false);
    expect(screen.queryByRole('button', { name: copy('button.deleteLegacy') })).toBeNull();
  });

  it('offers the delete for a device holding only the video-instance preference', () => {
    storage.set('fti.video.instance', 'https://yewtu.be');
    render(<SettingsView />);
    expect(screen.getByRole('button', { name: copy('button.deleteLegacy') })).toBeTruthy();
  });
});
