import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { FORMAT, copy } from '../../content/copy';
import { makeBlankState } from '../../test/migrationFactories';
import { useAppStore } from '../../store';
import { LEGACY_KEYS, LEGACY_V2_KEY, STORAGE_KEY } from '../../store/persistence';
import { installFakeStorage } from '../../store/testStorage';
import { SettingsView } from '../views/SettingsView';

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
let downloads: { name: string; text: string }[] = [];
let storage: Map<string, string>;

beforeEach(() => {
  storage = installFakeStorage({ [STORAGE_KEY]: STORED_DOCUMENT });
  downloads = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    downloads.push({ name: '', text: blob instanceof Blob ? '' : '' });
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
 * in the same section, carries a field with the SAME label text ('Type DELETE to confirm',
 * its own `confirm.typeToConfirm`), so an unscoped getByLabelText could not stay unambiguous.
 */
function panel(): HTMLElement {
  const found = document.querySelector('.confirm-destructive');
  if (!(found instanceof HTMLElement)) throw new Error('no confirmation panel is open');
  return found;
}

function typeWord(value: string): void {
  fireEvent.change(within(panel()).getByLabelText(FORMAT.typeToConfirm('DELETE')), {
    target: { value },
  });
}

function confirmButton(labelKey: 'button.wipeConfirm' | 'button.legacyDeleteOld'): HTMLElement {
  return within(panel()).getByRole('button', { name: copy(labelKey) });
}

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
    expect(downloads.map((d) => d.name)).toEqual(['fixthisinjustice-export.json']);
    expect(confirmButton('button.wipeConfirm')).toBeDisabled();

    typeWord('DELETE');
    expect(confirmButton('button.wipeConfirm')).not.toBeDisabled();
  });

  it('wipes the document and leaves the app at setup', () => {
    render(<SettingsView />);
    click(copy('button.wipeAll'));
    click(copy('button.downloadBackup'));
    typeWord('DELETE');
    fireEvent.click(confirmButton('button.wipeConfirm'));

    // The stored document is gone, and the store did not write it back: wipeAll suppresses
    // the write for its own reset (P1), which is the behaviour this asserts is still held.
    expect(storage.has(STORAGE_KEY)).toBe(false);
    expect(useAppStore.getState().activeProfileId).toBeNull();
    expect(Object.keys(useAppStore.getState().profiles)).toEqual([]);
    // With no profile the view has nothing to edit; App renders SetupWizard on the same fact.
    expect(screen.getByText(copy('advice.noProfileSetupFirst'))).toBeTruthy();
  });

  it('hides the legacy delete when no legacy document is on the device', () => {
    render(<SettingsView />);
    expect(screen.queryByRole('button', { name: copy('button.deleteLegacy') })).toBeNull();
  });

  it('deletes every legacy key behind the same two gates', () => {
    for (const key of LEGACY_KEYS) storage.set(key, '{}');
    render(<SettingsView />);

    click(copy('button.deleteLegacy'));
    typeWord('DELETE');
    expect(confirmButton('button.legacyDeleteOld')).toBeDisabled();

    click(copy('button.downloadLegacyJson'));
    expect(downloads.map((d) => d.name)).toEqual(['fixthisinjustice-legacy-v2.json']);
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
