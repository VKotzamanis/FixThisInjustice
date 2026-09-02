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
 * the end of a session when sounds are off, and rebuilds a new one on the next unlock; while
 * sounds are on it only suspends the context, so that check keeps passing across the cycle.
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
 * The shared context, constructed on demand: the first call builds it, every later call returns
 * that same object until releaseAudio() closes it (sounds off) and the next call builds a fresh
 * one, or forever while releaseAudio() only suspends it (sounds on).
 *
 * A NON-NULL RETURN DOES NOT MEAN SOUND IS POSSIBLE. Constructing a context outside a user
 * gesture is allowed everywhere, and the context it returns starts in state "suspended" on iOS
 * Safari and under Chrome's autoplay policy; unlockAudio() is what resumes it, and iOS suspends
 * it again whenever the app is backgrounded. So this function returns a live, suspended,
 * silent context before the gesture, and the same object afterwards.
 *
 * Returns null only where Web Audio is absent (jsdom, and any browser without it), which
 * callers must treat as "no sound", never as an error.
 *
 * P8 task 15's sound-effects player therefore gates playback on `ctx.state === 'running'`, the
 * check chime() makes, NOT on a null test: a null test passes on a suspended context, and the
 * player would then schedule nodes that never sound and report a sound that never played.
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
 * Release the shared context at the end of a session: an open, running context holds audio
 * hardware and, on iOS, keeps the app's audio session alive for nothing.
 *
 * P8 close-out defect: TrainView plays 'session_done' (src/skins/sfx.ts) and calls this
 * synchronously afterwards, in the same tick. AudioContext.close() stops every node scheduled
 * on the context immediately, so a close() here cut the sound that had just been scheduled, and
 * every later sound (pr_stamp, intervention_open) stayed silent for the rest of the document's
 * life: the first-gesture unlock (useFirstGestureUnlock, src/skins/sfx.ts) fires once and
 * disarms itself, so there is no later gesture to resume() a freshly-built context from.
 *
 * `sounds` is ui.sounds, read by the caller. When true, the context is only SUSPENDED, never
 * closed: MDN documents suspend() as "temporarily halting audio hardware access and reducing
 * CPU/battery usage", the same hardware-release goal close() serves, but it does not tear the
 * context down - the object survives, which is what lets the sfx player's play() resume() and
 * reuse it, and what keeps decodedFor's identity check (src/skins/sfx.ts) valid across the
 * cycle, so nothing needs re-decoding. When `sounds` is false (the default, and every call site
 * before this parameter existed), nothing is enabled to interrupt, so the context is closed
 * exactly as before and the module reference is dropped so the next unlock builds a fresh one.
 */
export function releaseAudio(options: { sounds?: boolean } = {}): void {
  const sounds = options.sounds ?? false;
  const ctx = context;
  if (ctx === null) return;
  if (sounds) {
    void ctx.suspend().catch(() => {
      // Suspending a context the browser already tore down rejects. Nothing to recover: the
      // context is left in whatever state the browser put it in, and play() already gates on
      // state === 'running', so a botched suspend cannot produce sound it should not.
    });
    return;
  }
  context = null;
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
