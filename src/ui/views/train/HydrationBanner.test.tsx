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
// Both branches are under test. The in-session cue is a single copy key; the shortfall cue is a
// FORMAT frame with two volumes in it, and since P8 close-out B that frame reads
// `advice.beverageShortfall` and takes an overlay, so close-out D hands it this banner's own
// `useCopyOverrides()` and the skin reaches it like any other string.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copy, copyFor } from '../../../content/copy';
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
/**
 * [ms] epoch UTC. 19:00 on 2026-03-02 in Europe/Athens, which is past DAILY_SHORTFALL_AFTER
 * (18:00). March 2 precedes the EU DST change, so the offset is UTC+2.
 */
const EVENING = Date.UTC(2026, 2, 2, 17, 0, 0);

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

/**
 * The daily-shortfall branch: no session under way, past 18:00 in the profile's zone, and
 * nothing logged today, so the volume is below DAILY_SHORTFALL_FRACTION of the 3000 mL target.
 */
function renderShortfall(skin: SkinId): void {
  vi.setSystemTime(EVENING);
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
  render(<HydrationBanner profile={PROFILE} date={TODAY} sessionActive={false} />);
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

  it('states the daily shortfall and names the drink control in the default words', () => {
    renderShortfall('clinical');
    expect(screen.getByText(FORMAT.beverageShortfall('0 mL', '3000 mL'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: FORMAT.logVolume('250 mL') })).toBeInTheDocument();
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

  it('names the drink control in the skin words, keeping the profile volume', () => {
    renderBanner('limelight');
    /*
     * P8 close-out B gave `FORMAT.logVolume` a copy key and an overlay parameter, and close-out
     * D passes this banner's `useCopyOverrides()` into it, so the control follows the skin.
     * What does NOT follow the skin is the VOLUME: 250 mL is the profile's own cup size, it
     * reaches the frame as a slot, and copy.limelight.ts rule 1 keeps it there.
     */
    expect(
      screen.getByRole('button', {
        name: FORMAT.logVolume('250 mL', SKIN_COPY.limelight),
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: FORMAT.logVolume('250 mL') })).toBeNull();
  });

  it('states the shortfall in the skin words, keeping both volumes', () => {
    renderShortfall('limelight');
    // Nothing logged today against the fixture's 3000 mL target.
    expect(
      screen.getByText(FORMAT.beverageShortfall('0 mL', '3000 mL', SKIN_COPY.limelight)),
    ).toBeInTheDocument();
    expect(screen.queryByText(FORMAT.beverageShortfall('0 mL', '3000 mL'))).toBeNull();
  });
});
