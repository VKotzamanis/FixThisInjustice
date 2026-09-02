import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, type ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../app/App';
import { FORMAT, copy } from '../../content/copy';
import { formatRest, planRowDomId } from '../format/plan';
import { requestPlanFocus, usePendingPlanFocus } from '../planFocus';
import { PlanView, blockOfSession, deloadNote, modifiedSets } from './PlanView';
// weekOfIndex MOVED to src/ui/planBrowse.tsx in P8 Task 9, with the plan-week arithmetic the
// keyboard scrub needs, and its two cases moved with it to src/ui/planBrowse.test.tsx. What is
// imported here is the browse RESET, because the scrub position is now module state and a week
// left browsed by one test would be the week the next one opens on.
import { resetPlanBrowse } from '../planBrowse';
import { useAppStore } from '../../store';
import { MONDAY, NOW_MS, seedState } from '../../test/scheduleFixtures';
import type { AppState, PlanBlock } from '../../domain/types';

/*
 * Deviations from the P3 plan's literal draft for this task, recorded here and in the task
 * report:
 *
 *  1. No vi.mock of the exercise library, for the reason Task 5 recorded: the shipped module
 *     exports EXERCISES as a readonly ARRAY and EXERCISE_BY_ID as the keyed view, so the
 *     draft's `EXERCISES: Record<...>` mock does not describe it. The fixture's ids ("ex-1")
 *     are not in the library, so the rows exercise exerciseName's documented fallback.
 *  2. The draft's `usePlan`/`useCursor` are read here as `useActivePlan`/`useActiveCursor`,
 *     which is what the shipped SessionIndicator reads; both spellings are one derivation.
 *  3. Every assertion quotes src/content/copy.ts rather than a literal (copy contract: "test
 *     assertions quote the default table"), so a reworded string fails here rather than
 *     shipping a view whose copy and whose test have drifted apart. The one exception is the
 *     second `deloadNote` case, which asserts a modifier the default table has no entry for
 *     and therefore quotes the FORMAT frame instead.
 */

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
/** Monday, Wednesday, Friday: ISO weekdays, Monday-first. */
const MWF = [1, 3, 5] as const;
/** [sessions/week] Three sessions a week over six sessions: two weeks, one block each. */
const SPW = 3;
const WEEKS = 2; // [weeks]

/**
 * An ordinary block followed by a deload block. `setModifier` 0.5 halves the VOLUME and
 * `loadModifier` stays 1: master plan section 5 and content review section 2.2 (Bosquet 2007)
 * put the cut on set count and never on load.
 */
const BLOCKS: PlanBlock[] = [
  {
    index: 0,
    firstSessionIndex: 0,
    sessionCount: 3, // [sessions]
    setModifier: 1, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: false,
  },
  {
    index: 1,
    firstSessionIndex: 3,
    sessionCount: 3, // [sessions]
    setModifier: 0.5, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: true,
  },
];

function seed(nextSessionIndex = 1): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: SPW,
    sessionsPerWeek: SPW,
    startedOn: MONDAY,
    nextSessionIndex,
    blocks: BLOCKS,
  });
}

function chip(blockNumber: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(FORMAT.blockLabel(blockNumber)) });
}

/** The outstanding deep link, rendered, so a test can assert the request was CONSUMED. */
function PendingProbe(): ReactElement {
  const target = usePendingPlanFocus();
  return (
    <span data-testid="pending">
      {target === null ? 'none' : `${target.sessionId}/${target.exerciseId}`}
    </span>
  );
}

beforeEach(() => {
  // Monday 2026-09-07, 09:30 in Europe/Athens (the profile's zone).
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  useAppStore.setState(seed());
  // Module state: a target left pending by one test would be delivered inside the next one,
  // and a week left browsed would be the week the next test opens on.
  requestPlanFocus(null);
  resetPlanBrowse();
});

afterEach(() => {
  requestPlanFocus(null);
  resetPlanBrowse();
  vi.restoreAllMocks();
});

describe('deloadNote', () => {
  it('states the volume cut and that the load is unchanged', () => {
    // The default table's own row, filled by the frame that reads it, so the note the view
    // prints for the canonical deload is the string the copy contract fixed. The row is a
    // template since P8 Task 16, so the frame is what renders it and `copy` alone no longer can.
    expect(deloadNote(0.5)).toBe(FORMAT.deloadNote(50)); // [%] of planned sets removed
  });

  it("reports the block's actual modifier rather than a fixed number", () => {
    expect(deloadNote(0.6)).toBe(FORMAT.deloadNote(40)); // [%] of planned sets removed
    expect(deloadNote(0.4)).toBe(FORMAT.deloadNote(60)); // [%]
  });
});

describe('modifiedSets', () => {
  it('scales the planned count by the block modifier, to the nearest whole set', () => {
    expect(modifiedSets(3, 0.5)).toBe(2); // [sets] 1.5 rounds to 2
    expect(modifiedSets(4, 0.5)).toBe(2); // [sets]
    expect(modifiedSets(3, 1)).toBe(3); // [sets] an ordinary block is unchanged
  });

  it('never prescribes zero sets', () => {
    // A set count that rounds to nothing would print a session with no work in it.
    expect(modifiedSets(1, 0.4)).toBe(1); // [sets]
  });
});

describe('blockOfSession', () => {
  it('finds the block a session index falls in', () => {
    expect(blockOfSession(BLOCKS, 2)?.index).toBe(0);
    expect(blockOfSession(BLOCKS, 3)?.index).toBe(1);
  });

  it('answers null past the end of the last block', () => {
    // The terminal cursor sits AT plan.sessions.length, which is inside no block.
    expect(blockOfSession(BLOCKS, 6)).toBeNull();
  });
});

describe('PlanView block strip', () => {
  it("lists every block with its session range and flags the deload block's volume cut", () => {
    render(<PlanView />);

    expect(chip(1).textContent).toContain(FORMAT.blockSessions(1, 3));
    const deload = chip(2);
    expect(deload.textContent).toContain(copy('status.deloadTag'));
    expect(deload.textContent).toContain(FORMAT.deloadNote(50)); // [%]
    // The ordinary block carries no deload flag: the strip states the cut where it applies.
    expect(chip(1).textContent).not.toContain(copy('status.deloadTag'));
  });

  it("highlights the block the cursor stands in, not the first one", () => {
    useAppStore.setState(seed(4)); // session 5 of 6, which is in the deload block
    render(<PlanView />);

    expect(chip(1).getAttribute('data-current')).toBe('false');
    expect(chip(2).getAttribute('data-current')).toBe('true');
  });

  it('jumps the scrubber to a selected block without moving the cursor', () => {
    render(<PlanView />);
    fireEvent.click(chip(2));

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(2, WEEKS));
    // The scrubber is a view of the plan, not a position in it (code review A14).
    expect(useAppStore.getState().cursors['p1']?.nextSessionIndex).toBe(1);
  });
});

describe('PlanView week scrubber', () => {
  it("opens on the cursor's own week", () => {
    render(<PlanView />);

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));
    expect(screen.getAllByTestId('plan-session')).toHaveLength(SPW);
  });

  it("scrubs to another week and lists that week's sessions", () => {
    render(<PlanView />);
    fireEvent.change(screen.getByLabelText(copy('label.week')), { target: { value: '2' } });

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(2, WEEKS));
    const rows = screen.getAllByTestId('plan-session');
    expect(rows).toHaveLength(SPW);
    expect(rows[0]?.textContent).toContain('Push 4');
  });
});

describe('PlanView sessions', () => {
  it('marks the session the cursor points at, and only that one', () => {
    render(<PlanView />);
    const rows = screen.getAllByTestId('plan-session');

    expect(rows[0]?.getAttribute('data-cursor')).toBe('false');
    expect(rows[1]?.getAttribute('data-cursor')).toBe('true');
    expect(rows[2]?.getAttribute('data-cursor')).toBe('false');
    expect(rows[1]?.textContent).toContain(copy('status.nextSession'));
  });

  it('renders each exercise as sets by prescription, with its rest interval', () => {
    render(<PlanView />);

    // The fixture's ids are not in the library, so exerciseName falls back to the id.
    expect(screen.getByText('ex-1')).toBeTruthy();
    expect(screen.getAllByText(FORMAT.setsBy('3–4', '6–10 reps'))).toHaveLength(SPW * 2);
    expect(screen.getAllByText(formatRest(120))).toHaveLength(SPW * 2); // [s]
  });

  it("gives every exercise row P8's deep-link id", () => {
    const { container } = render(<PlanView />);
    const plan = useAppStore.getState().plans['plan-1'];

    for (const session of plan?.sessions.slice(0, SPW) ?? []) {
      for (const ex of session.exercises) {
        const id = planRowDomId(session.id, ex.exerciseId);
        expect(container.querySelector(`#${CSS.escape(id)}`), id).not.toBeNull();
      }
    }
  });

  it('shows the reduced set counts in a deload week and says the load is held', () => {
    render(<PlanView />);
    fireEvent.click(chip(2));

    // 3-4 planned sets at setModifier 0.5 is 2 sets: round(1.5) and round(2.0).
    expect(screen.getAllByText(FORMAT.setsBy('2', '6–10 reps'))).toHaveLength(SPW * 2);
    expect(screen.queryByText(FORMAT.setsBy('3–4', '6–10 reps'))).toBeNull();
    expect(screen.getByText(copy('advice.deloadBlock'))).toBeTruthy();
    // R9: the arithmetic that produced "2" is available, and behind a disclosure.
    expect(screen.getByTestId('deload-basis').textContent).toContain(copy('disclosure.why'));
  });
});

describe('PlanView deep link', () => {
  it("scrubs to the target's week before focusing a row the shown week does not hold", () => {
    // s-4 is the fourth session of six at three a week, so it sits in WEEK 2, while the view
    // opens on the cursor's week, which is week 1. Consumed and dropped, the request would
    // leave the user on week 1 with nothing focused and no statement that anything happened.
    requestPlanFocus({ sessionId: 's-4', exerciseId: 'ex-7' });
    render(<PlanView />);

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(2, WEEKS));
    expect(document.activeElement?.id).toBe(planRowDomId('s-4', 'ex-7'));
  });

  it('focuses a row in the week already shown without moving the scrubber', () => {
    requestPlanFocus({ sessionId: 's-2', exerciseId: 'ex-3' });
    render(<PlanView />);

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));
    expect(document.activeElement?.id).toBe(planRowDomId('s-2', 'ex-3'));
  });

  it('consumes the request, so re-mounting the view does not jump to the row again', () => {
    requestPlanFocus({ sessionId: 's-4', exerciseId: 'ex-7' });
    render(
      <>
        <PlanView />
        <PendingProbe />
      </>,
    );
    expect(screen.getByTestId('pending').textContent).toBe('none');
  });

  it("survives StrictMode's double invocation of the delivery effect", () => {
    // The delivery is idempotent rather than guarded against a second run: React replays the
    // effect body with the SAME captured target on a development mount, so clearing the slot
    // before the delivery (which is what the code did) would not have prevented the repeat
    // either. src/main.tsx renders the app inside StrictMode, so this is the shipped path.
    requestPlanFocus({ sessionId: 's-4', exerciseId: 'ex-7' });
    render(
      <StrictMode>
        <PlanView />
        <PendingProbe />
      </StrictMode>,
    );

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(2, WEEKS));
    expect(document.activeElement?.id).toBe(planRowDomId('s-4', 'ex-7'));
    expect(screen.getByTestId('pending').textContent).toBe('none');
  });

  it('withdraws a request for a row no week of this plan holds', () => {
    // The session exists; the exercise does not. No scrub can reveal it, so the request must
    // not sit pending for a later, unrelated plan to deliver.
    requestPlanFocus({ sessionId: 's-2', exerciseId: 'ex-404' });
    render(
      <>
        <PlanView />
        <PendingProbe />
      </>,
    );

    expect(screen.getByTestId('pending').textContent).toBe('none');
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));
  });
});

describe('PlanView without a plan', () => {
  it('says no plan is configured rather than rendering an empty strip', () => {
    useAppStore.setState({ plans: {}, cursors: {} });
    render(<PlanView />);

    expect(screen.getByText(copy('hero.noPlan'))).toBeTruthy();
    expect(screen.queryAllByTestId('plan-session')).toHaveLength(0);
  });
});

describe('App wiring', () => {
  it('reaches the Plan view from the navigation', () => {
    useAppStore.getState().wipeAll();
    useAppStore.setState(seed());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copy('nav.plan') }));

    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));
    expect(useAppStore.getState().ui.lastView).toBe('plan');
  });
});
