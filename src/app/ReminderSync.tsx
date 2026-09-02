import { useEffect, useRef } from 'react';
import { REMINDERS_CONFIGURED, VAPID_PUBLIC_KEY } from '../config/reminders';
import { subscribe, syncSchedule } from '../domain/reminders/client';
import { useAppStore, type AppStore } from '../store';

/**
 * [ms] Collapse a burst of store writes into one upload.
 *
 * The burst this exists for is real: dragging a lead time, or logging a set that completes a
 * session, rewrites a slice several times in a second. Each rewrite changes the schedule hash,
 * and each upload is a PUT of up to 200 instants.
 */
const DEBOUNCE_MS = 2000;

/**
 * Did this store transition touch anything `computeReminderInstants` reads?
 *
 * Compared by REFERENCE, not by value. Every store action replaces the maps it writes and
 * returns the state object untouched when it changes nothing (src/store/reminderActions.ts
 * says why), so identity is already the store's own no-op signal and a deep comparison would
 * only cost a walk of the whole document on every keystroke anywhere in the app.
 *
 * `pushDevice` is deliberately absent. A successful sync writes the device back, so a
 * subscription that included it would schedule the next sync from the result of the last one,
 * for ever. The device is also not an input to the schedule: it decides where the reminders
 * go, never when.
 */
function scheduleInputsChanged(next: AppStore, previous: AppStore): boolean {
  return (
    next.activeProfileId !== previous.activeProfileId ||
    next.profiles !== previous.profiles || // the timezone every instant is computed in
    next.availability !== previous.availability || // the slots that give each day its time
    next.plans !== previous.plans ||
    next.cursors !== previous.cursors ||
    next.pauses !== previous.pauses ||
    next.assignments !== previous.assignments || // a completed day emits no reminder
    next.reminderSettings !== previous.reminderSettings
  );
}

/**
 * Keeps the Worker's copy of the schedule in step with the store. Renders nothing.
 *
 * Three triggers, and the reason for each:
 *   MOUNT       the app was opened, possibly days after the last upload.
 *   VISIBILITY  the tab came back. The Worker prunes each reminder once it has fired, so a
 *               device whose plan never changes runs dry at the end of the 21 day horizon;
 *               SYNC_MAX_AGE_MS inside syncSchedule is what forces the refresh, and this is
 *               the event that gives it a chance to.
 *   STORE       the schedule itself changed. Debounced, and filtered to the slices that
 *               actually feed it.
 *
 * Cheapness is the client's, not this component's: `syncSchedule` returns "unchanged" without
 * a request when the hash matches and the last acknowledged upload is under SYNC_MAX_AGE_MS
 * old, so a trigger that fires needlessly costs one calendar projection.
 *
 * Recovery. A 403 or 404 means the Worker record is not ours: it was pruned, or it belongs to
 * another secret. Every further sync repeats it, so the device is cleared and a new
 * subscription is minted ONCE per mount. Not in a loop: if the fresh subscription is refused
 * as well, staleness was not the fault, and retrying would only spend the browser's one-shot
 * permission prompt against it.
 */
export function ReminderSync(): null {
  /** True while a sync is awaiting the network. Refs, not closure state: they must survive the
   *  effect being torn down and re-run, which React does on every StrictMode mount. */
  const inFlight = useRef(false);
  const recovered = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A build with no Worker origin or no VAPID key has nothing to sync to. Nothing is
    // attached at all, rather than attaching listeners that would call a client which can only
    // answer "unconfigured".
    if (!REMINDERS_CONFIGURED) return;

    let cancelled = false;

    const store = () => useAppStore.getState();

    const run = async (): Promise<void> => {
      if (cancelled || inFlight.current) return;
      const state = store();
      const profileId = state.activeProfileId;
      if (profileId === null) return;
      inFlight.current = true;
      try {
        // The clock is read here and passed in: neither the client nor the domain reads one.
        const result = await syncSchedule(state, profileId, Date.now()); // [ms] epoch, UTC
        if (cancelled) return;
        if (result.status === 'synced') {
          store().setPushDevice(result.device);
          return;
        }
        if (result.status !== 'stale-device' || recovered.current) return;

        recovered.current = true;
        // Cleared BEFORE the new subscription is asked for, so a refused re-subscribe leaves
        // no record behind that the next sync would fail against all over again.
        store().setPushDevice(null);
        const fresh = await subscribe(VAPID_PUBLIC_KEY, null, Date.now());
        if (cancelled || !fresh.ok) return;
        store().setPushDevice(fresh.device);
        // One upload against the new device. `subscribe` resets lastSyncAt and lastSyncHash,
        // so this cannot short circuit on "unchanged", and the Worker ends the recovery
        // holding the schedule rather than waiting for the next visibility change.
        const retry = await syncSchedule(store(), profileId, Date.now());
        if (!cancelled && retry.status === 'synced') store().setPushDevice(retry.device);
      } finally {
        inFlight.current = false;
      }
    };

    const debounced = (): void => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, DEBOUNCE_MS);
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void run();
    };

    void run();
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribeStore = useAppStore.subscribe((next, previous) => {
      if (scheduleInputsChanged(next, previous)) debounced();
    });

    return () => {
      cancelled = true;
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeStore();
    };
  }, []);

  return null;
}
