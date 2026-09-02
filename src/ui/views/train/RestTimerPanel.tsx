// src/ui/views/train/RestTimerPanel.tsx
//
// The countdown is a function of Date.now() and the timer's endsAt. The interval only forces a
// re-render; it never holds the value (code review A31: the legacy interval froze while
// backgrounded and chimed a minute late).
//
// Units: instants are epoch ms UTC [ms]; every rest quantity is seconds [s]; the ring's
// geometry is in SVG user units, which the viewBox maps to px at the rendered size.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { copy, FORMAT, type CopyKey } from '../../../content/copy';
import { useCopy, useCopyOverrides } from '../../../content/useCopy';
import { extend, remainingS, totalS } from '../../../domain/training/restTimer';
import { playSfx } from '../../../skins/sfx';
import { useAppStore } from '../../../store';
import { useRestTimer } from '../../../store/selectors';
import { playChime, vibrate } from '../../audio/chime';
import '../../styles/train.css';

const RING_RADIUS = 28; // SVG user units, inside the 64-unit viewBox
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const EXTEND_S = 30; // [s], the fixed extension `button.extendRest` names
const TICK_MS = 1000; // [ms]
const S_PER_MIN = 60; // [s/min]

/** navigator.vibrate's pattern, in milliseconds on / off / on. */
const VIBRATE_PATTERN = [180, 80, 180]; // [ms]

/**
 * A local notification for a rest that ended while the page was hidden (master plan section
 * 6.5). It is posted through the service-worker registration, which is the only route a PWA
 * has to a notification on Android and iOS; `new Notification()` is not supported there.
 *
 * Every failure is swallowed and none of them is reported: a push-less registration, a revoked
 * permission, a browser with no service worker at all. The visual timer and the chime already
 * ran, so there is nothing for the user to act on.
 *
 * A plain function, so it takes the skin overlay as an ARGUMENT rather than reading a hook: it
 * is called from an effect, not from a render, and `useCopy` may not be called from either.
 *
 * @param overrides the active skin's override table, from `useCopyOverrides()` at the call site.
 */
async function notifyRestOver(overrides: Partial<Record<CopyKey, string>>): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(copy('notification.restOver', overrides), { tag: 'rest' });
  } catch {
    // Deliberately not an empty block: no-empty forbids that, and there is genuinely nothing
    // to recover. The chime and the ring are the primary cues; this is the third one.
    return;
  }
}

export function RestTimerPanel(): ReactElement | null {
  const timer = useRestTimer();
  // Above the `timer === null` return below, so the hooks run on every render of this component
  // whether or not a rest is under way.
  const c = useCopy();
  const overrides = useCopyOverrides();
  const [now, setNow] = useState<number>(() => Date.now()); // [ms] epoch UTC
  const firedRef = useRef(false);

  /*
   * Tick once per second only while the document is visible, and recompute immediately on
   * visibilitychange so a backgrounded return is not stale. Background tabs are throttled to
   * >= 1 s and suspended outright on iOS, so the interval is a repaint trigger and never the
   * source of the value: remainingS is recomputed from endsAt on every render.
   */
  useEffect(() => {
    if (timer === null) return;
    let id: number | undefined;
    const tick = (): void => {
      setNow(Date.now()); // [ms] epoch UTC
    };
    const start = (): void => {
      if (id === undefined) id = window.setInterval(tick, TICK_MS);
    };
    const stop = (): void => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const onVisibility = (): void => {
      tick();
      if (document.hidden) stop();
      else start();
    };
    tick();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timer]);

  /*
   * The zero-crossing cues, fired exactly once per timer. The ref is reset when the timer
   * IDENTITY changes (a new rest, or an extension, both of which produce a new object), which
   * is what makes "once" mean once per interval rather than once per mount.
   */
  useEffect(() => {
    firedRef.current = false;
  }, [timer]);

  useEffect(() => {
    if (timer === null || firedRef.current) return;
    if (remainingS(timer, now) > 0) return;
    firedRef.current = true;
    playChime();
    /*
     * The rest-over sound (P8 Task 15), beside the chime rather than instead of it: the chime is
     * the shipped cue and this is the skin's own sample, and both are gated inside their own
     * modules by `ui.sounds`. It sits after `firedRef` is set, so the once-per-timer guard
     * covers it too - an extension mints a NEW timer object, which resets the ref and arms both
     * cues for the extended interval rather than firing them at the moment Extend was pressed.
     */
    playSfx('rest_over');
    // navigator.vibrate is not implemented in Safari on iOS or iPadOS at any version
    // (REFERENCES.md, caniuse.com/mdn-api_navigator_vibrate), so this is an Android-only cue
    // and must never be the only one. chime.ts feature-detects it and returns false otherwise.
    vibrate(VIBRATE_PATTERN);
    if (document.hidden) void notifyRestOver(overrides);
  }, [timer, now, overrides]);

  if (timer === null) return null;

  const remaining = remainingS(timer, now); // [s]
  // Floored at 1 so the ring's fraction cannot divide by zero on a timer extended to nothing.
  const total = Math.max(1, totalS(timer)); // [s]
  const elapsedFraction = Math.min(1, (total - remaining) / total); // dimensionless
  const minutes = Math.floor(remaining / S_PER_MIN); // [min]
  const seconds = remaining % S_PER_MIN; // [s]

  return (
    <div className="rest-panel">
      <div className="rest-ring">
        {/* Decorative: the remaining time is read from the text beside it, not from the arc. */}
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--line-2)"
            strokeWidth="3"
          />
          <circle
            cx="32"
            cy="32"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * elapsedFraction}
            transform="rotate(-90 32 32)"
            strokeLinecap="round"
          />
        </svg>
        {/* The overlay reaches the readout too (P8 close-out D). No table words it today, and
            the zero padding stays in the frame: digit count is a property of a clock, not a
            word a skin may change. */}
        <span className="rest-time">{FORMAT.restRemaining(minutes, seconds, overrides)}</span>
      </div>
      <div className="rest-controls">
        <div className="rest-label">{c('status.rest')}</div>
        <button
          type="button"
          onClick={() => {
            // Through getState(): the store's actions are created once and never replace
            // themselves, so subscribing to one hands the component an unbound method.
            useAppStore.getState().setRestTimer(extend(timer, EXTEND_S));
          }}
        >
          {c('button.extendRest')}
        </button>
        <button
          type="button"
          onClick={() => {
            useAppStore.getState().setRestTimer(null);
          }}
        >
          {c('button.skipRest')}
        </button>
      </div>
    </div>
  );
}
