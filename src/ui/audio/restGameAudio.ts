// src/ui/audio/restGameAudio.ts
//
// Original, tiny rest-game cues. A cue is a handful of MIDI note events translated to Web Audio
// oscillators at runtime: no sample, MIDI file, network request or media-src exception ships.

import { getAudioContext } from './chime';

export type RestGameCue = 'submit' | 'win' | 'lose';

interface MidiNote {
  midi: number; // [semitones], MIDI note number; A4 = 69
  offsetMs: number; // [ms] after the cue starts
  durationMs: number; // [ms]
  gain: number; // [-] linear amplitude
}

const MIDI_A4 = 69; // [semitones] MIDI note number of A4
const A4_HZ = 440; // [Hz] concert pitch
const MS_PER_S = 1000; // [ms/s]
const QUIET_GAIN = 0.0001; // [-] linear amplitude; an exponential ramp cannot reach 0
const ATTACK_S = 0.006; // [s] fade-in; a hard start clicks

/* Original event patterns, deliberately shorter and quieter than the rest-over chime. */
const CUES: Readonly<Record<RestGameCue, readonly MidiNote[]>> = {
  submit: [{ midi: 72, offsetMs: 0, durationMs: 55, gain: 0.05 }],
  win: [
    { midi: 60, offsetMs: 0, durationMs: 70, gain: 0.06 },
    { midi: 64, offsetMs: 75, durationMs: 70, gain: 0.06 },
    { midi: 67, offsetMs: 150, durationMs: 120, gain: 0.07 },
  ],
  lose: [
    { midi: 55, offsetMs: 0, durationMs: 90, gain: 0.05 },
    { midi: 52, offsetMs: 95, durationMs: 110, gain: 0.05 },
  ],
};

/** The standard equal-temperament MIDI conversion, exported for a value-level test. */
export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - MIDI_A4) / 12);
}

/**
 * Schedules one original cue when `soundsOn` (the user's `ui.sounds`, read by the caller) is true
 * and the shared context is already unlocked and running. The setting is checked FIRST, before
 * the context is even looked up, so sounds off is silence on every device. Unlike the rest-over
 * chime, a game cue is decoration, not an alarm, so it obeys the switch. This function never
 * resumes a context: a timer expiry is not a gesture.
 *
 * @returns true when the notes were scheduled, false for silence.
 */
export function playRestGameCue(cue: RestGameCue, soundsOn: boolean): boolean {
  if (!soundsOn) return false;
  const context = getAudioContext();
  if (context === null || context.state !== 'running') return false;

  for (const note of CUES[cue]) {
    const startsAt = context.currentTime + note.offsetMs / MS_PER_S; // [s]
    const endsAt = startsAt + note.durationMs / MS_PER_S; // [s]
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = midiToHz(note.midi); // [Hz]
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(QUIET_GAIN, startsAt);
    gain.gain.exponentialRampToValueAtTime(note.gain, startsAt + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(QUIET_GAIN, endsAt);
    oscillator.start(startsAt);
    oscillator.stop(endsAt);
  }
  return true;
}
