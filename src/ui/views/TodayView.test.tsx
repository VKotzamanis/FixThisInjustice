import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../app/App';
import { FORMAT, SKIN_COPY, copy, copyFor } from '../../content/copy';
import { formatRest } from '../format/plan';
import { refusalLine } from '../format/refusal';
import { TodayView } from './TodayView';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
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
import type { AppState, SessionAssignment, SkinId, WeeklyReview } from '../../domain/types';

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
  const state = seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: 3, // [sessions/week]
    startedOn: MONDAY,
  });
  /*
   * P8 Task 14. The view now reads its strings through useCopy(), so the ACTIVE SKIN decides
   * what it renders, and the shipped default is limelight (schema.ts, UiPrefsSchema). Every
   * assertion below quotes the clinical default table, which is the contract's own baseline, so
   * the skin is pinned here rather than each assertion being rewritten; the limelight suite at
   * the end of this file flips it and asserts the override table instead.
   */
  return { ...state, ui: { ...state.ui, skin: 'clinical' } };
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
  // ReadinessNotice remembers its dismissal in session storage for the browser session; the
  // fake backing keeps that hermetic without naming the global (ESLint gate, P4 polish item 5).
  installFakeStorage();
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

  /*
   * The controls answer to the OPEN PAUSE, not to the hero's status. An assignment that was
   * already open when the pause began keeps the in-progress hero (master plan section 6.4),
   * and gating on that status offered Pause for a plan that is already paused while hiding
   * the Resume that lifts it.
   */
  it('offers Resume and withholds Pause for an open session under an open pause', () => {
    withAssignment({
      date: MONDAY,
      sessionId: 's-1',
      sourceIndex: 0,
      status: 'in-progress',
      startedAt: NOW_MS, // [ms] epoch, UTC
      completedAt: null,
      skipReason: null,
    });
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: null }] },
    });
    render(<TodayView />);

    expect(screen.getByText(copy('hero.sessionInProgress'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy('button.pausePlan') })).toBeNull();
    fireEvent.click(button('button.resumePlan'));
    expect(useAppStore.getState().pauses[PROFILE_ID]?.[0]?.to).toBe(MONDAY);
  });

  it('bounds the skip reason at 120 characters', () => {
    render(<TodayView />);
    fireEvent.click(button('button.skipToday'));
    // [characters] The UI bound on a short free-text reason; the value is stored verbatim.
    expect(screen.getByLabelText(copy('label.skipReason')).getAttribute('maxlength')).toBe('120');
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
    // P4 review item 4: the banner renders the copy line for the refusal, not the domain's
    // thrown message. The store still holds the domain's own words, which is what the schedule
    // slice documents; this is the mapping from those words to the ones the user reads.
    expect(useAppStore.getState().status.lastActionError).toBe(
      `startSession: a session is already in progress on ${PREV_FRIDAY}`,
    );
    expect(banner.textContent).toContain(
      FORMAT.withSlots('status.refusalSessionOpen', { date: PREV_FRIDAY }),
    );
    expect(banner.textContent).not.toContain('startSession');
    expect(useAppStore.getState().assignments[PROFILE_ID]).toBe(before);
  });

  it('stays on Today when the start is refused', () => {
    openDayLastFriday();
    render(<TodayView />);
    const before = useAppStore.getState().ui.lastView;

    fireEvent.click(button('button.startSession'));

    // The refusal left the document exactly as it was, so there is no open session to switch
    // to: Train would show a day that was never started, and the banner that explains why
    // would be left behind on a view the user is no longer looking at.
    const s = useAppStore.getState();
    expect(s.ui.lastView).toBe(before);
    expect(s.ui.lastView).not.toBe('train');
    expect(s.assignments[PROFILE_ID]?.some((a) => a.date === MONDAY)).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain(
      FORMAT.withSlots('status.refusalSessionOpen', { date: PREV_FRIDAY }),
    );
  });

  /*
   * P4 review item 4. The banner used to render `status.lastActionError` verbatim, so the user
   * read "startSession: the plan is paused on 2026-09-07" - the domain's own words, function
   * name and all. The refusal is driven through the real store action here rather than by
   * writing the message into the status object, so the string this test maps is the one the
   * domain actually mints.
   */
  it('renders a paused refusal as copy, with the date and no function name', () => {
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: null }] },
    });
    useAppStore.getState().startSession(PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    const raw = useAppStore.getState().status.lastActionError;
    expect(raw).toBe(`startSession: the plan is paused on ${MONDAY}`);

    render(<TodayView />);

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain(
      FORMAT.withSlots('status.refusalPaused', { date: MONDAY }),
    );
    expect(banner.textContent).toContain(MONDAY);
    expect(banner.textContent).not.toContain('startSession');
    expect(banner.textContent).not.toContain('startSession:');
    // The mapper is the single definition of that rendering; the view holds no second copy.
    expect(banner.textContent).toContain(refusalLine(raw ?? ''));
  });

  it('renders the refusal in the active skin, not always in the clinical words', () => {
    /*
     * `refusalLine` has taken an overlay since it was written, and TodayView called it without
     * one, so the one sentence on this screen that reports a domain refusal was clinical under
     * every skin while the controls beside it were not.
     *
     * `status.refusalPaused` is the row limelight carries, and it is asserted BY KEY through
     * `copyFor`, so the expectation follows the table rather than a literal beside it.
     */
    setState({
      ...useAppStore.getState(),
      pauses: { [PROFILE_ID]: [{ id: 'p', from: MONDAY, to: null, reason: null }] },
    });
    useAppStore.getState().startSession(PROFILE_ID, MONDAY, NOW_MS); // [ms] epoch, UTC
    withSkin('limelight');
    render(<TodayView />);

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain(
      FORMAT.withSlots('status.refusalPaused', { date: MONDAY }, SKIN_COPY.limelight),
    );
    // Not vacuous: the two skins render different words for the same refusal.
    expect(copyFor('limelight', 'status.refusalPaused')).not.toBe(copy('status.refusalPaused'));
    expect(banner.textContent).not.toContain(
      FORMAT.withSlots('status.refusalPaused', { date: MONDAY }),
    );
    // The date is still the domain's, whatever the skin does to the words around it.
    expect(banner.textContent).toContain(MONDAY);
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

  it('takes the list name from the heading, and names each glyph exactly once', () => {
    render(<TodayView />);
    const list = screen.getByRole('list', { name: copy('hero.nextFourteenDays') });

    // One string in the DOM: the list points at the heading rather than repeating it.
    const labelledBy = list.getAttribute('aria-labelledby');
    expect(labelledBy).not.toBeNull();
    expect(list.getAttribute('aria-label')).toBeNull();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe(
      copy('hero.nextFourteenDays'),
    );

    // aria-label is what the accessible-name computation reads; a <title> child would be a
    // second copy of the same name that nothing can reach.
    const row = screen.getAllByTestId('strip-day')[0] as HTMLElement;
    const glyph = within(row).getByLabelText(copy('status.dayPlanned'));
    expect(glyph.querySelector('title')).toBeNull();
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
    /*
     * Scoped to the view. P3 Task 6 mounted Task 7's SessionIndicator in the top bar, so the
     * same cursor position is now on screen twice by design: once in the header, once in this
     * hero. That they agree is the point (both read PlanCursor.nextSessionIndex); a document
     * query would just be ambiguous.
     */
    expect(
      within(screen.getByRole('main')).getByText(FORMAT.planPosition(1, TOTAL, '')),
    ).toBeTruthy();
    expect(useAppStore.getState().ui.lastView).toBe('today');
  });
});

/*
 * P8 Task 14: the ticker, the week block and the capsule.
 *
 * Every string below is quoted from the copy tables by KEY, never as a literal, which is the
 * rule the head of this file states: a reworded row fails here rather than shipping a view whose
 * copy and whose test have drifted apart.
 */

/** The week that closed before MONDAY 2026-09-07, met exactly: delta = 4 - 4 = 0. */
const MET_WEEK: WeeklyReview = {
  profileId: PROFILE_ID,
  weekStart: PREV_MONDAY,
  weekEnd: '2026-09-06',
  target: 4, // [sessions/week]
  completed: 4, // [sessions]
  skipped: 0, // [sessions]
  paused: false,
  delta: 0, // [sessions/week]
  evaluatedAt: NOW_MS, // [ms] epoch, UTC
  missHandled: true,
};

/** The same week missed, with the popup already answered (missHandled). */
const MISSED_WEEK: WeeklyReview = { ...MET_WEEK, completed: 1, skipped: 1, delta: -3 };

function withReview(review: WeeklyReview | null): void {
  setState({
    ...useAppStore.getState(),
    weeklyReviews: review === null ? {} : { [PROFILE_ID]: [review] },
  });
}

function withSkin(skin: SkinId): void {
  const state = useAppStore.getState();
  setState({ ...state, ui: { ...state.ui, skin } });
}

describe('TodayView: the ticker', () => {
  it('carries no ticker on the clinical skin', () => {
    render(<TodayView />);
    expect(screen.queryByRole('button', { name: copy('button.pauseTicker') })).toBeNull();
  });

  it('leads with the cursor position on limelight, in the limelight words', () => {
    withSkin('limelight');
    render(<TodayView />);

    // By key against copy.limelight.ts: the strip's name follows the skin like every other
    // control, and the default string is no longer what limelight renders.
    const strip = screen.getByRole('button', {
      name: copyFor('limelight', 'button.pauseTicker'),
    });
    expect(strip.getAttribute('aria-pressed')).toBe('false');

    const lines = [...document.querySelectorAll('.ll-marquee-static .ll-marquee-line')];
    expect(lines.map((node) => node.textContent)).toEqual([
      FORMAT.planPositionLabel(1, TOTAL, '', SKIN_COPY.limelight),
    ]);
  });

  it('names the strip in the board vocabulary and adds the closed week to it', () => {
    withSkin('board');
    withReview(MET_WEEK);
    render(<TodayView />);

    expect(screen.getByRole('button', { name: copyFor('board', 'button.pauseTicker') })).toBeTruthy();
    const lines = [...document.querySelectorAll('.ll-marquee-static .ll-marquee-line')];
    expect(lines.map((node) => node.textContent)).toEqual([
      FORMAT.planPositionLabel(1, TOTAL, '', SKIN_COPY.board),
      FORMAT.withSlots('status.weekDeltaZero', { completed: 4, target: 4 }, SKIN_COPY.board),
    ]);
  });

  it('drops the week line while the popup still owns an unacknowledged miss', () => {
    // `missHandled === false` is exactly "P6's modal has not had its turn on this week"
    // (src/domain/schedule/weekly.ts sets it from the sign of the delta; the store's
    // markMotivationShown sets it true). The verdict on that week therefore belongs to the
    // popup, and a ticker scrolling the same verdict behind it is the duplication A59 recorded.
    withSkin('board');
    withReview({ ...MISSED_WEEK, missHandled: false });
    render(<TodayView />);

    const lines = [...document.querySelectorAll('.ll-marquee-static .ll-marquee-line')];
    expect(lines.map((node) => node.textContent)).toEqual([
      FORMAT.planPositionLabel(1, TOTAL, '', SKIN_COPY.board),
    ]);
  });

  it('carries the week line once that miss has been answered', () => {
    withSkin('board');
    withReview({ ...MISSED_WEEK, missHandled: true });
    render(<TodayView />);

    const lines = [...document.querySelectorAll('.ll-marquee-static .ll-marquee-line')];
    expect(lines.map((node) => node.textContent)).toEqual([
      FORMAT.planPositionLabel(1, TOTAL, '', SKIN_COPY.board),
      FORMAT.withSlots('status.weekDeltaNegative', { completed: 1, target: 4 }, SKIN_COPY.board),
    ]);
  });

  it('names the strip in the limelight voice, in lower case', () => {
    // Round three section 3.2 closes the uppercase list; the ticker's control is not on it, and
    // the board's PAUSE TICKER is the board's register, not this one.
    withSkin('limelight');
    render(<TodayView />);
    const name = copyFor('limelight', 'button.pauseTicker');
    expect(name).toBe(name.toLowerCase());
    expect(screen.getByRole('button', { name })).toBeTruthy();
  });
});

describe('TodayView: the week that has just closed', () => {
  it('stamps a met week and never the intervention beside it', () => {
    withReview(MET_WEEK);
    render(<TodayView />);

    expect(screen.getByTestId('week-stamp')).toBeTruthy();
    expect(screen.queryByTestId('intervention')).toBeNull();
    expect(screen.getByText(copy('status.weekMetStamp'))).toBeTruthy();
  });

  it('shows the intervention for a missed week the popup has already answered', () => {
    withReview(MISSED_WEEK);
    render(<TodayView />);

    expect(screen.getByTestId('intervention')).toBeTruthy();
    expect(screen.queryByTestId('week-stamp')).toBeNull();
    expect(screen.getByText(copy('advice.interventionBody'))).toBeTruthy();
  });

  it('shows neither while the missed week is still owed its popup', () => {
    withReview({ ...MISSED_WEEK, missHandled: false });
    render(<TodayView />);

    expect(screen.queryByTestId('intervention')).toBeNull();
    expect(screen.queryByTestId('week-stamp')).toBeNull();
  });

  it('shows neither before any week has closed', () => {
    withReview(null);
    render(<TodayView />);

    expect(screen.queryByTestId('intervention')).toBeNull();
    expect(screen.queryByTestId('week-stamp')).toBeNull();
  });
});

describe('TodayView: the time capsule', () => {
  it('renders the capsule card, sealed to the profile zone by this render\'s clock', () => {
    render(<TodayView />);
    expect(screen.getByRole('heading', { name: copy('hero.timeCapsule') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy('button.writeCapsule') })).toBeTruthy();
  });
});

describe('TodayView: the limelight voice', () => {
  it('renders the override table on the controls the skin names', () => {
    withSkin('limelight');
    render(<TodayView />);

    // Asserted by key against copy.limelight.ts, never as a literal.
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.markCompleted') }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.skipToday') }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.pausePlan') }),
    ).toBeTruthy();
  });

  /**
   * P9 Task 17. Round three section 4.4 draws `skip` at `skip_today`, `heel` at `train_other`
   * and `martini` at `pause_plan`. All three were bare `c(key)` calls, so ICON_FOR_KEY carried
   * an entry no call site could reach; they render through SkinLabel now. The words are
   * asserted above, so what these two pin is the GLYPH and its absence.
   */
  it('puts the three round-three icons on the controls that carry them, on limelight', () => {
    withSkin('limelight');
    render(<TodayView />);

    for (const key of ['button.skipToday', 'button.trainSomethingElse', 'button.pausePlan'] as const) {
      const control = screen.getByRole('button', { name: copyFor('limelight', key) });
      expect(control.querySelectorAll('img.ll-icon')).toHaveLength(1);
    }
  });

  it('carries no image on those controls under the clinical skin', () => {
    // R6: the default table is glyph-free, and Icon returns null off limelight, so the same
    // three call sites render the string alone.
    render(<TodayView />);

    for (const key of ['button.skipToday', 'button.trainSomethingElse', 'button.pausePlan'] as const) {
      const control = screen.getByRole('button', { name: copy(key) });
      expect(control.querySelectorAll('img')).toHaveLength(0);
    }
  });

  it("keeps the session preview's set counts in the clinical string, under the overlay", () => {
    /*
     * P8 close-out D wired `useCopyOverrides()` into this view's `FORMAT.setsBy` call. The
     * limelight table carries no `status.setsBy` row on purpose (copy.test.ts records why: the
     * mockup's own card renders "3 x 6-8", which IS the default), so the preview reads the same
     * under both skins. That is asserted rather than assumed, so adding a row later fails here
     * instead of silently changing a plan row.
     */
    withSkin('limelight');
    render(<TodayView />);

    expect(
      screen.getAllByText(FORMAT.setsBy('3\u20134', '6\u201310 reps', SKIN_COPY.limelight)),
    ).toHaveLength(2);
    expect(screen.getAllByText(FORMAT.setsBy('3\u20134', '6\u201310 reps'))).toHaveLength(2);
  });

  it('states a met week in the limelight words, beside the shouted stamp', () => {
    withSkin('limelight');
    withReview(MET_WEEK);
    render(<TodayView />);

    expect(screen.getByText(copyFor('limelight', 'status.weekMetStamp'))).toBeTruthy();
    // Twice: once in the ticker's static line, once under the stamp. Same string, one source.
    expect(
      screen.getAllByText(
        FORMAT.withSlots('status.weekDeltaZero', { completed: 4, target: 4 }, SKIN_COPY.limelight),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
