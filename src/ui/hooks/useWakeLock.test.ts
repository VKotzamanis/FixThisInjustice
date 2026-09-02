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

interface FakeWakeLock {
  request: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function installWakeLock(options: { refuse?: boolean } = {}): FakeWakeLock {
  const release = vi.fn(() => Promise.resolve());
  const request = vi.fn(() =>
    options.refuse === true
      ? Promise.reject(new Error('the document is hidden'))
      : Promise.resolve({ release }),
  );
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, release };
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
