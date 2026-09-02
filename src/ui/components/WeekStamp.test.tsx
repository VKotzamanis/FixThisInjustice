import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekStamp, SPARKLE_COUNT } from './WeekStamp';
import { Intervention } from './Intervention';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { SkinId, WeeklyReview } from '../../domain/types';

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
  withSkin('clinical');
});

describe('WeekStamp', () => {
  it('states the plain phrase and the week counts on the clinical skin', () => {
    render(<WeekStamp review={MET} />);
    expect(screen.getByText(copy('status.prStamp'))).toBeTruthy();
    expect(
      screen.getByText(FORMAT.withSlots('status.weekDeltaZero', { completed: 4, target: 4 })),
    ).toBeTruthy();
  });

  it('shouts the limelight word for the same week', () => {
    withSkin('limelight');
    render(<WeekStamp review={MET} />);
    expect(screen.getByText(copyFor('limelight', 'status.prStamp'))).toBeTruthy();
    expect(
      screen.getByText(
        FORMAT.withSlots(
          'status.weekDeltaZero',
          { completed: 4, target: 4 },
          { 'status.weekDeltaZero': copyFor('limelight', 'status.weekDeltaZero') },
        ),
      ),
    ).toBeTruthy();
  });

  it('uses the board word, and lands the sparkle fan only where the art exists', () => {
    withSkin('board');
    render(<WeekStamp review={MET} />);
    expect(screen.getByText(copyFor('board', 'status.prStamp'))).toBeTruthy();
    expect(document.querySelectorAll('.ll-stamp-sparkle')).toHaveLength(SPARKLE_COUNT);
    expect(document.querySelectorAll('img.ll-icon')).toHaveLength(0);
  });

  it('reads the beaten week from the sign of the stored delta, never from arithmetic', () => {
    render(<WeekStamp review={BEATEN} />);
    expect(
      screen.getByText(FORMAT.withSlots('status.weekDeltaPositive', { completed: 5, target: 4 })),
    ).toBeTruthy();
  });

  it('says nothing about a missed week, an absent week, or a week the plan was paused in', () => {
    const { rerender } = render(<WeekStamp review={MISSED} />);
    expect(screen.queryByText(copy('status.prStamp'))).toBeNull();

    rerender(<WeekStamp review={null} />);
    expect(screen.queryByText(copy('status.prStamp'))).toBeNull();

    // delta = 0 on a paused week is the pause, not a target met (src/domain/schedule/weekly.ts).
    rerender(<WeekStamp review={PAUSED} />);
    expect(screen.queryByText(copy('status.prStamp'))).toBeNull();
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
