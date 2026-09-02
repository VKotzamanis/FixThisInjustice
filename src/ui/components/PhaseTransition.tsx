// src/ui/components/PhaseTransition.tsx
//
// The block transition cutscene, and the gate that decides it is due.
//
// WHAT THIS FIXES. Code review A61: the legacy cutscene was keyed to `s.week`, the Plan view's
// SCRUB position, and closing it wrote `lastPhaseSeen`. Dragging the week slider to week 20 in
// week 2 therefore fired the Phase 1 to Phase 3 cutscene immediately, read out the statistics
// of a block not yet trained, and consumed the flag, after which no real transition could ever
// fire. One tap disabled the feature for the rest of the programme.
//
// The gate below is keyed to PlanCursor.nextSessionIndex through
// src/domain/fun/blocks.ts, which advances only when a session is completed or skipped.
// Browsing cannot move it, so browsing cannot fire or consume the cutscene.
//
// WHY IT IS A ModalShell. It is the one screen in the app that interrupts: it covers the view,
// it holds one decision (acknowledge and move on), and it must not leave focus behind it. The
// shell supplies the trap, the Escape and backdrop exits, the focus restore and the scroll
// lock; the KonamiOverlay's argument for NOT using it - that it answers nothing - is exactly
// what does not hold here.
//
// Units: session indices are [sessions] offsets counted from 0; block numbers are shown 1-based.
// Tonnage is canonical [kg] and is converted at the display boundary only.

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import './phaseTransition.css';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { blockStats, currentBlockIndex, isBlockBoundary } from '../../domain/fun/blocks';
import type { BlockStats } from '../../domain/fun/blocks';
import type { UnitSystem } from '../../domain/types';
import { UNIT_LABEL, displayMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { hasLegacyV2 } from '../../store/persistence';
import { usePendingMotivation } from '../../store/selectors';
import { ModalShell } from './ModalShell';

/** [ms] from mount to the first statistic. */
const FIRST_STEP_MS = 600;
/** [ms] between statistics after the first. */
const STEP_MS = 800;
/** Four statistics, then the control: the reveal is finished at STEPS. */
const STEPS = 5;

/**
 * A picture of the boundary: a stretch finished, the crossing, a stretch ahead.
 *
 * ASCII only, decorative and `aria-hidden`, and deliberately wordless. KonamiOverlay's rule
 * applies here too: the sentence lives in the copy table so a skin can reword it, and art that
 * restated it would be a second copy no skin could reach.
 */
const ART = '[==================]==>[..................]';

/**
 * True when the user has asked for reduced motion.
 *
 * The typeof guard is Boot.tsx's, for its reason: jsdom implements no matchMedia at all, and
 * neither do some embedded webviews, so an unguarded call throws rather than returning false.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Total mass moved, in the profile's display unit. [kg] in, display unit out.
 *
 * Whole units, not the one decimal `formatMass` gives a body mass: this is a five-figure sum
 * over a block, and a tenth of a kilogram on it is precision the number does not have.
 *
 * The locale is PINNED rather than left ambient. A grouped thousands separator is what makes
 * a five-figure number readable, and reading the machine's locale would make the same document
 * render differently on two devices, which is exactly what src/domain/units.ts refuses to do
 * for the numbers themselves.
 */
function formatTonnage(tonnageKg: number, units: UnitSystem): string {
  const value = Math.round(displayMass(tonnageKg, units)); // [kg] or [lb]
  return `${value.toLocaleString('en-US')} ${UNIT_LABEL[units].mass}`;
}

export function PhaseTransition({
  fromIndex,
  toIndex,
  stats,
  units,
  onClose,
}: {
  /** 0-based PlanBlock.index of the block just finished. */
  fromIndex: number;
  /** 0-based PlanBlock.index of the block being entered. */
  toIndex: number;
  stats: BlockStats;
  units: UnitSystem;
  onClose: () => void;
}): ReactElement {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const headingId = useId();
  /*
   * The motion preference is read ONCE, at mount, exactly as Boot reads it: a user who changes
   * the setting mid-cutscene has changed it for the next one, and re-running the reveal under
   * them would be the motion the setting asks us not to produce.
   */
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const [step, setStep] = useState<number>(reduced ? STEPS : 0);

  /*
   * One timeout per step, all scheduled at mount at an ABSOLUTE offset from it, each setting
   * the step it owns rather than incrementing a shared counter. Boot.tsx's argument: a chain
   * measures each delay from the previous RENDER, so the reveal stretches by however long each
   * commit took, and an interval has to be cleared from inside its own callback.
   */
  useEffect(() => {
    if (reduced) return undefined;
    const handles = Array.from({ length: STEPS }, (_, index) =>
      setTimeout(
        () => {
          setStep(index + 1); // absolute, not an increment
        },
        FIRST_STEP_MS + index * STEP_MS, // [ms] from mount
      ),
    );
    return () => {
      for (const handle of handles) clearTimeout(handle);
    };
  }, [reduced]);

  return (
    <ModalShell
      labelledBy={headingId}
      className="phase"
      backdropClassName="phase-bg"
      testId="phase-transition"
      onClose={onClose}
    >
      <h2 className="pt-head" id={headingId}>
        {/* 1-based for display; PlanBlock.index is 0-based, as FORMAT.blockLabel records. */}
        {FORMAT.withSlots(
          'status.blockTransition',
          { from: fromIndex + 1, to: toIndex + 1 },
          overrides,
        )}
      </h2>
      <pre className="pt-art" aria-hidden="true">
        {ART}
      </pre>
      <dl className="pt-stats">
        {step >= 1 && (
          <div className="pt-row">
            <dt>{t('label.blockSessionsCompleted')}</dt>
            <dd>{stats.sessionsCompleted}</dd>
          </div>
        )}
        {step >= 2 && (
          <div className="pt-row">
            <dt>{t('label.blockSetsLogged')}</dt>
            <dd>{stats.setsLogged}</dd>
          </div>
        )}
        {step >= 3 && (
          <div className="pt-row">
            <dt>{t('label.blockMassMoved')}</dt>
            <dd>{formatTonnage(stats.tonnageKg, units)}</dd>
          </div>
        )}
        {step >= 4 && (
          <div className="pt-row">
            <dt>{t('label.blockSpecimens')}</dt>
            <dd>{stats.specimensOwned}</dd>
          </div>
        )}
      </dl>
      {step >= STEPS && (
        <button type="button" className="pt-continue" onClick={onClose}>
          {t('button.continue')}
        </button>
      )}
    </ModalShell>
  );
}

/**
 * Decides whether the cutscene is due, and records it as seen when it closes.
 *
 * Five conditions have to hold together, and none of them is a fact the cutscene can supply
 * for itself:
 *
 *  - the cursor stands in a block ahead of the last one this profile was shown. That is the
 *    whole A61 fix: `UiPrefs.lastBlockSeenByProfile` is compared against the CURSOR's block,
 *    never against a browse position, and it is written only by the close below.
 *  - a profile and its plan exist. Without them there is no block and nothing to count.
 *  - no session is in progress. `session.activeAssignmentDate` is "the civil day the user is
 *    training, once a session has been opened on it" (sessionMirror.ts), so a non-null value
 *    means sets are being logged and a rest timer may be running. A modal over that would take
 *    the timer off screen mid-set.
 *  - the boot sequence has finished. It is a fixed overlay covering the whole screen, and a
 *    dialog opened underneath it would trap focus in something nobody can see.
 *  - the legacy migration is not being offered. See the latch below.
 *  - no missed week is waiting to be answered. Both gates are mounted by the app shell and
 *    both used to satisfy their conditions on the same render, so two ModalShells opened at
 *    once. Each shell listens for Escape on the WINDOW, so one keypress aimed at the popup
 *    reached both handlers, and this gate's onClose wrote `lastBlockSeenByProfile` for a block
 *    the user never saw - which consumes the cutscene permanently, because the flag never
 *    goes back down. The popup wins because it is answering a question; the cutscene is due
 *    again on the next render after the Dismiss, and `usePendingMotivation` goes null on that
 *    render because the dismissal is a store write (MotivationGate.tsx).
 *
 *    This is NOT latched, unlike the migration below. The migration is a one-way data decision
 *    made in a wizard that stays on screen after writing its flag; the popup unmounts the
 *    instant its own write lands, so there is no window in which un-suppressing would paint
 *    over anything.
 *
 * Deferring costs nothing: the block stays unseen, so the cutscene is due again on the next
 * render for which every condition holds.
 */
export function PhaseTransitionGate(): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profiles = useAppStore((s) => s.profiles);
  const cursors = useAppStore((s) => s.cursors);
  const plans = useAppStore((s) => s.plans);
  const assignments = useAppStore((s) => s.assignments);
  const sets = useAppStore((s) => s.sets);
  const specimens = useAppStore((s) => s.specimens);
  const seenMap = useAppStore((s) => s.ui.lastBlockSeenByProfile);
  const bootSeen = useAppStore((s) => s.ui.bootSeen);
  const activeAssignmentDate = useAppStore((s) => s.session.activeAssignmentDate);
  const legacyDecision = useAppStore((s) => s.ui.legacyMigration);
  // The missed-week popup's own question, read through the selector that owns it so the two
  // gates cannot disagree about whether one is pending (src/store/selectors.ts).
  const pendingMiss = usePendingMotivation();

  /*
   * Read once per mount, as MigrationGate and MotivationGate read it: the legacy key does not
   * appear while the app is open, and it DISAPPEARS when the wizard's delete step runs, which
   * must not be read as "the migration is over" a frame before the wizard says so.
   */
  const [legacyPresent] = useState<boolean>(() => hasLegacyV2());

  /*
   * Latched, and deliberately not the live condition alone. MotivationGate's argument holds
   * here unchanged: applyMigration writes ui.legacyMigration = 'done' as part of the document
   * it installs, while the wizard is still on screen making its last offer to delete the old
   * data. A gate reading only the live condition would un-suppress mid-wizard and paint a
   * second modal over a destructive confirmation, with two ModalShells fighting over focus and
   * the scroll lock.
   *
   * Setting state during render is React's documented way to derive state from a changed
   * input; it re-renders before committing, so no extra paint is shown.
   */
  const migrationOffered = legacyPresent && legacyDecision === 'pending';
  const [suppressedByMigration, setSuppressedByMigration] = useState(migrationOffered);
  if (migrationOffered && !suppressedByMigration) setSuppressedByMigration(true);

  const cursor = profileId === null ? undefined : cursors[profileId];
  const plan = cursor === undefined ? undefined : plans[cursor.planId];
  const currentIndex =
    plan === undefined || cursor === undefined ? null : currentBlockIndex(plan, cursor);

  /*
   * The statistics belong to the block just FINISHED, which is the one before the index the
   * cursor now stands in.
   *
   * Computed here rather than inside a store selector: blockStats returns a fresh object, and
   * a selector returning one on every call hands zustand a snapshot that never compares equal
   * to the last, which is an unbounded re-render. The five slices it reads are subscribed to
   * individually above, so the memo is recomputed exactly when one of them changes.
   */
  const stats = useMemo<BlockStats | null>(
    () =>
      profileId === null || currentIndex === null
        ? null
        : blockStats({ cursors, plans, assignments, sets, specimens }, profileId, currentIndex - 1),
    [cursors, plans, assignments, sets, specimens, profileId, currentIndex],
  );

  /*
   * Stable, because ModalShell re-runs its whole effect - listener, scroll lock, focus restore
   * - whenever this identity changes (code review A53).
   *
   * The write is through getState(), the repo's convention for calling a store action: a bound
   * action read as a hook trips @typescript-eslint/unbound-method.
   */
  const onClose = useCallback((): void => {
    if (profileId === null || currentIndex === null) return;
    useAppStore
      .getState()
      .setUi({ lastBlockSeenByProfile: { ...seenMap, [profileId]: currentIndex } });
  }, [profileId, currentIndex, seenMap]);

  // Every hook above is called unconditionally; the decisions come after them.
  if (suppressedByMigration || pendingMiss !== null) return null;
  if (!bootSeen || activeAssignmentDate !== null) return null;
  if (profileId === null || currentIndex === null || stats === null) return null;
  const profile = profiles[profileId];
  if (profile === undefined) return null;
  if (!isBlockBoundary(seenMap[profileId] ?? 0, currentIndex)) return null;

  return (
    <PhaseTransition
      fromIndex={currentIndex - 1}
      toIndex={currentIndex}
      stats={stats}
      units={profile.units}
      onClose={onClose}
    />
  );
}
