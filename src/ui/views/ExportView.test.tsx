import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportView } from './ExportView';
import { FORMAT, copy } from '../../content/copy';
import { makeBlankState } from '../../test/migrationFactories';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';

/**
 * The instant every assertion is dated from: 2026-09-01T12:00:00Z, which is 2026-09-01 in
 * the fixture profile's Europe/Athens. Date.now is stubbed rather than the timer faked, so
 * Testing Library's own scheduling is untouched.
 */
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // [ms]

/** What each synthetic download carried. jsdom implements neither of the two APIs it needs. */
let downloads: { name: string; type: string }[] = [];

beforeEach(() => {
  installFakeStorage();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  downloads = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    downloads.push({ name: '', type: blob instanceof Blob ? blob.type : '' });
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

/** Types a candidate document into the paste area and asks for it to be checked. */
function check(text: string): void {
  fireEvent.change(screen.getByLabelText(copy('label.pasteExport')), { target: { value: text } });
  click(copy('button.checkImport'));
}

/** A valid document that differs from the fixture, so an import of it is observable. */
function otherDocument(): string {
  const seeded = makeBlankState();
  seeded.ui.accent = '#ffffff';
  return JSON.stringify(seeded);
}

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
    fireEvent.change(screen.getByLabelText(copy('confirm.typeToConfirm')), {
      target: { value: 'DELETE' },
    });
    expect(screen.getByRole('button', { name: copy('button.replaceData') })).toBeDisabled();
    expect(screen.getByText(copy('advice.downloadBackupFirst'))).toBeTruthy();

    click(copy('button.downloadJson'));
    expect(screen.getByRole('button', { name: copy('button.replaceData') })).toBeEnabled();
    // The instruction goes once it has been followed: standing advice the user has already
    // acted on reads as a second, unmet requirement.
    expect(screen.queryByText(copy('advice.downloadBackupFirst'))).toBeNull();
  });

  it('keeps the replace control disabled until the confirmation word is typed exactly', () => {
    render(<ExportView />);
    check(otherDocument());
    click(copy('button.downloadJson'));
    const field = screen.getByLabelText(copy('confirm.typeToConfirm'));
    expect(screen.getByRole('button', { name: copy('button.replaceData') })).toBeDisabled();

    fireEvent.change(field, { target: { value: 'delete' } });
    expect(screen.getByRole('button', { name: copy('button.replaceData') })).toBeDisabled();

    fireEvent.change(field, { target: { value: 'DELETE' } });
    expect(screen.getByRole('button', { name: copy('button.replaceData') })).toBeEnabled();
  });

  it('installs the document once the gate and the confirmation are both satisfied', () => {
    render(<ExportView />);
    const document_ = otherDocument();
    check(document_);
    click(copy('button.downloadJson'));
    fireEvent.change(screen.getByLabelText(copy('confirm.typeToConfirm')), {
      target: { value: 'DELETE' },
    });
    click(copy('button.replaceData'));

    expect(JSON.parse(useAppStore.getState().exportJson())).toEqual(JSON.parse(document_));
    expect(screen.getByText(copy('status.importOk'))).toBeTruthy();
  });

  it('re-imports its own export to an equal state', () => {
    render(<ExportView />);
    const exported = useAppStore.getState().exportJson();
    const seeded = makeBlankState();
    seeded.ui.accent = '#ffffff';
    useAppStore.getState().replaceState(seeded);
    expect(useAppStore.getState().exportJson()).not.toBe(exported);

    check(exported);
    click(copy('button.downloadJson'));
    fireEvent.change(screen.getByLabelText(copy('confirm.typeToConfirm')), {
      target: { value: 'DELETE' },
    });
    click(copy('button.replaceData'));
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
