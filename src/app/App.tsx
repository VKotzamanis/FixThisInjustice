import { useState } from 'react';
import type { ReactElement } from 'react';
import { copy } from '../content/copy';
import { useAppStore } from '../store';
import type { SaveErrorReason } from '../store';
import type { Profile } from '../domain/types';
import {
  useActiveProfile,
  useHydrated,
  useLastLoadRaw,
  useLoadError,
  useSaveError,
} from '../store/selectors';
import { SessionIndicator } from '../ui/components/SessionIndicator';
import { TrainingModalsProvider } from '../ui/components/TrainingModalsProvider';
import { ReadinessScreen } from '../ui/setup/ReadinessScreen';
import { SetupWizard } from '../ui/setup/SetupWizard';
import { LogView } from '../ui/views/LogView';
import { PlanView } from '../ui/views/PlanView';
import { SettingsView } from '../ui/views/SettingsView';
import { TargetsView } from '../ui/views/TargetsView';
import { TodayView } from '../ui/views/TodayView';
import { TrainView } from '../ui/views/TrainView';
import { downloadText } from './download';
import { useWeeklyClose } from './useWeeklyClose';
import { UpdatePrompt } from './UpdatePrompt';
import './appShell.css';

/**
 * The view switch every plan adds to. P3-P8 replace a placeholder entry with their own view
 * and add nothing else here: the union, NAV and the switch below are the three places a view
 * is named, and they are kept adjacent so a view cannot exist in one and not the others.
 */
export type ViewId = 'today' | 'plan' | 'train' | 'targets' | 'log' | 'settings';

const NAV: { id: ViewId; label: string }[] = [
  { id: 'today', label: copy('nav.today') },
  { id: 'plan', label: copy('nav.plan') },
  { id: 'train', label: copy('nav.train') },
  { id: 'targets', label: copy('nav.targets') },
  { id: 'log', label: copy('nav.log') },
  { id: 'settings', label: copy('nav.settings') },
];

/**
 * `UiPrefs.lastView` is a persisted string, not a ViewId: a document written by a later
 * version can name a view this build does not have. Checking it against NAV rather than
 * asserting the type is what keeps that document loading instead of rendering nothing.
 */
function isViewId(value: string): value is ViewId {
  return NAV.some((n) => n.id === value);
}

/**
 * Navigation and the view switch, mounted only once a profile exists.
 *
 * `UiPrefs.lastView` is the SOURCE OF TRUTH, subscribed to rather than read once. P4 Task 10
 * needs that: Today's Start handler switches to Train by writing the preference, and the
 * shell's earlier local-state copy meant the write reached storage and no one else (master
 * plan section 10, P3 close-out: "the app shell seeds its view from ui.lastView once and does
 * not subscribe, so Today's Start does not switch to Train until the shell subscribes").
 *
 * The earlier comment justified the local copy by the debounced persistence write. That was a
 * misreading of where the debounce sits: `setUi` updates the store synchronously and only the
 * WRITE TO STORAGE is coalesced, so a tap repaints on the same commit either way.
 *
 * A view this build does not have is not asserted away. A document written by a later version
 * can name one, and falling back to a known view is what keeps that document loading instead
 * of rendering nothing.
 */
function ViewShell(): ReactElement {
  const stored = useAppStore((s) => s.ui.lastView);
  const view: ViewId = isViewId(stored) ? stored : 'targets';

  return (
    <>
      <nav className="viewnav" aria-label={copy('nav.label')}>
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            aria-current={view === n.id}
            onClick={() => {
              // Through getState(), like every other action call in this codebase: the store's
              // actions are created once and never replace themselves, so subscribing to one
              // buys nothing and hands the component an unbound method.
              useAppStore.getState().setUi({ lastView: n.id });
            }}
          >
            {n.label}
          </button>
        ))}
      </nav>
      {view === 'targets' && <TargetsView />}
      {view === 'settings' && <SettingsView />}
      {view === 'today' && <TodayView />}
      {view === 'plan' && <PlanView />}
      {view === 'train' && <TrainView />}
      {view === 'log' && <LogView />}
    </>
  );
}

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
        message: 'Storage is full. Export now.',
        recovery: 'export-memory',
      };
    case 'unavailable':
      return {
        tag: 'NO STORAGE',
        message: 'Storage is unavailable here. Export now.',
        recovery: 'export-memory',
      };
    case 'serialize':
      return {
        tag: 'SAVE FAILED',
        message: 'The change could not be saved. The stored copy is unchanged.',
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
            Export stored copy
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
      <span>Stored data did not validate: {loadError}. Nothing was overwritten.</span>
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

/**
 * The pre-participation screening, shown to a profile that has never been screened.
 *
 * `readiness.screenedAt === null` means UNSCREENED, not cleared: a profile created before the
 * screen existed, or imported by P7, carries that value. Master plan section 10.4 says such a
 * profile is shown the screen on its next app open rather than being treated as clear, so this
 * stands between the wizard and the view shell and clears itself the moment the result is
 * recorded. `recordReadiness` is the action for it, because by here the profile exists.
 */
function ReadinessGate(props: { profile: Profile }): ReactElement {
  return (
    <ReadinessScreen
      timezone={props.profile.timezone}
      onComplete={(result) => {
        useAppStore.getState().recordReadiness(props.profile.id, result.screenedAt, result.flagged);
      }}
    />
  );
}

export function App(): ReactElement {
  useHydrateOnce();
  /*
   * After useHydrateOnce, which reads the document during render, so the first run of the
   * closure sees the stored profile rather than the default one. Both orders would in fact
   * work — the closure is an effect and effects run after the commit — but the reading order
   * is the one that has to be obvious. Before any conditional return, so the hook order is
   * stable, and it is a no-op until a profile exists.
   */
  useWeeklyClose();
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

  /*
   * The two P4 modals are mounted once, here, and reached from any view through
   * useVideoModal() / useFormCuesModal(). Nothing is written to `window` (code review A53).
   * The provider renders its children unconditionally and each modal only while it holds an
   * open request, so this changes no existing behaviour.
   */
  return (
    <TrainingModalsProvider>
      <div className={crtClasses}>
        <header className="topbar">
          <span className="brand">
            FIX<span className="acc">·</span>THIS<span className="acc">·</span>INJUSTICE
          </span>
          {/*
           * The plan position the CURSOR stands at, mounted here so it is visible from every
           * view (P3 Task 7). It renders nothing until a plan exists, so the header keeps its
           * two-element layout through setup.
           */}
          <SessionIndicator />
          <span>{hydrated ? 'local data loaded' : 'reading local data'}</span>
        </header>

        <main>
          <UpdatePrompt />
          <SaveErrorBanner />
          <LoadErrorBanner />

          {profile === null ? (
            // No profile means setup has not run. The wizard is the whole screen until it has:
            // every other view needs a profile to read units, time zone and targets from.
            <SetupWizard />
          ) : /*
               * Gated on `hydrated` as well as on the profile: before the stored document has been
               * read there is nothing to judge, and an empty store would look unscreened and flash
               * the screen at a user who has already answered it.
               */
          hydrated && profile.readiness.screenedAt === null ? (
            <ReadinessGate profile={profile} />
          ) : (
            <ViewShell />
          )}
        </main>
      </div>
    </TrainingModalsProvider>
  );
}
