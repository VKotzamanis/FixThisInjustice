import { useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

/**
 * The service-worker update prompt.
 *
 * vite.config.ts sets registerType: 'prompt', so a new build never takes over a
 * running session on its own: an unsaved change would go with it. main.tsx
 * registers the worker and calls notifyUpdateReady() from the plugin's
 * onNeedRefresh callback; this component is what the user sees.
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

export function UpdatePrompt(): ReactElement | null {
  const apply = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (apply === null) return null;

  return (
    <div className="banner update" role="status">
      <span className="banner-tag">UPDATE READY</span>
      <span>A new version is ready.</span>
      <button type="button" onClick={apply}>
        Reload
      </button>
    </div>
  );
}
