import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { FORMAT } from '../content/copy';
import type { CopyKey } from '../content/copy';
import { useCopy, useCopyOverrides } from '../content/useCopy';
import { useAppStore } from '../store';
import { useFirstGestureUnlock } from '../skins/sfx';
import { useApplySkin } from '../skins/skinContext';
import type { LimelightIconName } from '../skins/limelight/icons';
import type { SaveErrorReason } from '../store';
import {
  useActivePlan,
  useActiveProfile,
  useLastLoadRaw,
  useLoadError,
  useSaveError,
} from '../store/selectors';
import { useActiveCursor } from '../store/scheduleSelectors';
import { HotkeyProvider, useHotkeys } from '../ui/hotkeys';
import { goToView, useHistoryRouter } from '../ui/nav/router';
import { MoreSheet } from '../ui/nav/MoreSheet';
import { TabBar } from '../ui/nav/TabBar';
import { ViewActiveContext } from '../ui/nav/viewActive';
import { SPOTLIGHT_COMBO, VIEWS, VIEW_IDS, VIEW_INSTRUCTIONS, VIEW_TITLES, isViewId } from '../ui/nav/views';
import type { ViewId } from '../ui/nav/views';
import { stepBrowseBlock, stepBrowseWeek } from '../ui/planBrowse';
import { BootGate } from '../ui/components/Boot';
import { IntroGate } from '../ui/intro/IntroSequence';
import { KonamiOverlay, useKonamiCode } from '../ui/components/KonamiOverlay';
import { Marquee } from '../ui/components/Marquee';
import type { MarqueeItem } from '../ui/components/Marquee';
import { PhaseTransitionGate } from '../ui/components/PhaseTransition';
import { Spotlight } from '../ui/components/Spotlight';
import { ToastProvider, ToastQueue } from '../ui/components/ToastQueue';
import { TrainingModalsProvider } from '../ui/components/TrainingModalsProvider';
import { MotivationGate } from '../ui/motivation/MotivationGate';
import { SetupErrorBoundary } from '../ui/setup/SetupErrorBoundary';
import { SetupWizard } from '../ui/setup/SetupWizard';
import { SetupBannerProvider, useSetupBanner } from '../ui/setup/setupBanner';
import { AtlasView } from '../ui/views/AtlasView';
import { LogView } from '../ui/views/LogView';
import { PlanView } from '../ui/views/PlanView';
import { SettingsView } from '../ui/views/SettingsView';
import { TargetsView } from '../ui/views/TargetsView';
import { TodayView } from '../ui/views/TodayView';
import { TrainView } from '../ui/views/TrainView';
import { downloadText } from './download';
import { LoadRecovery } from './LoadRecovery';
import { useWeeklyClose } from './useWeeklyClose';
import { useStorageEstimate } from './useStorageEstimate';
import { ReminderSync } from './ReminderSync';
import { UpdatePrompt } from './UpdatePrompt';
import { StaleSessionNotice } from './StaleSessionNotice';
import { UnreadableNotice } from './UnreadableNotice';
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
  // Spec R6: one history entry per view; Back closes the top overlay, then switches view.
  useHistoryRouter(view);

  /*
   * The hotkey registry's ACTIVE SCOPE is the view on screen, so a key bound to 'plan' is
   * inert on every other view and cannot be shadowed by a global one (code review A54). The
   * provider is mounted here, inside the profile gate, because the digits
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
   * open it: the More sheet's "find it" row, and the one binding on SPOTLIGHT_COMBO. The palette registers no
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

  // Brief 2.2: the More sheet, opened from the fifth slot.
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => {
    setMoreOpen(false);
  }, []);

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
   * Escape is NOT bound. The overlay stack already closes the top dialog on Escape from its own
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
        goToView(v.id);
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
      <Spotlight open={spotlightOpen} onClose={closeSpotlight} />
      <ViewStack view={view} />
      {/* Brief 2.2: the fixed bottom bar; More opens the sheet with the other views and the palette. */}
      <TabBar
        view={view}
        moreOpen={moreOpen}
        onMore={() => {
          setMoreOpen(true);
        }}
      />
      {moreOpen && (
        <MoreSheet
          view={view}
          onClose={closeMore}
          onFind={() => {
            setSpotlightOpen(true);
          }}
        />
      )}
      {konami && <KonamiOverlay onClose={closeKonami} />}
    </>
  );
}

/** The component each view id renders. A switch, so a ninth ViewId is a compile error here. */
function renderView(id: ViewId): ReactElement {
  switch (id) {
    case 'targets':
      return <TargetsView />;
    case 'settings':
      return <SettingsView />;
    case 'today':
      return <TodayView />;
    case 'plan':
      return <PlanView />;
    case 'train':
      return <TrainView />;
    case 'log':
      return <LogView />;
    case 'atlas':
      return <AtlasView />;
  }
}

/**
 * Audit F02: every view visited since launch stays MOUNTED and is hidden when another is shown,
 * so a half-typed set, a Targets draft or a Settings field survives a tab switch. A view is
 * mounted on its first visit, never before (cold start pays for one view, not seven).
 */
function ViewStack({ view }: { view: ViewId }): ReactElement {
  const [visited, setVisited] = useState<ReadonlySet<ViewId>>(() => new Set([view]));
  if (!visited.has(view)) setVisited(new Set([...visited, view]));
  return (
    <>
      {VIEW_IDS.filter((id) => visited.has(id) || id === view).map((id) => (
        <div key={id} className="view-slot" data-view={id} hidden={id !== view}>
          <ViewActiveContext value={id === view}>{renderView(id)}</ViewActiveContext>
        </div>
      ))}
    </>
  );
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

/** Audit B05: the origin is near its storage quota; the in-memory export is the backup. */
function StorageNearlyFullBanner(): ReactElement | null {
  const nearlyFull = useAppStore((s) => s.status.storageNearlyFull === true);
  const t = useCopy();
  if (!nearlyFull) return null;
  return (
    <div className="banner" role="status">
      <span className="banner-tag">{t('banner.storageNearlyFull.tag')}</span>
      <span>{t('banner.storageNearlyFull.body')}</span>
      <button
        type="button"
        onClick={() => {
          downloadText('fixthisinjustice-export.json', useAppStore.getState().exportJson());
        }}
      >
        {t('button.exportData')}
      </button>
    </div>
  );
}

/**
 * One icon per view, for the marquee item TopbarTicker builds from `VIEW_INSTRUCTIONS`.
 *
 * Kept here rather than beside `VIEW_INSTRUCTIONS` in src/ui/nav/views.ts: that registry is
 * skin-neutral (its own header says so), and `LimelightIconName` is a limelight-skin type, so
 * the mapping belongs with the one renderer that reads it. A judgement call, not a fixed
 * convention: none of these seven is a stronger fit than another among the icon set P10 Brief
 * D's own instructions restrict this to (src/skins/limelight/icons.ts).
 */
const VIEW_ICONS: Record<ViewId, LimelightIconName> = {
  today: 'alert',
  plan: 'crownPanel',
  train: 'barbellPanel',
  targets: 'drop',
  log: 'heart',
  atlas: 'lips',
  settings: 'fan',
};

/**
 * What follows the fixed brand in the top bar: where the user is, in one phrase.
 *
 * ROUND 2, `r2-onboarding.general`: "The banner of the web page (That now says FIX THIS
 * INJUSTICE) is not dynamic. I would Like it to append some information as the user moves
 * forward." The brand does not move; this is the part that does.
 *
 *   the intro                    `Hi, How Are Ya`
 *   setup, no name yet           `Welcome Aboard`
 *   setup, once a name is given  `Welcome Aboard: {name}`
 *   setup, blank name at Review  `Welcome Aboard: Shy or Paranoid?`
 *   after setup                  the view's own name: `Atlas`, `Log`, and so on
 *
 * THE NAME IS THE USER'S OWN TEXT and is rendered exactly as typed. `FORMAT.bannerName` is a
 * frame with a slot, never a concatenation here, and nothing on this path trims, re-cases or
 * truncates the string. `trim()` decides only WHETHER a name has been given, which is the same
 * test `SetupWizard.confirm()` uses before falling back to the default display name; the value
 * handed to the frame is the raw one.
 *
 * THE JOKE IS KEYED OFF REVIEW, NEVER OFF AN EMPTY FIELD. `Shy or Paranoid?` is for a user who
 * reached the end of setup without giving a name, not for one who has not typed it yet, so it
 * reads `atReview` from the wizard rather than deciding for itself that the field is blank.
 *
 * WHICH SETUP TIER IT FOLLOWS, decided against brief K's two-tier draft: the MERGED view, which
 * is `buffer ?? committed` and is exactly what `SetupWizard` renders the name field's own `value`
 * from. Following the committed tier alone would leave the banner a step behind the field the
 * user is looking at, which reads as a bug; following the buffer alone would blank the banner
 * every time a step commits and the buffer empties. The wizard publishes its own merged `draft`,
 * so the banner and the field can never disagree by construction.
 */
function TopbarTitle(): ReactElement {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const profile = useActiveProfile();
  // Scalar selectors, so each snapshot stays referentially stable between renders.
  const introSeen = useAppStore((s) => s.ui.introSeen);
  const storedView = useAppStore((s) => s.ui.lastView);
  const setup = useSetupBanner();

  function text(): string {
    // The intro is the first thing a fresh document shows, ahead of boot and ahead of setup, and
    // `ui.introSeen` is the same flag IntroGate mounts itself on.
    if (!introSeen) return t('status.bannerIntro');
    if (profile === null) {
      // `null` means no wizard is mounted yet, which is the same screen as "nothing typed".
      const typed = setup?.displayName ?? '';
      if (typed.trim() !== '') return FORMAT.bannerName(typed, overrides);
      if (setup?.atReview === true) return t('status.bannerSetupAnonymous');
      return t('status.bannerSetup');
    }
    // The same fallback ViewShell uses, so the banner can never name a view the shell is not
    // showing.
    return t(VIEW_TITLES[isViewId(storedView) ? storedView : 'targets']);
  }

  return (
    <span className="topbar-title" data-testid="topbar-title">
      {text()}
    </span>
  );
}

/**
/**
 * The top bar's moving instruction, and the session position SessionIndicator used to carry
 * (P10 Brief D, part 1).
 *
 * READS ui.lastView DIRECTLY rather than a prop, because the header sits above <main> and
 * ViewShell -- the only other reader of ui.lastView -- is not mounted until a profile exists.
 * Gated on a profile existing for the same reason: an instruction names one of the seven VIEWS,
 * and Setup is a fixed sequence outside that list. Its own fallback ('targets') matches
 * ViewShell's exactly, so the instruction shown here can never name a different view than the
 * tab strip renders below it.
 *
 * THE SESSION POSITION IS DISPLACED HERE FROM SessionIndicator, which the brief describes as "a
 * shipped feature ... visible from every view" that this task moves "into the marquee as its
 * own item rather than dropping it". src/ui/components/SessionIndicator.tsx is left standing,
 * unedited and still fully covered by SessionIndicator.test.tsx: nothing in the brief asks for
 * that file or its suite to change, so this reads the same two selectors and the same
 * `FORMAT.planPositionLabel` frame it does, as a second, independent renderer of the same fact,
 * rather than importing a component built to stand alone with its own `role="img"` label and
 * its own tabular-nums guarantee, neither of which a MarqueeItem (an icon plus a plain string)
 * has anywhere to put.
 *
 */
function TopbarTicker(): ReactElement | null {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const profile = useActiveProfile();
  const storedView = useAppStore((s) => s.ui.lastView);
  const plan = useActivePlan();
  const cursor = useActiveCursor();

  /*
   * DURING SETUP the bar still carries an instruction. Brief D scoped the instruction registry to
   * the seven VIEWS, and setup is a fixed sequence outside that list, which left the bar holding
   * only the brand for the whole wizard. That is the empty bar round 1 reported (claim C1.03.1),
   * arriving by a different route, so setup gets one instruction of its own rather than nine.
   */
  const view: ViewId | null =
    profile === null ? null : isViewId(storedView) ? storedView : 'targets';
  const instructionText = view === null ? t('advice.setupInstruction') : t(VIEW_INSTRUCTIONS[view]);

  const items: MarqueeItem[] = [
    { icon: view === null ? 'fan' : VIEW_ICONS[view], text: instructionText },
  ];
  if (plan !== null && cursor !== null) {
    const total = plan.sessions.length; // [sessions] the whole programme
    // 1-based for display, clamped exactly as SessionIndicator.tsx clamps it: nextSessionIndex's
    // terminal value is sessions.length (master plan section 6.7), which would print N+1 unclamped.
    const shown = total === 0 ? 0 : Math.min(cursor.nextSessionIndex + 1, total); // [sessions]
    const complete = cursor.completedOn !== null;
    items.push({
      icon: 'stopwatchPanel',
      text: FORMAT.planPositionLabel(
        shown,
        total,
        complete ? t('hero.programmeComplete') : '',
        overrides,
      ),
    });
  }

  return <Marquee items={items} label={t('button.pauseUpdates')} />;
}

export function App(): ReactElement {
  /*
   * The skin, mirrored onto <html data-skin> for the two attribute-scoped token blocks in
   * src/ui/styles/tokens.css (P8 Task 12). First: it is an effect, so it runs after the commit
   * either way, and the reading order is the one that has to be obvious. Unconditional, like every hook in this component.
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
   * The document is already in the store: main.tsx awaits hydrate() before the first render
   * (spec R13), so the first run of the closure sees the stored profile. Before any
   * conditional return, so the hook order is
   * stable, and it is a no-op until a profile exists.
   */
  useWeeklyClose();
  useStorageEstimate();
  const profile = useActiveProfile();
  // Audit B01: a refused or unreadable document replaces intro, boot, setup and the views.
  const loadError = useLoadError();

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
   * P10 Brief C: the intro sequence gates the boot sequence, not just the setup wizard. Read as
   * a scalar selector so the snapshot stays referentially stable between renders, the same
   * reason `scanlines` and `flicker` are read this way above.
   */
  const introSeen = useAppStore((s) => s.ui.introSeen);

  /*
   * The two P4 modals are mounted once, here, and reached from any view through
   * useVideoModal() / useFormCuesModal(). Nothing is written to `window` (code review A53).
   * The provider renders its children unconditionally and each modal only while it holds an
   * open request, so this changes no existing behaviour.
   */
  return (
    <ToastProvider>
      <TrainingModalsProvider>
        {/*
         * The two facts the banner reads off the setup wizard (round 2, r2-onboarding.general).
         * It has to wrap BOTH the header and <main>, because the wizard is inside <main> and the
         * banner is in the header above it, and neither can read the other's state; see
         * src/ui/setup/setupBanner.tsx for why this is a context rather than a store field.
         */}
        <SetupBannerProvider>
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
               * Where the user is, appended to the fixed brand (round 2, r2-onboarding.general).
               * Immediately after the brand rather than at the far end of the bar, because the two
               * are read as one line: the app's name, then this page's.
               */}
              <TopbarTitle />
              {/*
               * The moving instruction for the current view, and the session position it now
               * carries (P10 Brief D, part 1: the app name stays fixed on the left, the
               * instruction moves). Kept by the owner in the one-row header (P4a AM-4a-1). Renders nothing until a profile exists, so the header keeps
               * its two-element layout through setup, exactly as SessionIndicator's absence did.
               */}
              <TopbarTicker />
            </header>

            <main>
              <UpdatePrompt />
              <SaveErrorBanner />
              <LoadErrorBanner />
              <StorageNearlyFullBanner />

              {/*
               * The intro sequence (P10 Brief C), AHEAD of the boot sequence below. A fixed
               * overlay exactly like BootGate, so it costs the tree nothing beyond itself and
               * gates itself on `ui.introSeen`. It is mounted unconditionally, like BootGate,
               * because it is the piece that has to notice the moment the sequence records itself
               * as seen and disappear.
               */}
              {/*
               * The boot sequence (P8 Task 6). A FIXED overlay covering the whole screen while it
               * runs, so its position in the tree carries no layout and the app behind it does not
               * reflow when it unmounts. It gates itself on `ui.bootSeen` and renders null once the
               * sequence has recorded itself as seen, which is why it is mounted unconditionally.
               * Inside <main> so setup, which is the whole screen before a profile exists, boots
               * behind the same sequence as everything else.
               *
               * ALSO gated here on `introSeen`, which BootGate itself does not check: the two
               * intro and Boot sequence would otherwise overlap when introSeen and bootSeen are false.
               * Deferring Boot's mount until the intro has been seen keeps the two
               * sequential, which is what "shown once before... Setup, step 1 of 9" already means
               * for the intro and what P8 already means for the boot: the user meets exactly one
               * full-screen sequence at a time.
               */}
              {/*
               * Audit B01/B17/B18 (plan Task 17): a refused or unreadable document shows the
               * recovery screen INSTEAD of the intro, boot, setup and the views; the load-error
               * banner above stays. No profile otherwise means setup has not run: the wizard is
               * the whole screen until it has, because every other view needs a profile to read
               * units, time zone and targets from.
               */}
              {loadError !== null ? (
                <LoadRecovery />
              ) : (
                <>
                  <IntroGate />
                  {introSeen && <BootGate />}
                  {profile === null ? (
                    // Audit A12: a wizard throw stays inside setup, with Restart Setup and Reload.
                    <SetupErrorBoundary>
                      <SetupWizard />
                    </SetupErrorBoundary>
                  ) : (
                    <ViewShell />
                  )}
                </>
              )}
            </main>

            {/*
             * The weekly-miss popup (P6). Outside <main>, as the last child of the CRT root,
             * because it is a modal over the whole app rather than a panel inside the view area.
             * It gates itself on the pending week, the profile and an idle session, and renders
             * null otherwise.
             */}
            <MotivationGate />

            {/*
             * The block transition cutscene (P8 Task 10). A modal over the whole app, beside the
             * weekly-miss popup rather than inside <main>, and last because it is the lowest
             * priority interruption of the two: it reports work already done, while the popup
             * asks for a decision about a week that was missed. It gates itself on the plan
             * CURSOR's block, an idle session, a finished boot and the weekly-miss popup, and
             * renders null otherwise.
             */}
            <PhaseTransitionGate />
          </div>
        </SetupBannerProvider>
      </TrainingModalsProvider>

      {/*
       * The two live regions, outside the CRT root and fixed to the viewport, so a toast is
       * never clipped by the shell's layout and never covered by the scanline and vignette
       * layers (.toast-stack sits above both). They are always in the DOM, empty or not: a
       * live region a screen reader first meets at the moment its content arrives is
       * announced unreliably.
       */}
      <StaleSessionNotice />
      <UnreadableNotice />
      <ToastQueue />

    </ToastProvider>
  );
}
