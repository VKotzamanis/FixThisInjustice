// src/ui/components/ModalShell.tsx
//
// The dialog behaviour both P4 modals need, in one place: Escape and backdrop close, a focus
// trap, focus restored to whatever opened the dialog, and a scroll lock on the body.
//
// It exists because the two modals would otherwise carry the same forty lines twice, and
// because the legacy versions carried only half of them (an Escape listener and the scroll
// lock; no trap, no focus restore). Nothing here reads or writes a global handle: the modals
// are mounted by TrainingModalsProvider and reached through context (code review A53).

import { useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Everything inside the panel that can take focus. `iframe` is included because a framed
 * video is a tab stop, so leaving it out would let Tab walk out of the dialog through it.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface ModalShellProps {
  /** Id of the element whose text names the dialog. Generate it with useId in the caller. */
  labelledBy: string;
  /** Class on the panel, and `${className}-bg` conventionally on the backdrop. */
  className: string;
  backdropClassName: string;
  /** Names the backdrop for the tests that click it. */
  testId: string;
  /**
   * Must be referentially stable (useCallback in the provider). An unstable handler re-runs
   * the effect below on every render, which is exactly the churn of code review A53.
   */
  onClose: () => void;
  children: ReactNode;
}

export function ModalShell(props: ModalShellProps): ReactElement {
  const { onClose } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus lands on the panel, not on its first control: the dialog's name is read before
    // the user is handed a button they did not ask for.
    panel?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || panel === null) return;

      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (first === undefined || last === undefined) {
        // A dialog with no controls still must not leak focus to the page behind it.
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (active === null || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // The dialog unmounts on close, so this is where focus goes back to the control that
      // opened it. Focusing a detached node is a no-op, which covers the whole tree
      // unmounting at once.
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div
      className={props.backdropClassName}
      data-testid={props.testId}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={props.className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.labelledBy}
        tabIndex={-1}
        onClick={(e) => {
          // A click inside the panel is not a click on the backdrop.
          e.stopPropagation();
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
