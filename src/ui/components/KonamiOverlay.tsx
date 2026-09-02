// src/ui/components/KonamiOverlay.tsx
//
// The one easter egg: the Konami sequence, and the card it puts on screen.
//
// WHAT THIS FIXES. Code review A52 found `useKonamiCode` called behind an `if` in the legacy
// build (legacy/console-fun.jsx), a Rules-of-Hooks violation that survived only because the
// script load order made the condition constant. The hook is called UNCONDITIONALLY by the app
// shell now, and the state it sets is what decides whether the overlay renders.
//
// WHY IT MAY KEEP ITS OWN LISTENER. src/ui/hotkeys.tsx exists so that exactly one window
// listener holds the app's key BINDINGS (code review A54). This is not a binding: it is a
// sequence detector that binds no combo, calls no preventDefault, and cannot shadow a hotkey.
// The overlay's own close-on-any-key listener is the same kind of thing, and it exists only
// while the overlay is on screen.
//
// WHY THE OVERLAY IS A DIALOG. `role="dialog" aria-modal="true"` is the selector the hotkey
// registry and ToastQueue both treat as "the app behind this is not taking commands", so the
// key that dismisses the overlay cannot also switch view underneath it. That is the whole
// reason the roles are here; the overlay traps no focus and is not a ModalShell, because it
// answers nothing and holds no decision.
//
// THE CSS ARRIVED LATE. P8 Task 16 wrote no stylesheet ("what this plan does not do": every
// component uses class names P1's src/ui/styles/ is expected to carry), so `.konami-bg` was a
// plain block in normal flow and the one easter egg in the app pushed the view down instead of
// covering it. P8 close-out B adds konami.css beside this file, which is where every other
// component in this directory keeps its rules.

import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import './konami.css';

/**
 * The sequence, in normalised (lowercased `KeyboardEvent.key`) form.
 *
 * Lowercased on both sides so a user with caps lock on, or holding shift for the letters, is
 * not silently excluded from the one joke in the app.
 */
const CODE: readonly string[] = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];

/** [ms] How long the overlay stays up if nothing dismisses it. */
export const KONAMI_OVERLAY_MS = 6000;

/**
 * The arrows, as a picture. Decorative and `aria-hidden`: a screen reader reading `+---+` is
 * being read punctuation, and the sentence beside it is the content.
 *
 * ASCII only, and deliberately not the overlay's sentence: the sentence lives in the copy
 * table so a skin can reword it, and art that restated it would be a second copy no skin
 * could reach.
 */
const ART = `+---------------------------------------------+
|  up up down down left right left right B A  |
+---------------------------------------------+`;

/**
 * Watch for the sequence. Call it unconditionally, at the top of a component that is always
 * mounted; the ACTIVATION is what is conditional, never the hook.
 *
 * The buffer is a sliding window rather than a strict state machine, so a false start costs
 * nothing: the wrong key shifts out of the window and the next attempt is judged on its own.
 */
export function useKonamiCode(onActivate: () => void): void {
  const buffer = useRef<string[]>([]);
  // Read through a ref so a caller passing a fresh closure each render does not re-subscribe
  // the listener, and so the window is not cleared underneath a user mid-sequence.
  const latest = useRef(onActivate);
  latest.current = onActivate;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      buffer.current.push(e.key.toLowerCase());
      if (buffer.current.length > CODE.length) buffer.current.shift();
      if (buffer.current.length !== CODE.length) return;
      if (!buffer.current.every((k, i) => k === CODE[i])) return;
      // Cleared, so the next activation needs the whole sequence again rather than one more
      // press of `a`.
      buffer.current = [];
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}

/**
 * The card the sequence puts on screen: one line, one picture, one way out that needs no
 * pointer and one that needs no keyboard.
 */
export function KonamiOverlay({ onClose }: { onClose: () => void }): ReactElement {
  const t = useCopy();
  const line = t('status.konami');
  const latest = useRef(onClose);
  latest.current = onClose;
  const dismissRef = useRef<HTMLButtonElement>(null);

  /*
   * Focus moves into the overlay at mount and back where it came from at unmount.
   *
   * `role="dialog" aria-modal="true"` is a promise to assistive technology that the app behind
   * this is not taking commands. Leaving focus outside it breaks that promise in both
   * directions: a screen reader goes on reading the page under the overlay, and a keyboard user
   * tabs through controls the overlay has covered. The DISMISS BUTTON rather than the panel,
   * because it is the only thing in here to do; focusing the box would make Tab the first
   * useful key rather than Enter.
   *
   * The restore is the same pattern src/ui/components/ModalShell.tsx documents, and it matters
   * more here than in a dialog the user opened deliberately: this one closes itself after
   * KONAMI_OVERLAY_MS whether or not anyone touched it, and focus would land on <body> with the
   * user's place in the page gone. Focusing a detached node is a no-op, which covers the whole
   * tree unmounting at once.
   */
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dismissRef.current?.focus();
    return () => {
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    // ANY key, which is why this is not a hotkey binding: the registry maps one combo to one
    // handler, and "whatever the user presses next" is not a combo.
    const onKey = (): void => {
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    // An overlay nobody dismisses is an overlay covering the app. The timeout is the floor
    // under both exits below, not a substitute for them.
    const handle = setTimeout(() => {
      latest.current();
    }, KONAMI_OVERLAY_MS);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(handle);
    };
  }, []);

  return (
    <div className="konami-bg" role="dialog" aria-modal="true" aria-label={line}>
      <div className="konami">
        <pre className="konami-art" aria-hidden="true">
          {ART}
        </pre>
        <p className="konami-line">{line}</p>
        <button
          type="button"
          ref={dismissRef}
          onClick={() => {
            onClose();
          }}
        >
          {t('button.dismiss')}
        </button>
      </div>
    </div>
  );
}
