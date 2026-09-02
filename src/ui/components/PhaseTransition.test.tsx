// src/ui/components/PhaseTransition.test.tsx
//
// The block transition cutscene and the gate that decides it is due (P8 Task 10).
//
// Deviations from the P8 plan's Task 10 Step 6 literal, recorded here rather than by editing
// the plan:
//  - The `milestoneMessage` describe block is gone with the component it tested. The milestone
//    toast is rendered by the queue itself from `FORMAT.milestoneSets` (P8 Task 3), so a second
//    module holding the same sentence would be a copy no skin override could reach.
//  - The gate assertions use the shared fixture plan's own block boundaries (0-19 and 20-23),
//    not the eight-session blocks the plan's literal assumes, and the heading is quoted through
//    the copy table rather than as a literal.
//  - Two conditions the plan's literal does not state are asserted here because the task brief
//    requires them: the cutscene never appears during an active session, and never over the
//    boot sequence.
//  - Repo style: single quotes, [unit] comments.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PhaseTransition, PhaseTransitionGate } from './PhaseTransition';
import { FORMAT, copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { EMPTY_SESSION } from '../../store/sessionMirror';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { PlanCursor } from '../../domain/types';

/** The fixture plan's second block starts here. [sessions] offset */
const BLOCK_ONE_START = 20;

function cursorAt(n: number): PlanCursor {
  return {
    planId: 'plan-upper-lower',
    nextSessionIndex: n, // [sessions] offset
    startedOn: '2026-09-07',
    completedOn: null,
  };
}

/** "Block 1 to Block 2", read from the table so a reworded template moves the assertion. */
function headingFor(from: number, to: number): string {
  return FORMAT.withSlots('status.blockTransition', { from, to });
}

describe('PhaseTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals its statistics in steps and then offers Continue', () => {
    const onClose = vi.fn();
    render(
      <PhaseTransition
        fromIndex={0}
        toIndex={1}
        stats={{ sessionsCompleted: 8, setsLogged: 96, tonnageKg: 41208, specimensOwned: 5 }}
        units="metric"
        onClose={onClose}
      />,
    );

    expect(screen.getByText(headingFor(1, 2))).toBeInTheDocument();
    expect(screen.queryByText('96')).toBeNull();
    expect(screen.queryByRole('button', { name: copy('button.continue') })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });

    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('41,208 kg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows mass moved in the profile display unit', () => {
    render(
      <PhaseTransition
        fromIndex={0}
        toIndex={1}
        stats={{ sessionsCompleted: 8, setsLogged: 96, tonnageKg: 1000, specimensOwned: 5 }}
        units="imperial"
        onClose={() => {
          /* not under test */
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });

    // 1000 kg / 0.45359237 = 2204.6 lb, rounded to a whole pound for display.
    expect(screen.getByText('2,205 lb')).toBeInTheDocument();
  });

  it('prints every statistic at once, with no timer, under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    );
    try {
      render(
        <PhaseTransition
          fromIndex={0}
          toIndex={1}
          stats={{ sessionsCompleted: 8, setsLogged: 96, tonnageKg: 1000, specimensOwned: 5 }}
          units="metric"
          onClose={() => {
            /* not under test */
          }}
        />,
      );

      // No clock has moved: the reveal is the whole point of the setting.
      expect(screen.getByText('96')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: copy('button.continue') })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PhaseTransitionGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The session slice is NOT part of AppState, so makeAppState does not reset it and a test
    // that opened a session would leak an active assignment date into the next one.
    useAppStore.setState({ ...makeAppState(), session: { ...EMPTY_SESSION } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays silent while the cursor is inside the first block', () => {
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  it('fires once when the cursor enters a new block and records it as seen', () => {
    useAppStore.setState({ cursors: { p1: cursorAt(BLOCK_ONE_START) } });
    render(<PhaseTransitionGate />);

    expect(screen.getByText(headingFor(1, 2))).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));

    expect(useAppStore.getState().ui.lastBlockSeenByProfile.p1).toBe(1);
  });

  it('does not fire again for a block already seen', () => {
    useAppStore.setState({
      cursors: { p1: cursorAt(BLOCK_ONE_START) },
      ui: makeUiPrefs({ lastBlockSeenByProfile: { p1: 1 } }),
    });
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  // G13: the A61 regression. Browsing must not fire or consume the cutscene.
  it('ignores the plan view browse position entirely', () => {
    // The user may be browsing block 2 in the Plan view; the cursor is still inside block 0.
    useAppStore.setState({ cursors: { p1: cursorAt(2) } });
    const { container } = render(<PhaseTransitionGate />);

    expect(container.firstChild).toBeNull();
    expect(useAppStore.getState().ui.lastBlockSeenByProfile.p1).toBeUndefined();
  });

  it('stays silent while a session is under way', () => {
    useAppStore.setState({
      cursors: { p1: cursorAt(BLOCK_ONE_START) },
      session: { ...useAppStore.getState().session, activeAssignmentDate: '2026-11-02' },
    });
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  it('stays silent while the boot sequence is still running', () => {
    useAppStore.setState({
      cursors: { p1: cursorAt(BLOCK_ONE_START) },
      ui: makeUiPrefs({ bootSeen: false }),
    });
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  it('stays silent without an active profile', () => {
    useAppStore.setState({ activeProfileId: null, cursors: { p1: cursorAt(BLOCK_ONE_START) } });
    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
  });

  it('reports the statistics of the block just finished, not the one being entered', () => {
    useAppStore.setState({
      cursors: { p1: cursorAt(BLOCK_ONE_START) },
      assignments: {
        p1: [
          {
            date: '2026-09-08',
            sessionId: 's-push',
            sourceIndex: 0, // block 0
            status: 'completed',
            startedAt: 1, // [ms] epoch UTC
            completedAt: 2, // [ms] epoch UTC
            skipReason: null,
          },
        ],
      },
    });
    render(<PhaseTransitionGate />);
    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });

    // One completed session, and it belongs to block 0: the block the transition closes.
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
