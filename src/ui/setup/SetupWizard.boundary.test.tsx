import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { PROFILE_DISPLAY_NAME_MAX_CHARS, defaultState } from '../../domain/schema';
import type { SetupDraft } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { REVIEW_DAYS, reviewDraft } from '../../../e2e/support/document';
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
  it('caps the name field by the schema bound and blocks a restored over-long name', () => {
    seedDraft(reviewDraft({ stepIndex: 2, displayName: 'A'.repeat(81) }));
    const { container } = render(<SetupWizard />);
    expect(container.querySelector('#f-name')?.getAttribute('maxlength')).toBe(String(PROFILE_DISPLAY_NAME_MAX_CHARS));
    expect(
      screen.getByText(FORMAT.withSlots('error.nameTooLong', { max: PROFILE_DISPLAY_NAME_MAX_CHARS })),
    ).toBeInTheDocument();
  });

  it('requires a start time on every chosen day', () => {
    seedDraft(reviewDraft({ stepIndex: 4, days: { ...REVIEW_DAYS, 1: { enabled: true, startTime: '', durationMin: '60' } } }));
    render(<SetupWizard />);
    expect(screen.getByText(copy('error.startTimeRequired'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

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
