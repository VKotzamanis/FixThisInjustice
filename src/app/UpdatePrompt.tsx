import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { useCopy } from '../content/useCopy';

/**
 * The service-worker update prompt.
 *
 * vite.config.ts sets registerType: 'prompt', so a new build never takes over a
 * running session on its own. src/app/updateController.ts decides (spec R7): it applies a
 * waiting worker itself when no session is open, and calls notifyUpdateReady() only while
 * one is, so this banner is the mid-session case. Its Reload is the user's choice.
 *
 * The pending update lives in a module-level slot rather than in the Zustand
 * store because it is neither persisted nor part of the document, and because
 * the registration happens in main.tsx, outside any React tree.
 */
let pendingApply: (() => void) | null = null;
const listeners = new Set<() => void>();

/** Called by main.tsx when the plugin reports a waiting service worker. */
export function notifyUpdateReady(apply: () => void): void {
  pendingApply = apply;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the slot itself, not a wrapper: useSyncExternalStore compares
 * snapshots by identity, and a fresh object per call would loop.
 */
function getSnapshot(): (() => void) | null {
  return pendingApply;
}

/**
 * The element the dock sits under (audit E13). P4a's one-line header keeps `header.topbar`; a
 * later rename changes this selector, and UpdatePrompt.test.tsx names it.
 */
export const UPDATE_DOCK_ANCHOR = 'header.topbar';

/** [px] The anchor's bottom edge in the viewport, kept current on resize; 0 when absent. */
function useAnchorBottom(): number {
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    const anchor = document.querySelector(UPDATE_DOCK_ANCHOR);
    const measure = (): void => {
      setBottom(Math.max(0, anchor?.getBoundingClientRect().bottom ?? 0));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' || anchor === null ? null : new ResizeObserver(measure);
    if (anchor !== null) observer?.observe(anchor);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);
  return bottom;
}

export function UpdatePrompt(): ReactElement | null {
  const apply = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Before the early return, as the rules of hooks require. The three strings were literals
  // byte-identical to their table rows until P9 Task 15; reading them here is what lets a skin
  // reach the prompt, and master plan section 3 forbids the literal either way.
  const t = useCopy();
  const top = useAnchorBottom(); // [px]
  if (apply === null) return null;

  return (
    // Audit E13: fixed under the header, above modal scrims, so it is visible when scrolled and
    // tappable while a dialog is open.
    <div className="update-dock" style={{ top: `${String(top)}px` }}>
      <div className="banner update" role="status">
        <span className="banner-tag">{t('banner.update.tag')}</span>
        <span>{t('banner.update.body')}</span>
        <button type="button" onClick={apply}>
          {t('button.reload')}
        </button>
      </div>
    </div>
  );
}
