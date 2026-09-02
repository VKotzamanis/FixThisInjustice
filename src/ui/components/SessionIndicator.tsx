// src/ui/components/SessionIndicator.tsx
//
// "S n/N" — the position the plan cursor is actually at. This replaces the legacy "D n/168"
// indicator, which counted calendar days since the start date and therefore reported a
// position the user had not reached (code review A11, A12). The cursor is attendance-driven
// (master plan section 6.4: it advances only on complete or skip), so this component reads
// PlanCursor.nextSessionIndex and PlanTemplate.sessions.length and never a date at all.

import type { ReactElement } from 'react';
import './sessionIndicator.css';
import { FORMAT, copy } from '../../content/copy';
import { useActiveCursor } from '../../store/scheduleSelectors';
import { useActivePlan } from '../../store/selectors';

export function SessionIndicator(): ReactElement | null {
  const plan = useActivePlan();
  const cursor = useActiveCursor();
  // Both hooks run before this return, so the early exit does not change the hook order.
  if (plan === null || cursor === null) return null;

  const total = plan.sessions.length; // [sessions] the whole programme
  /*
   * 1-based for display. nextSessionIndex is 0-based and its terminal value is
   * sessions.length (master plan section 6.7: "nextSessionIndex never exceeds
   * plan.sessions.length"), which would print N+1 unclamped. The min also holds the line
   * against a document whose cursor has run further than that.
   */
  const shown = total === 0 ? 0 : Math.min(cursor.nextSessionIndex + 1, total); // [sessions]
  const complete = cursor.completedOn !== null;

  return (
    <span
      className="session-indicator"
      data-testid="session-indicator"
      /*
       * role="img" makes the aria-label the element's accessible NAME. ARIA does not require
       * a label on a generic element to be exposed, and "S 12/48" read out as written is not
       * a sentence, so the spoken form is the one below. Not role="status": this is a
       * standing indicator, and a live region would announce it on every cursor change.
       */
      role="img"
      aria-label={FORMAT.planPositionLabel(
        shown,
        total,
        complete ? copy('hero.programmeComplete') : '',
      )}
      title={copy('label.planPosition')}
      /*
       * Inline, not in the stylesheet: the digits change under the user (S 9/48 to S 10/48)
       * in a fixed slot, so proportional figures would shift the label sideways on every
       * session. That makes it a correctness guarantee rather than theming, and inline is the
       * one place the test suite can assert it (vitest stubs stylesheets).
       */
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {FORMAT.planPosition(shown, total, complete ? copy('status.planComplete') : '')}
    </span>
  );
}
