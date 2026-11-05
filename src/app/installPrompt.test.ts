import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { promptInstall, runsStandalone, startInstallPromptCapture, useInstallState } from './installPrompt';

function promptEvent(outcome: 'accepted' | 'dismissed'): Event {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(e, { prompt: vi.fn(() => Promise.resolve({ outcome })) });
  return e;
}

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe('install prompt capture (spec R8, audit E04)', () => {
  it('is not standalone in a browser tab (jsdom has no display-mode match)', () => {
    expect(runsStandalone()).toBe(false);
  });

  it("holds Chromium's event, cancels the mini-infobar, and offers the prompt", () => {
    stop = startInstallPromptCapture();
    const { result } = renderHook(() => useInstallState());
    expect(result.current.canPrompt).toBe(false);
    const e = promptEvent('accepted');
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.canPrompt).toBe(true);
  });

  it('prompts once: the event is single-use', async () => {
    stop = startInstallPromptCapture();
    window.dispatchEvent(promptEvent('dismissed'));
    await expect(promptInstall()).resolves.toBe('dismissed');
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('reads as standalone once the app is installed', () => {
    stop = startInstallPromptCapture();
    const { result } = renderHook(() => useInstallState());
    act(() => {
      window.dispatchEvent(promptEvent('accepted'));
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current).toEqual({ standalone: true, canPrompt: false });
  });

  it('reads iOS navigator.standalone', () => {
    const win = { matchMedia: undefined, navigator: { standalone: true } } as unknown as Window;
    expect(runsStandalone(win)).toBe(true);
  });
});
