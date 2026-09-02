// src/ui/views/train/RestTimerPanel.test.tsx
//
// The rest panel's copy contract and its zero-crossing sound (P8 close-out C).
//
// Two mocks, both at the module boundary and both for the same reason: jsdom has no Web Audio,
// so the real `playChime` and `playSfx` would return silently whether or not the effect reached
// them, and "exactly once per interval" is the property under test.
//
// Only `Date` is faked, matching TrainView.test.tsx: faking the whole timer set would also fake
// the interval React's scheduler runs on. The zero crossing is driven by moving the clock and
// dispatching `visibilitychange`, which is the recomputation path master plan section 6.5
// specifies and the one a backgrounded PWA actually takes.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, copyFor } from '../../../content/copy';
import type { SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { makeAppState, makeUiPrefs } from '../../../test/funFixtures';
import { RestTimerPanel } from './RestTimerPanel';

const playChime = vi.hoisted(() => vi.fn(() => true));
const vibrate = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../audio/chime', () => ({
  playChime,
  vibrate,
  unlockAudio: vi.fn(() => Promise.resolve(true)),
  releaseAudio: vi.fn(),
}));

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../../skins/sfx', () => ({ playSfx }));

/** [ms] epoch UTC. An arbitrary instant; every offset below is relative to it. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
const REST_S = 90; // [s]

function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

/** Seeds a rest that ends REST_S after NOW and mounts the panel. */
function renderPanel(skin: SkinId): void {
  withSkin(skin);
  useAppStore.getState().setRestTimer({
    startedAt: NOW, // [ms] epoch UTC
    endsAt: NOW + REST_S * 1000, // [ms] epoch UTC
    durationS: REST_S, // [s]
  });
  render(<RestTimerPanel />);
}

/** Moves the clock past the end of the rest and forces the recomputation. */
function expireRest(): void {
  vi.setSystemTime(NOW + (REST_S + 60) * 1000); // [ms] epoch UTC
  fireEvent(document, new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  playChime.mockClear();
  vibrate.mockClear();
  playSfx.mockClear();
});

afterEach(() => {
  useAppStore.getState().setRestTimer(null);
  vi.useRealTimers();
});

describe('RestTimerPanel: the clinical words', () => {
  it('names the interval and its two controls from the default table', () => {
    renderPanel('clinical');
    expect(screen.getByText(copy('status.rest'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy('button.extendRest') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy('button.skipRest') })).toBeInTheDocument();
  });
});

describe('RestTimerPanel: the limelight voice', () => {
  it('renders the skin strings on the label and both controls', () => {
    renderPanel('limelight');
    // By key against copy.limelight.ts, never as a literal.
    expect(screen.getByText(copyFor('limelight', 'status.rest'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.extendRest') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.skipRest') }),
    ).toBeInTheDocument();
    expect(screen.queryByText(copy('status.rest'))).toBeNull();
  });
});

describe('RestTimerPanel: the rest-over sound (P8 Task 15)', () => {
  it('sounds the sample once when the rest reaches zero, beside the chime', () => {
    renderPanel('clinical');
    expect(playSfx).not.toHaveBeenCalled();

    expireRest();

    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
    // Beside, not instead of: the chime is the shipped cue and the sample is the skin's.
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('does not sound it a second time for the same interval', () => {
    renderPanel('clinical');
    expireRest();
    fireEvent(document, new Event('visibilitychange'));

    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it('sounds nothing when the interval is extended', () => {
    // Extend mints a NEW timer object, which resets the once-per-timer ref. That reset arms the
    // cues for the extended interval; it must not fire them at the moment Extend was pressed.
    renderPanel('clinical');
    fireEvent.click(screen.getByRole('button', { name: copy('button.extendRest') }));

    expect(playSfx).not.toHaveBeenCalled();
    expect(playChime).not.toHaveBeenCalled();
  });

  it('sounds it once for an interval that was extended and then ran out', () => {
    renderPanel('clinical');
    fireEvent.click(screen.getByRole('button', { name: copy('button.extendRest') }));
    // 30 s past the EXTENDED end, which is REST_S + EXTEND_S after the start.
    vi.setSystemTime(NOW + (REST_S + 30 + 30) * 1000); // [ms] epoch UTC
    fireEvent(document, new Event('visibilitychange'));

    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
  });
});
