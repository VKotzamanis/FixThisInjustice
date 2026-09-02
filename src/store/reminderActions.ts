// src/store/reminderActions.ts
//
// The store's reminder actions (master plan section 6.7, P5). Structured like
// src/store/motivationActions.ts: a slice built from an adapter over zustand's `set`, so the
// slice sees a pure AppState -> AppState transition and knows nothing about zustand,
// persistence or the status slice.
//
// No error channel, for the same reason motivationActions.ts has none: neither action can be
// REFUSED. Writing a preference and recording the device this browser subscribed with are
// always honoured. The one thing that can go wrong is a caller handing over a profile id
// nobody owns, and that is a defect rather than a refusal, so it throws and reaches
// RootErrorBoundary with its stack (`reminderSettings` is one of the profile-keyed maps the
// schema's root refinement checks, so a write under an unowned key would produce a document
// that cannot be saved and would lose data silently at the next load).
//
// Neither action talks to the network. Subscribing, unsubscribing and uploading the schedule
// live in src/domain/reminders/client.ts, which stores nothing; this slice is the only place
// their results are written down, and the caller decides which result to write. In particular
// `setPushDevice(null)` records that this browser no longer holds a subscription; it does NOT
// delete the Worker's record, which is `unsubscribe`'s job and must be awaited first.
//
// Units: PushDevice.createdAt and lastSyncAt are epoch milliseconds, UTC.
// ReminderSettings.leadMinutes are minutes before a slot's start time.

import { requireProfile } from './scheduleActions';
import type { AppState, PushDevice, ReminderSettings } from '../domain/types';

export interface ReminderActionDeps {
  /** Applies a pure AppState transition. Zustand's `set` is adapted to this in index.ts. */
  set(updater: (state: AppState) => AppState): void;
}

export interface ReminderActions {
  /**
   * Replaces the reminder preferences of one profile.
   *
   * Whole record, not a patch: the three fields are read together by
   * `computeReminderInstants`, and a patch API would let a caller enable reminders without
   * ever having chosen the times they fire at.
   *
   * An unchanged write is a no-op by identity. The persistence subscription compares the
   * persisted top-level fields by reference, so minting a new map for a settings object equal
   * to the stored one would cost a save and re-render every subscriber for nothing. Equality
   * is compared field by field, `leadMinutes` element by element: the array arrives fresh from
   * the settings panel on every keystroke, so reference equality alone would never fire.
   */
  setReminderSettings(profileId: string, settings: ReminderSettings): void;
  /**
   * Records the Web Push registration this browser holds, or clears it with null.
   *
   * Not keyed by a profile: `AppState.pushDevice` is one per device, not per profile
   * (src/domain/types.ts), because the subscription belongs to the browser and every profile
   * on it shares the endpoint. So there is no requireProfile guard here, and none is needed.
   *
   * Clearing is a local fact only. It says this browser no longer holds a subscription; the
   * Worker's copy is deleted by `unsubscribe`, which the caller must await BEFORE writing
   * enabled = false or clearing the device, or the record is left sending
   * (src/domain/reminders/client.ts, rule 2 of the caller contract).
   */
  setPushDevice(device: PushDevice | null): void;
}

/** Are these the settings already stored? Element-wise on leadMinutes: see the doc comment. */
function sameSettings(a: ReminderSettings | undefined, b: ReminderSettings): boolean {
  if (a === undefined) return false;
  if (a.enabled !== b.enabled || a.dayOfTime !== b.dayOfTime) return false;
  if (a.leadMinutes.length !== b.leadMinutes.length) return false;
  return a.leadMinutes.every((minutes, index) => minutes === b.leadMinutes[index]);
}

export function createReminderActions(deps: ReminderActionDeps): ReminderActions {
  return {
    setReminderSettings: (profileId, settings) => {
      deps.set((s) => {
        requireProfile(s, 'setReminderSettings', profileId);
        if (sameSettings(s.reminderSettings[profileId], settings)) return s;
        return {
          ...s,
          // The array is copied so a caller that keeps mutating the one it passed cannot
          // change the stored document behind the persistence subscription's back.
          reminderSettings: {
            ...s.reminderSettings,
            [profileId]: { ...settings, leadMinutes: [...settings.leadMinutes] },
          },
        };
      });
    },

    setPushDevice: (device) => {
      deps.set((s) => {
        // Identity is the no-op signal here too. Clearing an already absent device is the
        // common case: it is what the sync effect does on every "stale-device" result.
        if (s.pushDevice === device) return s;
        if (s.pushDevice === null && device === null) return s;
        return { ...s, pushDevice: device };
      });
    },
  };
}
