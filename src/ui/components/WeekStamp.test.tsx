import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekStamp, SPARKLE_COUNT } from './WeekStamp';
import { Intervention } from './Intervention';
import { FORMAT, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import { addDays, todayLocal } from '../../domain/dates';
import type { SkinId, WeeklyReview } from '../../domain/types';
import { HER_SHEETS } from './herSheets';

// The sound is decorative and the player reaches the store and the Web Audio API, neither of
// which this suite is about. Mocked at the module boundary so "once per appearance" is counted.
const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../skins/sfx', () => ({ playSfx }));

/** A closed week that met its target: delta = completed - target = 0 [sessions/week]. */
const MET: WeeklyReview = {
  profileId: 'p1',
  weekStart: '2026-08-24',
  weekEnd: '2026-08-30',
  target: 4, // [sessions/week]
  completed: 4, // [sessions]
  skipped: 0, // [sessions]
  paused: false,
  delta: 0, // [sessions/week]
  evaluatedAt: 1_756_684_800_000, // [ms] epoch, UTC
  missHandled: true,
};

const BEATEN: WeeklyReview = { ...MET, completed: 5, delta: 1 };
const MISSED: WeeklyReview = { ...MET, completed: 1, skipped: 1, delta: -3, missHandled: true };
/** A week overlapped by a pause carries delta = 0 by construction (weekly.ts), not a met target. */
const PAUSED: WeeklyReview = { ...MET, completed: 0, paused: true, delta: 0 };

function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

beforeEach(() => {
  playSfx.mockClear();
  withSkin('limelight');
});

describe('WeekStamp', () => {
  it('shouts the limelight word for the same week', () => {
    withSkin('limelight');
    render(<WeekStamp review={MET} />);
    expect(screen.getByText(copyFor('limelight', 'status.weekMetStamp'))).toBeTruthy();
    expect(
      screen.getByText(
        FORMAT.withSlots(
          'status.weekDeltaZero',
          { completed: 4, target: 4 },
          { 'status.weekDeltaZero': copyFor('limelight', 'status.weekDeltaZero') },
        ),
      ),
    ).toBeTruthy();
    // The sparkle fan lands in full. Asserted under the board skin until that skin was removed;
    // the fan is not skin-gated, so the count holds here.
    expect(document.querySelectorAll('.ll-stamp-sparkle')).toHaveLength(SPARKLE_COUNT);
  });

  it('reads the beaten week from the sign of the stored delta, never from arithmetic', () => {
    render(<WeekStamp review={BEATEN} />);
    expect(
      screen.getByText(
        FORMAT.withSlots(
          'status.weekDeltaPositive',
          { completed: 5, target: 4 },
          { 'status.weekDeltaPositive': copyFor('limelight', 'status.weekDeltaPositive') },
        ),
      ),
    ).toBeTruthy();
  });

  it('says nothing about a missed week, an absent week, or a week the plan was paused in', () => {
    const { rerender } = render(<WeekStamp review={MISSED} />);
    expect(screen.queryByText(copyFor('limelight', 'status.weekMetStamp'))).toBeNull();

    rerender(<WeekStamp review={null} />);
    expect(screen.queryByText(copyFor('limelight', 'status.weekMetStamp'))).toBeNull();

    // delta = 0 on a paused week is the pause, not a target met (src/domain/schedule/weekly.ts).
    rerender(<WeekStamp review={PAUSED} />);
    expect(screen.queryByText(copyFor('limelight', 'status.weekMetStamp'))).toBeNull();
  });

  it('plays the stamp sound once per appearance and never while hidden', () => {
    const { rerender } = render(<WeekStamp review={null} />);
    expect(playSfx).not.toHaveBeenCalled();

    rerender(<WeekStamp review={MET} />);
    expect(playSfx.mock.calls).toEqual([['pr_stamp']]);

    // A re-render of the same appearance is not a second appearance.
    rerender(<WeekStamp review={BEATEN} />);
    expect(playSfx.mock.calls).toEqual([['pr_stamp']]);

    rerender(<WeekStamp review={null} />);
    rerender(<WeekStamp review={MET} />);
    expect(playSfx.mock.calls).toEqual([['pr_stamp'], ['pr_stamp']]);
  });
});

describe('WeekStamp while an older week still owes its popup', () => {
  /*
   * The screen a stale backlog produces, and the one this gate exists for: week n - 1 was
   * missed and never answered, week n met its target. `usePendingMotivation` still returns the
   * older week, so P6's modal is on screen; without the gate the celebration stamp for the
   * newest week renders behind it.
   *
   * The dates are derived from the clock rather than written as literals because
   * `pendingMotivation` drops a week that closed more than MOTIVATION_MISS_WINDOW_DAYS = 14 days
   * ago, so a fixed date would stop being pending the day after it was written.
   */
  const TZ = 'Europe/Athens';

  function pendingMiss(): WeeklyReview {
    const end = addDays(todayLocal(TZ), -2); // [d] closed the day before yesterday: inside the window
    return {
      ...MET,
      weekStart: addDays(end, -6),
      weekEnd: end,
      completed: 1, // [sessions]
      delta: -3, // [sessions/week]
      missHandled: false, // the popup has not had its turn
    };
  }

  it('renders nothing while the popup owns an older week', () => {
    const miss = pendingMiss();
    useAppStore.setState(
      makeAppState({ weeklyReviews: { p1: [miss] }, ui: makeUiPrefs({ skin: 'limelight' }) }),
    );
    render(<WeekStamp review={MET} />);
    expect(screen.queryByTestId('week-stamp')).toBeNull();
  });

  it('renders once that older week has been answered', () => {
    const miss = { ...pendingMiss(), missHandled: true };
    useAppStore.setState(
      makeAppState({ weeklyReviews: { p1: [miss] }, ui: makeUiPrefs({ skin: 'limelight' }) }),
    );
    render(<WeekStamp review={MET} />);
    expect(screen.queryByTestId('week-stamp')).not.toBeNull();
  });
});

describe('the stamp and the intervention', () => {
  it('are mutually exclusive, because one week cannot both meet and miss its target', () => {
    const { rerender } = render(
      <>
        <WeekStamp review={MET} />
        <Intervention review={MET} />
      </>,
    );
    expect(screen.queryByTestId('week-stamp')).not.toBeNull();
    expect(screen.queryByTestId('intervention')).toBeNull();

    rerender(
      <>
        <WeekStamp review={MISSED} />
        <Intervention review={MISSED} />
      </>,
    );
    expect(screen.queryByTestId('week-stamp')).toBeNull();
    expect(screen.queryByTestId('intervention')).not.toBeNull();
  });
});

/*
 * Her crown sheet replaced the blob's crown beside the stamp (owner request 2026-10-18). It is
 * decoration: the stamp's own word carries the meaning.
 */
describe('WeekStamp: her crown', () => {
  function crown(): HTMLElement | null {
    return screen.getByTestId('week-stamp').querySelector<HTMLElement>('.ll-sheet');
  }

  it('wears her crown sheet, 4 frames at 64 px, twice through and then still', () => {
    render(<WeekStamp review={MET} />);
    const box = crown();
    expect(box?.getAttribute('data-sheet')).toBe('her-crown');
    expect(box?.getAttribute('data-frames')).toBe('4');
    expect(box?.style.backgroundImage).toContain(HER_SHEETS['her-crown'].src);
    expect(box?.style.width).toBe('64px'); // [CSS px] 64 px frames at 1x
    expect(box?.style.animationIterationCount).toBe('2'); // [cycles]
    expect(box?.getAttribute('aria-hidden')).toBe('true');
    // A span, not an <img>: the only images left in the stamp are the icon bank's crown and
    // sparkles (img.ll-icon).
    expect(screen.getByTestId('week-stamp').querySelectorAll('img:not(.ll-icon)')).toHaveLength(0);
  });

  it('holds frame 0 with no animation under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    try {
      render(<WeekStamp review={MET} />);
      expect(crown()?.getAttribute('data-sprite')).toBe('still');
      expect(crown()?.classList.contains('ll-sheet-play')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
