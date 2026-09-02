// src/ui/planBrowse.tsx
//
// Which week of the programme the Plan view is showing, as state a key press can move.
//
// WHY IT IS NOT LOCAL TO PlanView. The keys that move it are bound in the app shell, one level
// above the view, because the hotkey registry (src/ui/hotkeys.tsx) exists so that exactly one
// component owns the window listener. A `useState` inside PlanView is unreachable from there,
// and passing a setter down would put the binding back in the view, which is the shape code
// review A54 found two listeners in.
//
// WHY MODULE STATE AND NOT A CONTEXT. The same argument src/ui/planFocus.tsx makes, and the
// same arrangement: a context would oblige every existing PlanView test to mount a provider for
// a view that needs nothing else from one, and the value would then re-render the whole shell
// on every scrub. useSyncExternalStore re-renders only what subscribes.
//
// THE SCRUB IS A VIEW, NOT A POSITION. Nothing here writes to the store. Code review A14 was a
// week scrubber that moved the programme underneath the user; the browsed week is a fact about
// this screen and the cursor is a fact about the programme, and `null` below means "no opinion,
// follow the cursor" rather than "week 0".
//
// Deviations from the P8 plan's Task 9 Step 5 draft, recorded here and in the task report: the
// browsed position is a WEEK rather than a { blockIndex, sessionIndex } pair, because PlanView
// renders one week at a time and has no session cursor to move; a session index would be state
// that no key press could be seen to change. Block movement survives as a jump to the block's
// first week, which is what the block chips already do on a tap.

import { useSyncExternalStore } from 'react';
import type { PlanTemplate } from '../domain/types';
import { useAppStore } from '../store';
import { selectCursor, selectPlan } from '../store/scheduleSelectors';

/**
 * The week the Plan view is showing, 0-based, or null while it is following the cursor.
 *
 * Module scope for the reason planFocus.tsx's pending target is: the writer (the shell's key
 * handler) and the reader (the Plan view) are in different subtrees.
 */
let browsedWeek: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getBrowsedWeek(): number | null {
  return browsedWeek;
}

/**
 * Zero-based week index of a session position.
 *
 * @param sessionIndex 0-based position in `PlanTemplate.sessions`
 * @param sessionsPerWeek [sessions/week]
 *
 * A plan with no weekly rate cannot be chunked, and dividing by it would put Infinity into the
 * scrubber's value. Week 0 is the only answer that is not a lie.
 */
export function weekOfIndex(sessionIndex: number, sessionsPerWeek: number): number {
  if (sessionsPerWeek <= 0) return 0;
  return Math.floor(sessionIndex / sessionsPerWeek);
}

/** [sessions/week] The plan's rate, or 1 for a plan that claims none or no plan at all. */
export function sessionsPerWeekOf(plan: PlanTemplate | null): number {
  return plan !== null && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
}

/**
 * [weeks] How many weeks the plan's SESSIONS fill.
 *
 * Derived from the session list and not from `PlanTemplate.weeks`, so no scrubber can offer a
 * week the plan has no sessions for. One week is the floor: that is what the "no plan" state
 * of the view occupies.
 */
export function weekCountOf(plan: PlanTemplate | null): number {
  if (plan === null) return 1;
  return Math.max(1, Math.ceil(plan.sessions.length / sessionsPerWeekOf(plan)));
}

interface Bounds {
  /** [weeks] */
  weekCount: number;
  /** [weeks] 0-based week the programme cursor stands in. */
  cursorWeek: number;
  /** [weeks] 0-based first week of each block, in plan order. */
  blockStarts: readonly number[];
}

/**
 * The plan facts a move needs, read from the store at the moment of the move.
 *
 * Read through getState() rather than a subscription: these functions are called from a key
 * handler, not from a render, and a stale copy captured at bind time would clamp against a
 * plan the user has since replaced.
 */
function bounds(): Bounds {
  const state = useAppStore.getState();
  const plan = selectPlan(state);
  const cursor = selectCursor(state);
  const spw = sessionsPerWeekOf(plan); // [sessions/week]
  const weekCount = weekCountOf(plan); // [weeks]
  const cursorWeek =
    cursor === null ? 0 : Math.min(weekOfIndex(cursor.nextSessionIndex, spw), weekCount - 1);
  const blockStarts = (plan?.blocks ?? []).map((b) => weekOfIndex(b.firstSessionIndex, spw));
  return { weekCount, cursorWeek, blockStarts };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function publish(week: number | null): void {
  if (browsedWeek === week) return;
  browsedWeek = week;
  emit();
}

/**
 * Show one week, clamped to the weeks the plan holds. Pass null to go back to following the
 * cursor, which is what `resetPlanBrowse` is a name for.
 */
export function browseWeek(week: number | null): void {
  if (week === null) {
    publish(null);
    return;
  }
  publish(clamp(Math.trunc(week), 0, bounds().weekCount - 1));
}

/**
 * Move the shown week by `delta`, from the cursor's week when nothing has been browsed yet.
 *
 * Clamped rather than wrapped: a user holding the key down at the end of the programme must
 * not silently reappear at week 1, and an unclamped counter would need as many presses back as
 * it took overshooting.
 */
export function stepBrowseWeek(delta: number): void {
  const { weekCount, cursorWeek } = bounds();
  const current = browsedWeek ?? cursorWeek;
  publish(clamp(current + delta, 0, weekCount - 1));
}

/**
 * Jump to the first week of the next or previous BLOCK.
 *
 * Defined on week boundaries rather than on block indices because a block is what the user
 * sees in the chip strip and a week is what the view can show. `delta > 0` lands on the
 * nearest block start after the shown week, `delta < 0` on the nearest one before it; at
 * either end of the strip the shown week does not move.
 */
export function stepBrowseBlock(delta: number): void {
  const { weekCount, cursorWeek, blockStarts } = bounds();
  const current = browsedWeek ?? cursorWeek;
  const candidates = blockStarts
    .map((w) => clamp(w, 0, weekCount - 1))
    .filter((w) => (delta > 0 ? w > current : w < current));
  if (candidates.length === 0) return;
  // Forward: the nearest start after the shown week. Back: the nearest one before it.
  publish(delta > 0 ? Math.min(...candidates) : Math.max(...candidates));
}

/** Follow the cursor again. Called when the shell leaves the Plan view by keyboard. */
export function resetPlanBrowse(): void {
  publish(null);
}

/**
 * The browsed week, as a subscription. null means the caller should show the cursor's week.
 *
 * The third argument is the server snapshot; this app never renders on a server, and passing
 * the same getter keeps the two in step rather than throwing if it ever does.
 */
export function usePlanBrowseWeek(): number | null {
  return useSyncExternalStore(subscribe, getBrowsedWeek, getBrowsedWeek);
}
