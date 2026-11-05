// src/app/RestController.tsx
//
// The one app-level rest controller (audit C06, C11; spec R6 P4 line). Mounted in the view
// shell, so the rest-over cues fire whichever view is on screen; it used to live in
// RestTimerPanel, which only Train mounts (C06: "ended on Today view, oscillators 0").
//
// It schedules ONE timeout to the rest's own `endsAt` [ms] epoch UTC and re-arms it on every
// visibilitychange, so a backgrounded tab that is throttled or frozen is corrected on return.
// When the timeout fires while the page is hidden, the cue includes the local notification
// (master plan section 6.5), which the old panel could never reach: its tick stopped while
// hidden, so `document.hidden` was never true at the zero crossing (C06).
//
// Cues, once per rest interval (an extension mints a new timer object, which re-arms them):
//  - the chime, ONLY with ui.sounds on (C11: it ignored the switch);
//  - the skin's rest-over sample (playSfx gates on ui.sounds itself);
//  - a vibration where navigator.vibrate exists (Android; never iOS);
//  - a notification through the service worker while the page is hidden.
// A rest that ended more than REST_OVER_GRACE_MS ago (the app was closed or frozen through it)
// gets no cue: the bar already shows it over, and a chime minutes late is noise.
//
// Platform limit, unchanged: an installed iOS app that is locked runs no JavaScript, so nothing
// here fires until it is opened again (docs/ARCHITECTURE.md).
import { useEffect, useRef } from 'react';
import { copy, type CopyKey } from '../content/copy';
import { useCopyOverrides } from '../content/useCopy';
import type { RestTimer } from '../domain/training/restTimer';
import { playSfx } from '../skins/sfx';
import { useAppStore } from '../store';
import { useRestTimer } from '../store/selectors';
import { playChime, vibrate } from '../ui/audio/chime';

/** navigator.vibrate's pattern, in milliseconds on / off / on (moved from RestTimerPanel). */
export const VIBRATE_PATTERN = [180, 80, 180]; // [ms]

/**
 * [ms] How late a rest-over cue may still fire. An engineering bound, not a health number: long
 * enough for a throttled background timeout or a return from the lock screen within the same
 * minute, short enough that reopening the app minutes later is silent.
 */
export const REST_OVER_GRACE_MS = 10_000;

/**
 * A local notification for a rest that ended while the page was hidden, through the service
 * worker registration (the only route a PWA has on Android and iOS). Every failure is swallowed:
 * the visual and the chime already ran, so there is nothing for the user to act on.
 */
async function notifyRestOver(overrides: Partial<Record<CopyKey, string>>): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(copy('notification.restOver', overrides), { tag: 'rest' });
  } catch {
    return;
  }
}

/** The cues for one rest that has just ended. Exported for the controller's tests. */
export function restOverCues(sounds: boolean, overrides: Partial<Record<CopyKey, string>>): void {
  if (sounds) playChime(); // C11: the chime obeys ui.sounds like every other sound
  playSfx('rest_over'); // gated on ui.sounds inside src/skins/sfx.ts
  vibrate(VIBRATE_PATTERN);
  if (document.hidden) void notifyRestOver(overrides);
}

export function RestController(): null {
  const timer = useRestTimer();
  const sounds = useAppStore((s) => s.ui.sounds);
  const overrides = useCopyOverrides();
  // The interval the cues already fired for; identity, because an extension is a new object.
  const firedFor = useRef<RestTimer | null>(null);
  // Read at fire time, so toggling sounds mid-rest does not re-arm the timeout.
  const soundsRef = useRef(sounds);
  const overridesRef = useRef(overrides);
  useEffect(() => {
    soundsRef.current = sounds;
    overridesRef.current = overrides;
  });

  useEffect(() => {
    if (timer === null || firedFor.current === timer) return;
    let handle: number | undefined;
    const fire = (): void => {
      if (firedFor.current === timer) return;
      firedFor.current = timer;
      const late = Date.now() - timer.endsAt; // [ms]
      if (late > REST_OVER_GRACE_MS) return;
      restOverCues(soundsRef.current, overridesRef.current);
    };
    const arm = (): void => {
      window.clearTimeout(handle);
      const wait = Math.max(0, timer.endsAt - Date.now()); // [ms]
      handle = window.setTimeout(() => {
        if (Date.now() >= timer.endsAt) fire();
        else arm(); // woken early (clock change): wait again for the real end
      }, wait);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(handle);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [timer]);

  return null;
}
