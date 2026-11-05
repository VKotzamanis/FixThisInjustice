// src/ui/views/train/useSheetDismiss.ts
//
// Back and Escape close the game sheet (P6, plan D5). Opening pushes one history entry marked
// MARK; a popstate that lands on an unmarked entry is Back and closes the sheet; closing any other
// way steps back over the sheet's own entry, so the history stays as it was. A popstate that lands
// on a marked entry is ignored: under React StrictMode the effect runs twice and the first
// cleanup's step back arrives after the second push. Escape is left to a modal dialog open above
// the sheet (form cues, video).
//
// P4 (R6: one history entry per overlay) replaces this hook with its overlay stack.
import { useEffect, useRef } from 'react';

const MARK = 'ftiRestGameSheet';

function isSheetEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[MARK] === true;
}

export function useSheetDismiss(onDismiss: () => void): void {
  // The latest handler, read at event time, so the history entry is pushed exactly once.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    window.history.pushState({ [MARK]: true }, '');
    let popped = false;
    const onPop = (event: PopStateEvent): void => {
      if (isSheetEntry(event.state)) return;
      popped = true;
      dismissRef.current();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[aria-modal="true"]') !== null) return;
      dismissRef.current();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if (!popped && isSheetEntry(window.history.state)) window.history.back();
    };
  }, []);
}
