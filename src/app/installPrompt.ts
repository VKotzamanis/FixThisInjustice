// src/app/installPrompt.ts
//
// Spec R8 (audit E04): install guidance that does not depend on reminders.
//
//  - STANDALONE. The app is already installed when `display-mode: standalone` matches (Chromium,
//    and iOS Home Screen apps [U: iOS not tested]) or `navigator.standalone` is true (older iOS).
//    Then no guidance is shown at all.
//  - ANDROID. Chromium fires `beforeinstallprompt` when the app is installable; the event is held
//    (preventDefault stops the mini-infobar) so the card's Install App button can call prompt()
//    from a tap. MDN marks the event "Limited availability" (Chromium only): Safari and Firefox
//    never fire it, and there the card shows the written steps instead.
//    https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event (read 2026-11-04)
//  - `appinstalled` clears the held event: the card disappears without a reload.
//
// Module state, not the store: none of it is a fact about the user's data, and the event must be
// captured in main.tsx before React mounts (Chromium may fire it before the first render).
import { useSyncExternalStore } from 'react';

/** The part of Chromium's BeforeInstallPromptEvent this module uses (not in lib.dom). */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** The app runs installed (standalone). */
  standalone: boolean;
  /** Chromium offered an install prompt this page life, not yet used. */
  canPrompt: boolean;
}

let held: InstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallState = { standalone: false, canPrompt: false };
const listeners = new Set<() => void>();

function isInstallPromptEvent(e: Event): e is InstallPromptEvent {
  return typeof Reflect.get(e, 'prompt') === 'function';
}

export function runsStandalone(win: Window = window): boolean {
  const media = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  // Older iOS exposes only this non-standard flag.
  return media || Reflect.get(win.navigator, 'standalone') === true;
}

function publish(win: Window): void {
  snapshot = { standalone: installed || runsStandalone(win), canPrompt: held !== null };
  for (const listener of listeners) listener();
}

/** Called once from main.tsx. Returns the teardown (tests). */
export function startInstallPromptCapture(win: Window = window): () => void {
  const onPrompt = (e: Event): void => {
    if (!isInstallPromptEvent(e)) return;
    e.preventDefault();
    held = e;
    publish(win);
  };
  const onInstalled = (): void => {
    held = null;
    installed = true;
    publish(win);
  };
  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  publish(win);
  return () => {
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
    held = null;
    installed = false;
    snapshot = { standalone: false, canPrompt: false };
  };
}

/** Shows Chromium's install dialog. Must run inside a tap. The event is single-use. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = held;
  if (event === null) return 'unavailable';
  held = null;
  publish(window);
  try {
    const choice = await event.prompt();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  return snapshot;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
