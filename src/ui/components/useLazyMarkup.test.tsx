import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MAX_LAZY_MARKUP_ATTEMPTS, useLazyMarkup } from './useLazyMarkup';

describe('useLazyMarkup (audit E12)', () => {
  it('loads once, caches, and returns a cached file on the first render', async () => {
    const cache = new Map<string, string>();
    const load = vi.fn(() => Promise.resolve('<svg/>'));
    const first = renderHook(() => useLazyMarkup('a', load, cache));
    expect(first.result.current).toEqual({ markup: undefined, state: 'loading' });
    await waitFor(() => {
      expect(first.result.current.state).toBe('ready');
    });
    first.unmount();
    const second = renderHook(() => useLazyMarkup('a', load, cache));
    expect(second.result.current).toEqual({ markup: '<svg/>', state: 'ready' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reports a failed load, then retries in place when the browser comes back online', async () => {
    const cache = new Map<string, string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce('<svg id="b"/>');
    const { result } = renderHook(() => useLazyMarkup('b', load, cache));
    await waitFor(() => {
      expect(result.current.state).toBe('failed');
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(result.current).toEqual({ markup: '<svg id="b"/>', state: 'ready' });
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('retries when the page becomes visible again', async () => {
    const cache = new Map<string, string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('<svg id="c"/>');
    const { result } = renderHook(() => useLazyMarkup('c', load, cache));
    await waitFor(() => {
      expect(result.current.state).toBe('failed');
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
  });

  it(`stops after ${String(MAX_LAZY_MARKUP_ATTEMPTS)} attempts`, async () => {
    const cache = new Map<string, string>();
    const load = vi.fn<() => Promise<string>>(() => Promise.reject(new Error('gone')));
    const { result } = renderHook(() => useLazyMarkup('d', load, cache));
    for (let i = 0; i < MAX_LAZY_MARKUP_ATTEMPTS + 2; i += 1) {
      await waitFor(() => {
        expect(result.current.state).toBe('failed');
      });
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
    }
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(MAX_LAZY_MARKUP_ATTEMPTS);
    });
  });

  it('is failed at once when no file exists for the key', async () => {
    const { result } = renderHook(() => useLazyMarkup('none', undefined, new Map()));
    await waitFor(() => {
      expect(result.current).toEqual({ markup: undefined, state: 'failed' });
    });
  });
});
