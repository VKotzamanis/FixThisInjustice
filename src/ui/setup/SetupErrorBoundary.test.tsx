import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { reviewDraft } from '../../../e2e/support/document';
import { SetupErrorBoundary } from './SetupErrorBoundary';

/** Throws while a draft is stored: the deterministic, draft-caused throw A12 describes. */
function DraftBomb(): JSX.Element {
  if (useAppStore.getState().setupDraft !== null) throw new Error('the draft broke setup');
  return <p>fresh setup</p>;
}

beforeEach(() => {
  installFakeStorage();
  // React logs a caught render error to console.error; the boundary is the subject here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const base = defaultState();
  useAppStore.setState({ ...base, setupDraft: reviewDraft(), ui: { ...base.ui, skin: 'limelight' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SetupErrorBoundary (A12)', () => {
  it('keeps a wizard throw inside setup and offers Restart Setup and Reload', () => {
    render(
      <SetupErrorBoundary>
        <DraftBomb />
      </SetupErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(copyFor('limelight', 'hero.setupFailed'));
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.restartSetup') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.reload') })).toBeTruthy();
  });

  it('Restart Setup clears the draft only, then shows the wizard again', () => {
    const before = useAppStore.getState();
    render(
      <SetupErrorBoundary>
        <DraftBomb />
      </SetupErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.restartSetup') }));
    expect(screen.getByText('fresh setup')).toBeTruthy();
    const after = useAppStore.getState();
    expect(after.setupDraft).toBeNull();
    expect(after.profiles).toBe(before.profiles);
    expect(after.sets).toBe(before.sets);
  });

  it('Reload asks for a reload', () => {
    const onReload = vi.fn();
    render(
      <SetupErrorBoundary onReload={onReload}>
        <DraftBomb />
      </SetupErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.reload') }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
