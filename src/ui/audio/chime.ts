/**
 * One long-lived AudioContext, shared by every sound this app makes.
 *
 * Master plan section 6.5: the UI "unlocks an AudioContext on the 'start session' tap, chimes
 * at zero, vibrates where navigator.vibrate exists". Code review A29 records why the unlock has
 * to happen inside that tap: the legacy constructed a context inside a setInterval callback, so
 * it started suspended, resume() was never called from a gesture, and no sound was ever
 * produced on iOS Safari or on Chrome under its autoplay policy.
 *
 * Constructing a context is allowed anywhere; only resuming it needs a user gesture, and iOS
 * suspends the context again whenever the app is backgrounded (REFERENCES.md). Playback is
 * therefore gated on state === "running" and reports whether it actually happened, rather than
 * pretending a suspended context made a sound.
 *
 * P8 task 15's sound-effects player reuses this context through getAudioContext() instead of
 * constructing a second one, and re-checks identity because releaseAudio() closes this one at
 * the end of a session.
 *
 * No audio file is involved: the chime is synthesised, so nothing here touches the CSP's
 * media-src, and there is no inline script (master plan section 3).
 */

declare global {
  interface Window {
    /** WebKit's prefixed constructor, still the only one on older iOS builds. */
    webkitAudioContext?: typeof AudioContext;
  }
}

const CHIME_FREQUENCY_HZ = 880; // [Hz] A5
const CHIME_DURATION_MS = 250; // [ms]
const CHIME_ATTACK_S = 0.01; // [s] fade-in; a hard start clicks
const CHIME_PEAK_GAIN = 0.25; // [-] linear amplitude, well inside full scale
const SILENT_GAIN = 0.0001; // [-] linear amplitude; an exponential ramp cannot reach 0
const MS_PER_S = 1000; // [ms/s]

/** The one context. null until something asks for it, and again after releaseAudio(). */
let context: AudioContext | null = null;

function audioContextConstructor(): (new () => AudioContext) | null {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window === 'undefined') return null;
  return window.webkitAudioContext ?? null; // jsdom and pre-14.1 WebKit land here
}

/**
 * The shared context, constructed on first use. null where Web Audio does not exist (jsdom,
 * and any browser without it), which callers must treat as "no sound", never as an error.
 */
export function getAudioContext(): AudioContext | null {
  if (context !== null) return context;
  const Constructor = audioContextConstructor();
  if (Constructor === null) return null;
  context = new Constructor();
  return context;
}

/**
 * Resume the shared context. MUST be called from inside a click or touch handler: every
 * browser refuses resume() outside a user gesture, and iOS refuses it again after the app has
 * been backgrounded. Resolves true when the context is running afterwards, false when there is
 * no Web Audio implementation or the browser refused.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (ctx === null) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Called outside a gesture, or the page has no audio permission. Silence is the
      // documented fallback: the rest timer is visual first (master plan section 6.5).
      return false;
    }
  }
  const state: AudioContextState = ctx.state;
  return state === 'running';
}

/**
 * A single sine tone with a short gain envelope. Returns true when it was scheduled, false
 * when the context is missing, never unlocked, suspended by a backgrounded iOS app, or closed.
 */
export function chime(frequencyHz: number = CHIME_FREQUENCY_HZ, durationMs: number = CHIME_DURATION_MS): boolean {
  const ctx = context;
  if (ctx === null || ctx.state !== 'running') return false;

  const durationS = durationMs / MS_PER_S; // [s]
  const attackS = Math.min(CHIME_ATTACK_S, durationS / 2); // [s] never longer than half the tone

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequencyHz; // [Hz]
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const t0 = ctx.currentTime; // [s] on the context clock, not on Date.now()
  gain.gain.setValueAtTime(SILENT_GAIN, t0);
  gain.gain.exponentialRampToValueAtTime(CHIME_PEAK_GAIN, t0 + attackS);
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, t0 + durationS);
  oscillator.start(t0);
  oscillator.stop(t0 + durationS);
  return true;
}

/** The default chime, for callers that take no parameters (P4's rest timer at zero). */
export function playChime(): boolean {
  return chime();
}

/**
 * Close the shared context. Called when a session ends: an open context holds audio hardware
 * and, on iOS, keeps the app's audio session alive for nothing.
 */
export function releaseAudio(): void {
  const ctx = context;
  context = null;
  if (ctx === null) return;
  void ctx.close().catch(() => {
    // Closing a context that the browser already tore down rejects. Nothing to recover: the
    // module reference is dropped either way, and the next unlock builds a fresh context.
  });
}

/**
 * Haptic feedback beside the chime. Returns false where the API is absent, which includes
 * every iOS and iPadOS version to date (REFERENCES.md, caniuse.com/mdn-api_navigator_vibrate),
 * so a caller must never treat false as a failure.
 *
 * @param pattern Milliseconds on, or an alternating on/off pattern in milliseconds.
 */
export function vibrate(pattern: number | number[]): boolean {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false;
  return navigator.vibrate(pattern);
}
