// src/ui/views/train/HydrationBanner.test.tsx
//
// The hydration cue's copy contract (P8 close-out C).
//
// The domain chooses a KEY (src/domain/training/hydration.ts, HYDRATION_COPY_KEY) and this
// component renders it, so the skin reaches the cue without the cue logic knowing that copy
// exists. The assertions quote the tables by key: the limelight case is the row round three
// section 3.4 names for `advice.drinkToThirst`, and asserting the literal here would let a
// reworded table pass a stale test.
//
// The in-session branch is the one under test because it is the only cue whose whole body is a
// single copy key. The shortfall branch is a FORMAT frame with two volumes in it and no
// overlay parameter (see the note in the last case).
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, copy, copyFor } from '../../../content/copy';
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

function renderBanner(skin: SkinId): void {
  useAppStore.setState(seed(skin));
  render(<HydrationBanner profile={PROFILE} date={TODAY} sessionActive />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HydrationBanner: the clinical words', () => {
  it('renders the default in-session cue', () => {
    renderBanner('clinical');
    expect(screen.getByText(copy('advice.drinkToThirst'))).toBeInTheDocument();
  });
});

describe('HydrationBanner: the limelight voice', () => {
  it('renders the skin cue for the same domain decision', () => {
    renderBanner('limelight');
    // By key against copy.limelight.ts. The domain returned the same cue kind in both cases;
    // only the words moved.
    expect(screen.getByText(copyFor('limelight', 'advice.drinkToThirst'))).toBeInTheDocument();
    expect(screen.queryByText(copy('advice.drinkToThirst'))).toBeNull();
  });

  it('keeps the drink control naming the profile volume, which no skin may restate', () => {
    renderBanner('limelight');
    // `FORMAT.logVolume` takes no overlay parameter, so this control is the clinical frame in
    // every skin. That is recorded here rather than left implicit: the volume is the profile's
    // own cup size and belongs to the contract, not to the skin.
    expect(screen.getByRole('button', { name: FORMAT.logVolume('250 mL') })).toBeInTheDocument();
  });
});
