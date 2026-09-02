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
import { FORMAT, copy, copyFor } from '../../content/copy';
import { addDays, todayLocal } from '../../domain/dates';
import { probeBundledVideo, resolveVideoSrc } from '../../domain/motivation/assets';
import { useAppStore } from '../../store';
import { LEGACY_V2_KEY } from '../../store/persistence';
import { EMPTY_SESSION } from '../../store/sessionMirror';
import { installFakeStorage } from '../../store/testStorage';
import { FUN_PROFILE_ID, makeAppState, makeProfile, makeUiPrefs } from '../../test/funFixtures';
import { MotivationGate } from '../motivation/MotivationGate';
import type { PlanCursor, WeeklyReview } from '../../domain/types';
import type { SkinId } from '../../domain/types';

/*
 * The clip is the motivation modal's business, never this file's: MotivationGate.test.tsx owns
 * what it plays. Both asset lookups are mocked exactly as that suite mocks them, and
 * `resolveVideoSrc` is left PENDING rather than resolved, so no state update lands outside
 * `act` for a video no assertion here reads.
 */
vi.mock('../../domain/motivation/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/motivation/assets')>();
  return { ...actual, resolveVideoSrc: vi.fn(), probeBundledVideo: vi.fn() };
});

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

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

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
    // makeAppState replaces `ui`, which puts the shipped skin back over the pin above.
    pinSkin();
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
      ui: makeUiPrefs({ lastBlockSeenByProfile: { p1: 1 }, skin: 'clinical' }),
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
      ui: makeUiPrefs({ bootSeen: false, skin: 'clinical' }),
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

/**
 * The two full-screen dialogs the app shell mounts together (src/app/App.tsx), exercised as the
 * shell mounts them.
 *
 * Code review: both gates used to satisfy their conditions at the same time, so two ModalShells
 * opened at once. Each shell listens for Escape on the WINDOW, so one keypress aimed at the
 * popup reached both, and the cutscene's own handler wrote `lastBlockSeenByProfile` for a block
 * nobody had seen. That consumes the cutscene permanently: the flag never goes back down.
 */
describe('PhaseTransitionGate against the missed-week popup', () => {
  /** A closed week three sessions short of its target, ending on the given civil day. */
  function miss(end: string): WeeklyReview {
    return {
      profileId: FUN_PROFILE_ID,
      weekStart: addDays(end, -6),
      weekEnd: end,
      target: 4, // [sessions/week]
      completed: 1, // [sessions]
      skipped: 0, // [sessions]
      paused: false,
      delta: -3, // completed - target, [sessions]; negative = sessions missed
      evaluatedAt: 1_756_000_000_000, // [ms] epoch, UTC
      missHandled: false,
    };
  }

  /**
   * A pending miss AND a block boundary, which is the state the two gates used to collide in.
   *
   * The week is anchored to the profile's civil today read from the same clock the selector
   * uses, so a run that straddles midnight moves the anchor rather than falling out of
   * MOTIVATION_MISS_WINDOW_DAYS = 14.
   */
  function seedBoth(): void {
    installFakeStorage();
    const today = todayLocal(makeProfile().timezone);
    useAppStore.setState({
      ...makeAppState({
        cursors: { [FUN_PROFILE_ID]: cursorAt(BLOCK_ONE_START) },
        weeklyReviews: { [FUN_PROFILE_ID]: [miss(addDays(today, -1))] },
        motivation: {},
      }),
      session: { ...EMPTY_SESSION },
    });
    pinSkin();
  }

  function renderShell(): ReturnType<typeof render> {
    return render(
      <>
        <MotivationGate />
        <PhaseTransitionGate />
      </>,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // Left PENDING on purpose: see the module mock at the top of this file.
    vi.mocked(resolveVideoSrc).mockReturnValue(new Promise(() => undefined));
    vi.mocked(probeBundledVideo).mockResolvedValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders only the popup while a missed week is still pending', () => {
    seedBoth();
    renderShell();

    // One dialog, and it is the popup: two ModalShells at once fight over focus and the
    // scroll lock, and the topmost is not the one the user is answering.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByTestId('motivation-backdrop')).toBeInTheDocument();
    expect(screen.queryByTestId('phase-transition')).toBeNull();
  });

  it('spends one Escape on the popup alone, leaving the block unseen', () => {
    seedBoth();
    renderShell();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    // The popup's own dismissal was recorded...
    expect(useAppStore.getState().weeklyReviews[FUN_PROFILE_ID]?.[0]?.missHandled).toBe(true);
    // ...and the cutscene's was NOT: one keypress must not consume two dialogs.
    expect(useAppStore.getState().ui.lastBlockSeenByProfile[FUN_PROFILE_ID]).toBeUndefined();
  });

  it('shows the cutscene on the next render after the popup is dismissed', () => {
    seedBoth();
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));

    expect(screen.queryByTestId('motivation-backdrop')).toBeNull();
    expect(screen.getByTestId('phase-transition')).toBeInTheDocument();
    expect(screen.getByText(headingFor(1, 2))).toBeInTheDocument();
    // Still unseen: only the cutscene's own Continue or Escape writes the flag.
    expect(useAppStore.getState().ui.lastBlockSeenByProfile[FUN_PROFILE_ID]).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    expect(useAppStore.getState().ui.lastBlockSeenByProfile[FUN_PROFILE_ID]).toBe(1);
  });
});

/**
 * The `suppressedByMigration` branch (code review: it shipped untested).
 *
 * The legacy key is what MigrationGate mounts on, so a cutscene painted over the import wizard
 * would put a second ModalShell on top of a destructive confirmation.
 */
describe('PhaseTransitionGate against the legacy migration offer', () => {
  const LEGACY_RAW = '{"schemaVersion":2}';

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays silent while the legacy import is still being offered', () => {
    installFakeStorage({ [LEGACY_V2_KEY]: LEGACY_RAW });
    useAppStore.setState({
      ...makeAppState({
        cursors: { [FUN_PROFILE_ID]: cursorAt(BLOCK_ONE_START) },
        ui: makeUiPrefs({ legacyMigration: 'pending', skin: 'clinical' }),
      }),
      session: { ...EMPTY_SESSION },
    });

    const { container } = render(<PhaseTransitionGate />);
    expect(container.firstChild).toBeNull();
    expect(useAppStore.getState().ui.lastBlockSeenByProfile[FUN_PROFILE_ID]).toBeUndefined();
  });

  it('stays latched when the migration writes its decision mid-wizard', () => {
    installFakeStorage({ [LEGACY_V2_KEY]: LEGACY_RAW });
    useAppStore.setState({
      ...makeAppState({
        cursors: { [FUN_PROFILE_ID]: cursorAt(BLOCK_ONE_START) },
        ui: makeUiPrefs({ legacyMigration: 'pending', skin: 'clinical' }),
      }),
      session: { ...EMPTY_SESSION },
    });
    const { container } = render(<PhaseTransitionGate />);

    // applyMigration writes 'done' as part of the document it installs, while the wizard is
    // still on screen offering to delete the old data. The latch is what keeps this mount
    // silent for the rest of its life rather than un-suppressing under the wizard.
    act(() => {
      useAppStore.getState().setUi({ legacyMigration: 'done' });
    });
    expect(container.firstChild).toBeNull();
  });

  it('fires normally on a device that holds no legacy document', () => {
    installFakeStorage();
    useAppStore.setState({
      ...makeAppState({
        cursors: { [FUN_PROFILE_ID]: cursorAt(BLOCK_ONE_START) },
        ui: makeUiPrefs({ legacyMigration: 'pending', skin: 'clinical' }),
      }),
      session: { ...EMPTY_SESSION },
    });

    render(<PhaseTransitionGate />);
    expect(screen.getByText(headingFor(1, 2))).toBeInTheDocument();
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('PhaseTransition under a skin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the control in the limelight words, and in the default ones under clinical', () => {
    const stats = { sessionsCompleted: 8, setsLogged: 96, tonnageKg: 41208, specimensOwned: 5 };

    pinSkin('limelight');
    const view = render(
      <PhaseTransition fromIndex={0} toIndex={1} stats={stats} units="metric" onClose={vi.fn()} />,
    );
    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.continue') }),
    ).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    render(
      <PhaseTransition fromIndex={0} toIndex={1} stats={stats} units="metric" onClose={vi.fn()} />,
    );
    act(() => {
      vi.advanceTimersByTime(6000); // [ms]
    });
    expect(
      screen.getByRole('button', { name: copyFor('clinical', 'button.continue') }),
    ).toBeInTheDocument();
  });
});
