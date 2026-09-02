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
import { ICON_FOR_KEY } from '../../../skins/limelight/Icon';
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

function renderBanner(skin: SkinId): HTMLElement {
  useAppStore.setState(seed(skin));
  return render(<HydrationBanner profile={PROFILE} date={TODAY} sessionActive />).container;
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
  it('renders the default in-session cue, with no glyph beside it', () => {
    const container = renderBanner('clinical');
    expect(screen.getByText(copy('advice.drinkToThirst'))).toBeInTheDocument();
    // Copy contract R6: the clinical skin is emoji-free and glyph-free, and the limelight icon
    // set belongs to exactly one skin (src/skins/limelight/Icon.tsx).
    expect(container.querySelectorAll('img.ll-icon')).toHaveLength(0);
  });

  it('states the daily shortfall and names the drink control in the default words', () => {
    renderShortfall('clinical');
    expect(screen.getByText(FORMAT.beverageShortfall('0 mL', '3000 mL'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: FORMAT.logVolume('250 mL') })).toBeInTheDocument();
  });
});

describe('HydrationBanner: the limelight voice', () => {
  it('renders the skin cue for the same domain decision, under its own icon', () => {
    const container = renderBanner('limelight');
    /*
     * P8 close-out D. `advice.drinkToThirst` has been mapped to the `drop` icon since the map
     * was written (round three, section 4.4), but nothing rendered it: this cue was a bare
     * `c(key)` call, so the icon was unreachable. The cue goes through SkinLabel now.
     *
     * The icon is DECORATIVE: no label, so it carries alt="" and aria-hidden and the sentence
     * beside it is the whole accessible name. Queried by class, because an empty-alt image has
     * no role for getByRole to find, which is the point of it.
     */
    expect(ICON_FOR_KEY['advice.drinkToThirst']).toBe('drop');
    const icons = container.querySelectorAll('img.ll-icon');
    expect(icons).toHaveLength(1);
    expect(icons[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(icons[0]?.getAttribute('alt')).toBe('');
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

/*
 * The departures board (P8 close-out D).
 *
 * BOARD_COPY is a partial table by design (see its header: sixteen design rows plus the nav),
 * so most of this screen falls through to the clinical string under it. One smoke case per
 * Train component asserts BOTH halves of that: the component mounts under `ui.skin = 'board'`
 * without throwing, and the key it renders resolves to whatever `copyFor('board', ...)` says -
 * the board's own word where the table has one, the default where it does not. Asserting by
 * key rather than by literal is what makes the case survive a row being added later.
 */
describe('HydrationBanner under the departures board', () => {
  it('mounts and states the in-session cue in the board words, with no glyph', () => {
    // `advice.drinkToThirst` is round two's own hydration row, with the design's em-dash
    // replaced by the colon R5 prescribes (copy.board.ts records that one departure).
    expect(() => {
      renderBanner('board');
    }).not.toThrow();

    expect(screen.getByText(copyFor('board', 'advice.drinkToThirst'))).toBeInTheDocument();
    expect(screen.queryByText(copy('advice.drinkToThirst'))).toBeNull();
    // The icon set belongs to limelight alone, so the board shows the words and nothing else.
    // Queried from the document rather than a container handle: the render happens inside the
    // callback above, so there is nothing for a local to be narrowed from.
    expect(document.body.querySelectorAll('img.ll-icon')).toHaveLength(0);
  });
});
