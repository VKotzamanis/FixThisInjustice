// src/app/ReminderSync.test.tsx
//
// The app-level schedule sync. Against the REAL store and a mocked client, so what is pinned
// here is the trigger policy, not the upload: when a sync is issued, when one is suppressed,
// and what happens to the stored device when the Worker no longer recognises it.
//
// The four rules this file exists to hold:
//   1. One sync on mount, one on every return to visibility.
//   2. A schedule edit syncs once per 2 s window, not once per keystroke.
//   3. Never two syncs in flight at the same time.
//   4. "stale-device" clears the device and re-subscribes ONCE. A loop would spend the
//      permission prompt against a refusal that is not about staleness at all.
//
// Units: every timestamp is epoch milliseconds, UTC.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { ReminderSync } from './ReminderSync';
import { subscribe, syncSchedule } from '../domain/reminders/client';
import { FIXTURE_PROFILE_ID, makeAppState } from '../domain/reminders/state.fixture';
import { useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import type { PushDevice } from '../domain/types';

const config = vi.hoisted(() => ({
  configured: true,
  // 87 base64url characters decode to 65 bytes, the length of an uncompressed P-256 point.
  vapid: `BP${'A'.repeat(85)}` as string | null,
}));

vi.mock('../config/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/reminders')>();
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

vi.mock('../domain/reminders/client', () => ({
  subscribe: vi.fn(),
  syncSchedule: vi.fn(),
}));

const subscribeMock = vi.mocked(subscribe);
const syncMock = vi.mocked(syncSchedule);

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

const FRESH: PushDevice = { ...DEVICE, deviceId: '1a2b3c4d-5e6f-4071-8a1b-2c3d4e5f6071' };

/** [ms] The component's debounce window. Kept as a literal so a change to it fails here. */
const DEBOUNCE_MS = 2000;

function seed(device: PushDevice | null = DEVICE): void {
  useAppStore.setState(
    makeAppState({
      settings: { enabled: true, dayOfTime: '08:00', leadMinutes: [120] }, // [min]
      pushDevice: device,
    }),
  );
}

/** Lets every pending microtask settle inside act, so React sees the state writes. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Announces a return to visibility and lets the sync it starts settle inside act. */
async function visibility(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
}

/** Edits a slice the schedule is computed from. */
function editSchedule(dayOfTime: string): void {
  act(() => {
    useAppStore
      .getState()
      .setReminderSettings(FIXTURE_PROFILE_ID, { enabled: true, dayOfTime, leadMinutes: [120] });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  installFakeStorage();
  syncMock.mockReset();
  subscribeMock.mockReset();
  config.configured = true;
  config.vapid = `BP${'A'.repeat(85)}`;
  syncMock.mockResolvedValue({ status: 'unchanged' });
  subscribeMock.mockResolvedValue({ ok: true, device: FRESH });
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReminderSync', () => {
  it('renders nothing', () => {
    const { container } = render(<ReminderSync />);
    expect(container.firstChild).toBeNull();
  });

  it('syncs once on mount', async () => {
    render(<ReminderSync />);
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeProfileId: FIXTURE_PROFILE_ID }),
      FIXTURE_PROFILE_ID,
      expect.any(Number),
    );
  });

  it('does not sync when no profile is active', async () => {
    useAppStore.setState({ activeProfileId: null });
    render(<ReminderSync />);
    await flush();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('syncs again when the document becomes visible', async () => {
    render(<ReminderSync />);
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });
    await visibility();
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(2);
    });
  });

  it('never runs two syncs at once', async () => {
    let release = (): void => undefined;
    syncMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ status: 'unchanged' });
          };
        }),
    );
    render(<ReminderSync />);
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });

    await visibility();
    await visibility();
    expect(syncMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await Promise.resolve();
    });
    await visibility();
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(2);
    });
  });

  it('debounces a burst of schedule edits into a single sync', async () => {
    render(<ReminderSync />);
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });

    editSchedule('07:00');
    editSchedule('07:15');
    editSchedule('07:30');
    expect(syncMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(2);
    });
  });

  it('ignores a store change the schedule does not read', async () => {
    render(<ReminderSync />);
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });

    // The device is not an input to computeReminderInstants. Were it subscribed to, storing
    // the device a sync just returned would schedule the next sync, and so on for ever.
    act(() => {
      useAppStore.getState().setPushDevice(SYNCED);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('stores the device a successful sync returns', async () => {
    syncMock.mockResolvedValue({ status: 'synced', device: SYNCED });
    render(<ReminderSync />);
    await waitFor(() => {
      expect(useAppStore.getState().pushDevice).toEqual(SYNCED);
    });
  });

  it('clears the device and re-subscribes once when the Worker no longer knows it', async () => {
    syncMock.mockResolvedValueOnce({ status: 'stale-device', error: 'HTTP 404' });
    syncMock.mockResolvedValue({ status: 'synced', device: SYNCED });
    const cleared: (PushDevice | null)[] = [];
    const unsubscribeStore = useAppStore.subscribe((state) => {
      cleared.push(state.pushDevice);
    });

    render(<ReminderSync />);
    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    });
    unsubscribeStore();

    // Cleared first, then replaced: the stale record must not survive a failed re-subscribe.
    expect(cleared[0]).toBeNull();
    expect(subscribeMock).toHaveBeenCalledWith(config.vapid, null, expect.any(Number));
    await waitFor(() => {
      expect(useAppStore.getState().pushDevice).toEqual(SYNCED);
    });
  });

  it('re-subscribes only once, however often the Worker refuses', async () => {
    syncMock.mockResolvedValue({ status: 'stale-device', error: 'HTTP 403' });
    subscribeMock.mockResolvedValue({ ok: false, reason: 'failed' });

    render(<ReminderSync />);
    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    });

    await visibility();
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(2);
    });
    // A second refusal is not evidence of staleness, so it buys no second prompt.
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().pushDevice).toBeNull();
  });

  it('removes its listeners on unmount', async () => {
    const view = render(<ReminderSync />);
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledTimes(1);
    });
    view.unmount();

    document.dispatchEvent(new Event('visibilitychange'));
    editSchedule('06:45');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all on a build with no reminder configuration', async () => {
    config.configured = false;
    config.vapid = null;
    render(<ReminderSync />);
    await flush();
    expect(syncMock).not.toHaveBeenCalled();
  });
});
