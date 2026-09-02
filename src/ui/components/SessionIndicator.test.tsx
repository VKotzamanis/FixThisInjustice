// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionIndicator } from './SessionIndicator';
import { FORMAT, copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { DAY_MS, MONDAY, NOW_MS, PLAN_ID, PROFILE_ID, seedState } from '../../test/scheduleFixtures';
import type { PlanCursor } from '../../domain/types';

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

/** A 16-week, 3-day plan: 48 sessions, the size master plan section 5's own example uses. */
const CYCLE = ['Push', 'Legs', 'Pull'];
const LONG_LABELS = Array.from({ length: 48 }, (_, i) => CYCLE[i % CYCLE.length] ?? 'Push');

function setCursor(patch: Partial<PlanCursor>): void {
  useAppStore.setState({
    cursors: {
      [PROFILE_ID]: {
        planId: PLAN_ID,
        nextSessionIndex: 0,
        startedOn: MONDAY,
        completedOn: null,
        ...patch,
      },
    },
  });
}

beforeEach(() => {
  // [ms] epoch, UTC. Pinned so no assertion here can depend on the real wall clock.
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
  useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
});

describe('SessionIndicator', () => {
  it('renders nothing when there is no plan', () => {
    useAppStore.setState({ plans: {}, cursors: {} });
    const { container } = render(<SessionIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('reads the session number from the cursor, not the calendar', () => {
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 1/6');
  });

  it('reports the cursor position in a 48 session plan', () => {
    useAppStore.setState(
      seedState({
        labels: LONG_LABELS,
        weekdays: [1, 3, 5],
        startedOn: MONDAY,
        nextSessionIndex: 11,
      }),
    );
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 12/48');
  });

  it('reports a finished programme without overrunning the total', () => {
    setCursor({ nextSessionIndex: 6, completedOn: MONDAY });
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 6/6 complete');
  });

  it('clamps a cursor that has run past the last session', () => {
    // nextSessionIndex === sessions.length is the terminal value the cursor invariant allows
    // (master plan section 6.7); anything beyond it is a corrupt document, and the indicator
    // still must not print a position the plan does not contain.
    setCursor({ nextSessionIndex: 9 });
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 6/6');
  });

  it('prints no position for a plan with no sessions', () => {
    useAppStore.setState(seedState({ labels: [], weekdays: [1, 3, 5], startedOn: MONDAY }));
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 0/0');
  });

  it('moves when the store cursor changes', () => {
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 1/6');
    act(() => {
      setCursor({ nextSessionIndex: 3 });
    });
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 4/6');
  });

  it('does not move when only the clock advances', () => {
    // 60 calendar days past startedOn with no completion. The legacy "D n/168" block counted
    // days since the start date and reported a position the user had not reached; the cursor
    // is attendance-driven (master plan section 6.4), so the indicator must not budge.
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS + 60 * DAY_MS); // [ms] epoch, UTC
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator').textContent).toBe('S 1/6');
  });

  it('carries an accessible label from the copy table', () => {
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator')).toHaveAccessibleName(
      FORMAT.planPositionLabel(1, 6, ''),
    );
  });

  it('names the finished programme in the accessible label', () => {
    setCursor({ nextSessionIndex: 6, completedOn: MONDAY });
    render(<SessionIndicator />);
    expect(screen.getByTestId('session-indicator')).toHaveAccessibleName(
      FORMAT.planPositionLabel(6, 6, copy('hero.programmeComplete')),
    );
  });

  it('renders the position with tabular numerals', () => {
    render(<SessionIndicator />);
    // The declaration is inline rather than in sessionIndicator.css precisely so this holds:
    // vitest stubs every stylesheet but crt.css, so a rule in the sheet would assert nothing.
    expect(screen.getByTestId('session-indicator')).toHaveStyle({
      fontVariantNumeric: 'tabular-nums',
    });
  });
});
