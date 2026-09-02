import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ExportView } from './ExportView';
import { FORMAT, copy } from '../../content/copy';
import { makeBlankState, makeProfile } from '../../test/migrationFactories';
import { flushSave, startPersistence, useAppStore } from '../../store';
import { STORAGE_KEY } from '../../store/persistence';
import { installFakeStorage } from '../../store/testStorage';
import { parseState } from '../../domain/schema';
import type { PushDevice, SessionAssignment } from '../../domain/types';

/**
 * The instant every assertion is dated from: 2026-09-01T12:00:00Z, which is 2026-09-01 in
 * the fixture profile's Europe/Athens. Date.now is stubbed rather than the timer faked, so
 * Testing Library's own scheduling is untouched.
 */
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // [ms]

/**
 * What each synthetic download carried, including the Blob itself so a test can read the
 * bytes the user would have received. jsdom implements neither of the two APIs it needs.
 */
let downloads: { name: string; type: string; blob: Blob | null }[] = [];

/**
 * Teardowns for every startPersistence() subscription a test started. Unconditional in
 * afterEach, following store/index.test.ts's own pattern: a test that fails before reaching
 * its own stop() call must not leave the subscription writing on behalf of every later test.
 */
const liveTeardowns = new Set<() => void>();

function startPersistenceForTest(): void {
  liveTeardowns.add(startPersistence());
}

beforeEach(() => {
  installFakeStorage();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  downloads = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    downloads.push({
      name: '',
      type: blob instanceof Blob ? blob.type : '',
      blob: blob instanceof Blob ? blob : null,
    });
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
  for (const stop of [...liveTeardowns]) stop();
  liveTeardowns.clear();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function click(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

/** Types a candidate document into the paste area and asks for it to be checked. */
function check(text: string): void {
  fireEvent.change(screen.getByLabelText(copy('label.pasteExport')), { target: { value: text } });
  click(copy('button.checkImport'));
}

/**
 * The Replace confirmation, which is now the shared ConfirmDestructive panel rather than a
 * second typed-confirmation field written into this view (P7 Task 6 review, item 2). It is
 * addressed by its group name because the panel's export control and the view's own three
 * downloads sit in one region, and only the panel's press opens the gate.
 */
function replacePanel(): HTMLElement {
  return screen.getByRole('group', { name: copy('label.confirmReplace') });
}

/** Press the panel's own export control. The gate is a fact about this panel, not the session. */
function backUpInPanel(): void {
  fireEvent.click(within(replacePanel()).getByRole('button', { name: copy('button.downloadBackup') }));
}

/** Type into the panel's confirmation field, whose label is the frame that names the word. */
function typeConfirmation(value: string): void {
  fireEvent.change(within(replacePanel()).getByLabelText(FORMAT.typeToConfirm('DELETE')), {
    target: { value },
  });
}

/** The armed destructive control. */
function replaceButton(): HTMLElement {
  return within(replacePanel()).getByRole('button', { name: copy('button.replaceData') });
}

/** A valid document that differs from the fixture, so an import of it is observable. */
function otherDocument(): string {
  const seeded = makeBlankState();
  seeded.ui.accent = '#ffffff';
  return JSON.stringify(seeded);
}

/**
 * A device as the reminders slice stores it. `secret` is the bearer credential the Worker
 * checks on PUT and DELETE, which is why it must never reach a downloaded file.
 * Instants are epoch milliseconds, UTC.
 */
const DEVICE: PushDevice = {
  deviceId: '0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071',
  secret: 'sEcReTsEcReTsEcReTsEcReTsEcReTsEcReTsEcReT1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: `B${'A'.repeat(85)}`, auth: 'tBHItJI5svbpez7KI4CCXg' },
  createdAt: NOW, // [ms]
  lastSyncAt: NOW, // [ms]
  lastSyncHash: 'f00dcafe',
};

describe('the downloaded document and the push device', () => {
  it('withholds the device from the file while the running app keeps it', async () => {
    useAppStore.setState({ pushDevice: DEVICE });
    render(<ExportView />);
    click(copy('button.downloadJson'));

    const text = await (downloads.at(-1)?.blob ?? new Blob([''])).text();
    expect(text).not.toContain(DEVICE.secret);
    expect(text).toContain('"pushDevice": null');
    expect((JSON.parse(text) as { pushDevice: unknown }).pushDevice).toBeNull();
    // The projection is the file's, not the store's: this browser can still reach its
    // Worker record.
    expect(useAppStore.getState().pushDevice).toEqual(DEVICE);
  });

  it('leaves the importing browser with no device, to mint its own', () => {
    useAppStore.setState({ pushDevice: DEVICE });
    render(<ExportView />);
    check(otherDocument());
    backUpInPanel();
    typeConfirmation('DELETE');
    fireEvent.click(replaceButton());

    expect(screen.getByText(copy('status.importOk'))).toBeTruthy();
    // An imported document never carries a device, so reminders on this browser are dead
    // until the user switches the toggle off and on in Settings. src/store/persistence.ts
    // exportJson states that consequence; it is the same recovery the stale-device path uses.
    expect(useAppStore.getState().pushDevice).toBeNull();
  });
});

describe('ExportView', () => {
  it('offers the three downloads', () => {
    render(<ExportView />);
    expect(screen.getByRole('button', { name: copy('button.downloadJson') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy('button.downloadSummary') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy('button.downloadCalendar') })).toBeTruthy();
  });

  it('says the calendar alarms are a courtesy, not the reminder mechanism', () => {
    render(<ExportView />);
    expect(screen.getByText(copy('advice.calendarAlarms'))).toBeTruthy();
    expect(screen.getByText(FORMAT.calendarWindow(28))).toBeTruthy();
  });

  it('hands the browser one named file per download', () => {
    render(<ExportView />);
    click(copy('button.downloadJson'));
    click(copy('button.downloadSummary'));
    click(copy('button.downloadCalendar'));
    expect(downloads.map((d) => d.name)).toEqual([
      'fti-state-2026-09-01.json',
      'fti-summary-2026-09-01.txt',
      'fti-sessions-2026-09-01.ics',
    ]);
  });

  it('omits a VEVENT for a day already completed or skipped, but keeps a planned future day', async () => {
    // 2026-09-01 (the mocked NOW, Athens) is a Tuesday. The fixture's availability slots
    // (migrationFactories.makeAvailability) fall on ISO weekdays 1/3/5/6 -- Mon/Wed/Fri/Sat --
    // so the first four training days the 28-day window covers are 09-02 (Wed), 09-04 (Fri),
    // 09-05 (Sat) and 09-07 (Mon).
    const assignment = (patch: Partial<SessionAssignment>): SessionAssignment => ({
      date: '2026-09-02',
      sessionId: 's-push',
      sourceIndex: 0,
      status: 'completed',
      startedAt: NOW,
      completedAt: NOW,
      skipReason: null,
      ...patch,
    });
    const state = {
      ...makeBlankState(),
      assignments: {
        p1: [
          assignment({ date: '2026-09-02', sessionId: 's-push', status: 'completed' }),
          assignment({
            date: '2026-09-04',
            sessionId: 's-pull',
            status: 'skipped',
            startedAt: null,
            completedAt: null,
            skipReason: 'illness',
          }),
        ],
      },
    };
    useAppStore.getState().replaceState(state);

    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) blobs.push(blob);
      return 'blob:fti/1';
    });

    render(<ExportView />);
    click(copy('button.downloadCalendar'));
    const ics = await blobs[0]!.text();

    // The two terminal days: no VEVENT for either, regardless of whether it was completed or
    // skipped.
    expect(ics).not.toContain('UID:2026-09-02-s-push@fixthisinjustice');
    expect(ics).not.toContain('UID:2026-09-04-s-pull@fixthisinjustice');
    // The walk is not advanced by a terminal day (calendar.ts's own rule), so the first two
    // unassigned slot days -- 09-05 (Sat) and 09-07 (Mon) -- are projected from the plan's own
    // start (s-push, then s-pull) and must still produce a VEVENT each.
    expect(ics).toContain('UID:2026-09-05-s-push@fixthisinjustice');
    expect(ics).toContain('UID:2026-09-07-s-pull@fixthisinjustice');
  });

  it('shows the parse error and changes nothing for text that is not JSON', () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    check('{not json');
    expect(screen.getByRole('alert').textContent).toBe(copy('advice.importParseFailed'));
    expect(useAppStore.getState().exportJson()).toBe(before);
    expect(screen.queryByRole('button', { name: copy('button.replaceData') })).toBeNull();
  });

  it('shows the validation error and changes nothing for a hostile document', () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    check('{"week":999}');
    expect(screen.getByRole('alert').textContent).toMatch(/^The import was rejected: /);
    expect(useAppStore.getState().exportJson()).toBe(before);
    expect(screen.queryByRole('button', { name: copy('button.replaceData') })).toBeNull();
  });

  it('writes nothing to the store merely because a document validated', () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    check(otherDocument());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: copy('button.replaceData') })).toBeTruthy();
    expect(useAppStore.getState().exportJson()).toBe(before);
  });

  it('keeps the replace control disabled until the backup has been downloaded', () => {
    render(<ExportView />);
    check(otherDocument());
    typeConfirmation('DELETE');
    expect(replaceButton()).toBeDisabled();
    expect(screen.getByText(copy('advice.exportBeforeConfirm'))).toBeTruthy();

    backUpInPanel();
    expect(replaceButton()).toBeEnabled();
    // The instruction goes once it has been followed: standing advice the user has already
    // acted on reads as a second, unmet requirement.
    expect(screen.queryByText(copy('advice.exportBeforeConfirm'))).toBeNull();
    expect(screen.getByText(copy('status.exportTaken'))).toBeTruthy();
  });

  it('does not accept the view download as the backup this panel requires', () => {
    // The export gate is a fact about the open panel, not about the session (the property
    // ConfirmDestructive holds and its own suite asserts). A copy taken before the document
    // was pasted is not a copy of what Replace is about to overwrite.
    render(<ExportView />);
    click(copy('button.downloadJson'));
    check(otherDocument());
    typeConfirmation('DELETE');
    expect(replaceButton()).toBeDisabled();
  });

  it('names the panel, so it is not one of two anonymous confirmations', () => {
    render(<ExportView />);
    check(otherDocument());
    expect(replacePanel().getAttribute('aria-label')).toBe(copy('label.confirmReplace'));
  });

  it('offers the panel backup under the same stamped filename as the view download', () => {
    render(<ExportView />);
    check(otherDocument());
    backUpInPanel();
    expect(downloads.map((d) => d.name)).toEqual(['fti-state-2026-09-01.json']);
  });

  it('keeps the replace control disabled until the confirmation word is typed exactly', () => {
    render(<ExportView />);
    check(otherDocument());
    backUpInPanel();
    expect(replaceButton()).toBeDisabled();

    typeConfirmation('delete');
    expect(replaceButton()).toBeDisabled();

    typeConfirmation('DELETE');
    expect(replaceButton()).toBeEnabled();
  });

  it('changes nothing when the confirmation is cancelled, and asks for the backup again', () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    check(otherDocument());
    backUpInPanel();
    typeConfirmation('DELETE');
    fireEvent.click(within(replacePanel()).getByRole('button', { name: copy('button.cancel') }));

    expect(screen.queryByRole('group', { name: copy('label.confirmReplace') })).toBeNull();
    expect(useAppStore.getState().exportJson()).toBe(before);

    // Checked again, the panel comes back unarmed: unmounting it is what re-arms both gates.
    click(copy('button.checkImport'));
    typeConfirmation('DELETE');
    expect(replaceButton()).toBeDisabled();
  });

  it('installs the document once the gate and the confirmation are both satisfied', () => {
    render(<ExportView />);
    const document_ = otherDocument();
    check(document_);
    backUpInPanel();
    typeConfirmation('DELETE');
    fireEvent.click(replaceButton());

    expect(JSON.parse(useAppStore.getState().exportJson())).toEqual(JSON.parse(document_));
    expect(screen.getByText(copy('status.importOk'))).toBeTruthy();
  });

  it('persists the imported document to storage once Replace commits it', () => {
    // The in-memory store (exportJson(), asserted above) proves the STATE changed; it says
    // nothing about the disk. startPersistence() is not on by default in this suite -- most
    // tests here never touch storage -- so it is switched on for this one test only.
    const storage = installFakeStorage();
    // The persistence subscription refuses to write until the store is marked hydrated
    // (store/index.ts canPersist); hydrate() against the now-empty fake storage takes the
    // "absent" branch, which only flips that flag and leaves the profile/plan the outer
    // beforeEach already installed untouched.
    useAppStore.getState().hydrate();
    startPersistenceForTest();
    render(<ExportView />);

    const imported = JSON.stringify(makeBlankState(makeProfile({ displayName: 'Imported Athlete' })));
    check(imported);
    backUpInPanel();
    typeConfirmation('DELETE');
    fireEvent.click(replaceButton());

    // The write is debounced (SAVE_DEBOUNCE_MS); flushSave() commits it synchronously without
    // switching this file over to fake timers.
    flushSave();

    const raw = storage.get(STORAGE_KEY);
    expect(raw).toBeDefined();
    const result = parseState(JSON.parse(raw ?? 'null'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.profiles[result.state.activeProfileId ?? '']?.displayName).toBe(
        'Imported Athlete',
      );
    }
  });

  it('re-imports its own export to an equal state', () => {
    render(<ExportView />);
    const exported = useAppStore.getState().exportJson();
    const seeded = makeBlankState();
    seeded.ui.accent = '#ffffff';
    useAppStore.getState().replaceState(seeded);
    expect(useAppStore.getState().exportJson()).not.toBe(exported);

    check(exported);
    backUpInPanel();
    typeConfirmation('DELETE');
    fireEvent.click(replaceButton());
    expect(JSON.parse(useAppStore.getState().exportJson())).toEqual(JSON.parse(exported));
  });

  it('reads a chosen file into the paste area without importing it', async () => {
    render(<ExportView />);
    const before = useAppStore.getState().exportJson();
    const file = new File([otherDocument()], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText(copy('label.chooseExportFile')), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByLabelText(copy('label.pasteExport'))).toHaveValue(otherDocument());
    });
    expect(useAppStore.getState().exportJson()).toBe(before);
  });
});
