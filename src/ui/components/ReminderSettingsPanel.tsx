import { useCallback, useState, type JSX } from 'react';
import {
  DEFAULT_REMINDER_SETTINGS,
  LEAD_MINUTE_CHOICES,
  REMINDERS_CONFIGURED,
  VAPID_PUBLIC_KEY,
} from '../../config/reminders';
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { localTimeOf } from '../../domain/dates';
import {
  pushAvailability,
  subscribe,
  syncSchedule,
  unsubscribe,
  type SubscribeFailure,
} from '../../domain/reminders/client';
import type { EpochMs, LocalTime, ReminderSettings, TimeZone } from '../../domain/types';
import { useAppStore } from '../../store';
import { InstallGuide } from './InstallGuide';

/**
 * What the panel can offer, in the order it is decided. The order is the point: a build with
 * no Worker origin cannot subscribe whatever the runtime supports, and a runtime with no
 * PushManager cannot subscribe whatever the permission says, so each state is only reachable
 * once every state above it has been ruled out.
 */
export type ReminderStatus =
  | 'not-configured'
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'off'
  | 'needs-reenable'
  | 'active';

/** The copy key each state renders, and the two states that carry a value instead. */
const STATUS_COPY: Readonly<Record<Exclude<ReminderStatus, 'active'>, CopyKey>> = {
  'not-configured': 'status.remindersUnconfigured',
  unsupported: 'status.remindersUnsupported',
  'needs-install': 'status.remindersNeedInstall',
  denied: 'status.remindersDenied',
  off: 'status.remindersOff',
  'needs-reenable': 'status.remindersNeedReenable',
};

/**
 * The one line the panel is about.
 *
 * @param lastSyncAt [ms] epoch, UTC: when the Worker last acknowledged a schedule, or null.
 * @param timezone   the PROFILE's zone, not the device's. The sync happened at one instant;
 *                   which wall clock it is reported as is a property of the profile, and
 *                   reporting it in the device zone would move the time when the user travels.
 * @param overrides  the active skin's table. Pure and optional, so the suite can call this
 *                   with no React tree and get the clinical sentence it always got.
 */
export function statusLine(
  status: ReminderStatus,
  lastSyncAt: EpochMs | null,
  timezone: TimeZone,
  overrides?: Partial<Record<CopyKey, string>>,
): string {
  if (status !== 'active') return copy(STATUS_COPY[status], overrides);
  if (lastSyncAt === null) return copy('status.remindersPending', overrides);
  return FORMAT.remindersActive(localTimeOf(lastSyncAt, timezone), overrides);
}

/** The user-facing sentence for a refusal from subscribe(). The reason itself is never shown. */
function failureCopy(reason: SubscribeFailure): CopyKey {
  switch (reason) {
    case 'denied':
      return 'status.remindersDenied';
    case 'not-configured':
      return 'status.remindersUnconfigured';
    case 'not-installed':
      return 'status.remindersNeedInstall';
    case 'unsupported':
      return 'status.remindersUnsupported';
    case 'failed':
      return 'advice.reminderSubscribeFailed';
  }
}

/**
 * Has the user already refused notifications for this origin?
 *
 * Read at render rather than held in state, so lifting the block in the browser and coming
 * back to this screen shows the toggle working again. The guard is for jsdom and for any
 * runtime without the constructor; it is not a capability test, which is what
 * `pushAvailability()` is for.
 */
function permissionDenied(): boolean {
  if (typeof Notification === 'undefined') return false;
  return Notification.permission === 'denied';
}

/**
 * Reminder settings (master plan section 6.6).
 *
 * Store-wired and prop-free: SettingsView mounts it as one row. Every capability decision is
 * feature detection through `pushAvailability()`; nothing here parses a user-agent string, so
 * the panel cannot claim a platform limitation that the runtime in front of it does not have.
 *
 * Two orderings this component owns, both from the caller contract in
 * src/domain/reminders/client.ts:
 *
 *   ON:  subscribe, store the device, write enabled = true, then upload the schedule. The
 *        upload reads the store, so the device has to be in it first.
 *   OFF: await unsubscribe(device), THEN write enabled = false. In the other order the next
 *        sync short circuits on "disabled" and the Worker record is never deleted, so the
 *        device goes on receiving until its push endpoint dies.
 *
 * What it deliberately does not do: retry. A failed upload leaves the preference alone and
 * says so; src/app/ReminderSync.tsx tries again on the next mount, visibility change or
 * schedule edit, which is where the rate limit and the staleness rule already live.
 */
export function ReminderSettingsPanel(): JSX.Element | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (s.activeProfileId === null ? null : s.profiles[s.activeProfileId] ?? null));
  const stored = useAppStore((s) =>
    s.activeProfileId === null ? undefined : s.reminderSettings[s.activeProfileId],
  );
  const pushDevice = useAppStore((s) => s.pushDevice);

  const t = useCopy();
  const overrides = useCopyOverrides();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CopyKey | null>(null);

  const settings: ReminderSettings = stored ?? DEFAULT_REMINDER_SETTINGS;
  const availability = pushAvailability();

  /*
   * 'needs-reenable' sits between 'active' and 'off', and it is the one state the document
   * alone cannot express: `settings.enabled` is the user's PREFERENCE and `pushDevice` is this
   * browser's SUBSCRIPTION, and the two are stored in different places for a reason. The
   * preference travels in an export; the subscription does not, because `pushDevice.secret` is
   * a bearer credential the export deliberately withholds (src/store/persistence.ts). So an
   * imported document, and the stale-device recovery in the ON branch below, both land here:
   * enabled true, device null, nothing subscribed and nothing queued to send.
   *
   * Reported ABOVE 'active' rather than folded into it. Reading `lastSyncAt === null` as
   * "pending" conflated a browser that has subscribed and is waiting for the Worker to
   * acknowledge a schedule with one that has not subscribed at all, and told the second that
   * reminders were on.
   */
  const status: ReminderStatus = !REMINDERS_CONFIGURED
    ? 'not-configured'
    : availability === 'unsupported'
      ? 'unsupported'
      : availability === 'needs-install'
        ? 'needs-install'
        : permissionDenied()
          ? 'denied'
          : settings.enabled && pushDevice === null
            ? 'needs-reenable'
            : settings.enabled
              ? 'active'
              : 'off';

  // A toggle is offered only where switching it could do something. On 'unsupported' and
  // 'needs-install' the subscribe call cannot succeed, so a disabled switch would be an
  // invitation to a dead end; the status line and the install guide are the whole answer.
  // 'needs-reenable' is NOT one of those: the toggle is the recovery, so it stays offered and
  // enabled, checked, and the user turns it off and on to mint a device for this browser.
  const offersToggle = status !== 'unsupported' && status !== 'needs-install';

  const handleToggle = useCallback(
    (enabled: boolean): void => {
      if (profileId === null || busy) return;
      // Never call subscribe on a build that carried no Worker origin or no VAPID key. The
      // disabled attribute is not the guard: a synthetic change event reaches a disabled input
      // in jsdom, and a future skin could style the control rather than disable it.
      if (enabled && (!REMINDERS_CONFIGURED || VAPID_PUBLIC_KEY === null)) return;
      setBusy(true);
      setError(null);
      void (async () => {
        try {
          if (enabled) {
            // The stored device is handed over so a subscription the browser already holds
            // keeps its deviceId and secret, rather than stranding a Worker record that would
            // go on sending.
            const result = await subscribe(VAPID_PUBLIC_KEY, pushDevice, Date.now());
            if (!result.ok) {
              setError(failureCopy(result.reason));
              return;
            }
            useAppStore.getState().setPushDevice(result.device);
            useAppStore.getState().setReminderSettings(profileId, { ...settings, enabled: true });
            const sync = await syncSchedule(useAppStore.getState(), profileId, Date.now());
            if (sync.status === 'synced') useAppStore.getState().setPushDevice(sync.device);
            // 'stale-device' here means the Worker does not know the device this client just
            // registered. Re-subscribing would spend another round trip on the same refusal,
            // so the record is dropped and the next sync (mount, visibility, or an edit)
            // starts again from no-device. src/app/ReminderSync.tsx owns that recovery.
            else if (sync.status === 'stale-device') {
              useAppStore.getState().setPushDevice(null);
              setError('advice.reminderSyncFailed');
            } else if (sync.status === 'failed') setError('advice.reminderSyncFailed');
          } else {
            // Worker first, store second: see the component comment. The local disable always
            // runs, even when the Worker delete fails, so the user is never stuck with the
            // switch reading "on" while believing they turned it off; the failure is still
            // surfaced so it is not silent, using the nearest existing copy (there is no key
            // specific to an unsubscribe failure among status.reminders*/advice.reminder*).
            if (pushDevice !== null) {
              const result = await unsubscribe(pushDevice);
              if (!result.ok) setError('advice.reminderSyncFailed');
            }
            useAppStore.getState().setPushDevice(null);
            useAppStore.getState().setReminderSettings(profileId, { ...settings, enabled: false });
          }
        } catch {
          // Neither subscribe() nor syncSchedule() is contracted to throw (both resolve with a
          // result object), so reaching here means something failed outside that contract. No
          // store write in the ON branch happens before subscribe() resolves, so the only thing
          // to undo is a write from later in this same attempt (e.g. setPushDevice(result.device)
          // succeeding before a later step throws); both writes are reset to the values this
          // closure captured at the start of the attempt (`pushDevice`, `settings`), which are
          // no-ops (by the identity checks in reminderActions.ts) when nothing had actually
          // changed yet.
          useAppStore.getState().setPushDevice(pushDevice);
          useAppStore.getState().setReminderSettings(profileId, settings);
          setError('advice.reminderSubscribeFailed');
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, profileId, pushDevice, settings],
  );

  const handleDayOfTime = useCallback(
    (time: LocalTime): void => {
      if (profileId === null) return;
      useAppStore.getState().setReminderSettings(profileId, { ...settings, dayOfTime: time });
    },
    [profileId, settings],
  );

  const handleLeadToggle = useCallback(
    (minutes: number, on: boolean): void => {
      if (profileId === null) return;
      // Longest lead first, which is the order the user meets them; the set removes a
      // duplicate that a repeated click could otherwise introduce.
      const next = on
        ? [...new Set([...settings.leadMinutes, minutes])].sort((a, b) => b - a) // [min]
        : settings.leadMinutes.filter((value) => value !== minutes);
      useAppStore.getState().setReminderSettings(profileId, { ...settings, leadMinutes: next });
    },
    [profileId, settings],
  );

  if (profile === null) return null;

  return (
    <section className="fti-reminders" aria-labelledby="fti-reminders-heading">
      <h2 id="fti-reminders-heading">{t('hero.reminders')}</h2>
      <p role="status">
        {statusLine(status, pushDevice?.lastSyncAt ?? null, profile.timezone, overrides)}
      </p>
      {error === null ? null : <p className="view-note">{t(error)}</p>}

      {offersToggle ? (
        <label className="view-inline">
          <input
            type="checkbox"
            aria-label={t('label.remindersEnable')}
            checked={settings.enabled}
            disabled={busy || status === 'not-configured'}
            onChange={(event) => {
              handleToggle(event.target.checked);
            }}
          />
          {t('label.remindersEnable')}
        </label>
      ) : null}

      {settings.enabled ? (
        <>
          <label className="view-inline">
            {t('label.reminderDayOfTime')}
            <input
              type="time"
              aria-label={t('label.reminderDayOfTime')}
              value={settings.dayOfTime}
              disabled={busy}
              onChange={(event) => {
                handleDayOfTime(event.target.value);
              }}
            />
          </label>

          <fieldset>
            <legend>{t('label.reminderLeadTimes')}</legend>
            {LEAD_MINUTE_CHOICES.map((minutes) => (
              <label className="view-inline" key={minutes}>
                <input
                  type="checkbox"
                  aria-label={FORMAT.reminderLead(minutes, overrides)}
                  checked={settings.leadMinutes.includes(minutes)}
                  disabled={busy}
                  onChange={(event) => {
                    handleLeadToggle(minutes, event.target.checked);
                  }}
                />
                {FORMAT.reminderLead(minutes, overrides)}
              </label>
            ))}
          </fieldset>
        </>
      ) : null}

      {status === 'needs-install' ? <InstallGuide /> : null}
    </section>
  );
}
