// src/ui/views/train/DrinkReminder.test.tsx
//
// The in-session drink reminder (owner, 2026-11-05: "a reminder ... like a button that appears
// below games. it doesn't have to log them"). The domain chooses the cue and its KEY
// (src/domain/training/hydration.ts); this button renders it under the skin's words and icon, and
// a tap only acknowledges it: no fluid record is written.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, copyFor } from '../../../content/copy';
import { SESSION_CHECK_INTERVAL_MS } from '../../../domain/training/hydration';
import type { AppState, SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { FUN_PROFILE_ID, makeAppState, makeUiPrefs } from '../../../test/funFixtures';
import { ICON_FOR_KEY } from '../../../skins/limelight/Icon';
import { DrinkReminder } from './DrinkReminder';
import { resetDrinkAcknowledgements } from './drinkAcknowledgement';

const TODAY = '2026-03-02';
/** [ms] epoch UTC. 12:00 on 2026-03-02 in Europe/Athens, the fixture profile's zone. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
/** [ms] Started long enough ago that the in-session cadence is due. */
const STARTED_AT = NOW - SESSION_CHECK_INTERVAL_MS - 60_000;
/** A document with one in-progress session, which is what arms the in-session cue. */
function seed(skin: SkinId): AppState {
  return makeAppState({
    ui: makeUiPrefs({ skin }),
    assignments: {
      [FUN_PROFILE_ID]: [
        {
          date: TODAY,
          sessionId: 'session-1',
          sourceIndex: 0,
          status: 'in-progress',
          startedAt: STARTED_AT, // [ms] epoch UTC
          completedAt: null,
          skipReason: null,
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDrinkAcknowledgements();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DrinkReminder', () => {
  it('shows the skin cue under its own icon once the cadence is due', () => {
    useAppStore.setState(seed('limelight'));
    const { container } = render(<DrinkReminder now={NOW} />);
    // The icon is decorative (alt="", aria-hidden): the sentence is the whole accessible name.
    expect(ICON_FOR_KEY['advice.drinkToThirst']).toBe('drop');
    const icons = container.querySelectorAll('img.ll-icon');
    expect(icons).toHaveLength(1);
    expect(icons[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: copyFor('limelight', 'advice.drinkToThirst') })).toBeInTheDocument();
    expect(screen.queryByText(copy('advice.drinkToThirst'))).toBeNull();
  });

  it('is not shown before the cadence is due', () => {
    useAppStore.setState(seed('limelight'));
    render(<DrinkReminder now={STARTED_AT + SESSION_CHECK_INTERVAL_MS - 60_000} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a tap hides it until the next cadence mark and writes no fluid record', () => {
    useAppStore.setState(seed('limelight'));
    const { rerender } = render(<DrinkReminder now={NOW} />);
    const before = useAppStore.getState().hydration;
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.queryByRole('button')).toBeNull();
    expect(useAppStore.getState().hydration).toBe(before);
    rerender(<DrinkReminder now={NOW + SESSION_CHECK_INTERVAL_MS - 60_000} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<DrinkReminder now={NOW + SESSION_CHECK_INTERVAL_MS} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('is silent with no session in progress', () => {
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    render(<DrinkReminder now={NOW} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
