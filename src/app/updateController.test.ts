import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startUpdateController, type RegisterOptions, type UpdateControllerDeps } from './updateController';
import { UPDATE_POLL_INTERVAL_MS } from './updatePolicy';

/** A page whose visibility the test sets, and whose events the test dispatches. */
function harness(initial: { sessionOpen?: boolean; ready?: boolean; controller?: object | null } = {}) {
  /** navigator.serviceWorker: `controller` is the worker controlling this page, or null. */
  const sw = new EventTarget() as EventTarget & { controller: object | null };
  sw.controller = initial.controller === undefined ? { id: 'v1' } : initial.controller;
  const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  doc.visibilityState = 'visible';
  let sessionOpen = initial.sessionOpen ?? false;
  let ready = initial.ready ?? true;
  const storeListeners = new Set<() => void>();
  let options: RegisterOptions | null = null;
  const applyUpdate = vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve());
  const update = vi.fn(() => Promise.resolve());
  const deps = {
    register: (o: RegisterOptions) => {
      options = o;
      return applyUpdate;
    },
    ready: () => ready,
    isSessionOpen: () => sessionOpen,
    flush: vi.fn(),
    reload: vi.fn(),
    showBanner: vi.fn<(onReload: () => void) => void>(),
    subscribeStore: (l: () => void) => {
      storeListeners.add(l);
      return () => storeListeners.delete(l);
    },
    doc,
    win: window,
    sw,
  } satisfies UpdateControllerDeps;
  const controller = startUpdateController(deps);
  const opts = (): RegisterOptions => {
    if (options === null) throw new Error('register was not called');
    return options;
  };
  return {
    deps,
    controller,
    applyUpdate,
    update,
    registered: () => {
      opts().onRegisteredSW('sw.js', { update } as unknown as ServiceWorkerRegistration);
    },
    waiting: () => {
      opts().onNeedRefresh();
    },
    newWorkerTookControl: () => {
      opts().onNeedReload();
    },
    /** A worker takes control of this page (claim on first install, or an applied update). */
    controllerChange: (id: string) => {
      sw.controller = { id };
      sw.dispatchEvent(new Event('controllerchange'));
    },
    setVisibility: (v: DocumentVisibilityState) => {
      doc.visibilityState = v;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    tap: () => {
      window.dispatchEvent(new Event('pointerdown'));
    },
    setSession: (open: boolean) => {
      sessionOpen = open;
      for (const l of storeListeners) l();
    },
    setReady: (r: boolean) => {
      ready = r;
      for (const l of storeListeners) l();
    },
  };
}

let h: ReturnType<typeof harness> | null = null;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  h?.controller.stop();
  h = null;
  vi.useRealTimers();
});

describe('update checks (audit E01)', () => {
  it('checks for a new worker every time the page becomes visible', () => {
    h = harness();
    h.registered();
    h.setVisibility('hidden');
    h.setVisibility('visible');
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('checks every 30 min while visible, and not while hidden', () => {
    h = harness();
    h.registered();
    vi.advanceTimersByTime(UPDATE_POLL_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.setVisibility('hidden');
    vi.advanceTimersByTime(UPDATE_POLL_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected check (offline)', () => {
    h = harness();
    h.update.mockRejectedValueOnce(new Error('offline'));
    h.registered();
    expect(() => {
      vi.advanceTimersByTime(UPDATE_POLL_INTERVAL_MS);
    }).not.toThrow();
  });
});

describe('a waiting worker (spec R7)', () => {
  it('applies at a cold launch with no session open: flushes, then activates, no banner', () => {
    h = harness();
    h.waiting();
    expect(h.deps.flush).toHaveBeenCalledTimes(1);
    expect(h.applyUpdate).toHaveBeenCalledWith(true);
    expect(h.deps.showBanner).not.toHaveBeenCalled();
  });

  it('decides nothing before the document is read, then applies once it is', () => {
    h = harness({ ready: false });
    h.waiting();
    expect(h.applyUpdate).not.toHaveBeenCalled();
    h.setReady(true);
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows the banner, never applies, while a session is open', () => {
    h = harness({ sessionOpen: true });
    h.waiting();
    h.setVisibility('hidden');
    expect(h.applyUpdate).not.toHaveBeenCalled();
    expect(h.deps.showBanner).toHaveBeenCalled();
  });

  it('applies from the banner only when the user taps it', () => {
    h = harness({ sessionOpen: true });
    h.waiting();
    const onReload = h.deps.showBanner.mock.calls[0]?.[0];
    expect(h.applyUpdate).not.toHaveBeenCalled();
    onReload?.();
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('waits while the user is using the app, then applies when the page goes hidden', () => {
    h = harness();
    h.tap();
    h.waiting();
    expect(h.controller.lastDecision()).toBe('defer');
    expect(h.applyUpdate).not.toHaveBeenCalled();
    h.setVisibility('hidden');
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies on a resume before the first tap', () => {
    h = harness();
    h.tap();
    h.waiting();
    h.setSession(true);
    h.setVisibility('hidden'); // session open: still nothing
    expect(h.applyUpdate).not.toHaveBeenCalled();
    h.setSession(false);
    h.setVisibility('visible');
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies once the session closes while the page is hidden', () => {
    h = harness({ sessionOpen: true });
    h.waiting();
    h.setVisibility('hidden');
    h.setSession(false);
    expect(h.applyUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('another window applied the update (audit E01: both windows reloaded)', () => {
  it('reloads this window at once when it has no session open', () => {
    h = harness();
    h.newWorkerTookControl();
    expect(h.deps.flush).toHaveBeenCalled();
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads a window with a session open; banner, then reload on the tap', () => {
    h = harness({ sessionOpen: true });
    h.newWorkerTookControl();
    expect(h.deps.reload).not.toHaveBeenCalled();
    const onReload = h.deps.showBanner.mock.calls[0]?.[0];
    onReload?.();
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads it later, when the session has closed and the page is hidden', () => {
    h = harness({ sessionOpen: true });
    h.tap();
    h.newWorkerTookControl();
    h.setSession(false); // Finish tapped: the user is still on the page
    expect(h.deps.reload).not.toHaveBeenCalled();
    h.setVisibility('hidden');
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });
});

describe('first launch after install (controllerchange)', () => {
  it('does not reload when clients.claim() adopts the install page (no controller before)', () => {
    h = harness({ controller: null });
    h.controllerChange('v1');
    expect(h.deps.reload).not.toHaveBeenCalled();
    expect(h.deps.showBanner).not.toHaveBeenCalled();
  });

  it('reloads the install page when an update takes control and no session is open', () => {
    h = harness({ controller: null });
    h.controllerChange('v1'); // claim
    h.waiting();
    expect(h.applyUpdate).toHaveBeenCalledWith(true);
    // workbox-window reports this `controlling` with isUpdate false on the install page, so
    // vite-plugin-pwa never calls onNeedReload: only controllerchange can apply it now.
    h.controllerChange('v2');
    expect(h.deps.flush).toHaveBeenCalled();
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads mid-session: banner instead, reload once the session closes and the page hides', () => {
    h = harness({ controller: null, sessionOpen: true });
    h.controllerChange('v1');
    h.tap();
    h.controllerChange('v2');
    expect(h.deps.reload).not.toHaveBeenCalled();
    expect(h.deps.showBanner).toHaveBeenCalledTimes(1);
    h.setSession(false);
    h.setVisibility('hidden');
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once when onNeedReload and controllerchange both report the same takeover', () => {
    h = harness();
    h.newWorkerTookControl();
    h.controllerChange('v2');
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });
});
