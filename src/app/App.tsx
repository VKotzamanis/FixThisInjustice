import { useState } from 'react';
import type { ReactElement } from 'react';
import { useAppStore } from '../store';
import { useActiveProfile, useHydrated, useLoadError, useSaveError } from '../store/selectors';
import { readRaw } from '../store/persistence';
import { downloadText } from './download';
import { UpdatePrompt } from './UpdatePrompt';
import './appShell.css';

/**
 * Reads the persisted document exactly once per mount, during render, so a
 * throw is caught by RootErrorBoundary. A useState lazy initializer is the
 * documented way to run a synchronous once-per-mount side effect where an
 * effect would fire too late for the boundary to help: an error boundary
 * catches a throw from render, but a throw inside a useEffect callback reaches
 * it only after the commit, and the placeholder tree would flash first.
 *
 * hydrate() is idempotent, so StrictMode's double invocation in development
 * costs one extra read and changes nothing.
 */
function useHydrateOnce(): void {
  useState(() => {
    useAppStore.getState().hydrate();
    return true;
  });
}

/**
 * A failed write is never silent (finding H3 / A42). The banner is persistent —
 * it stays until a later write succeeds and the store clears the status — and
 * it carries the export control, because after a failed write the only copy of
 * the change is the in-memory document this button serialises.
 */
function SaveErrorBanner(): ReactElement | null {
  const saveError = useSaveError();
  if (saveError === null) return null;

  return (
    <div className="banner" role="alert">
      <span className="banner-tag">{saveError === 'quota' ? 'STORAGE FULL' : 'NO STORAGE'}</span>
      <span>
        {saveError === 'quota'
          ? 'Storage is full. Export your data now.'
          : 'Storage is unavailable in this browser context. Export your data now.'}
      </span>
      <button
        type="button"
        onClick={() => {
          downloadText('fixthisinjustice-export.json', useAppStore.getState().exportJson());
        }}
      >
        Export data
      </button>
    </div>
  );
}

/**
 * The stored document failed validation. Master plan section 3: keep the last
 * known-good state in memory, show the error, offer export — and the export
 * offered here is the *raw* stored text, not the in-memory state, which at this
 * point is the default document and carries none of the user's data.
 */
function LoadErrorBanner(): ReactElement | null {
  const loadError = useLoadError();
  if (loadError === null) return null;

  return (
    <div className="banner" role="alert">
      <span className="banner-tag">INVALID DATA</span>
      <span>
        The stored document did not validate and was not loaded: {loadError}. Nothing has been
        overwritten. Export the stored document before making changes.
      </span>
      <button
        type="button"
        onClick={() => {
          downloadText('fixthisinjustice-recovery.json', readRaw() ?? '{}');
        }}
      >
        Export stored data
      </button>
    </div>
  );
}

export function App(): ReactElement {
  useHydrateOnce();
  const hydrated = useHydrated();
  const profile = useActiveProfile();

  return (
    <div className="crt">
      <header className="topbar">
        <span className="brand">
          FIX<span className="acc">·</span>THIS<span className="acc">·</span>INJUSTICE
        </span>
        <span>{hydrated ? 'local data loaded' : 'reading local data'}</span>
      </header>

      <main>
        <UpdatePrompt />
        <SaveErrorBanner />
        <LoadErrorBanner />

        {profile === null ? (
          <section className="placeholder">
            <h2>No profile yet</h2>
            <p>
              Setup collects your body data, goal, units and weekly availability. It is added in the
              next plan; this build carries the storage, schema and unit layers it needs.
            </p>
          </section>
        ) : (
          <section className="placeholder">
            <h2>{profile.displayName}</h2>
            <p>
              Time zone {profile.timezone}, units {profile.units}.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
