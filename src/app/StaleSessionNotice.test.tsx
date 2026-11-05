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

  it('shows one notice when another window replaced a queued change (B03, AM-10)', () => {
    useAppStore.setState({ status: { ...useAppStore.getState().status, staleClosures: [], externalWriteReplaced: true } });
    render(
      <ToastProvider>
        <StaleSessionNotice />
        <ToastQueue />
      </ToastProvider>,
    );
    expect(screen.getAllByText(copyFor('limelight', 'status.externalWriteReplaced'))).toHaveLength(1);
    expect(useAppStore.getState().status.externalWriteReplaced).toBe(false);
  });
});
