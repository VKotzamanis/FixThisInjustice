import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Intervention } from './Intervention';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { SkinId, WeeklyReview } from '../../domain/types';

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../skins/sfx', () => ({ playSfx }));

/**
 * A closed week that missed its target and whose popup has been answered: delta < 0 and
 * missHandled === true, which is what markMotivationShown writes (src/store/motivationActions.ts).
 */
const HANDLED: WeeklyReview = {
  profileId: 'p1',
  weekStart: '2026-08-24',
  weekEnd: '2026-08-30',
  target: 4, // [sessions/week]
  completed: 1, // [sessions]
  skipped: 1, // [sessions]
  paused: false,
  delta: -3, // [sessions/week]
  evaluatedAt: 1_756_684_800_000, // [ms] epoch, UTC
  missHandled: true,
};

/** The same week before the popup has been answered: P6's modal owns the screen, not this. */
const PENDING: WeeklyReview = { ...HANDLED, missHandled: false };
const PAUSED: WeeklyReview = { ...HANDLED, paused: true, delta: 0 };
const MET: WeeklyReview = { ...HANDLED, completed: 4, skipped: 0, delta: 0 };

function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

beforeEach(() => {
  playSfx.mockClear();
  withSkin('clinical');
});

describe('Intervention', () => {
  it('states the title, the body and the week counts on the clinical skin', () => {
    render(<Intervention review={HANDLED} />);
    expect(screen.getByText(copy('hero.weeklyTargetMissed'))).toBeTruthy();
    expect(screen.getByText(copy('advice.interventionBody'))).toBeTruthy();
    expect(
      screen.getByText(FORMAT.withSlots('status.weekDeltaNegative', { completed: 1, target: 4 })),
    ).toBeTruthy();
  });

  it('carries the limelight body, which is camp nowhere and about the week everywhere', () => {
    withSkin('limelight');
    render(<Intervention review={HANDLED} />);
    expect(screen.getByText(copyFor('limelight', 'advice.interventionBody'))).toBeTruthy();
    expect(screen.getByText(copyFor('limelight', 'hero.weeklyTargetMissed'))).toBeTruthy();
    // The honest line never leaves: the counts sit beside the camp title in every skin.
    expect(
      screen.getByText(
        FORMAT.withSlots(
          'status.weekDeltaNegative',
          { completed: 1, target: 4 },
          { 'status.weekDeltaNegative': copyFor('limelight', 'status.weekDeltaNegative') },
        ),
      ),
    ).toBeTruthy();
  });

  it('keeps the board vocabulary for the same missed week', () => {
    withSkin('board');
    render(<Intervention review={HANDLED} />);
    expect(screen.getByText(copyFor('board', 'hero.weeklyTargetMissed'))).toBeTruthy();
  });

  it('stays silent while the popup still owes the user that week', () => {
    render(<Intervention review={PENDING} />);
    expect(screen.queryByTestId('intervention')).toBeNull();
  });

  it('says nothing about a paused week, a met week, or no week at all', () => {
    const { rerender } = render(<Intervention review={PAUSED} />);
    expect(screen.queryByTestId('intervention')).toBeNull();

    rerender(<Intervention review={MET} />);
    expect(screen.queryByTestId('intervention')).toBeNull();

    rerender(<Intervention review={null} />);
    expect(screen.queryByTestId('intervention')).toBeNull();
  });

  it('plays the opening sound once per appearance', () => {
    const { rerender } = render(<Intervention review={PENDING} />);
    expect(playSfx).not.toHaveBeenCalled();

    rerender(<Intervention review={HANDLED} />);
    expect(playSfx.mock.calls).toEqual([['intervention_open']]);

    rerender(<Intervention review={{ ...HANDLED, completed: 2, delta: -2 }} />);
    expect(playSfx.mock.calls).toEqual([['intervention_open']]);

    rerender(<Intervention review={null} />);
    rerender(<Intervention review={HANDLED} />);
    expect(playSfx.mock.calls).toEqual([['intervention_open'], ['intervention_open']]);
  });
});
