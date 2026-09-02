import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { FORMAT } from '../content/copy';
import type { CopyKey } from '../content/copy';
import { useCopy, useCopyOverrides } from '../content/useCopy';
import { useAppStore } from '../store';
import { useFirstGestureUnlock } from '../skins/sfx';
import { useApplySkin } from '../skins/skinContext';
import type { SaveErrorReason } from '../store';
import type { Profile } from '../domain/types';
import {
  useActiveProfile,
  useHydrated,
  useLastLoadRaw,
  useLoadError,
  useSaveError,
} from '../store/selectors';
import { HotkeyProvider, useHotkeys } from '../ui/hotkeys';
import { SPOTLIGHT_COMBO, VIEWS, isViewId } from '../ui/nav/views';
import type { ViewId } from '../ui/nav/views';
import { stepBrowseBlock, stepBrowseWeek } from '../ui/planBrowse';
import { BootGate } from '../ui/components/Boot';
import { KonamiOverlay, useKonamiCode } from '../ui/components/KonamiOverlay';
import { PhaseTransitionGate } from '../ui/components/PhaseTransition';
import { SessionIndicator } from '../ui/components/SessionIndicator';
import { Spotlight } from '../ui/components/Spotlight';
import { SpotlightButton } from '../ui/components/SpotlightButton';
import { ToastProvider, ToastQueue } from '../ui/components/ToastQueue';
import { TrainingModalsProvider } from '../ui/components/TrainingModalsProvider';
import { MigrationGate } from '../ui/migration/MigrationGate';
import { MotivationGate } from '../ui/motivation/MotivationGate';
import { ReadinessScreen } from '../ui/setup/ReadinessScreen';
import { SetupWizard } from '../ui/setup/SetupWizard';
import { AtlasView } from '../ui/views/AtlasView';
import { LogView } from '../ui/views/LogView';
import { PlanView } from '../ui/views/PlanView';
import { SettingsView } from '../ui/views/SettingsView';
import { TargetsView } from '../ui/views/TargetsView';
import { TodayView } from '../ui/views/TodayView';
import { TrainView } from '../ui/views/TrainView';
import { downloadText } from './download';
import { useWeeklyClose } from './useWeeklyClose';
import { ReminderSync } from './ReminderSync';
import { UpdatePrompt } from './UpdatePrompt';
import './appShell.css';

/**
 * The view list is NOT declared here. src/ui/nav/views.ts is the one place a view is named:
 * the tab strip below, the hotkey digits, the spotlight palette and `isViewId` all read it, so
 * a view cannot exist in one of them and be missing from another (P8 Task 9). What is left in
 * this file is the switch that says which component each id renders, and
 * src/ui/nav/views.test.ts asserts there is an arm here for every view the registry names.
 */

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

  /*
   * The hotkey registry's ACTIVE SCOPE is the view on screen, so a key bound to 'plan' is
   * inert on every other view and cannot be shadowed by a global one (code review A54). The
   * provider is mounted here, inside the profile and readiness gates, because the digits
   * switch views and there are no views to switch between until the shell is up.
   */
  return (
    <HotkeyProvider activeScope={view}>
      <ViewSwitch view={view} />
    </HotkeyProvider>
  );
}

/**
 * The tab strip, the view switch and everything the keyboard reaches.
 *
 * Split from ViewShell only because `useHotkeys` has to be called BELOW the provider that owns
 * the listener. Every hook here runs unconditionally, including useKonamiCode: calling it
 * behind a condition is code review A52, and the state it sets is what is conditional.
 */
function ViewSwitch({ view }: { view: ViewId }): ReactElement {
  /*
   * The spotlight palette is CONTROLLED, and the two things below are the only things that
   * open it: the tap target, and the one binding on SPOTLIGHT_COMBO. The palette registers no
   * key listener of its own (code review A54 was two window listeners bound to the same combo,
   * both firing).
   *
   * `closeSpotlight` is a stable identity so the palette's `onClose` prop does not change on
   * every keystroke in the query box; the open handler is not, because it is passed to a
   * button that re-renders with the nav anyway.
   */
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const closeSpotlight = useCallback(() => {
    setSpotlightOpen(false);
  }, []);

  /*
   * The shortcut off switch (WCAG 2.1 SC 2.1.4), read here only to decide what is ANNOUNCED.
   * The registry does its own read at dispatch time; this one exists because aria-keyshortcuts
   * is a claim that the key works, and a claim that outlives the shortcut misleads exactly the
   * users the criterion is written for. A scalar selector, so the snapshot stays referentially
   * stable between renders.
   */
  const hotkeysOn = useAppStore((s) => s.ui.hotkeys);

  /*
   * The strip's words, resolved at RENDER against the active skin.
   *
   * NOT `copy()` and NOT the registry's `label`. Both are the DEFAULT table: `label` is a module
   * constant src/ui/nav/views.ts bakes at import, so it cannot follow `ui.skin` at all, and the
   * landmark's name was a bare `copy()` call beside it. Under limelight that left the palette
   * offering "the run" and the tab beside it still reading "Plan" (P8 review). The registry's
   * `copyKey` is the row, and this is the reader, which is exactly what
   * src/ui/components/Spotlight.tsx does with the same rows.
   */
  const c = useCopy();

  const [konami, setKonami] = useState(false);
  const closeKonami = useCallback(() => {
    setKonami(false);
  }, []);
  // Unconditionally, and with a stable callback: the hook is a sequence detector that binds no
  // combo, so it cannot shadow anything in the registry.
  useKonamiCode(
    useCallback(() => {
      setKonami(true);
    }, []),
  );

  /*
   * The app's own keys. The digits come from the registry rather than from a list written out
   * here, so a view added there is reachable from the keyboard without a second edit.
   *
   * Escape is NOT bound. ModalShell already closes an open dialog on Escape from its own
   * listener, and ToastQueue already withdraws the front toast on it; a third handler would
   * close two things with one press.
   */
  const globalKeys = useMemo<Record<string, () => void>>(() => {
    const map: Record<string, () => void> = {
      [SPOTLIGHT_COMBO]: () => {
        setSpotlightOpen(true);
      },
    };
    for (const v of VIEWS) {
      map[String(v.digit)] = () => {
        useAppStore.getState().setUi({ lastView: v.id });
      };
    }
    return map;
  }, []);
  useHotkeys('global', globalKeys);

  /*
   * Plan browsing, in the 'plan' SCOPE: these keys mean nothing on any other view, and binding
   * them globally is what made `j` advance the programme week from inside the Train view
   * (code review A54). They move the scrubber, which is a view of the plan and never a
   * position in it (A14), so nothing here writes to the store.
   */
  const planKeys = useMemo<Record<string, () => void>>(
    () => ({
      j: () => {
        stepBrowseBlock(1);
      },
      k: () => {
        stepBrowseBlock(-1);
      },
      arrowright: () => {
        stepBrowseWeek(1);
      },
      arrowleft: () => {
        stepBrowseWeek(-1);
      },
    }),
    [],
  );
  useHotkeys('plan', planKeys);

  return (
    <>
      <nav className="viewnav" aria-label={c('nav.label')}>
        {VIEWS.map((n) => (
          <button
            key={n.id}
            type="button"
            aria-current={view === n.id}
            /*
             * The digit that reaches this tab, read from the registry entry rather than written
             * out here, so a re-ordered VIEWS list cannot leave the announcement naming the old
             * key. Absent while the shortcuts are switched off: the attribute is a promise that
             * the key press does something, and it must not outlive the binding.
             */
            aria-keyshortcuts={hotkeysOn ? String(n.digit) : undefined}
            onClick={() => {
              // Through getState(), like every other action call in this codebase: the store's
              // actions are created once and never replace themselves, so subscribing to one
              // buys nothing and hands the component an unbound method.
              useAppStore.getState().setUi({ lastView: n.id });
            }}
          >
            {c(n.copyKey)}
          </button>
        ))}
        {/*
         * The tap target for the palette. It sits in the nav because SPOTLIGHT_COMBO cannot be
         * pressed on a phone, which would otherwise leave the palette unreachable there.
         */}
        <SpotlightButton
          onOpen={() => {
            setSpotlightOpen(true);
          }}
        />
      </nav>
      <Spotlight open={spotlightOpen} onClose={closeSpotlight} />
      {view === 'targets' && <TargetsView />}
      {view === 'settings' && <SettingsView />}
      {view === 'today' && <TodayView />}
      {view === 'plan' && <PlanView />}
      {view === 'train' && <TrainView />}
      {view === 'log' && <LogView />}
      {view === 'atlas' && <AtlasView />}
      {konami && <KonamiOverlay onClose={closeKonami} />}
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
  tag: CopyKey;
  message: CopyKey;
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
        tag: 'banner.saveQuota.tag',
        message: 'banner.saveQuota.body',
        recovery: 'export-memory',
      };
    case 'unavailable':
      return {
        tag: 'banner.saveUnavailable.tag',
        message: 'banner.saveUnavailable.body',
        recovery: 'export-memory',
      };
    case 'serialize':
      return {
        tag: 'banner.saveFailed.tag',
        message: 'banner.saveFailed.body',
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
  const t = useCopy();
  if (saveError === null) return null;

  const { tag, message, recovery } = saveErrorCopy(saveError.reason);

  return (
    <div className="banner" role="alert">
      <span className="banner-tag">{t(tag)}</span>
      <span>{t(message)}</span>
      {recovery === 'export-memory' ? (
        <button
          type="button"
          onClick={() => {
            downloadText('fixthisinjustice-export.json', useAppStore.getState().exportJson());
          }}
        >
          {t('button.exportData')}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().retrySave();
            }}
          >
            {t('button.retrySave')}
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
            {t('button.exportStoredCopy')}
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
  const t = useCopy();
  // The reason is the only value in the sentence, so the frame takes the skin's table with it:
  // a skin that rewrites the row around `{reason}` reaches the rendered string, and the reason
  // itself is never rewritten.
  const overrides = useCopyOverrides();
  if (loadError === null) return null;

  return (
    <div className="banner" role="alert">
      <span className="banner-tag">{t('banner.loadInvalid.tag')}</span>
      <span>{FORMAT.loadInvalid(loadError, overrides)}</span>
      <button
        type="button"
        onClick={() => {
          downloadText('fixthisinjustice-recovery.json', lastLoadRaw ?? '{}');
        }}
      >
        {t('button.exportStoredData')}
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
  /*
   * The skin, mirrored onto <html data-skin> for the two attribute-scoped token blocks in
   * src/ui/styles/tokens.css (P8 Task 12). First, and before useHydrateOnce: it is an effect,
   * so it runs after the commit either way, and the reading order is the one that has to be
   * obvious. Unconditional, like every hook in this component.
   */
  useApplySkin();
  /*
   * The audio unlock, armed on the first gesture of any kind (P8 Task 15).
   *
   * It belongs in the SHELL rather than on the Start tap because the Start tap is not the only
   * way into a session: a PWA resumed from the home screen lands straight back on Train with a
   * session already under way, and the rest interval ends without anything having been tapped
   * there. Train's own unlock on the Start handler stays; this one covers every other entry.
   *
   * Not autoplay. Nothing sounds because of it, and `ui.sounds` still gates every sound; with
   * sounds off the player fetches nothing at all (src/skins/sfx.ts).
   */
  useFirstGestureUnlock();
  /*
   * The header's own two words. Unconditional and above every early return in the tree below,
   * like the hooks around it; the two rows read here were literals byte-identical to their
   * table entries until P9 Task 15.
   */
  const t = useCopy();
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
    <ToastProvider>
      <TrainingModalsProvider>
        <div className={crtClasses}>
          {/*
           * The Worker's copy of the reminder schedule, kept in step with the store (P5 Task 6).
           * It renders nothing, so its position carries no layout: it is first so the mount
           * sync is issued on the app's first commit rather than behind the view tree, and it
           * attaches nothing at all in a build that carried no Worker origin.
           */}
          <ReminderSync />
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
            <span>{t(hydrated ? 'shell.status.loaded' : 'shell.status.loading')}</span>
          </header>

          <main>
            <UpdatePrompt />
            <SaveErrorBanner />
            <LoadErrorBanner />
            {/*
             * The legacy import offer (P7). A PANEL, not a route and not a modal: it is rendered
             * beside the view switch rather than in place of it, so a user who wants to ignore
             * the old data can still log a set today. It gates itself on all four of its
             * conditions and renders null otherwise, so it costs the shell nothing.
             */}
            <MigrationGate />

            {/*
             * The boot sequence (P8 Task 6). A FIXED overlay covering the whole screen while it
             * runs, so its position in the tree carries no layout and the app behind it does not
             * reflow when it unmounts. It gates itself on `ui.bootSeen` and renders null once the
             * sequence has recorded itself as seen, which is why it is mounted unconditionally.
             * Inside <main> so setup, which is the whole screen before a profile exists, boots
             * behind the same sequence as everything else.
             */}
            <BootGate />

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

          {/*
           * The weekly-miss popup (P6). Outside <main>, as the last child of the CRT root,
           * because it is a modal over the whole app rather than a panel inside the view area.
           * It gates itself on the pending week, the profile, an idle session and the migration
           * offer, and renders null otherwise.
           */}
          <MotivationGate />

          {/*
           * The block transition cutscene (P8 Task 10). A modal over the whole app, beside the
           * weekly-miss popup rather than inside <main>, and last because it is the lowest
           * priority interruption of the two: it reports work already done, while the popup
           * asks for a decision about a week that was missed. It gates itself on the plan
           * CURSOR's block, an idle session, a finished boot and the migration offer, and
           * renders null otherwise.
           */}
          <PhaseTransitionGate />
        </div>
      </TrainingModalsProvider>

      {/*
       * The two live regions, outside the CRT root and fixed to the viewport, so a toast is
       * never clipped by the shell's layout and never covered by the scanline and vignette
       * layers (.toast-stack sits above both). They are always in the DOM, empty or not: a
       * live region a screen reader first meets at the moment its content arrives is
       * announced unreliably.
       */}
      <ToastQueue />
    </ToastProvider>
  );
}
