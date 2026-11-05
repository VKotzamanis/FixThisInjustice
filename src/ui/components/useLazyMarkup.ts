// src/ui/components/useLazyMarkup.ts
//
// One bundled SVG file, fetched as its own chunk on first use (the Atlas card icons, the setup
// wizard's body-fat drawings). Shared so both get the same two guarantees:
//
//  1. A file already loaded this page life is returned on the first render (no placeholder
//     frame), from the caller's cache.
//  2. Audit E12: a load that fails (offline first session, a chunk gone after a deploy) is
//     retried in place when the browser reports it is back online or the page becomes visible
//     again, at most MAX_LAZY_MARKUP_ATTEMPTS times per mount, instead of leaving an empty box
//     until a remount. Whether a browser re-fetches a module whose earlier import() failed varies
//     by engine [U: not tested here]; where it does not, the box stays empty and says 'failed'
//     (the caption beside every drawing still names it).
import { useEffect, useState } from 'react';

/** [attempts] per mount: the first load plus two retries. An engineering bound, not tuned. */
export const MAX_LAZY_MARKUP_ATTEMPTS = 3;

export type LazyMarkupState = 'loading' | 'ready' | 'failed';

export interface LazyMarkup {
  markup: string | undefined;
  state: LazyMarkupState;
}

/**
 * @param key   the file's id; a change of key starts a new load.
 * @param load  the chunk loader, or undefined when no file exists for the key (state 'failed').
 *              Must be stable per key (memoise it), or every render restarts the load.
 * @param cache module-scope map owned by the caller, keyed by `key`.
 */
export function useLazyMarkup(
  key: string,
  load: (() => Promise<string>) | undefined,
  cache: Map<string, string>,
): LazyMarkup {
  const [arrived, setArrived] = useState<{ key: string; markup: string } | undefined>(undefined);
  const [failedKey, setFailedKey] = useState<string | undefined>(undefined);
  const markup = arrived?.key === key ? arrived.markup : cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return undefined;
    if (load === undefined) {
      setFailedKey(key);
      return undefined;
    }
    let live = true;
    let attempts = 0; // [attempts]
    let waiting = false;

    const attempt = (): void => {
      waiting = false;
      attempts += 1;
      setFailedKey(undefined);
      load().then(
        (text) => {
          cache.set(key, text);
          if (live) setArrived({ key, markup: text });
        },
        () => {
          if (!live) return;
          setFailedKey(key);
          waiting = attempts < MAX_LAZY_MARKUP_ATTEMPTS;
        },
      );
    };
    const retry = (): void => {
      if (live && waiting) attempt();
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') retry();
    };

    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    attempt();
    return () => {
      live = false;
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, load, cache]);

  if (markup !== undefined) return { markup, state: 'ready' };
  return { markup: undefined, state: failedKey === key ? 'failed' : 'loading' };
}
