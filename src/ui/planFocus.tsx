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
// The request is CONSUMED, not merely read: it is cleared the moment it is delivered, so
// re-mounting the Plan view later does not jump the user to a row they asked for once.

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
 * row it names: keyboard focus first, then the scroll.
 *
 * FOCUS, NOT ONLY SCROLL. Scrolling moves the viewport and tells a screen reader nothing. The
 * row carries tabIndex={-1} so it can take focus programmatically without entering the tab
 * order, which is what makes the deep link land for a keyboard or screen-reader user too.
 */
export function usePlanRowFocus(): void {
  const target = usePendingPlanFocus();

  useEffect(() => {
    if (target === null) return;
    // Cleared BEFORE the delivery, so this effect cannot run twice for one request (React's
    // development double-invoke, or any later re-render of the Plan view).
    requestPlanFocus(null);

    const row = document.getElementById(planRowDomId(target.sessionId, target.exerciseId));
    // A plan generated against an earlier library, or a row outside the week being shown, has
    // no element. Doing nothing is the honest outcome; the view is already correct.
    if (row === null) return;

    row.focus();
    // jsdom implements no layout and therefore does not define scrollIntoView, so the guard is
    // what keeps the test environment from throwing on a purely visual step.
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'center' });
    }
  }, [target]);
}
