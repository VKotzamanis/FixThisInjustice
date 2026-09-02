// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { FORMAT, copy } from '../../content/copy';
import { downloadText } from '../../app/download';
import { ConfirmDestructive, type ConfirmDestructiveProps } from './ConfirmDestructive';

/*
 * downloadText is mocked rather than exercised: jsdom implements neither URL.createObjectURL
 * nor a download, so the real function throws. The same seam App.test.tsx uses.
 */
vi.mock('../../app/download', () => ({ downloadText: vi.fn() }));

const WORD = 'DELETE';
const BACKUP = '{"legacy":true}';

function renderPanel(
  overrides: Partial<ConfirmDestructiveProps> = {},
): { onConfirm: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDestructive
      titleKey="label.confirmDeleteLegacy"
      word={WORD}
      exportLabelKey="button.downloadLegacyJson"
      exportFilename="fixthisinjustice-legacy-v2.json"
      exportText={() => BACKUP}
      confirmLabelKey="button.legacyDeleteOld"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Type into the confirmation field, whose label is the frame that names the word. */
function type(value: string, word: string = WORD): void {
  fireEvent.change(screen.getByLabelText(FORMAT.typeToConfirm(word)), { target: { value } });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConfirmDestructive: the export gate', () => {
  it('holds the action while the backup has not been taken, even with the word typed', () => {
    renderPanel();
    type(WORD);
    expect(button(copy('button.legacyDeleteOld'))).toBeDisabled();
    expect(screen.getByText(copy('advice.exportBeforeConfirm'))).toBeTruthy();
  });

  it('holds the action after the backup when the typed word does not match', () => {
    renderPanel();
    fireEvent.click(button(copy('button.downloadLegacyJson')));
    type('delete');
    expect(button(copy('button.legacyDeleteOld'))).toBeDisabled();
  });

  it('releases the action once the backup is taken and the word matches exactly', () => {
    renderPanel();
    fireEvent.click(button(copy('button.downloadLegacyJson')));
    type(WORD);
    expect(button(copy('button.legacyDeleteOld'))).toBeEnabled();
  });

  it('hands the export the filename and the text it was given, and says so', () => {
    renderPanel();
    fireEvent.click(button(copy('button.downloadLegacyJson')));
    expect(downloadText).toHaveBeenCalledTimes(1);
    expect(downloadText).toHaveBeenCalledWith('fixthisinjustice-legacy-v2.json', BACKUP);
    expect(screen.getByText(copy('status.exportTaken'))).toBeTruthy();
    expect(screen.queryByText(copy('advice.exportBeforeConfirm'))).toBeNull();
  });
});

describe('ConfirmDestructive: the decision', () => {
  it('calls onConfirm exactly once and never cancels', () => {
    const { onConfirm, onCancel } = renderPanel();
    fireEvent.click(button(copy('button.downloadLegacyJson')));
    type(WORD);
    fireEvent.click(button(copy('button.legacyDeleteOld')));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel and never confirms', () => {
    const { onConfirm, onCancel } = renderPanel();
    fireEvent.click(button(copy('button.downloadLegacyJson')));
    type(WORD);
    fireEvent.click(button(copy('button.cancel')));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ConfirmDestructive: the word and its label', () => {
  /*
   * Code review finding 3. The label used to be a fixed string that spelled the word out, so a
   * skin could rewrite it to name a different word than the one the component compares
   * against, and the control would then never enable. One frame, one argument: the label
   * cannot name a word the gate does not accept.
   */
  it('names the word through the frame, whatever the word is', () => {
    renderPanel({ word: 'IMPORT' });
    expect(screen.getByLabelText(FORMAT.typeToConfirm('IMPORT'))).toBeTruthy();
    expect(screen.queryByLabelText(FORMAT.typeToConfirm('DELETE'))).toBeNull();
  });

  it('compares the typed word case-sensitively against the word it was given', () => {
    renderPanel({ word: 'IMPORT' });
    fireEvent.click(button(copy('button.downloadLegacyJson')));
    type('Import', 'IMPORT');
    expect(button(copy('button.legacyDeleteOld'))).toBeDisabled();
    type('IMPORT', 'IMPORT');
    expect(button(copy('button.legacyDeleteOld'))).toBeEnabled();
  });
});

describe('ConfirmDestructive: the panel names itself', () => {
  /*
   * Accessible grouping (P7 Task 6 review, item 2). Two panels can be on screen at once: the
   * Settings wipe, and the Replace confirmation in the export view mounted directly above it.
   * Both label their field 'Type DELETE to confirm' and both carry a 'Cancel', so without a
   * name on the group a screen reader offers two indistinguishable sets of controls that
   * destroy different things.
   */
  it('exposes the title as the group label', () => {
    renderPanel({ titleKey: 'label.confirmWipe' });
    const group = screen.getByRole('group', { name: copy('label.confirmWipe') });
    // The gate's own controls are INSIDE the named group, which is what makes the name useful.
    expect(within(group).getByRole('button', { name: copy('button.legacyDeleteOld') })).toBeTruthy();
    expect(within(group).getByLabelText(FORMAT.typeToConfirm(WORD))).toBeTruthy();
  });

  it('gives two panels mounted at once distinct accessible names', () => {
    render(
      <>
        <ConfirmDestructive
          titleKey="label.confirmWipe"
          word={WORD}
          exportLabelKey="button.downloadBackup"
          exportFilename="fti-state-2026-09-01.json"
          exportText={() => BACKUP}
          confirmLabelKey="button.wipeConfirm"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
        <ConfirmDestructive
          titleKey="label.confirmReplace"
          word={WORD}
          exportLabelKey="button.downloadBackup"
          exportFilename="fti-state-2026-09-01.json"
          exportText={() => BACKUP}
          confirmLabelKey="button.replaceData"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    );

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    const names = groups.map((g) => g.getAttribute('aria-label'));
    expect(names).toEqual([copy('label.confirmWipe'), copy('label.confirmReplace')]);
    // Distinct, not merely present: the whole point is that one query cannot match both.
    expect(new Set(names).size).toBe(2);
    expect(screen.getByRole('group', { name: copy('label.confirmWipe') })).toBe(groups[0]);
    expect(screen.getByRole('group', { name: copy('label.confirmReplace') })).toBe(groups[1]);
  });
});
