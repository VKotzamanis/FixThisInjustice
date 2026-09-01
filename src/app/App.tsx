import { useState } from 'react';
import type { ReactElement } from 'react';
import { useAppStore } from '../store';
import type { SaveErrorReason } from '../store';
import {
  useActiveProfile,
  useHydrated,
  useLastLoadRaw,
  useLoadError,
  useSaveError,
} from '../store/selectors';
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
 * What a save failure means and what can still be done about it.
 *
 * `recovery` distinguishes the two cases the user has to act on differently:
 *
 *  - 'export-memory': storage refused the write, so the in-memory document is
 *    both intact and the only copy of the change. exportJson() serialises it.
 *  - 'retry-and-export-stored': serialisation itself failed, so exportJson()
 *    would fail on the same document for the same reason. The only text that
 *    can be handed over is what is already stored, and the only thing worth
 *    trying is the write again.
 */
interface SaveErrorCopy {
  tag: string;
  message: string;
  recovery: 'export-memory' | 'retry-and-export-stored';
}

/**
 * An exhaustive switch, not a ternary: the `never` binding in the default arm
 * makes a fourth SaveErrorReason a typecheck failure here rather than a banner
 * that silently falls through to the wrong advice.
 */
function saveErrorCopy(reason: SaveErrorReason): SaveErrorCopy {
  switch (reason) {
    case 'quota':
      return {
        tag: 'STORAGE FULL',
        message: 'Storage is full. Export your data now.',
        recovery: 'export-memory',
      };
    case 'unavailable':
      return {
        tag: 'NO STORAGE',
        message: 'Storage is unavailable in this browser context. Export your data now.',
        recovery: 'export-memory',
      };
    case 'serialize':
      return {
        tag: 'CANNOT SERIALISE',
        message:
          'The document could not be serialised, so nothing was written and the stored document is unchanged. Retry the save; if it fails again, export the last stored document before making further changes.',
        recovery: 'retry-and-export-stored',
      };
    default: {
      const exhaustive: never = reason;
      throw new Error(`unhandled save error reason: ${String(exhaustive)}`);
    }
  }
}

/**
 * A failed write is never silent (finding H3 / A42). The banner is persistent —
 * it stays until a later write succeeds and the store clears the status — and
 * it carries whichever recovery the failure actually admits.
 */
function SaveErrorBanner(): ReactElement | null {
  const saveError = useSaveError();
  const lastLoadRaw = useLastLoadRaw();
  if (saveError === null) return null;

  const { tag, message, recovery } = saveErrorCopy(saveError.reason);

  return (
    <div className="banner" role="alert">
      <span className="banner-tag">{tag}</span>
      <span>{message}</span>
      {recovery === 'export-memory' ? (
        <button
          type="button"
          onClick={() => {
            downloadText('fixthisinjustice-export.json', useAppStore.getState().exportJson());
          }}
        >
          Export data
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().retrySave();
            }}
          >
            Retry save
          </button>
          <button
            type="button"
            onClick={() => {
              // Never exportJson() here: it serialises the same document that
              // JSON.stringify has just refused, so it would throw on the one
              // click the user was told to make.
              downloadText('fixthisinjustice-recovery.json', lastLoadRaw ?? '{}');
            }}
          >
            Export last stored document
          </button>
        </>
      )}
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
  const lastLoadRaw = useLastLoadRaw();
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
          downloadText('fixthisinjustice-recovery.json', lastLoadRaw ?? '{}');
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

  /*
   * The two CRT presentation layers are opt-in, and the preference is what
   * makes the CSS reachable at all: .crt.sc and .crt.fl match nothing until
   * these classes are on the root. Read as two scalar selectors rather than one
   * object, so the snapshot stays referentially stable between renders.
   *
   * prefers-reduced-motion is handled in crt.css, not here: a media query is
   * live, so a user changing the setting mid-session stops the flicker without
   * a re-render, which a matchMedia read at render time would not do.
   */
  const scanlines = useAppStore((s) => s.ui.scanlines);
  const flicker = useAppStore((s) => s.ui.flicker);
  const crtClasses = ['crt', scanlines ? 'sc' : '', flicker ? 'fl' : ''].filter(Boolean).join(' ');

  return (
    <div className={crtClasses}>
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
