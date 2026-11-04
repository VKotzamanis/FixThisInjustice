import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copy, copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import type { SetupDraft } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { reviewDraft } from '../../../e2e/support/document';
import { SetupWizard } from './SetupWizard';

function seedDraft(draft: SetupDraft): void {
  const base = defaultState();
  useAppStore.setState({
    ...base,
    setupDraft: draft,
    ui: { ...base.ui, introSeen: true, bootSeen: true, scanlines: false },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

beforeEach(() => {
  installFakeStorage();
});

describe('the wizard refuses what the loader refuses (R5, A01/A08)', () => {
  it('confirms through one completeSetup write', () => {
    seedDraft(reviewDraft());
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Looks Good'));
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.confirmStart') }));
    const s = useAppStore.getState();
    expect(Object.keys(s.profiles)).toHaveLength(1);
    expect(s.setupDraft).toBeNull();
    expect(s.cursors[s.activeProfileId ?? '']?.nextSessionIndex).toBe(0);
  });

  it('shows a refusal and writes nothing when the store refuses', () => {
    seedDraft(reviewDraft());
    useAppStore.setState({
      completeSetup: () => {
        throw new Error('completeSetup: refused in this test');
      },
    });
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText('Looks Good'));
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.confirmStart') }));
    expect(screen.getByRole('alert')).toHaveTextContent(copy('error.setupRefused'));
    expect(useAppStore.getState().profiles).toEqual({});
  });
});
