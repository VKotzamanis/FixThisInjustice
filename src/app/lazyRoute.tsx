// src/app/lazyRoute.tsx
//
// Audit E09/F14: route-level code splitting without React.lazy. A screen the user may never
// open on this launch (setup, intro, Atlas, Log, Settings, the rest games) is its own chunk;
// the service worker precaches every chunk (vite.config.ts globPatterns `**/*.js`), so offline
// it still opens.
//
// WHY NOT React.lazy + Suspense. A rejected React.lazy is cached inside the lazy object, so a
// chunk that failed once (offline first session, a stale deploy) fails for the life of the page,
// and the throw reaches RootErrorBoundary: the whole app is replaced by the crash screen. Here a
// failure is local: the screen shows Try Again, which calls the loader again (Chrome 156+ and
// Firefox 155+ re-fetch a failed module; Safari caches the failure, hence the Reload control
// beside it), and the rest of the shell keeps working.
//
// SYNCHRONOUS ONCE LOADED. The module is held at module scope, so after the first load every
// mount renders the screen on its first frame, and `preload()` lets a test (or an idle hint)
// make the first mount synchronous too.
import { useEffect, useState, type ComponentType, type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';

export interface LazyRoute<P extends object> {
  /** Renders the screen, a sized empty placeholder while it loads, or the retry panel. */
  Component: (props: P) => ReactElement;
  /** Starts (or joins) the load. Resolves once the screen can render synchronously. */
  preload: () => Promise<void>;
}

type LoadState<P> =
  | { status: 'idle' }
  | { status: 'loading'; promise: Promise<void> }
  | { status: 'ready'; component: ComponentType<P> }
  | { status: 'failed' };

export function lazyRoute<P extends object>(
  name: string,
  load: () => Promise<ComponentType<P>>,
): LazyRoute<P> {
  let state: LoadState<P> = { status: 'idle' };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const preload = (): Promise<void> => {
    if (state.status === 'ready') return Promise.resolve();
    if (state.status === 'loading') return state.promise;
    const promise = load().then(
      (component) => {
        state = { status: 'ready', component };
        notify();
      },
      () => {
        state = { status: 'failed' };
        notify();
      },
    );
    state = { status: 'loading', promise };
    return promise;
  };

  function Component(props: P): ReactElement {
    const [, setTick] = useState(0);
    useEffect(() => {
      const listener = (): void => {
        setTick((n) => n + 1);
      };
      listeners.add(listener);
      if (state.status === 'idle') void preload();
      return () => {
        listeners.delete(listener);
      };
    }, []);

    if (state.status === 'ready') {
      const Loaded = state.component;
      return <Loaded {...props} />;
    }
    if (state.status === 'failed') {
      return (
        <RouteLoadFailed
          name={name}
          onRetry={() => {
            state = { status: 'idle' };
            void preload();
            notify();
          }}
        />
      );
    }
    // `aria-busy` so assistive technology hears that the region is filling, not empty.
    return <div className="route-loading" data-route={name} aria-busy="true" />;
  }

  return { Component, preload };
}

function RouteLoadFailed(props: { name: string; onRetry: () => void }): ReactElement {
  const t = useCopy();
  return (
    <div className="route-failed" data-route={props.name} role="alert">
      <p>{t('advice.screenLoadFailed')}</p>
      <button type="button" onClick={props.onRetry}>
        {t('button.tryAgain')}
      </button>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
      >
        {t('button.reload')}
      </button>
    </div>
  );
}
