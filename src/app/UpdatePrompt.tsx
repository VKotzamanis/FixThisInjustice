import { useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { useCopy } from '../content/useCopy';

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
  // Before the early return, as the rules of hooks require. The three strings were literals
  // byte-identical to their table rows until P9 Task 15; reading them here is what lets a skin
  // reach the prompt, and master plan section 3 forbids the literal either way.
  const t = useCopy();
  if (apply === null) return null;

  return (
    <div className="banner update" role="status">
      <span className="banner-tag">{t('banner.update.tag')}</span>
      <span>{t('banner.update.body')}</span>
      <button type="button" onClick={apply}>
        {t('button.reload')}
      </button>
    </div>
  );
}
