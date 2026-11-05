// src/ui/nav/router.ts
//
// The hash router (spec R6; audit F01, F09). `ui.lastView` stays the one source of truth for
// which view renders, so every existing writer (a tab, a hotkey digit, Today's Start, the
// palette, Train's Finish) keeps working unchanged; this hook makes history follow it:
//  - cold start: the current entry is REPLACED with `#/<view>` (no new entry);
//  - every later change of the view PUSHES one entry, unless the change came from Back;
//  - Back lands on an earlier entry and history.ts closes overlays above it, then calls the
//    view switch registered here.
// Scroll (F09): one window scroller is shared by every view, so each view's offset is saved the
// moment the view changes (a synchronous store subscription, before React hides the old view)
// and restored when the change came from a tab or from Back; any other change (Start, the
// palette, Finish) opens the target at the top.
//
// Rejected: making the hash the source of truth (a hash left in jsdom by one test would decide
// the next test's view; a persisted lastView already gives cold-start restore).
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { abandonOverlaysForNavigation } from '../overlay/overlayStack';
import { currentEntry, pushEntry, replaceEntry, setViewShower } from './history';
import { isViewId, type ViewId } from './views';

/** How the next view change was asked for: from a tab or Back (restore), or by the app (top). */
let restoreNext = false;

/** A tab, the More sheet or a hotkey digit: the user is moving between views, not being moved. */
export function goToView(view: ViewId): void {
  restoreNext = true;
  useAppStore.getState().setUi({ lastView: view });
}

/** [px] the offset each view was left at. Module scope: one shell, one window scroller. */
const savedScroll = new Map<string, number>();

/** Test seam (src/test/setup.ts): forget offsets and the pending restore flag. */
export function resetRouterForTests(): void {
  savedScroll.clear();
  restoreNext = false;
}

export function useHistoryRouter(view: ViewId): void {
  // Captured synchronously when lastView changes, before the old view is hidden and the page
  // height (and so the clamped offset) changes under it.
  const restoreRef = useRef(false);
  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (state.ui.lastView === prev.ui.lastView) return;
        savedScroll.set(prev.ui.lastView, window.scrollY); // [px]
        restoreRef.current = restoreNext;
        restoreNext = false;
      }),
    [],
  );

  // Back: show the entry's view without pushing a new entry (the effect below sees it equal).
  useEffect(() => {
    setViewShower((next) => {
      if (!isViewId(next)) return;
      restoreNext = true;
      useAppStore.getState().setUi({ lastView: next });
    });
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    return () => {
      setViewShower(null);
    };
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      replaceEntry({ view, depth: 0 });
      return;
    }
    if (currentEntry()?.view === view && currentEntry()?.depth === 0) return; // Back landed here
    abandonOverlaysForNavigation();
    pushEntry({ view, depth: 0 });
  }, [view]);

  useLayoutEffect(() => {
    const restore = restoreRef.current;
    restoreRef.current = false;
    // 'instant': a view switch is not a scroll the user should watch (brief section 6).
    window.scrollTo({ top: restore ? (savedScroll.get(view) ?? 0) : 0, behavior: 'instant' }); // [px]
  }, [view]);
}
