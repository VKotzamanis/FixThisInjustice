// A06 (resume by step id, clamp on restore) and A07 (backgrounding flushes the draft).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FORMAT, copyFor } from '../../content/copy';
import { defaultState, parseState } from '../../domain/schema';
import type { SetupDraft } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { e2eDocument, reviewDraft } from '../../../e2e/support/document';
import { STEPS, SetupWizard, restoreStepIndex } from './SetupWizard';

function seedDraft(draft: SetupDraft): void {
  const base = defaultState();
  useAppStore.setState({
    ...base,
    setupDraft: draft,
    ui: { ...base.ui, introSeen: true, bootSeen: true, scanlines: false, skin: 'limelight' },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('A06: a stored draft resumes on a screen that exists', () => {
  it('restores by step id when the id names a step', () => {
    expect(restoreStepIndex({ stepIndex: 0, stepId: 'goal' })).toBe(STEPS.indexOf('goal'));
  });

  it('resumes a draft saved under the eight-step wizard by its step id (ROADMAP L6)', () => {
    // Under the old STEPS guidance was index 6 and review 7; the id still finds them.
    expect(restoreStepIndex({ stepIndex: 6, stepId: 'guidance' })).toBe(STEPS.indexOf('guidance'));
    expect(restoreStepIndex({ stepIndex: 7, stepId: 'review' })).toBe(STEPS.indexOf('review'));
    // A draft parked on the removed programme step (old index 5) opens on the step after it.
    expect(restoreStepIndex({ stepIndex: 5, stepId: 'programme' })).toBe(STEPS.indexOf('guidance'));
  });

  it('clamps a stale index, ignores an unknown id, and starts a missing draft at 0', () => {
    expect(restoreStepIndex({ stepIndex: 8 })).toBe(STEPS.length - 1);
    expect(restoreStepIndex({ stepIndex: 3, stepId: 'retired-step' })).toBe(3);
    expect(restoreStepIndex({ stepIndex: -2 })).toBe(0);
    expect(restoreStepIndex(null)).toBe(0);
  });

  it('opens a draft stored at index 8 on the last step, with Confirm, never "Step 9 of 8"', () => {
    seedDraft(reviewDraft({ stepIndex: 8 }));
    render(<SetupWizard />);
    expect(
      screen.getByText(FORMAT.stepOf(STEPS.length, STEPS.length, copyFor('limelight', 'step.review'))),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.confirmStart') })).toBeTruthy();
  });

  it('saves the step id beside the index', () => {
    vi.useFakeTimers();
    seedDraft(reviewDraft({ stepIndex: 2 }));
    const { container } = render(<SetupWizard />);
    fireEvent.change(container.querySelector('#f-name') as HTMLInputElement, { target: { value: 'Ann' } });
    act(() => void vi.advanceTimersByTime(1000)); // [ms] past the wizard's 400 ms debounce
    expect(useAppStore.getState().setupDraft).toMatchObject({ stepIndex: 2, stepId: 'body' });
  });

  it('parses a stored id, and turns a corrupt one into "" without losing the draft (rule 7)', () => {
    const ok = parseState(
      JSON.parse(JSON.stringify(e2eDocument({ profile: false, setupDraft: reviewDraft({ stepId: 'goal' }) }))) as unknown,
    );
    expect(ok.ok ? ok.state.setupDraft?.stepId : ok.error).toBe('goal');
    const corrupt = parseState(
      JSON.parse(
        JSON.stringify(e2eDocument({ profile: false, setupDraft: reviewDraft({ stepId: 'x'.repeat(500) }) })),
      ) as unknown,
    );
    expect(corrupt.ok ? corrupt.state.setupDraft?.stepId : corrupt.error).toBe('');
    expect(corrupt.ok ? corrupt.state.setupDraft?.displayName : corrupt.error).toBe('E2E');
  });
});

describe('A07: backgrounding hands the last keystrokes to the store', () => {
  it('saves a name typed less than the debounce before the app is hidden', () => {
    vi.useFakeTimers();
    seedDraft(reviewDraft({ stepIndex: 2 }));
    const { container } = render(<SetupWizard />);
    fireEvent.change(container.querySelector('#f-name') as HTMLInputElement, { target: { value: 'Annabel' } });
    expect(useAppStore.getState().setupDraft?.buffer?.displayName).not.toBe('Annabel'); // still in the timer
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(useAppStore.getState().setupDraft?.buffer?.displayName).toBe('Annabel');
  });
});
