// src/ui/views/train/restGameGuarantees.test.tsx
//
// What every rest-game family holds to (docs/design/rest-games.md, constraints 1, 3, 4 and 5),
// asserted once for all five so a new family is checked by being listed (P6, AGENTS rule 2).
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FAMILIES, type RestGameFamily } from '../../../domain/fun/restGames';
import type { RestTimer } from '../../../domain/training/restTimer';
import { REST_GAME_CATALOG } from './restGameCatalog';
// Every source a rest game runs, as text (?raw: node:fs has no typings under tsconfig.app.json).
import restWordGameSource from './RestWordGame.tsx?raw';
import plateMathGameSource from './PlateMathGame.tsx?raw';
import reactionGameSource from './ReactionGame.tsx?raw';
import sequenceGameSource from './SequenceRecallGame.tsx?raw';
import anagramGameSource from './GymAnagramGame.tsx?raw';
import frameSource from './RestGameFrame.tsx?raw';
import sheetSource from './RestGameSheet.tsx?raw';
import pickerSource from './RestGamePicker.tsx?raw';
import catalogSource from './restGameCatalog.ts?raw';
import choiceSource from './restGameChoice.ts?raw';
import hostSource from './restGameHost.ts?raw';
import propsSource from './restGameProps.ts?raw';
import clockSource from './useRoundClock.ts?raw';
import dismissSource from './useSheetDismiss.ts?raw';
import mascotSource from './PixelMascot.tsx?raw';
import spriteSource from '../../components/OwnerSprite.tsx?raw';
import audioSource from '../../audio/restGameAudio.ts?raw';
import formatSource from '../../../content/restGameFormat.ts?raw';
import registrySource from '../../../domain/fun/restGames.ts?raw';
import restWordSource from '../../../domain/fun/restWord.ts?raw';
import plateMathSource from '../../../domain/fun/plateMath.ts?raw';
import reactionSource from '../../../domain/fun/reaction.ts?raw';
import sequenceSource from '../../../domain/fun/sequenceRecall.ts?raw';
import anagramSource from '../../../domain/fun/gymAnagram.ts?raw';
// rng.ts is not listed: it is the shared seeded generator, cites its algorithm by URL in a comment,
// and has its own suite (rng.test.ts). It makes no request.

const SOURCES: Readonly<Record<string, string>> = {
  'RestWordGame.tsx': restWordGameSource,
  'PlateMathGame.tsx': plateMathGameSource,
  'ReactionGame.tsx': reactionGameSource,
  'SequenceRecallGame.tsx': sequenceGameSource,
  'GymAnagramGame.tsx': anagramGameSource,
  'RestGameFrame.tsx': frameSource,
  'RestGameSheet.tsx': sheetSource,
  'RestGamePicker.tsx': pickerSource,
  'restGameCatalog.ts': catalogSource,
  'restGameChoice.ts': choiceSource,
  'restGameHost.ts': hostSource,
  'restGameProps.ts': propsSource,
  'useRoundClock.ts': clockSource,
  'useSheetDismiss.ts': dismissSource,
  'PixelMascot.tsx': mascotSource,
  'OwnerSprite.tsx': spriteSource,
  'restGameAudio.ts': audioSource,
  'restGameFormat.ts': formatSource,
  'restGames.ts': registrySource,
  'restWord.ts': restWordSource,
  'plateMath.ts': plateMathSource,
  'reaction.ts': reactionSource,
  'sequenceRecall.ts': sequenceSource,
  'gymAnagram.ts': anagramSource,
};

/*
 * A running shared context whose oscillator count is the observable difference between a cue and
 * silence (the cues are synthesised on it; src/ui/audio/restGameAudio.ts). jsdom has no Web Audio.
 */
const audio = vi.hoisted(() => ({ oscillators: 0 }));
vi.mock('../../audio/chime', () => ({
  playChime: vi.fn(() => true),
  vibrate: vi.fn(() => true),
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

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0); // [ms] epoch UTC
const REST_S = 120; // [s] a 60 s round clock

function makeTimer(): RestTimer {
  return {
    startedAt: NOW, // [ms] epoch UTC
    endsAt: NOW + REST_S * 1000, // [ms] epoch UTC
    durationS: REST_S, // [s]
    game: {
      exerciseId: 'barbell-bench-press',
      sessionId: 'session-1',
      assignmentDate: '2026-09-11',
      setNumber: 1,
      sessionSetOrdinal: 1,
    },
  };
}

function renderFamily(family: RestGameFamily, soundsEnabled: boolean, timer: RestTimer) {
  const { Component } = REST_GAME_CATALOG[family];
  const onWin = vi.fn();
  const view = render(
    <Component
      timer={timer}
      priorWins={0}
      soundsEnabled={soundsEnabled}
      t={copy}
      overrides={{}}
      onExit={vi.fn()}
      onWin={onWin}
    />,
  );
  return { ...view, onWin };
}

describe('rest-game sources (docs/design/rest-games.md)', () => {
  it('names no network API and no remote address in any game source (constraint 3)', () => {
    const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\/|\bimport\s*\(/;
    for (const [file, text] of Object.entries(SOURCES)) {
      expect({ file, network: NETWORK.test(text) }).toEqual({ file, network: false });
    }
  });

  it('reads no store, no web storage, and writes no timer and no score (constraints 1 and 4)', () => {
    const FORBIDDEN =
      /from '(?:\.\.\/)+store(?:\/[^']*)?'|sessionMirror|localStorage|sessionStorage|indexedDB|setRestTimer|startRest\(|\bextend\(|recordRestGameWin\(/;
    for (const [file, text] of Object.entries(SOURCES)) {
      expect({ file, forbidden: FORBIDDEN.exec(text)?.[0] ?? null }).toEqual({ file, forbidden: null });
    }
  });
});

describe('every rest-game family (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    audio.oscillators = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(REST_GAME_FAMILIES)('%s names itself from the table and offers Exit', (family) => {
    renderFamily(family, false, makeTimer());
    expect(screen.getByRole('heading', { name: copy(REST_GAME_CATALOG[family].titleKey) })).toBeInTheDocument();
    expect(screen.getByText(copy(REST_GAME_CATALOG[family].ruleKey))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy('button.restWordExit') })).toBeEnabled();
  });

  it.each(REST_GAME_FAMILIES)(
    '%s runs out offline and silent with ui.sounds off, and leaves the rest timer alone',
    (family) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const timer = makeTimer();
      const before = { ...timer, game: { ...timer.game! } };
      const { container, onWin } = renderFamily(family, false, timer);
      act(() => {
        vi.advanceTimersByTime(REST_S * 500 + 1000); // [ms] past the 60 s round clock
      });
      expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
      expect(audio.oscillators).toBe(0);
      expect(onWin).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(container.querySelectorAll('img, audio, video, iframe, canvas, link, source')).toHaveLength(0);
      expect(timer).toEqual(before);
      expect(screen.getByRole('button', { name: copy('button.restWordExit') })).toBeEnabled();
    },
  );

  it.each(REST_GAME_FAMILIES)('%s plays the loss cue when ui.sounds is on', (family) => {
    renderFamily(family, true, makeTimer());
    act(() => {
      vi.advanceTimersByTime(REST_S * 500 + 1000); // [ms]
    });
    expect(audio.oscillators).toBeGreaterThan(0);
  });
});
