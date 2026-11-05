// src/ui/overlay/overlayStack.ts
//
// One overlay stack for the whole app (spec R6; audit F12). Every dialog, sheet and full-screen
// layer that the user can dismiss registers here while it is on screen, and the stack owns the
// three things each of them used to do for itself:
//  - ONE Escape listener: Escape closes the top overlay only (two stacked ModalShells used to
//    close together on one press, F12);
//  - ONE history entry per open overlay, through src/ui/nav/history.ts: Back closes the top
//    overlay first and never leaves the app with one up (F01);
//  - ONE scroll lock: the page under a modal overlay does not scroll; the lock is taken by the
//    first modal and released by the last.
// z-order is NOT decided here: every layer takes a `--z-*` token in its own stylesheet
// (src/ui/styles/tokens.css), so the order is one ladder in one file.
import { useEffect, useRef } from 'react';
import { currentEntry, pushEntry, setOverlayCloser, stepBack, viewFromHash } from '../nav/history';

export interface OverlayOptions {
  /** A modal overlay locks the page scroll and owns Tab (ModalShell); a non-modal sheet does not. */
  modal: boolean;
}

interface Handle {
  id: number;
  close: () => void;
  modal: boolean;
  /** [overlays] the depth of the history entry this overlay pushed (1 = the first overlay). */
  depth: number;
  /** True once Back (or closeTo) has already consumed this overlay's history entry. */
  poppedByHistory: boolean;
}

const stack: Handle[] = [];
let nextId = 1;
/**
 * [entries] overlay entries this stack has pushed above the current view entry and not yet
 * stepped back over. One per open overlay, except while a close by control is still landing.
 */
let ownEntries = 0;
let keyListening = false;
let scrollLocked = false;
let overflowBeforeLock = '';

function syncScrollLock(): void {
  const wantLock = stack.some((h) => h.modal);
  if (wantLock && !scrollLocked) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scrollLocked = true;
  } else if (!wantLock && scrollLocked) {
    document.body.style.overflow = overflowBeforeLock;
    scrollLocked = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const top = stack.at(-1);
  if (top === undefined) return;
  event.preventDefault();
  top.close();
}

function ensureKeyListener(): void {
  if (keyListening) return;
  window.addEventListener('keydown', onKeyDown);
  keyListening = true;
}

/**
 * Back landed on an entry written with `depth` overlays open: close the ones above it, top
 * first. Each is taken off the stack BEFORE its close runs, so its unmount does not step back
 * over an entry the browser has already left.
 */
export function closeOverlaysTo(depth: number): void {
  // The browser has already left every entry above `depth`.
  ownEntries = Math.min(ownEntries, depth);
  while (stack.length > depth) {
    const top = stack.pop();
    if (top === undefined) break;
    top.poppedByHistory = true;
    syncScrollLock();
    top.close();
  }
}

/**
 * A view switch that did not come from Back (a tab, Start, the palette) closes whatever overlay
 * is still open (only the non-modal rest-game sheet can be: a modal's scrim covers the tabs)
 * WITHOUT stepping back: the new view entry goes on top and the overlay entries under it become
 * plain stops on the way back, which reconcile to their view.
 */
export function abandonOverlaysForNavigation(): void {
  closeOverlaysTo(0);
}

// Back reaches the stack whether or not a router is mounted (a dialog in a unit test, the wizard).
setOverlayCloser(closeOverlaysTo);

/** [overlays] how many overlays are open. */
export function overlayDepth(): number {
  return stack.length;
}

/** Whether the overlay registered under `id` is the top one (ModalShell's focus trap asks). */
export function isTopOverlay(id: number): boolean {
  return stack.at(-1)?.id === id;
}

function viewNow(): string {
  return currentEntry()?.view ?? viewFromHash(window.location.hash) ?? 'today';
}

/** Registers an open overlay; returns its id and the release its unmount must call. */
export function openOverlay(close: () => void, options: OverlayOptions): { id: number; release: () => void } {
  ensureKeyListener();
  const handle: Handle = {
    id: nextId,
    close,
    modal: options.modal,
    depth: stack.length + 1,
    poppedByHistory: false,
  };
  nextId += 1;
  stack.push(handle);
  syncScrollLock();
  pushEntry({ view: viewNow(), depth: handle.depth });
  ownEntries += 1;
  let released = false;
  return {
    id: handle.id,
    release: () => {
      if (released) return;
      released = true;
      const index = stack.indexOf(handle);
      if (index !== -1) stack.splice(index, 1);
      syncScrollLock();
      if (handle.poppedByHistory) return;
      // Closed by its own control (or Escape): step back over one overlay entry, so the history
      // keeps exactly one entry per open overlay (two closed together step back twice).
      if (ownEntries > stack.length) {
        ownEntries -= 1;
        stepBack();
      }
    },
  };
}

/**
 * The hook every overlay calls while it is mounted (mounted = open). `onClose` is read at event
 * time, so an inline arrow is fine. Returns a ref holding this overlay's id for `isTopOverlay`.
 */
export function useOverlay(onClose: () => void, options: OverlayOptions): { readonly current: number } {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const idRef = useRef(0);
  const { modal } = options;
  useEffect(() => {
    const { id, release } = openOverlay(() => {
      closeRef.current();
    }, { modal });
    idRef.current = id;
    return release;
  }, [modal]);
  return idRef;
}

/** Test seam: empty the stack and drop the lock (src/test/setup.ts calls it after each test). */
export function resetOverlaysForTests(): void {
  stack.length = 0;
  ownEntries = 0;
  if (scrollLocked) {
    document.body.style.overflow = overflowBeforeLock;
    scrollLocked = false;
  }
}
