// src/ui/planFocus.tsx
//
// The deep link between a spotlight result and the row it names in the Plan view.
//
// WHAT THIS REPLACES. The legacy palette (legacy/console-shared.jsx:147-224) switched view and
// then, inside a setTimeout, built a CSS attribute selector for the row and scrolled to it. Two
// things could drift silently: the selector against the markup, and the timeout against the
// render. The id is now built by ONE function (planRowDomId, src/ui/format/plan.ts), and the
// delivery is an EFFECT in the Plan view rather than a timer, so it runs when the row exists
// and not a fixed number of milliseconds after the request.
//
// WHY MODULE STATE AND NOT A CONTEXT. The P8 draft put this in a React context. A context needs
// its provider mounted in src/app/App.tsx, which P8 Task 9 owns and this task may not edit, so
// the palette would have had nowhere to publish from. A module-level pending request read
// through useSyncExternalStore needs no provider, works whether or not the Plan view is
// currently mounted, and is the arrangement src/ui/components/ModalShell.tsx already uses for
// the scroll lock: one slot, shared by every subtree in the document.
//
// The request is CONSUMED, not merely read: it is cleared the moment it is DELIVERED, so
// re-mounting the Plan view later does not jump the user to a row they asked for once. Cleared
// on sight instead, a link into a week the view is not showing would be swallowed in silence,
// which is the defect this file's usePlanRowFocus documents at length.

import { useEffect, useSyncExternalStore } from 'react';
import { planRowDomId } from './format/plan';

/** The planned-exercise row a deep link is asking the Plan view to reveal. */
export interface PlanFocusTarget {
  sessionId: string;
  exerciseId: string;
}

/**
 * The one outstanding request, or null when there is none.
 *
 * Module scope for the reason ModalShell's scroll-lock counter is: the writer (the palette) and
 * the reader (the Plan view) are in different subtrees, and the palette unmounts as it writes.
 */
let pending: PlanFocusTarget | null = null;
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

/**
 * useSyncExternalStore compares snapshots by IDENTITY, so this must return the stored reference
 * rather than a fresh object; a new object per call would re-render on every store notification.
 */
function getPending(): PlanFocusTarget | null {
  return pending;
}

/**
 * Ask the Plan view to reveal one row. Pass null to withdraw an undelivered request.
 *
 * Safe to call while the Plan view is unmounted: the request waits, and the view picks it up on
 * its first render. That is the ordinary case, because the palette is normally open over a
 * different view when the user selects an exercise.
 */
export function requestPlanFocus(target: PlanFocusTarget | null): void {
  pending = target;
  emit();
}

/** The outstanding request, as a subscription. Exported for tests and for future callers. */
export function usePendingPlanFocus(): PlanFocusTarget | null {
  // The third argument is the server snapshot; this app never renders on a server, and passing
  // the same getter keeps the two in step rather than throwing if it ever does.
  return useSyncExternalStore(subscribe, getPending, getPending);
}

/**
 * Called once, unconditionally, at the top of PlanView. Delivers any outstanding request to the
 * row it names: keyboard focus first, then the scroll. Returns the request it is still waiting
 * to deliver, or null.
 *
 * FOCUS, NOT ONLY SCROLL. Scrolling moves the viewport and tells a screen reader nothing. The
 * row carries tabIndex={-1} so it can take focus programmatically without entering the tab
 * order, which is what makes the deep link land for a keyboard or screen-reader user too.
 *
 * TWO PHASES, AND WHY THE TARGET IS RETURNED. The Plan view renders ONE WEEK at a time, so a
 * link into another week names a row that is not in the document when the request arrives.
 * This hook cannot fix that itself: which week holds a session is a fact about the plan, which
 * the caller holds and this module does not. So phase one is the caller's - it reads the
 * returned target, scrubs to that target's week, and re-renders - and phase two is this effect
 * finding the row that scrub produced. A caller that ignores the return value gets the old
 * behaviour for rows already on screen and no delivery for the rest.
 *
 * CONSUMED AT DELIVERY, NOT AT READ. Clearing on sight would drop exactly the cross-week
 * request phase one exists to serve. The request therefore survives until the row is found,
 * and the caller withdraws it (requestPlanFocus(null)) when no week of the plan holds it, so
 * an unresolvable request cannot sit pending for a later, unrelated plan to deliver.
 */
export function usePlanRowFocus(): PlanFocusTarget | null {
  const target = usePendingPlanFocus();

  /*
   * No dependency array, deliberately: this is a retry, and the thing it waits on is the DOM
   * rather than a value React can compare. React commits the DOM before an effect runs, so
   * "after every render of the Plan view" is exactly "every time the row set may have changed"
   * - the week scrub, a late hydration, a plan swap. Once the request is delivered or
   * withdrawn, `target` is null and every later run is the single check below.
   */
  useEffect(() => {
    if (target === null) return;

    const row = document.getElementById(planRowDomId(target.sessionId, target.exerciseId));
    // Not there YET: the caller is expected to scrub to the target's week, and the next render
    // is the next attempt. Doing nothing is the honest outcome for this pass.
    if (row === null) return;

    // Cleared as the delivery happens. React's development double-invoke replays this effect
    // body with the SAME captured target, so it does run twice for one request; both halves of
    // the delivery are idempotent (clearing a cleared slot is a no-op, and focusing the focused
    // row is one too), which is what makes the repeat harmless rather than prevented.
    requestPlanFocus(null);

    row.focus();
    // jsdom implements no layout and therefore does not define scrollIntoView, so the guard is
    // what keeps the test environment from throwing on a purely visual step.
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'center' });
    }
  });

  return target;
}
