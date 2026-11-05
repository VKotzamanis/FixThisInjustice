// src/ui/views/train/HydrationBanner.test.tsx
//
// The banner carries the post-session weigh-in cue only (owner, 2026-11-05): the in-session
// drink reminder is DrinkReminder's (under the rest bar), and there is no daily-shortfall cue or
// log-a-cup control any more.
import { Profiler } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_CHECK_INTERVAL_MS } from '../../../domain/training/hydration';
import type { AppState, Profile, SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { FUN_PROFILE_ID, makeAppState, makeProfile, makeUiPrefs } from '../../../test/funFixtures';
import { HydrationBanner } from './HydrationBanner';

const TODAY = '2026-03-02';
/** [ms] epoch UTC. 12:00 on 2026-03-02 in Europe/Athens, the fixture profile's zone. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
/** [ms] Started long enough ago that the in-session cadence is due. */
const STARTED_AT = NOW - SESSION_CHECK_INTERVAL_MS - 60_000;
const PROFILE: Profile = makeProfile();

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

/** [ms] epoch UTC. 19:00 on 2026-03-02 in Europe/Athens (UTC+2): the old shortfall hour. */
const EVENING = Date.UTC(2026, 2, 2, 17, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HydrationBanner: the weigh-in cue only', () => {
  it('does not show the in-session drink cue, which lives under the rest bar', () => {
    useAppStore.setState(seed('limelight'));
    const { container } = render(<HydrationBanner profile={PROFILE} />);
    expect(container.querySelector('.hydration-banner')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no daily shortfall on an evening with nothing logged', () => {
    vi.setSystemTime(EVENING);
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    const { container } = render(<HydrationBanner profile={PROFILE} />);
    expect(container.querySelector('.hydration-banner')).toBeNull();
  });
});

describe('subscribes to its cue, not to the whole document (audit C17)', () => {
  it('does not re-render on a write that does not change the cue', () => {
    useAppStore.setState(seed('limelight'));
    let commits = 0;
    render(
      <Profiler
        id="banner"
        onRender={() => {
          commits += 1;
        }}
      >
        <HydrationBanner profile={PROFILE} />
      </Profiler>,
    );
    const before = commits;
    act(() => {
      // A UI preference: no profile, assignment, hydration or body-mass change.
      useAppStore.getState().setUi({ hotkeys: !useAppStore.getState().ui.hotkeys });
    });
    expect(commits).toBe(before);
  });
});
