// src/ui/nav/history.ts
//
// The ONE owner of window.history and the ONE popstate listener (spec R6; audit F01, F12).
//
// Every history entry this app writes carries `{ fti: { view, depth } }`: the view on screen and
// how many overlays were open when the entry was written. Back (Android back, browser back, an
// iOS edge swipe in a browser tab) lands on an earlier entry, and `reconcile` makes the screen
// match it: overlays above the entry's depth close (top first), then the view switches. So back
// closes the top overlay first, then goes to the previous view, and an overlay never outlives
// the entry it was opened on.
//
// An overlay closed by its own control (not by Back) steps back over its own entry, so the
// stack and the history stay one-to-one. history.go() is asynchronous: the popstate it causes
// is counted in `selfPops` and swallowed, and any push requested before it lands is deferred
// until it has, so a push can never be undone by a traversal that was queued before it.
//
// Rejected: React Router or TanStack Router (spec R6: bundle weight, loaders unused); a dummy
// pushState per overlay with no view entries (audit F verdict: fixes back, leaves no per-view
// history).

export interface HistoryEntry {
  /** The view on screen when the entry was written (a ViewId; kept as string here). */
  view: string;
  /** [overlays] how many overlays were open when the entry was written. */
  depth: number;
}

const KEY = 'fti';

/** The entry a history state carries, or null for an entry this app did not write. */
export function entryOf(state: unknown): HistoryEntry | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = (state as Record<string, unknown>)[KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const { view, depth } = raw as Record<string, unknown>;
  if (typeof view !== 'string' || typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0) {
    return null;
  }
  return { view, depth };
}

/** `#/today`: the hash a view entry is written under. */
export function hashFor(view: string): string {
  return `#/${view}`;
}

/** The view named by a `#/view` hash, or null. */
export function viewFromHash(hash: string): string | null {
  const m = /^#\/([a-z]+)$/.exec(hash);
  return m === null ? null : (m[1] ?? null);
}

/** Closes overlays until at most `depth` remain, top first. Set once by the overlay stack. */
let closeOverlaysTo: ((depth: number) => void) | null = null;
/** Shows a view (writes ui.lastView). Set by the router while the view shell is mounted. */
let showView: ((view: string) => void) | null = null;
let selfPops = 0; // [traversals] history.go() calls of ours whose popstate has not arrived yet
let pendingSteps = 0; // [entries] step-backs asked for in this task, not yet issued
let deferred: Array<() => void> = [];
let listening = false;

function flushDeferred(): void {
  const run = deferred;
  deferred = [];
  for (const f of run) f();
}

function inFlight(): boolean {
  return selfPops > 0 || pendingSteps > 0;
}

function onPopState(event: PopStateEvent): void {
  if (selfPops > 0) {
    selfPops -= 1;
    if (!inFlight()) flushDeferred();
    return;
  }
  const entry = entryOf(event.state);
  const depth = entry?.depth ?? 0; // [overlays]
  const view = entry?.view ?? viewFromHash(window.location.hash);
  closeOverlaysTo?.(depth);
  if (view !== null) showView?.(view);
}

function ensureListening(): void {
  if (listening) return;
  window.addEventListener('popstate', onPopState);
  listening = true;
}

/** The overlay stack registers its closer here, once, at module load. */
export function setOverlayCloser(fn: (depth: number) => void): void {
  ensureListening();
  closeOverlaysTo = fn;
}

/** The router registers the view switch here while the shell is mounted; null detaches it. */
export function setViewShower(fn: ((view: string) => void) | null): void {
  ensureListening();
  showView = fn;
}

/** The entry history is on now, or null if it is not one of ours. */
export function currentEntry(): HistoryEntry | null {
  return entryOf(window.history.state);
}

/** Replaces the current entry (cold start: the first view gets its hash without a new entry). */
export function replaceEntry(entry: HistoryEntry): void {
  ensureListening();
  window.history.replaceState({ [KEY]: entry }, '', hashFor(entry.view));
}

/** Adds one entry on top. Deferred while one of our own traversals is still in flight. */
export function pushEntry(entry: HistoryEntry): void {
  ensureListening();
  if (inFlight()) {
    deferred.push(() => {
      pushEntry(entry);
    });
    return;
  }
  window.history.pushState({ [KEY]: entry }, '', hashFor(entry.view));
}

/**
 * Steps back over one entry of our own; its popstate is swallowed. Step-backs asked for in one
 * task (two overlays closed together) are issued as ONE `history.go(-n)` in a microtask:
 * measured in jsdom (and not guaranteed by browsers), two synchronous `history.back()` calls
 * traverse once.
 */
export function stepBack(): void {
  ensureListening();
  pendingSteps += 1;
  if (pendingSteps > 1) return;
  queueMicrotask(() => {
    const steps = pendingSteps; // [entries]
    pendingSteps = 0;
    selfPops += 1;
    window.history.go(-steps);
  });
}

/**
 * Test seam (src/test/setup.ts, after every test): drop deferred pushes and the view switch.
 * `selfPops` is KEPT: a traversal the last test queued still arrives (jsdom delivers it on a
 * later task) and must be swallowed, not read as the next test's Back.
 */
export function resetHistoryForTests(): void {
  deferred = [];
  showView = null;
}
