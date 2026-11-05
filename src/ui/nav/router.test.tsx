// Spec R6 / audit F01, F09: history follows ui.lastView; Back switches view; a tab or Back
// restores the view's own scroll offset, any other switch opens the view at the top.
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { useAppStore } from '../../store';
import { currentEntry } from './history';
import { goToView, useHistoryRouter } from './router';
import { isViewId, type ViewId } from './views';

function Shell(): ReactElement {
  const stored = useAppStore((s) => s.ui.lastView);
  const view: ViewId = isViewId(stored) ? stored : 'today';
  useHistoryRouter(view);
  return <p data-testid="view">{view}</p>;
}

/** Resolves after jsdom has delivered a queued history traversal. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
  });
}

describe('the hash router (R6, F01, F09)', () => {
  beforeEach(async () => {
    await settle(); // a previous test's own step-backs land first
    useAppStore.getState().setUi({ lastView: 'today' });
  });

  it('replaces the cold-start entry with the view hash, then pushes one entry per view change', () => {
    const before = window.history.length;
    render(<Shell />);
    expect(currentEntry()).toEqual({ view: 'today', depth: 0 });
    expect(window.location.hash).toBe('#/today');
    act(() => {
      goToView('log');
    });
    expect(currentEntry()).toEqual({ view: 'log', depth: 0 });
    expect(window.location.hash).toBe('#/log');
    expect(window.history.length - before).toBe(1);
  });

  it('Back returns to the previous view without pushing a new entry', async () => {
    const { getByTestId } = render(<Shell />);
    act(() => {
      goToView('plan');
    });
    const length = window.history.length;
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
    });
    expect(getByTestId('view').textContent).toBe('today');
    expect(useAppStore.getState().ui.lastView).toBe('today');
    expect(window.history.length).toBe(length);
  });

  it('a tab restores the offset the view was left at; Start-style switches open at the top (F09)', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    render(<Shell />);
    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true }); // [px] Today
    act(() => {
      goToView('plan');
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true }); // [px] Plan
    act(() => {
      goToView('today');
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true });
    act(() => {
      // Today's Start writes the preference directly: the target opens at the top.
      useAppStore.getState().setUi({ lastView: 'train' });
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});
