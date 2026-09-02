// src/ui/components/ReminderSettingsPanel.test.tsx
//
// The reminder settings panel, against the REAL store and a mocked client. The client is the
// only thing stubbed: every assertion about what was written is made against the document the
// views read, so a wiring mistake between the panel and src/store/reminderActions.ts fails
// here rather than in a browser.
//
// The two orderings this file exists to pin, both of them from the caller contract in
// src/domain/reminders/client.ts:
//   1. Switching ON: subscribe, then store the device, then upload the schedule. Uploading
//      before the device is stored would send against a device the store does not know.
//   2. Switching OFF: unsubscribe FIRST, then write enabled = false. In the other order
//      syncSchedule short circuits on "disabled", the Worker record is never deleted, and the
//      device keeps receiving until its endpoint dies.
//
// Units: every timestamp is epoch milliseconds, UTC. Lead times are minutes before the slot.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReminderSettingsPanel } from './ReminderSettingsPanel';
import { FORMAT, copy } from '../../content/copy';
import { LEAD_MINUTE_CHOICES } from '../../config/reminders';
import { localTimeOf } from '../../domain/dates';
import {
  pushAvailability,
  subscribe,
  syncSchedule,
  unsubscribe,
} from '../../domain/reminders/client';
import {
  FIXTURE_PROFILE_ID,
  FIXTURE_TIMEZONE,
  makeAppState,
} from '../../domain/reminders/state.fixture';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import type { PushDevice } from '../../domain/types';

/**
 * The two build variables the panel reads, made writable so one test can run against a build
 * that carried neither. The mock exposes getters, not copied values, so the panel sees the
 * change on its next read rather than the value at module-load time.
 */
const config = vi.hoisted(() => ({
  configured: true,
  // 87 base64url characters decode to 65 bytes, the length of an uncompressed P-256 point.
  vapid: `BP${'A'.repeat(85)}` as string | null,
}));

vi.mock('../../config/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/reminders')>();
  return {
    ...actual,
    get REMINDERS_CONFIGURED(): boolean {
      return config.configured;
    },
    get VAPID_PUBLIC_KEY(): string | null {
      return config.vapid;
    },
  };
});

vi.mock('../../domain/reminders/client', () => ({
  pushAvailability: vi.fn(() => 'ready'),
  subscribe: vi.fn(),
  syncSchedule: vi.fn(),
  unsubscribe: vi.fn(),
}));

const availabilityMock = vi.mocked(pushAvailability);
const subscribeMock = vi.mocked(subscribe);
const syncMock = vi.mocked(syncSchedule);
const unsubscribeMock = vi.mocked(unsubscribe);

/** Mon 2026-10-26 17:00 in America/Chicago (CDT, UTC-5). [ms] epoch, UTC. */
const OCT26_1700 = 1_793_052_000_000;

const DEVICE: PushDevice = {
  deviceId: '0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071',
  secret: 's'.repeat(43),
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BNcRd', auth: 'tBHI' },
  createdAt: OCT26_1700, // [ms] epoch, UTC
  lastSyncAt: null,
  lastSyncHash: null,
};

const SYNCED: PushDevice = { ...DEVICE, lastSyncAt: OCT26_1700, lastSyncHash: 'deadbeef' };

function seed(options: { enabled?: boolean; device?: PushDevice | null } = {}): void {
  useAppStore.setState(
    makeAppState({
      settings: {
        enabled: options.enabled ?? false,
        dayOfTime: '08:00', // local wall clock in the profile's zone
        leadMinutes: [120], // [min] before the slot start
      },
      pushDevice: options.device ?? null,
    }),
  );
}

function settings(): { enabled: boolean; dayOfTime: string; leadMinutes: number[] } | undefined {
  return useAppStore.getState().reminderSettings[FIXTURE_PROFILE_ID];
}

/** Clicks a control and flushes the promise chain the click starts. */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
    // The click starts a promise chain (subscribe, then syncSchedule); yielding once inside
    // act lets React see the state writes it produces rather than warning about them.
    await Promise.resolve();
  });
}

function toggle(): HTMLInputElement {
  return screen.getByLabelText(copy('label.remindersEnable'));
}

beforeEach(() => {
  installFakeStorage();
  // The four client stubs are module-level vi.fn()s, so `restoreMocks` does not clear their
  // call history between tests: every "was it called" assertion below would otherwise see the
  // previous test's calls.
  for (const mock of [availabilityMock, subscribeMock, syncMock, unsubscribeMock]) {
    mock.mockReset();
  }
  config.configured = true;
  config.vapid = `BP${'A'.repeat(85)}`;
  availabilityMock.mockReturnValue('ready');
  subscribeMock.mockResolvedValue({ ok: true, device: DEVICE });
  syncMock.mockResolvedValue({ status: 'synced', device: SYNCED });
  unsubscribeMock.mockResolvedValue({ ok: true, error: null });
  // jsdom implements no Notification, so the permission is stubbed rather than read.
  vi.stubGlobal('Notification', { permission: 'default' });
  seed();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('switching reminders on', () => {
  it('subscribes, stores the device, then uploads the schedule', async () => {
    render(<ReminderSettingsPanel />);
    await click(toggle());

    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(config.vapid, null, expect.any(Number));
    expect(settings()?.enabled).toBe(true);
    expect(useAppStore.getState().pushDevice).toEqual(SYNCED);
  });

  it('hands subscribe the device already stored, so the Worker record is reused', async () => {
    seed({ device: DEVICE });
    render(<ReminderSettingsPanel />);
    await click(toggle());
    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledWith(config.vapid, DEVICE, expect.any(Number));
    });
  });

  it('reports a refused subscription as copy and enables nothing', async () => {
    subscribeMock.mockResolvedValue({ ok: false, reason: 'failed' });
    render(<ReminderSettingsPanel />);
    await click(toggle());

    await waitFor(() => {
      expect(screen.getByText(copy('advice.reminderSubscribeFailed'))).toBeInTheDocument();
    });
    expect(settings()?.enabled).toBe(false);
    expect(useAppStore.getState().pushDevice).toBeNull();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('reports the generic failure and rolls back when subscribe rejects', async () => {
    // subscribe() is a caller contract that resolves with {ok, reason} rather than throwing,
    // but nothing in this component enforces that at the type level, and a runtime failure
    // upstream of that contract (e.g. a bug in the client, or a mock in test) must not leave
    // an unhandled rejection with no user-visible copy and no store write undone.
    subscribeMock.mockRejectedValue(new Error('boom'));
    seed({ device: DEVICE });
    render(<ReminderSettingsPanel />);
    await click(toggle());

    await waitFor(() => {
      expect(screen.getByText(copy('advice.reminderSubscribeFailed'))).toBeInTheDocument();
    });
    // Nothing was written before subscribe threw, so "roll back" here means the pre-attempt
    // pushDevice/settings are left exactly as seeded, not merely coincidentally unchanged.
    expect(useAppStore.getState().pushDevice).toEqual(DEVICE);
    expect(settings()?.enabled).toBe(false);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('reports a denied permission with the copy that names where to allow it', async () => {
    subscribeMock.mockResolvedValue({ ok: false, reason: 'denied' });
    render(<ReminderSettingsPanel />);
    await click(toggle());

    await waitFor(() => {
      expect(screen.getByText(copy('status.remindersDenied'))).toBeInTheDocument();
    });
    expect(settings()?.enabled).toBe(false);
  });

  it('reports a failed upload as copy and keeps the raw error out of the page', async () => {
    syncMock.mockResolvedValue({ status: 'failed', error: 'HTTP 500' });
    const { container } = render(<ReminderSettingsPanel />);
    await click(toggle());

    await waitFor(() => {
      expect(screen.getByText(copy('advice.reminderSyncFailed'))).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('HTTP 500');
    // The subscription itself succeeded, so the preference stands and the next sync retries.
    expect(settings()?.enabled).toBe(true);
  });

  it('refuses a second request while one is in flight', async () => {
    let release = (): void => undefined;
    subscribeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ ok: true, device: DEVICE });
          };
        }),
    );
    render(<ReminderSettingsPanel />);
    await click(toggle());
    expect(toggle().disabled).toBe(true);

    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(toggle().disabled).toBe(false);
    });
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });
});

describe('switching reminders off', () => {
  it('deletes the Worker record before it writes enabled = false', async () => {
    seed({ enabled: true, device: SYNCED });
    let enabledWhenUnsubscribed: boolean | null = null;
    unsubscribeMock.mockImplementation(() => {
      enabledWhenUnsubscribed = settings()?.enabled ?? null;
      return Promise.resolve({ ok: true, error: null });
    });

    render(<ReminderSettingsPanel />);
    await click(toggle());

    await waitFor(() => {
      expect(settings()?.enabled).toBe(false);
    });
    expect(unsubscribeMock).toHaveBeenCalledWith(SYNCED);
    // The whole point of the ordering: the record was still live when the DELETE went out.
    expect(enabledWhenUnsubscribed).toBe(true);
    expect(useAppStore.getState().pushDevice).toBeNull();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('writes enabled = false even when the Worker delete fails', async () => {
    seed({ enabled: true, device: SYNCED });
    unsubscribeMock.mockResolvedValue({ ok: false, error: 'network' });
    render(<ReminderSettingsPanel />);
    await click(toggle());

    // An orphaned Worker record stops sending on its own once the endpoint dies; a user who
    // switched reminders off must not be left with the switch back on.
    await waitFor(() => {
      expect(settings()?.enabled).toBe(false);
    });
    // The local state clears regardless, but the failure must not be silent: there is no copy
    // key specific to an unsubscribe failure (grepped status.reminders*/advice.reminder*), so
    // this reuses advice.reminderSyncFailed, the nearest existing "did not reach the server"
    // copy for a Worker-side push failure.
    expect(useAppStore.getState().pushDevice).toBeNull();
    expect(screen.getByText(copy('advice.reminderSyncFailed'))).toBeInTheDocument();
  });
});

describe('the schedule controls', () => {
  it('offers exactly the configured lead times', () => {
    seed({ enabled: true, device: SYNCED });
    render(<ReminderSettingsPanel />);
    for (const minutes of LEAD_MINUTE_CHOICES) {
      expect(screen.getByLabelText(FORMAT.reminderLead(minutes))).toBeInTheDocument();
    }
  });

  it('adds a lead time, longest first', async () => {
    seed({ enabled: true, device: SYNCED });
    render(<ReminderSettingsPanel />);
    await click(screen.getByLabelText(FORMAT.reminderLead(60)));
    expect(settings()?.leadMinutes).toEqual([120, 60]); // [min], descending
  });

  it('removes a lead time', async () => {
    seed({ enabled: true, device: SYNCED });
    render(<ReminderSettingsPanel />);
    await click(screen.getByLabelText(FORMAT.reminderLead(120)));
    expect(settings()?.leadMinutes).toEqual([]);
  });

  it('writes the day-of reminder time', () => {
    seed({ enabled: true, device: SYNCED });
    render(<ReminderSettingsPanel />);
    fireEvent.change(screen.getByLabelText(copy('label.reminderDayOfTime')), {
      target: { value: '07:30' },
    });
    expect(settings()?.dayOfTime).toBe('07:30');
  });

  it('hides the schedule controls while reminders are off', () => {
    render(<ReminderSettingsPanel />);
    expect(screen.queryByLabelText(copy('label.reminderDayOfTime'))).toBeNull();
  });
});

describe('the status line', () => {
  it('reports the last sync in the profile timezone, not in UTC', () => {
    seed({ enabled: true, device: SYNCED });
    render(<ReminderSettingsPanel />);
    // 17:00 in America/Chicago; the same instant is 22:00 UTC, which must not appear.
    expect(localTimeOf(OCT26_1700, FIXTURE_TIMEZONE)).toBe('17:00');
    expect(screen.getByText(FORMAT.remindersActive('17:00'))).toBeInTheDocument();
  });

  it('says the schedule has not reached the server yet', () => {
    seed({ enabled: true, device: DEVICE });
    render(<ReminderSettingsPanel />);
    expect(screen.getByText(copy('status.remindersPending'))).toBeInTheDocument();
  });

  it('says reminders are off', () => {
    render(<ReminderSettingsPanel />);
    expect(screen.getByText(copy('status.remindersOff'))).toBeInTheDocument();
  });
});

describe('the three availability states', () => {
  it('renders the install guide and no toggle when the runtime needs an install', () => {
    availabilityMock.mockReturnValue('needs-install');
    render(<ReminderSettingsPanel />);
    expect(screen.getByText(copy('status.remindersNeedInstall'))).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: copy('hero.installHomeScreen') }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(copy('label.remindersEnable'))).toBeNull();
  });

  it('reports an unsupported runtime, with no guide and no toggle', () => {
    availabilityMock.mockReturnValue('unsupported');
    render(<ReminderSettingsPanel />);
    expect(screen.getByText(copy('status.remindersUnsupported'))).toBeInTheDocument();
    expect(screen.queryByText(copy('hero.installHomeScreen'))).toBeNull();
    expect(screen.queryByLabelText(copy('label.remindersEnable'))).toBeNull();
  });

  it('offers the toggle when the runtime is ready', () => {
    render(<ReminderSettingsPanel />);
    expect(toggle().disabled).toBe(false);
  });
});

describe('states the panel cannot act on', () => {
  it('reports a standing block and where to lift it', () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    render(<ReminderSettingsPanel />);
    expect(screen.getByText(copy('status.remindersDenied'))).toBeInTheDocument();
  });

  it('reports a standing block even after reminders were already switched on', () => {
    // The plan's order: denial is checked before the enabled branch, so a permission the user
    // revoked after turning reminders on must still surface as denied, not as "Reminders are
    // on" (which would tell the user their reminders will fire when the browser will not
    // deliver them).
    seed({ enabled: true, device: SYNCED });
    vi.stubGlobal('Notification', { permission: 'denied' });
    render(<ReminderSettingsPanel />);
    expect(screen.getByRole('status').textContent).toBe(copy('status.remindersDenied'));
  });

  it('says reminders are not set up on this deployment and disables the toggle', async () => {
    config.configured = false;
    config.vapid = null;
    render(<ReminderSettingsPanel />);
    expect(screen.getByText(copy('status.remindersUnconfigured'))).toBeInTheDocument();
    expect(toggle().disabled).toBe(true);
    await click(toggle());
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('renders nothing when no profile is active', () => {
    useAppStore.setState({ activeProfileId: null });
    const { container } = render(<ReminderSettingsPanel />);
    expect(container.firstChild).toBeNull();
  });
});
