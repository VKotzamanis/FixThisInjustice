// src/app/updateController.ts
//
// Spec R7 (audit E01): the app's whole update model, in one place.
//
//  - CHECKS. The browser looks for a new sw.js only on a navigation, and an installed iPhone app
//    resumed from the app switcher never navigates, so a deploy did not reach it (E01). Here
//    `registration.update()` runs every time the page becomes visible and every
//    UPDATE_POLL_INTERVAL_MS while it stays visible. Pages serves sw.js with max-age=600 behind
//    its CDN, so a check can still see the previous deploy for up to 10 min (audit E01, [U]).
//  - APPLY. A waiting worker is applied by updatePolicy.decideUpdate: at a cold launch or a
//    resume before the first tap, or when the page goes hidden, and only with no session open.
//    Applying flushes the pending document write first (the reload must not drop it).
//  - BANNER. Only while a session is open (UpdatePrompt); its Reload is the user's choice.
//  - ANOTHER WINDOW APPLIED IT. vite-plugin-pwa reloads every window when the new worker takes
//    control. `onNeedReload` intercepts that: a window with a session open shows the banner and
//    reloads only on the tap (or when it is next hidden or untouched with the session closed).
//  - FIRST LAUNCH. On the page that installed the worker, workbox-window fixes isUpdate = false
//    (no controller at registration), so vite-plugin-pwa never calls onNeedReload and an update
//    applied there left the old code running until the next launch. The controller therefore
//    also listens to `controllerchange` itself and treats a worker REPLACING another exactly like
//    onNeedReload: reload at once with no session open, banner mid-session. A change from no
//    controller (clients.claim() adopting the install page, E09) is not an update: no reload.
//
// Every browser API arrives through `deps`, so updateController.test.ts drives it in jsdom.
import { decideUpdate, UPDATE_POLL_INTERVAL_MS, type UpdateDecision } from './updatePolicy';

/** The subset of vite-plugin-pwa's RegisterSWOptions this controller passes. */
export interface RegisterOptions {
  immediate: boolean;
  onNeedRefresh: () => void;
  onNeedReload: () => void;
  onRegisteredSW: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}

export interface UpdateControllerDeps {
  /** `registerSW` from 'virtual:pwa-register'. Returns the apply function (posts SKIP_WAITING). */
  register: (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>;
  /** The stored document has been read (status.hydrated). Nothing is decided before it. */
  ready: () => boolean;
  isSessionOpen: () => boolean;
  /** Writes any debounced document change now (src/store/index.ts flushSave). */
  flush: () => void;
  reload: () => void;
  /** Shows the banner with this Reload action (src/app/UpdatePrompt.tsx notifyUpdateReady). */
  showBanner: (onReload: () => void) => void;
  /** Subscribes to store changes (a session closing re-evaluates). Returns the unsubscribe. */
  subscribeStore: (listener: () => void) => () => void;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>;
  /** navigator.serviceWorker; absent where the browser has none. */
  sw?: {
    readonly controller: object | null;
    addEventListener(type: 'controllerchange', listener: () => void): void;
    removeEventListener(type: 'controllerchange', listener: () => void): void;
  } | undefined;
}

export interface UpdateController {
  /** For tests: the last decision taken for a waiting worker, or null when none is waiting. */
  lastDecision: () => UpdateDecision | null;
  stop: () => void;
}

export function startUpdateController(deps: UpdateControllerDeps): UpdateController {
  let waiting = false; // a new worker is installed and waiting
  let controlledByNew = false; // the new worker already controls this page (another window applied)
  let applying = false;
  let reloading = false;
  let controller: object | null = deps.sw?.controller ?? null;
  let interacted = false;
  let decision: UpdateDecision | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let poll: number | null = null;

  const hidden = (): boolean => deps.doc.visibilityState === 'hidden';

  const check = (): void => {
    // update() rejects offline or on a fetch error; the next visible/interval tick tries again.
    registration?.update().catch(() => undefined);
  };

  const reloadNow = (): void => {
    if (reloading) return;
    reloading = true;
    deps.flush();
    deps.reload();
  };

  /** A new worker controls this page (this window applied it, another window did, or first launch). */
  const newWorkerInControl = (): void => {
    if (reloading || controlledByNew) return;
    if (applying || !deps.isSessionOpen()) {
      reloadNow();
      return;
    }
    controlledByNew = true;
    deps.showBanner(reloadNow);
  };

  const apply = (): void => {
    if (applying || applyUpdate === null) return;
    applying = true;
    deps.flush();
    void applyUpdate(true);
  };

  const evaluate = (): void => {
    // Before hydrate the store holds the default document, which never has a session open.
    if (!deps.ready()) return;
    if (controlledByNew) {
      // The page runs the old code under the new worker: reload at the first safe moment.
      if (!deps.isSessionOpen() && (hidden() || !interacted)) reloadNow();
      return;
    }
    if (!waiting) return;
    decision = decideUpdate({ sessionOpen: deps.isSessionOpen(), hidden: hidden(), interacted });
    if (decision === 'apply') apply();
    else if (decision === 'prompt') deps.showBanner(apply);
  };

  applyUpdate = deps.register({
    immediate: true,
    onNeedRefresh: () => {
      waiting = true;
      evaluate();
    },
    // This window asked for the update (apply above) or another window did.
    onNeedReload: newWorkerInControl,
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      poll = deps.win.setInterval(() => {
        if (!hidden()) check();
      }, UPDATE_POLL_INTERVAL_MS);
    },
  });

  const onInteract = (): void => {
    interacted = true;
  };
  const onVisibility = (): void => {
    if (hidden()) {
      evaluate();
      return;
    }
    interacted = false; // a resume is a fresh look at the app
    check();
    evaluate();
  };
  const onControllerChange = (): void => {
    const previous = controller;
    controller = deps.sw?.controller ?? null;
    if (previous === null) return; // claim() adopting an uncontrolled page: same code, no update
    newWorkerInControl();
  };
  const unsubscribe = deps.subscribeStore(evaluate);
  deps.sw?.addEventListener('controllerchange', onControllerChange);

  deps.win.addEventListener('pointerdown', onInteract, { capture: true, passive: true });
  deps.win.addEventListener('keydown', onInteract, { capture: true, passive: true });
  deps.doc.addEventListener('visibilitychange', onVisibility);

  return {
    lastDecision: () => decision,
    stop: () => {
      unsubscribe();
      if (poll !== null) deps.win.clearInterval(poll);
      deps.win.removeEventListener('pointerdown', onInteract, { capture: true });
      deps.win.removeEventListener('keydown', onInteract, { capture: true });
      deps.doc.removeEventListener('visibilitychange', onVisibility);
      deps.sw?.removeEventListener('controllerchange', onControllerChange);
    },
  };
}
