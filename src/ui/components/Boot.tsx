// src/ui/components/Boot.tsx
//
// The boot sequence, generic.
//
// The legacy console printed a named individual's body composition and a medication line while
// it "booted". Content review section 7 removed both, so this replacement prints only facts the
// app already shows elsewhere: the plan's name, the week the CURSOR stands in, and the weekly
// session count. No display name, no time zone, no place, no mass, no medication. There is
// therefore nothing here for the personal-data gate in .github/workflows/ci.yml to find, and
// nothing that has to be redacted before a screenshot.
//
// Three exports, three concerns:
//   buildBootLines  the text, a pure function of the document, unit-tested as strings;
//   Boot            the timed print of that text;
//   BootGate        the one-line mount, which reads UiPrefs.bootSeen and unmounts the sequence
//                   the moment the sequence records itself as seen.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import './boot.css';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { AppState } from '../../domain/types';
import { useAppStore } from '../../store';

/**
 * Delay between printed lines. [ms]
 *
 * 90 ms is the legacy sequence's own cadence, kept because it is the one number in this file
 * with a reason behind it: a seven-line boot then costs 0.63 s, which is under the 1 s a user
 * reads as "the app started" rather than as "the app is slow".
 */
export const BOOT_LINE_INTERVAL_MS = 90; // [ms] per line

/**
 * The boot text for a document.
 *
 * Pure: same document in, same lines out, no clock and no store read. That is what makes the
 * content assertable without rendering anything, and it is why the personal-data test can read
 * the lines directly rather than scraping the DOM.
 *
 * With no active profile, no cursor or no plan, the plan block is skipped and the sequence is
 * two lines: the console line and READY. Setup runs behind the same boot as everything else,
 * so this path is the one a first run takes.
 */
export function buildBootLines(
  state: AppState,
  overrides?: Partial<Record<CopyKey, string>>,
): string[] {
  const ok = copy('status.bootOk', overrides);
  const lines: string[] = [FORMAT.bootStep(copy('status.bootConsole', overrides), ok)];

  const profileId = state.activeProfileId;
  const cursor = profileId === null ? undefined : state.cursors[profileId];
  const plan = cursor === undefined ? undefined : state.plans[cursor.planId];

  /*
   * The two lower bounds are the schema's own (sessionsPerWeek and weeks are both >= 1), and
   * they are restated rather than assumed: sessionsPerWeek is a divisor below, and a document
   * that reached this function with 0 would print "week Infinity of 0" instead of failing.
   */
  if (cursor !== undefined && plan !== undefined && plan.sessionsPerWeek >= 1 && plan.weeks >= 1) {
    /*
     * nextSessionIndex is a 0-based count of sessions the cursor has advanced past, so the week
     * it stands in is that count divided by the weekly session count, 1-based for display. It
     * is the CURSOR's week, never the calendar's: the two diverge the moment a session is
     * missed, which is the same argument SessionIndicator records for "S n/N".
     *
     * Clamped to the plan's length because the terminal cursor value is sessions.length, which
     * is one session past the last week and would print week 13 of a 12-week plan.
     */
    const week = Math.min(
      Math.floor(cursor.nextSessionIndex / plan.sessionsPerWeek) + 1, // [weeks], 1-based
      plan.weeks, // [weeks]
    );
    lines.push(
      FORMAT.bootStep(copy('status.bootPlan', overrides), ok),
      FORMAT.withSlots('status.bootPlanName', { name: plan.name }, overrides),
      FORMAT.withSlots('status.bootWeek', { week, weeks: plan.weeks }, overrides),
      FORMAT.withSlots(
        'status.bootSchedule',
        { count: plan.sessionsPerWeek }, // [sessions/week]
        overrides,
      ),
      FORMAT.bootStep(copy('status.bootStore', overrides), ok),
    );
  }

  lines.push(copy('status.bootReady', overrides));
  return lines;
}

/**
 * True when the user has asked for reduced motion.
 *
 * The typeof guard is not defensive noise: jsdom implements no matchMedia at all, and neither
 * do some embedded webviews, so an unguarded call throws rather than returning false
 * (src/domain/reminders/client.ts makes the same argument for display-mode).
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The timed print.
 *
 * `onDone` is optional because the sequence already records itself as seen through the store,
 * which is what BootGate watches; a caller that wants to do something else as well passes one.
 */
export function Boot({ onDone }: { onDone?: () => void }): ReactElement | null {
  /*
   * Three mount-time snapshots, deliberately not subscriptions.
   *
   * The lines: a subscription would rebuild the text mid-sequence when anything at all changed
   * in the document, and the boot would print a different plan halfway down.
   *
   * bootSeen: the sequence SETS this flag when it finishes, so a component that also read it
   * reactively would blank itself on its own last line. Read once, at mount, it answers the
   * only question that matters here: has this document already seen a boot?
   *
   * The motion preference: a media query is live, but a user who changes it mid-boot has
   * changed it for the next boot, and re-running the sequence under them would be the motion
   * the setting asks us not to produce.
   */
  const t = useCopy();
  /*
   * The skin as it stands at MOUNT. The sequence is a snapshot for the same reason the
   * document is (the comment above): a line already printed cannot be rewritten under the
   * user, and the boot lasts under a second, so no skin change can arrive mid-sequence.
   */
  const overrides = useCopyOverrides();
  const [lines] = useState<string[]>(() => buildBootLines(useAppStore.getState(), overrides));
  const [seenAtMount] = useState<boolean>(() => useAppStore.getState().ui.bootSeen);
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const [shown, setShown] = useState<number>(reduced ? lines.length : 0); // [lines] printed

  const [finished, setFinished] = useState<boolean>(false);

  const active = !seenAtMount;
  const finishedRef = useRef<boolean>(false);

  /*
   * Idempotent by the ref rather than by the store flag: the tap handler, the key handler and
   * the completion effect can all reach this in the same commit, and setUi is a write to the
   * persisted document, not a free call.
   */
  const finish = useCallback((): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    setShown(lines.length);
    // Through getState() rather than through a selector: a bound action read as a hook trips
    // @typescript-eslint/unbound-method, and this is the repo's convention for calling one.
    useAppStore.getState().setUi({ bootSeen: true });
    onDone?.();
  }, [lines.length, onDone]);

  /*
   * One timeout per line, all scheduled at mount at an ABSOLUTE offset from it, and each one
   * setting the count it owns rather than incrementing a shared one.
   *
   * Not a chain: a chain schedules line n + 1 from inside line n's callback, so every line's
   * delay is measured from the previous RENDER rather than from the mount, and the sequence
   * stretches by however long each commit took. Not an interval either: an interval has to be
   * cleared from inside its own callback once the last line is printed, which is a side effect
   * in a state updater.
   *
   * `finished` is a dependency so that a skip tears the pending timeouts down: without it the
   * queued callbacks would fire after the skip and print the sequence backwards. It only ever
   * flips once, so the effect never reschedules from a fresh mount time.
   */
  useEffect(() => {
    if (!active || reduced || finished) return undefined;
    const handles = lines.map((_, index) =>
      setTimeout(
        () => {
          setShown(index + 1); // [lines] printed, absolute
        },
        (index + 1) * BOOT_LINE_INTERVAL_MS, // [ms] from mount
      ),
    );
    return () => {
      for (const handle of handles) clearTimeout(handle);
    };
  }, [active, reduced, finished, lines]);

  /*
   * Completion, in an effect rather than in the timeout: under reduced motion every line is
   * already printed at mount, so there is no timeout to hang it on, and the two paths must
   * record the boot the same way.
   */
  useEffect(() => {
    if (!active || shown < lines.length) return;
    finish();
  }, [active, shown, lines.length, finish]);

  /*
   * Any key skips, which is what a boot screen is expected to do, and it is also the keyboard
   * equivalent of the tap handler on the section below. Nothing is preventDefault-ed, so a Tab
   * still moves focus while the sequence tears down.
   */
  useEffect(() => {
    if (!active) return undefined;
    const skip = (): void => {
      finish();
    };
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
    };
  }, [active, finish]);

  // After every hook, so the hook order is the same on a mount that renders nothing.
  if (!active) return null;

  return (
    /*
     * Not a live region. The text changes every 90 ms and aria-live would read the whole block
     * again on each line; the label names the screen once and the Skip control is the part a
     * screen reader user needs to reach.
     */
    <section className="boot" aria-label={t('hero.boot')} onClick={finish}>
      <pre className="boot-pre" data-testid="boot-text">
        {lines.slice(0, shown).join('\n')}
      </pre>
      <button type="button" className="boot-skip" onClick={finish}>
        {t('button.skipBoot')}
      </button>
    </section>
  );
}

/**
 * The mount point: `<BootGate />`, once, anywhere in the shell.
 *
 * It is the piece that reads `UiPrefs.bootSeen` reactively, so the sequence disappears the
 * moment it records itself as seen and never comes back on a later mount. Boot itself must not
 * do this, for the reason its snapshot comment gives.
 */
export function BootGate(): ReactElement | null {
  const bootSeen = useAppStore((s) => s.ui.bootSeen);
  return bootSeen ? null : <Boot />;
}
