import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { MotivationGate } from './MotivationGate';
import { probeBundledVideo, resolveVideoSrc } from '../../domain/motivation/assets';
import { copy } from '../../content/copy';
import { addDays, todayLocal } from '../../domain/dates';
import { useAppStore } from '../../store';
import type { AppStore } from '../../store';
import { LEGACY_V2_KEY } from '../../store/persistence';
import { EMPTY_SESSION } from '../../store/sessionMirror';
import { installFakeStorage } from '../../store/testStorage';
import { PROFILE_ID, TZ_ATHENS, seedState } from '../../test/scheduleFixtures';
import type { EpochMs, LocalDate, WeeklyReview } from '../../domain/types';

/*
 * The clip is the modal's business, not the gate's, so both asset lookups are mocked exactly as
 * MotivationModal.test.tsx mocks them: this suite asserts WHEN the popup is mounted, never what
 * it plays. importOriginal keeps BUNDLED_VIDEO_SRC real, because the modal compares against it.
 */
vi.mock('../../domain/motivation/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/motivation/assets')>();
  return { ...actual, resolveVideoSrc: vi.fn(), probeBundledVideo: vi.fn() };
});

/**
 * The profile's civil today, read from the real clock in the fixture's zone.
 *
 * The window `pendingMotivation` applies is measured against `Date.now()` through
 * `useMinuteClock`, which no fake timer here replaces (userEvent drives its own clock and the
 * two do not compose cleanly). The fixtures are therefore anchored to the real day and offset
 * by 1 and 20 days, so a run that straddles midnight moves both anchors by the same day and
 * neither crosses the 14 day threshold.
 */
const TODAY: LocalDate = todayLocal(TZ_ATHENS);

const LEGACY_RAW = '{"schemaVersion":2}';

/** A closed week three sessions short of its target, ending on the given civil day. */
function miss(end: LocalDate): WeeklyReview {
  return {
    profileId: PROFILE_ID,
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

/** Closed at midnight opening today: one day old, inside MOTIVATION_MISS_WINDOW_DAYS = 14. */
const RECENT = miss(addDays(TODAY, -1));
/** Closed 19 days ago: outside the window, so the gate must never offer it. */
const STALE = miss(addDays(TODAY, -20));

/** Counts the dismissals the popup records. Wraps the real action rather than replacing it. */
let mark: Mock<AppStore['markMotivationShown']>;

function seed(reviews: WeeklyReview[], legacy: string | null = null): void {
  installFakeStorage(legacy === null ? {} : { [LEGACY_V2_KEY]: legacy });
  useAppStore.setState({
    ...seedState({ labels: ['Push'], weekdays: [1] }),
    weeklyReviews: { [PROFILE_ID]: reviews },
    motivation: {},
    // The session slice is store-only and survives between tests in a file, so it is pinned.
    session: { ...EMPTY_SESSION },
  });
  /*
   * Wrapped, not stubbed: the real write is what makes pendingMotivation go null, which is the
   * only thing that closes the popup. The spy exists to prove it happens exactly once.
   *
   * The snapshot is captured BEFORE the replacement and called through, never extracted as a
   * bare method reference: setState merges into a new state object, so `before` keeps the
   * original action, and a wrapper that re-read getState() would call the spy and recurse.
   */
  const before = useAppStore.getState();
  mark = vi.fn((profileId: string, weekStart: LocalDate, now: EpochMs): void => {
    before.markMotivationShown(profileId, weekStart, now); // now: [ms] epoch, UTC
  });
  useAppStore.setState({ markMotivationShown: mark });
}

function dialog(): HTMLElement | null {
  return screen.queryByRole('dialog');
}

beforeEach(() => {
  seed([RECENT]);
  vi.mocked(resolveVideoSrc).mockResolvedValue({
    src: 'blob:motivation-clip',
    revoke: () => {
      /* nothing is held: the source is a literal, not a real object URL */
    },
  });
  vi.mocked(probeBundledVideo).mockResolvedValue(true);
  // jsdom has no media pipeline, and the modal autoplays.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

describe('MotivationGate', () => {
  it('mounts the popup for a miss inside the window', async () => {
    render(<MotivationGate />);
    expect(await screen.findByTestId('motivation-video')).toBeDefined();
    expect(screen.getByRole('heading', { name: copy('hero.weeklyTargetMissed') })).toBeDefined();
    expect(dialog()).not.toBeNull();
  });

  it('renders nothing when no week is pending', () => {
    seed([{ ...RECENT, completed: 4, delta: 0 }]);
    const { container } = render(<MotivationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a miss older than the window', () => {
    seed([STALE]);
    const { container } = render(<MotivationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while a session is in progress', () => {
    seed([RECENT]);
    useAppStore.setState({ session: { ...EMPTY_SESSION, activeAssignmentDate: TODAY } });
    const { container } = render(<MotivationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the legacy migration is still pending', () => {
    seed([RECENT], LEGACY_RAW);
    const { container } = render(<MotivationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays closed for the rest of the mount once the migration has been offered', () => {
    seed([RECENT], LEGACY_RAW);
    const { container } = render(<MotivationGate />);
    // applyMigration writes 'done' while the wizard is still on screen making its delete offer,
    // so an un-latched gate would paint over it.
    useAppStore.getState().setUi({ legacyMigration: 'done' });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before setup has produced a profile', () => {
    seed([RECENT]);
    useAppStore.setState({ activeProfileId: null });
    const { container } = render(<MotivationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('closes on Dismiss, records the week once, and does not come back', async () => {
    const user = userEvent.setup();
    render(<MotivationGate />);
    expect(await screen.findByTestId('motivation-video')).toBeDefined();
    await user.click(screen.getByRole('button', { name: copy('button.dismiss') }));
    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
    // Once: the modal owns the write, and a gate that wrote as well would re-run the backlog
    // sweep in markMotivationShown.
    expect(mark).toHaveBeenCalledTimes(1);
    const state = useAppStore.getState();
    expect(state.weeklyReviews[PROFILE_ID]?.[0]?.missHandled).toBe(true);
    expect(state.motivation[PROFILE_ID]?.lastShownForWeek).toBe(RECENT.weekStart);
  });
});
