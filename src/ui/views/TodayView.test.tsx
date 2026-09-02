import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../app/App';
import { FORMAT, copy } from '../../content/copy';
import { formatRest } from '../format/plan';
import { TodayView } from './TodayView';
import { useAppStore } from '../../store';
import {
  DAY_MS,
  MONDAY,
  NOW_MS,
  PREV_FRIDAY,
  PREV_MONDAY,
  PROFILE_ID,
  TUESDAY,
  TZ_ATHENS,
  WEDNESDAY,
  makeProfile,
  seedState,
} from '../../test/scheduleFixtures';
import type { AppState, SessionAssignment } from '../../domain/types';

/*
 * Deviations from the P3 plan's literal draft, recorded here and in the task report:
 *
 *  1. No vi.mock of the exercise library. The shipped library exports EXERCISES as a readonly
 *     ARRAY and EXERCISE_BY_ID as the keyed view, so the draft's Record mock does not describe
 *     the module. The fixture's exercise ids ("ex-1", "ex-2") are not in the library, so the
 *     rows exercise exerciseName's documented fallback instead, which is the behaviour a plan
 *     generated against an older library actually gets.
 *  2. Every assertion quotes src/content/copy.ts rather than a literal (copy contract: "test
 *     assertions quote the default table"), so a reworded string fails here rather than
 *     shipping a view whose copy and whose test have drifted apart.
 *  3. The hero eyebrow is the CURSOR position in Task 7's "S n/N" form (FORMAT.planPosition),
 *     not a re-spelling of it, so the Today hero and the top-bar indicator cannot disagree
 *     about where the plan stands.
 */

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
/** Monday, Wednesday, Friday: ISO weekdays, Monday-first. */
const MWF = [1, 3, 5] as const;
const TOTAL = LABELS.length; // [sessions]

function seed(): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: 3, // [sessions/week]
    startedOn: MONDAY,
  });
}

/** Replaces the document. zustand merges shallowly, so the actions and status survive. */
function setState(state: AppState): void {
  useAppStore.setState(state);
}

/** Overwrites today's row of the assignment table for the active profile. */
function withAssignment(a: SessionAssignment): void {
  setState({ ...useAppStore.getState(), assignments: { [PROFILE_ID]: [a] } });
}

function button(key: Parameters<typeof copy>[0]): HTMLElement {
  return screen.getByRole('button', { name: copy(key) });
}

beforeEach(() => {
  // Monday 2026-09-07, 09:30 in Europe/Athens (the profile's zone), which is the same civil
  // day in every zone `npm run test:tz` runs in for this instant.
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  setState(seed());
  // status.lastActionError is not part of AppState, so setState does not reset it and a
  // refusal raised by one test would otherwise render a banner in the next.
  useAppStore.getState().clearActionError();
  // ReadinessNotice remembers its dismissal in sessionStorage for the browser session.
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TodayView hero: a session is scheduled today', () => {
  it('states the session, the cursor position, the label and the slot time', () => {
    render(<TodayView />);
    expect(screen.getByText('Push 1')).toBeTruthy();
    expect(screen.getByText(FORMAT.planPosition(1, TOTAL, ''))).toBeTruthy();
    expect(screen.getByText(FORMAT.sessionSummary('Push', '07:00', 2))).toBeTruthy();
  });

  it("previews the session's exercises with sets, prescription and rest", () => {
    render(<TodayView />);
    // The fixture's ids are not in the library, so exerciseName falls back to the id.
    expect(screen.getByText('ex-1')).toBeTruthy();
    expect(screen.getByText('ex-2')).toBeTruthy();
    expect(screen.getAllByText(FORMAT.setsBy('3–4', '6–10 reps'))).toHaveLength(2);
    expect(screen.getAllByText(formatRest(120))).toHaveLength(2); // [s]
  });
});

describe('TodayView hero: the other states', () => {
  it('rests when today has no slot, and names the next slot day', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS + DAY_MS); // Tuesday: not a training day
    render(<TodayView />);
    expect(screen.getByText(copy('hero.noSessionToday'))).toBeTruthy();
    expect(screen.getByText(FORMAT.nextSession('Wed', '07:00', 'Push'))).toBeTruthy();
  });

  it('reports a session in progress and offers the way back into it', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'in-progress',
      startedAt: NOW_MS, // [ms] epoch, UTC
      completedAt: null,
      skipReason: null,
    });
    render(<TodayView />);
    expect(screen.getByText(copy('hero.sessionInProgress'))).toBeTruthy();
    expect(button('button.returnToSession')).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.startSession') })).toBeNull();
  });

  it('reports a completed session and withdraws Start', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'completed',
      startedAt: NOW_MS,
      completedAt: NOW_MS,
      skipReason: null,
    });
    render(<TodayView />);
    expect(screen.getByText(copy('hero.sessionCompleted'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.startSession') })).toBeNull();
  });

  it('reports a skipped session with the reason the user gave', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'skipped',
      startedAt: null,
      completedAt: null,
      skipReason: 'illness',
    });
    render(<TodayView />);
    expect(screen.getByText(copy('hero.sessionSkipped'))).toBeTruthy();
    expect(screen.getByText(FORMAT.skipReason('illness'))).toBeTruthy();
  });

  it('reports an open pause and states that it consumes no session', () => {
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: 'travel' }] },
    });
    render(<TodayView />);
    expect(screen.getByText(FORMAT.pausedSince(MONDAY))).toBeTruthy();
    expect(screen.getByText(copy('advice.pauseHoldsCursor'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.startSession') })).toBeNull();
  });

  /*
   * The two orderings the hero's precedence actually turns on. Neither state is exotic: the
   * first is "I started, then the plan went on hold", the second is "I trained, then paused".
   */
  it('keeps an open session visible when the pause began under it', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'in-progress',
      startedAt: NOW_MS,
      completedAt: null,
      skipReason: null,
    });
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: null }] },
    });
    render(<TodayView />);

    // Master plan section 6.4: an assignment already in progress when the pause began may
    // still be completed or skipped, so the pause hero must not bury it.
    expect(screen.getByText(copy('hero.sessionInProgress'))).toBeTruthy();
    fireEvent.click(button('button.markCompleted'));
    expect(useAppStore.getState().assignments[PROFILE_ID]?.[0]?.status).toBe('completed');
    expect(useAppStore.getState().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
  });

  it('reports the pause over a day already closed', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'completed',
      startedAt: NOW_MS,
      completedAt: NOW_MS,
      skipReason: null,
    });
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: null }] },
    });
    render(<TodayView />);

    // The pause is the standing fact about the plan and the thing the user must lift first.
    expect(screen.getByText(FORMAT.pausedSince(MONDAY))).toBeTruthy();
    expect(screen.queryByText(copy('hero.sessionCompleted'))).toBeNull();
    expect(button('button.resumePlan')).toBeTruthy();
  });

  it('reports a finished programme without overrunning the total', () => {
    setState({
      ...useAppStore.getState(),
      cursors: {
        [PROFILE_ID]: {
          planId: 'plan-1',
          nextSessionIndex: TOTAL, // [sessions] clamped at plan length
          startedOn: MONDAY,
          completedOn: MONDAY,
        },
      },
    });
    render(<TodayView />);
    expect(screen.getByText(copy('hero.programmeComplete'))).toBeTruthy();
    expect(screen.getByText(FORMAT.programmeClosed(TOTAL, MONDAY))).toBeTruthy();
    expect(
      screen.getByText(FORMAT.planPosition(TOTAL, TOTAL, copy('status.planComplete'))),
    ).toBeTruthy();
  });

  it('asks for setup when there is no plan', () => {
    setState({ ...useAppStore.getState(), plans: {}, cursors: {} });
    render(<TodayView />);
    expect(screen.getByText(copy('hero.noPlan'))).toBeTruthy();
    expect(screen.getByText(copy('advice.completeSetup'))).toBeTruthy();
  });
});

describe('TodayView controls', () => {
  it('Start session opens the day and switches to the Train view', () => {
    render(<TodayView />);
    fireEvent.click(button('button.startSession'));
    const s = useAppStore.getState();
    expect(s.assignments[PROFILE_ID]?.[0]?.status).toBe('in-progress');
    expect(s.assignments[PROFILE_ID]?.[0]?.startedAt).toBe(NOW_MS); // [ms] epoch, UTC
    expect(s.ui.lastView).toBe('train');
  });

  it('Return to session switches to the Train view without reopening the day', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'in-progress',
      startedAt: NOW_MS,
      completedAt: null,
      skipReason: null,
    });
    render(<TodayView />);
    fireEvent.click(button('button.returnToSession'));
    const s = useAppStore.getState();
    expect(s.ui.lastView).toBe('train');
    expect(s.assignments[PROFILE_ID]?.[0]?.startedAt).toBe(NOW_MS); // unchanged
  });

  it('Mark completed advances the cursor by one', () => {
    render(<TodayView />);
    fireEvent.click(button('button.markCompleted'));
    expect(useAppStore.getState().cursors[PROFILE_ID]?.nextSessionIndex).toBe(1);
  });

  it('Skip today records the optional reason verbatim', () => {
    render(<TodayView />);
    fireEvent.click(button('button.skipToday'));
    fireEvent.change(screen.getByLabelText(copy('label.skipReason')), {
      target: { value: 'illness' },
    });
    fireEvent.click(button('button.confirmSkip'));
    const a = useAppStore.getState().assignments[PROFILE_ID]?.[0];
    expect(a?.status).toBe('skipped');
    expect(a?.skipReason).toBe('illness');
  });

  it('Skip today with an empty reason stores null, not an empty string', () => {
    render(<TodayView />);
    fireEvent.click(button('button.skipToday'));
    fireEvent.click(button('button.confirmSkip'));
    expect(useAppStore.getState().assignments[PROFILE_ID]?.[0]?.skipReason).toBeNull();
  });

  it('Cancel closes the skip form and records nothing', () => {
    render(<TodayView />);
    fireEvent.click(button('button.skipToday'));
    fireEvent.click(button('button.cancel'));
    expect(screen.queryByLabelText(copy('label.skipReason'))).toBeNull();
    expect(useAppStore.getState().assignments[PROFILE_ID]).toEqual([]);
  });

  it('Pause plan opens a pause from today and holds the cursor', () => {
    render(<TodayView />);
    fireEvent.click(button('button.pausePlan'));
    const s = useAppStore.getState();
    expect(s.pauses[PROFILE_ID]?.[0]?.from).toBe(MONDAY);
    expect(s.pauses[PROFILE_ID]?.[0]?.to).toBeNull();
    expect(s.cursors[PROFILE_ID]?.nextSessionIndex).toBe(0); // a pause consumes no session
  });

  it('Resume plan closes the open pause at today', () => {
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: null }] },
    });
    render(<TodayView />);
    fireEvent.click(button('button.resumePlan'));
    expect(useAppStore.getState().pauses[PROFILE_ID]?.[0]?.to).toBe(MONDAY);
  });
});

describe('TodayView: train something else today', () => {
  it('offers exactly the labels remaining this week', () => {
    render(<TodayView />);
    fireEvent.click(button('button.trainSomethingElse'));
    const picker = screen.getByTestId('label-picker');
    // Window [0, 2] of the current ISO week: Push, Legs, Pull, each offered once.
    for (const label of ['Push', 'Legs', 'Pull']) {
      expect(within(picker).getByRole('button', { name: FORMAT.trainLabelToday(label) })).toBeTruthy();
    }
    expect(within(picker).getAllByRole('button')).toHaveLength(3);
  });

  it('choosing Legs assigns it to today and re-projects the week', () => {
    render(<TodayView />);
    fireEvent.click(button('button.trainSomethingElse'));
    fireEvent.click(screen.getByRole('button', { name: FORMAT.trainLabelToday('Legs') }));

    const s = useAppStore.getState();
    expect(s.assignments[PROFILE_ID]?.[0]?.sessionId).toBe('s-2');
    expect(s.assignments[PROFILE_ID]?.[0]?.sourceIndex).toBe(0);
    // The multiset of labels in the week is preserved; only the order changed.
    expect(s.plans['plan-1']?.sessions.map((x) => x.label)).toEqual([
      'Legs',
      'Push',
      'Pull',
      'Push',
      'Legs',
      'Pull',
    ]);
    expect(screen.getByText('Legs 2')).toBeTruthy();
  });

  it('withdraws the control once no label is on offer', () => {
    // Master plan section 6.4: the pick is offered BEFORE Start, never after, because a
    // reshuffle would swap the exercises out from under a session being logged.
    render(<TodayView />);
    fireEvent.click(button('button.startSession'));
    expect(screen.queryByRole('button', { name: copy('button.trainSomethingElse') })).toBeNull();
    expect(screen.queryByTestId('label-picker')).toBeNull();
  });
});

describe('TodayView: the readiness notice', () => {
  function flag(flagged: boolean): void {
    const profile = makeProfile(TZ_ATHENS);
    setState({
      ...useAppStore.getState(),
      profiles: {
        [PROFILE_ID]: { ...profile, readiness: { screenedAt: PREV_MONDAY, flagged } },
      },
    });
  }

  it('shows the physician-consult notice at a flagged session start', () => {
    flag(true);
    render(<TodayView />);
    // Master plan section 10.4: shown at EVERY session start, above the hero.
    expect(screen.getByText(copy('advice.readinessConsult'))).toBeTruthy();
  });

  it('shows nothing for a profile whose screen raised no flag', () => {
    flag(false);
    render(<TodayView />);
    expect(screen.queryByText(copy('advice.readinessConsult'))).toBeNull();
  });
});

describe('TodayView: a refused action', () => {
  /** An open day the user never closed, three days back: the second-open-day gate. */
  function openDayLastFriday(): void {
    setState({
      ...useAppStore.getState(),
      assignments: {
        [PROFILE_ID]: [
          {
            date: PREV_FRIDAY,
            sessionId: 's-1',
            sourceIndex: 0,
            status: 'in-progress',
            startedAt: NOW_MS - 3 * DAY_MS, // [ms] epoch, UTC
            completedAt: null,
            skipReason: null,
          },
        ],
      },
    });
  }

  it("reports the domain's own refusal and changes nothing", () => {
    openDayLastFriday();
    render(<TodayView />);
    const before = useAppStore.getState().assignments[PROFILE_ID];

    fireEvent.click(button('button.startSession'));

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain(copy('banner.actionRefused.tag'));
    expect(banner.textContent).toContain(`a session is already in progress on ${PREV_FRIDAY}`);
    expect(useAppStore.getState().assignments[PROFILE_ID]).toBe(before);
  });

  it('dismisses the banner without making another attempt', () => {
    openDayLastFriday();
    render(<TodayView />);
    fireEvent.click(button('button.startSession'));

    fireEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: copy('button.dismiss') }),
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(useAppStore.getState().status.lastActionError).toBeNull();
  });
});

describe('TodayView: the 14-day strip', () => {
  it('renders fourteen days with weekday, slot time and projected label', () => {
    render(<TodayView />);
    const rows = screen.getAllByTestId('strip-day');
    expect(rows).toHaveLength(14); // [d]

    expect(rows[0]?.textContent).toContain('Mon');
    expect(rows[0]?.textContent).toContain('07:00');
    expect(rows[0]?.textContent).toContain('Push');
    expect(rows[1]?.textContent).toContain('Tue');
    expect(rows[1]?.textContent).toContain(copy('status.dayRest'));
  });

  it('marks a completed day and a paused day, and names each glyph', () => {
    setState({
      ...useAppStore.getState(),
      assignments: {
        [PROFILE_ID]: [
          {
            date: MONDAY,
            sessionId: 's-1',
            sourceIndex: 0,
            status: 'completed',
            startedAt: NOW_MS,
            completedAt: NOW_MS,
            skipReason: null,
          },
        ],
      },
      // Half-open [from, to): Tuesday is paused, Wednesday is active again.
      pauses: { [PROFILE_ID]: [{ id: 'p', from: TUESDAY, to: WEDNESDAY, reason: null }] },
    });
    render(<TodayView />);
    const rows = screen.getAllByTestId('strip-day');

    expect(rows[0]?.getAttribute('data-status')).toBe('completed');
    expect(rows[1]?.getAttribute('data-status')).toBe('paused');
    expect(rows[2]?.getAttribute('data-status')).toBe('planned');

    // The glyphs are drawn, not written, so their only accessible name is this label.
    expect(within(rows[0] as HTMLElement).getByLabelText(copy('status.dayCompleted'))).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByLabelText(copy('status.dayPaused'))).toBeTruthy();
  });
});

describe('TodayView: one whole training day', () => {
  it('start, then complete, moves the cursor and re-projects the strip', () => {
    render(<TodayView />);

    fireEvent.click(button('button.startSession'));
    expect(screen.getByText(copy('hero.sessionInProgress'))).toBeTruthy();
    expect(screen.getAllByTestId('strip-day')[0]?.getAttribute('data-status')).toBe('in-progress');

    fireEvent.click(button('button.markCompleted'));
    expect(screen.getByText(copy('hero.sessionCompleted'))).toBeTruthy();
    expect(screen.getByText(FORMAT.planPosition(2, TOTAL, ''))).toBeTruthy();

    const rows = screen.getAllByTestId('strip-day');
    expect(rows[0]?.getAttribute('data-status')).toBe('completed');
    // Wednesday now serves session 2, which the plan labels Legs.
    expect(rows[2]?.textContent).toContain('Legs');
    expect(rows[2]?.getAttribute('data-status')).toBe('planned');
  });
});

describe('App wiring', () => {
  it('reaches the Today view from the navigation', () => {
    useAppStore.getState().wipeAll();
    setState(seed());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copy('nav.today') }));
    expect(screen.getByText('Push 1')).toBeTruthy();
    expect(screen.getByText(FORMAT.planPosition(1, TOTAL, ''))).toBeTruthy();
    expect(useAppStore.getState().ui.lastView).toBe('today');
  });
});
