import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

/**
 * The Screen Wake Lock API is absent from jsdom, so it is installed on `navigator` per test.
 * Support, from REFERENCES.md: caniuse.com/wake-lock gives iOS Safari 16.4+ and Chrome on
 * Android, and WebKit bug 254545 records that the API was broken inside installed Home Screen
 * web apps until iOS/iPadOS 18.4, this project's platform floor. Absence is therefore a normal
 * runtime state, not a failure, and the hook has to report it rather than throw.
 */

/**
 * A stand-in for WakeLockSentinel. The real one is an EventTarget that fires "release" whenever
 * the platform drops the lock (the document is hidden, a battery saver engages, the user
 * revokes it), which is the event the hook has to listen for; a bare `{ release }` object cannot
 * exercise that path, so the listener registry is spelled out here.
 */
interface FakeSentinel {
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  /** Fires "release" on this sentinel, as the platform would. */
  dispatchRelease: () => void;
  /** Listeners still attached; 0 after the hook has cleaned up. */
  listenerCount: () => number;
}

interface FakeWakeLock {
  request: ReturnType<typeof vi.fn>;
  /** Shared across every sentinel this lock hands out, so call counts are cumulative. */
  release: ReturnType<typeof vi.fn>;
  /** One entry per granted request, in order. A second entry means a second lock was taken. */
  sentinels: FakeSentinel[];
  /** Resolves every request left pending by `defer: true`. */
  settle: () => Promise<void>;
}

function installWakeLock(options: { refuse?: boolean; defer?: boolean } = {}): FakeWakeLock {
  const release = vi.fn(() => Promise.resolve());
  const sentinels: FakeSentinel[] = [];
  const pending: (() => void)[] = [];

  const makeSentinel = (): FakeSentinel => {
    const listeners = new Set<() => void>();
    const sentinel: FakeSentinel = {
      release,
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'release') listeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'release') listeners.delete(listener);
      }),
      dispatchRelease: () => {
        act(() => {
          for (const listener of [...listeners]) listener();
        });
      },
      listenerCount: () => listeners.size,
    };
    return sentinel;
  };

  const request = vi.fn(() => {
    if (options.refuse === true) return Promise.reject(new Error('the document is hidden'));
    const sentinel = makeSentinel();
    sentinels.push(sentinel);
    if (options.defer !== true) return Promise.resolve(sentinel);
    return new Promise<FakeSentinel>((resolve) => {
      pending.push(() => {
        resolve(sentinel);
      });
    });
  });

  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return {
    request,
    release,
    sentinels,
    settle: async () => {
      await act(async () => {
        for (const resolve of pending.splice(0)) resolve();
        // Lets the hook's continuation after `await api.request(...)` run inside this act().
        await Promise.resolve();
      });
    },
  };
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useWakeLock', () => {
  it('reports "unsupported" where the API is absent, without throwing', () => {
    expect('wakeLock' in navigator).toBe(false);
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe('unsupported');
  });

  it('requests a screen lock while active and reports "active"', async () => {
    const lock = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    expect(lock.request).toHaveBeenCalledTimes(1);
    expect(lock.request).toHaveBeenCalledWith('screen');
  });

  it('requests nothing while inactive and reports "released"', () => {
    const lock = installWakeLock();
    const { result } = renderHook(() => useWakeLock(false));
    expect(result.current).toBe('released');
    expect(lock.request).not.toHaveBeenCalled();
  });

  it('releases the lock when the caller goes inactive', async () => {
    const lock = installWakeLock();
    const { result, rerender } = renderHook((active: boolean) => useWakeLock(active), {
      initialProps: true,
    });
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    rerender(false);
    await waitFor(() => {
      expect(lock.release).toHaveBeenCalledTimes(1);
    });
    expect(result.current).toBe('released');
  });

  it('releases the lock on unmount', async () => {
    const lock = installWakeLock();
    const { result, unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    unmount();
    await waitFor(() => {
      expect(lock.release).toHaveBeenCalledTimes(1);
    });
  });

  it('re-requests the lock when the document becomes visible again', async () => {
    const lock = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('active');
    });

    // The platform drops the lock as soon as the document is hidden; the hook must not go on
    // reporting a lock it no longer holds.
    setVisibility('hidden');
    expect(result.current).toBe('released');
    expect(lock.request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    expect(lock.request).toHaveBeenCalledTimes(2);
  });

  it('reports "released" when the platform releases the sentinel, and re-requests once', async () => {
    const lock = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    const first = lock.sentinels[0];
    expect(first).toBeDefined();
    expect(first?.addEventListener).toHaveBeenCalledWith('release', expect.any(Function));

    // The platform drops the lock without a visibilitychange under a battery saver, or when the
    // user revokes it. Without the "release" listener the hook goes on reporting "active" for a
    // lock it no longer holds, and the Train view shows a dim-lock that is not there.
    first?.dispatchRelease();
    expect(result.current).toBe('released');

    await waitFor(() => {
      expect(lock.request).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    expect(lock.sentinels).toHaveLength(2);

    // "Once" is a bound, not a description: a platform that granted and immediately released on
    // every attempt would otherwise spin. Recovery after this point runs through
    // visibilitychange, which fires on every return to the foreground.
    lock.sentinels[1]?.dispatchRelease();
    expect(result.current).toBe('released');
    expect(lock.request).toHaveBeenCalledTimes(2);
  });

  it('does not re-request on release while the document is hidden', async () => {
    const lock = installWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('active');
    });

    // The platform auto-releases on hide and fires "release" for it. Requesting again while
    // hidden is refused by every implementation, so the retry is gated on visibility; the
    // visibilitychange path takes it back when the document returns.
    setVisibility('hidden');
    lock.sentinels[0]?.dispatchRelease();
    expect(result.current).toBe('released');
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it('removes the release listener when it lets go of the sentinel', async () => {
    const lock = installWakeLock();
    const { result, unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('active');
    });
    const sentinel = lock.sentinels[0];
    unmount();
    await waitFor(() => {
      expect(lock.release).toHaveBeenCalledTimes(1);
    });
    expect(sentinel?.removeEventListener).toHaveBeenCalledWith('release', expect.any(Function));
    expect(sentinel?.listenerCount()).toBe(0);

    // A late "release" from a sentinel the hook has already dropped must not reach the
    // unmounted hook and must not start a new request.
    sentinel?.dispatchRelease();
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it('issues no second request while the first is still in flight', async () => {
    const lock = installWakeLock({ defer: true });
    renderHook(() => useWakeLock(true));
    expect(lock.request).toHaveBeenCalledTimes(1);

    // request("screen") is async and both the mount path and the visibilitychange path reach
    // it. Two overlapping calls each resolve to their own sentinel; the second overwrites the
    // first, and the first lock is then held with no reference left to release it.
    setVisibility('visible');
    expect(lock.request).toHaveBeenCalledTimes(1);

    await lock.settle();
    expect(lock.sentinels).toHaveLength(1);
  });

  it('reports "denied" when the browser refuses the lock', async () => {
    const lock = installWakeLock({ refuse: true });
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(result.current).toBe('denied');
    });
    expect(lock.request).toHaveBeenCalledTimes(1);
    expect(lock.release).not.toHaveBeenCalled();
  });
});
