// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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
