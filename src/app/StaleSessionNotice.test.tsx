import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { defaultState, useAppStore } from '../store';
import { ToastProvider, ToastQueue } from '../ui/components/ToastQueue';
import { StaleSessionNotice } from './StaleSessionNotice';

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: true,
      lastActionError: null,
      staleClosures: [{ date: '2026-09-07', sessionId: 's-1', outcome: 'completed' }],
    },
  });
});

describe('StaleSessionNotice', () => {
  it('shows one notice for a closed session and acknowledges it', () => {
    render(
      <ToastProvider>
        <StaleSessionNotice />
        <ToastQueue />
      </ToastProvider>,
    );
    expect(screen.getByText(copyFor('limelight', 'status.staleSessionCompleted'))).toBeInTheDocument();
    expect(useAppStore.getState().status.staleClosures).toEqual([]);
  });
});
