import { beforeEach, describe, expect, it, vi } from 'vitest';
import { midiToHz, playRestGameCue } from './restGameAudio';

/*
 * jsdom has no Web Audio, so the shared context is doubled at the module boundary. The double
 * counts the oscillators a cue schedules, which is the observable difference between a sound and
 * silence.
 */
const fake = vi.hoisted((): { state: AudioContextState; oscillators: number } => ({
  state: 'running',
  oscillators: 0,
}));

vi.mock('./chime', () => ({
  getAudioContext: () => ({
    get state() {
      return fake.state;
    },
    currentTime: 0, // [s] on the context clock
    destination: {},
    createOscillator: () => {
      fake.oscillators += 1;
      return { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    },
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  }),
}));

beforeEach(() => {
  fake.state = 'running';
  fake.oscillators = 0;
});

describe('rest-game MIDI conversion', () => {
  it('maps MIDI A4 to its exact concert-pitch frequency', () => {
    expect(midiToHz(69)).toBe(440);
  });

  it('doubles frequency after twelve semitones', () => {
    expect(midiToHz(81)).toBe(880);
  });
});

describe('rest-game cues and ui.sounds (ROADMAP F1)', () => {
  it('stays silent with sounds off, even on a running context', () => {
    expect(playRestGameCue('win', false)).toBe(false);
    expect(fake.oscillators).toBe(0);
  });

  it('schedules synthesised notes with sounds on, and fetches nothing', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(playRestGameCue('win', true)).toBe(true);
    expect(fake.oscillators).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('stays silent on a context the browser has not unlocked', () => {
    fake.state = 'suspended';
    expect(playRestGameCue('lose', true)).toBe(false);
    expect(fake.oscillators).toBe(0);
  });
});
