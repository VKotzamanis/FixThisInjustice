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
import { FORMAT, SKIN_COPY, copy, copyFor } from '../../../content/copy';
import { restWordRound } from '../../../domain/fun/restWord';
import type { RestGameContext, RestTimer } from '../../../domain/training/restTimer';
import type { SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { EMPTY_SESSION } from '../../../store/sessionMirror';
import { makeAppState, makeUiPrefs } from '../../../test/funFixtures';
import { ICON_FOR_KEY } from '../../../skins/limelight/Icon';
import { RestTimerPanel } from './RestTimerPanel';

const playChime = vi.hoisted(() => vi.fn(() => true));
const vibrate = vi.hoisted(() => vi.fn(() => true));
/*
 * A running shared context whose oscillator count is the observable difference between a game
 * cue and silence (the rest-game cues are synthesised on it; src/ui/audio/restGameAudio.ts).
 */
const audio = vi.hoisted(() => ({ oscillators: 0 }));
vi.mock('../../audio/chime', () => ({
  playChime,
  vibrate,
  unlockAudio: vi.fn(() => Promise.resolve(true)),
  releaseAudio: vi.fn(),
  getAudioContext: () => ({
    state: 'running',
    currentTime: 0, // [s] on the context clock
    destination: {},
    createOscillator: () => {
      audio.oscillators += 1;
      return { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    },
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  }),
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
function renderPanel(skin: SkinId): HTMLElement {
  withSkin(skin);
  useAppStore.getState().setRestTimer({
    startedAt: NOW, // [ms] epoch UTC
    endsAt: NOW + REST_S * 1000, // [ms] epoch UTC
    durationS: REST_S, // [s]
  });
  return render(<RestTimerPanel />).container;
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

  it('puts the mapped icon beside the label and the skip control', () => {
    /*
     * P8 close-out D. `status.rest` and `button.skipRest` have carried an entry in ICON_FOR_KEY
     * since the map was written (round three, section 4.4), and neither was reachable: both
     * were bare `c(key)` calls. Two of the three icons this batch made reachable are here.
     *
     * `button.extendRest` is deliberately NOT wrapped: section 4.4 gives it no icon, so a
     * SkinLabel around it would add a wrapper element and no glyph.
     */
    expect(ICON_FOR_KEY['status.rest']).toBe('stopwatchPanel');
    expect(ICON_FOR_KEY['button.skipRest']).toBe('skip');

    const container = renderPanel('limelight');
    const icons = container.querySelectorAll('img.ll-icon');
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      // Decorative: an empty alt plus aria-hidden, so the words beside each one stand alone as
      // the accessible name. A labelled icon would double the skip control's name.
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('alt')).toBe('');
    }
    // The control's accessible name is still exactly the skin's word, with nothing added.
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.skipRest') }),
    ).toBeInTheDocument();
  });

  it('reads the clock through the active overlay, which has no word for it', () => {
    /*
     * P8 close-out D. `FORMAT.restRemaining` reads `status.restRemaining` and this panel now
     * passes `useCopyOverrides()` into it. The limelight table carries no row for that key on
     * purpose (copy.test.ts records why: the mockup renders "1:47" and the string is two slots
     * and a colon), so the readout is the default under every skin, and this case is what would
     * fail if a row were ever added without revisiting that decision.
     */
    renderPanel('limelight');
    expect(
      screen.getByText(FORMAT.restRemaining(1, 30, SKIN_COPY.limelight)),
    ).toBeInTheDocument();
    expect(screen.getByText(FORMAT.restRemaining(1, 30))).toBeInTheDocument();
  });
});

describe('RestTimerPanel: the rest-over sound (P8 Task 15)', () => {
  it('sounds the sample once when the rest reaches zero, beside the chime', () => {
    renderPanel('limelight');
    expect(playSfx).not.toHaveBeenCalled();

    expireRest();

    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
    // Beside, not instead of: the chime is the shipped cue and the sample is the skin's.
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('does not sound it a second time for the same interval', () => {
    renderPanel('limelight');
    expireRest();
    fireEvent(document, new Event('visibilitychange'));

    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it('sounds nothing when the interval is extended', () => {
    // Extend mints a NEW timer object, which resets the once-per-timer ref. That reset arms the
    // cues for the extended interval; it must not fire them at the moment Extend was pressed.
    renderPanel('limelight');
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.extendRest') }));

    expect(playSfx).not.toHaveBeenCalled();
    expect(playChime).not.toHaveBeenCalled();
  });

  it('sounds it once for an interval that was extended and then ran out', () => {
    renderPanel('limelight');
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.extendRest') }));
    // 30 s past the EXTENDED end, which is REST_S + EXTEND_S after the start.
    vi.setSystemTime(NOW + (REST_S + 30 + 30) * 1000); // [ms] epoch UTC
    fireEvent(document, new Event('visibilitychange'));

    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
  });
});

/*
 * Stylize survey item 3: the rest is a black lit sign (`.ll-panel`), and when it runs out the sign
 * turns pink and says so. The colours and the pulse are CSS (restPanelStyles.test.ts reads the
 * sheet); what is asserted here is the state the component hands the CSS, and the word that
 * carries the state alongside the colour (WCAG 1.4.1).
 */
describe('RestTimerPanel: the lit sign (stylize survey item 3)', () => {
  const sign = (container: HTMLElement): Element | null => container.querySelector('.rest-summary');

  it('draws the ring, the clock and the controls on the black panel', () => {
    const container = renderPanel('limelight');
    const panel = sign(container);
    expect(panel?.classList.contains('ll-panel')).toBe(true);
    expect(panel?.classList.contains('rest-over')).toBe(false);
    // The ring takes its colours from the sheet, not from inline presentation attributes.
    expect(container.querySelector('circle.rest-ring-track')?.getAttribute('stroke')).toBeNull();
    expect(container.querySelector('circle.rest-ring-arc')?.getAttribute('stroke')).toBeNull();
    // The stopwatchPanel icon (lime, drawn for a black ground) sits inside the panel now.
    expect(panel?.querySelector('.rest-label img.ll-icon')).not.toBeNull();
  });

  it('turns to the pulsing rest-over state, in words as well as colour, when the rest ends', () => {
    const container = renderPanel('limelight');
    const label = container.querySelector('.rest-label');
    expect(label?.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByText(copyFor('limelight', 'notification.restOver'))).toBeNull();

    expireRest();

    const panel = sign(container);
    expect(panel?.classList.contains('rest-over')).toBe(true);
    expect(panel?.classList.contains('rest-over-pulse')).toBe(true);
    expect(label?.textContent).toBe(copyFor('limelight', 'notification.restOver'));
    // Timing and sounds are untouched: the clock still reads zero and the cues fired once.
    expect(screen.getByText(FORMAT.restRemaining(0, 0))).toBeInTheDocument();
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('under prefers-reduced-motion changes state once, steady, with no pulse', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const container = renderPanel('limelight');
    expireRest();
    const panel = sign(container);
    expect(panel?.classList.contains('rest-over')).toBe(true);
    expect(panel?.classList.contains('rest-over-pulse')).toBe(false);
    expect(screen.getByText(copyFor('limelight', 'notification.restOver'))).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

/*
 * ROADMAP F1, docs/design/rest-games.md. The game rides on the rest timer: offered when a rest
 * with a game identity starts, gone when the rest ends, and never a writer of the timer.
 */
const GAME: RestGameContext = {
  exerciseId: 'barbell-back-squat',
  sessionId: 'session-1',
  assignmentDate: '2026-03-02',
  setNumber: 1, // [sets]
  sessionSetOrdinal: 1, // [sets]
};

/** A REST_S rest from NOW that offers a game. */
function gameTimer(): RestTimer {
  return { startedAt: NOW, endsAt: NOW + REST_S * 1000, durationS: REST_S, game: GAME }; // [ms], [ms], [s]
}

function renderGamePanel(sounds = false): RestTimer {
  // A fresh session slice: wins from an earlier case would change the round's difficulty.
  useAppStore.setState({ ...makeAppState({ ui: makeUiPrefs({ skin: 'limelight', sounds }) }), session: EMPTY_SESSION });
  const timer = gameTimer();
  useAppStore.getState().setRestTimer(timer);
  render(<RestTimerPanel />);
  return timer;
}

const gameHeading = () => screen.queryByRole('heading', { name: copy('hero.restWord') });

/** Types the round's own answer on the on-screen keys and submits it. */
function winRound(): void {
  const target = restWordRound(GAME, REST_S, 0).target.toUpperCase();
  for (const letter of target) fireEvent.click(screen.getByRole('button', { name: letter }));
  fireEvent.click(screen.getByRole('button', { name: copy('button.restWordSubmit') }));
}

describe('RestTimerPanel: the rest game (ROADMAP F1)', () => {
  beforeEach(() => {
    audio.oscillators = 0;
  });

  it('offers one optional round with the rest and never writes the timer', () => {
    const timer = renderGamePanel();
    // Offered, not forced: the rest starts with a launch control and no board.
    expect(gameHeading()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordLaunch') }));
    expect(gameHeading()).toBeInTheDocument();
    expect(useAppStore.getState().session.restTimer).toEqual(timer);

    winRound();
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(useAppStore.getState().session.restGameWins).toBe(1); // [rounds]
    expect(useAppStore.getState().session.restTimer).toEqual(timer);

    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordExit') }));
    expect(gameHeading()).toBeNull();
    expect(useAppStore.getState().session.restTimer).toEqual(timer);
    // One round per rest: the launch control does not come back for the same interval.
    expect(screen.queryByRole('button', { name: copy('button.restWordLaunch') })).toBeNull();
  });

  it('keeps counting the rest down while the game is open', () => {
    renderGamePanel();
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordLaunch') }));

    vi.setSystemTime(NOW + 30_000); // [ms] 30 s into a 90 s rest
    fireEvent(document, new Event('visibilitychange'));

    expect(screen.getByText(FORMAT.restRemaining(1, 0))).toBeInTheDocument();
    expect(gameHeading()).toBeInTheDocument();
  });

  it('closes the game when the rest ends, and the rest-over cues still fire once', () => {
    renderGamePanel();
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordLaunch') }));

    expireRest();

    expect(gameHeading()).toBeNull();
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('rest_over');
    expect(useAppStore.getState().session.restTimer?.endsAt).toBe(NOW + REST_S * 1000); // [ms]

    // An extension after the end is a new stretch of rest, not a revived board.
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.extendRest') }));
    expect(gameHeading()).toBeNull();
  });

  it('closes with the rest when the rest is skipped', () => {
    renderGamePanel();
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordLaunch') }));

    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.skipRest') }));

    expect(useAppStore.getState().session.restTimer).toBeNull();
    expect(gameHeading()).toBeNull();
  });

  it('does not start a round that no longer fits in the prescribed rest', () => {
    renderGamePanel();
    vi.setSystemTime(NOW + 50_000); // [ms] 40 s remain; a 90 s rest's round is 45 s
    fireEvent(document, new Event('visibilitychange'));

    expect(screen.getByRole('button', { name: copy('button.restWordLaunch') })).toBeDisabled();
    expect(screen.getByText(copy('status.restWordTooLate'))).toBeInTheDocument();
  });

  it('offers no game on a timer with no game identity, as an older build restores', () => {
    renderPanel('limelight');
    expect(screen.queryByRole('button', { name: copy('button.restWordLaunch') })).toBeNull();
  });

  it('makes no game sound with ui.sounds off', () => {
    renderGamePanel(false);
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordLaunch') }));
    winRound();
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(audio.oscillators).toBe(0);
  });

  it('plays the game cue with ui.sounds on', () => {
    renderGamePanel(true);
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordLaunch') }));
    winRound();
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(audio.oscillators).toBeGreaterThan(0);
  });
});
