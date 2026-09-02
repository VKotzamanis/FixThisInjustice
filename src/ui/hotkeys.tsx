// src/ui/hotkeys.tsx
//
// The single keydown listener for the whole app, and the scoped registry behind it.
//
// WHAT THIS FIXES. Code review A54 found two `window` keydown listeners binding the same keys:
// pressing `j` on the Train view opened the next exercise AND advanced the programme week, with
// nothing on screen to say why. Two listeners on one key is not a bug that can be fixed by
// ordering them; it is fixed by there being one. Every binding goes through this registry, the
// ACTIVE scope is consulted before 'global', and the first match ends the dispatch.
//
// WHAT IS STILL ALLOWED TO LISTEN. Seven window keydown listeners exist in the app. This file
// holds the first and it is the only BINDING table; each of the other six owns a press that is
// not a combo, so none of them can shadow a hotkey:
//  - this file: one listener, attached for as long as the provider is mounted, dispatching
//    every binding in the registry.
//  - src/ui/components/ModalShell.tsx handles Escape and Tab while its dialog is open. It owns
//    the dialog's own keys, which is why nothing here binds Escape on the app's behalf.
//  - src/ui/components/ToastQueue.tsx withdraws the front toast on Escape while a toast is
//    showing, already guarded against an open dialog.
//  - useKonamiCode (src/ui/components/KonamiOverlay.tsx) is a SEQUENCE detector, mounted for
//    the life of the view shell: it binds no combo, calls no preventDefault, and cannot shadow
//    a hotkey.
//  - KonamiOverlay itself closes on ANY key while the overlay is on screen. "Whatever the user
//    presses next" is not a combo, which is why it is not a binding here.
//  - src/ui/components/Boot.tsx skips the boot sequence on ANY key while the sequence runs, for
//    the same reason.
//  - useFirstGestureUnlock (src/skins/sfx.ts) resumes the audio context on the first gesture of
//    any kind and then removes itself, so it is armed once per document and binds nothing.
//
// SCOPES. 'global' is the app's own keys (the view digits, the palette). A ViewId scope is a
// key that means something only while that view is on screen. 'dialog' is the carve-out for a
// key that must work while a modal dialog is open, and it is the ONLY scope consulted then:
// with a dialog up, the keys behind it are not the user's to press.

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useAppStore } from '../store';
import type { ViewId } from './nav/views';

export type HotkeyScope = 'global' | 'dialog' | ViewId;

/**
 * Combos that must still fire while a text field has focus.
 *
 * Escape because a field inside a dialog must still be able to close it, and the palette combo
 * because the palette's own query box is a text field and the user who opens it a second time
 * expects the same key to work. Every other key is text the user is typing.
 */
const ALWAYS_ACTIVE = new Set(['escape', 'mod+k']);

/**
 * Combos `ui.hotkeys === false` leaves alone.
 *
 * WCAG 2.1 SC 2.1.4 (Character Key Shortcuts) is about a shortcut that a single character key
 * fires on its own: a letter, a digit, punctuation or a symbol. A user driving the app by
 * speech emits those characters as a side effect of speaking, and a user with a tremor emits
 * them by resting a hand on the keyboard, which is why the criterion asks for a way to switch
 * them off. A combo carrying a modifier is outside it, and so is a key that types no character:
 * `mod+k` is the only route to every view once the digits are gone, and Escape is how a dialog
 * is left, so taking either away would make the switch an accessibility defect of its own.
 *
 * The app's other non-printing bindings - `arrowleft` and `arrowright` on the Plan view - are
 * deliberately NOT exempt. They sit outside the letter of the criterion, but they are shortcuts
 * in the same sense as the `j` and `k` beside them, and a switch that took away half of one
 * scrubber is a switch the user cannot reason about. Going further than the criterion requires
 * is allowed; stopping halfway through a feature is not. Switching them off also hands the
 * arrows back to the browser, which is what a focused control expects them to do.
 */
const OFF_SWITCH_EXEMPT = new Set(['escape']);

/** Whether `ui.hotkeys === false` takes this combo away. */
function switchedOff(combo: string): boolean {
  return !combo.startsWith('mod+') && !OFF_SWITCH_EXEMPT.has(combo);
}

/**
 * A modal dialog that is actually OPEN. ModalShell unmounts rather than hides, so today the
 * `:not([hidden])` qualifier changes nothing; a dialog kept mounted and hidden would otherwise
 * swallow every hotkey for the rest of the session, which is a failure the user cannot
 * diagnose. The same selector is what ToastQueue guards its Escape with.
 */
const OPEN_DIALOG = '[role="dialog"][aria-modal="true"]:not([hidden])';

/**
 * The combo a key press stands for: the lowercased key, prefixed with `mod+` when either
 * platform's command modifier is held.
 *
 * Meta and Control map to ONE prefix on purpose. `mod+k` is Command on macOS and Control
 * elsewhere, and a binding table that spelled both would be two entries that must never
 * disagree. Shift and Alt are not encoded: they already change `key` itself (Shift+1 arrives
 * as '!'), so encoding them as well would give one physical press two spellings.
 */
export function normalizeCombo(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>): string {
  const key = e.key.toLowerCase();
  return e.metaKey || e.ctrlKey ? `mod+${key}` : key;
}

/** Whether the key press is text going into a field rather than a command. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

type ScopeMap = Map<HotkeyScope, Map<string, () => void>>;

interface HotkeyApi {
  register(scope: HotkeyScope, combo: string, handler: () => void): () => void;
}

const HotkeyContext = createContext<HotkeyApi | null>(null);

export function HotkeyProvider({
  activeScope,
  children,
}: {
  activeScope: HotkeyScope;
  children: ReactNode;
}): ReactElement {
  const scopesRef = useRef<ScopeMap>(new Map());
  /*
   * The active scope is read through a ref rather than closed over, so the listener below is
   * attached ONCE and not re-attached on every view switch. Re-attaching would be correct and
   * still wrong: the count of listeners on the window is the thing this module exists to hold
   * at one, and a listener that comes and goes is a listener that can be leaked.
   */
  const activeRef = useRef<HotkeyScope>(activeScope);
  activeRef.current = activeScope;

  const api = useMemo<HotkeyApi>(
    () => ({
      register(scope, combo, handler) {
        const scopes = scopesRef.current;
        let bucket = scopes.get(scope);
        if (!bucket) {
          bucket = new Map();
          scopes.set(scope, bucket);
        }
        // Two components binding one combo in one scope is the A54 defect in miniature: one of
        // them would win, silently, and which one would depend on mount order. It is a
        // programming error, so it is thrown rather than resolved.
        if (bucket.has(combo)) {
          throw new Error(`Hotkey "${combo}" is already bound in scope "${scope}"`);
        }
        bucket.set(combo, handler);
        const bound = bucket;
        return () => {
          bound.delete(combo);
        };
      },
    }),
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const combo = normalizeCombo(e);
      const scopes = scopesRef.current;

      /*
       * The off switch, WCAG 2.1 SC 2.1.4. Read at DISPATCH time through getState(), for the
       * reason the active scope above is read through a ref: the listener is attached once, and
       * the preference has to be able to change without it being re-attached or a single
       * binding being re-registered.
       *
       * BEFORE the dialog branch, so the switch reaches the 'dialog' scope too. No dialog binds
       * a character key today; one that did would be as unusable by speech as any other, and
       * Escape - the key that actually leaves a dialog - is exempt above.
       *
       * Returning without preventDefault is the whole behaviour: a switched-off key keeps the
       * browser's own handling, so the digit types a digit and the arrows move a focused
       * control, which is what the user who switched them off is asking for.
       */
      if (switchedOff(combo) && !useAppStore.getState().ui.hotkeys) return;

      /*
       * A dialog is modal: the app behind it is not accepting commands. Only the 'dialog'
       * scope is consulted, and ALWAYS_ACTIVE does not apply, so mod+k cannot open the palette
       * over a dialog the user has not answered. ModalShell's own Escape is untouched by this,
       * because it is not routed through this registry at all.
       */
      const underDialog = document.querySelector(OPEN_DIALOG) !== null;
      if (underDialog) {
        const handler = scopes.get('dialog')?.get(combo);
        if (!handler) return;
        e.preventDefault();
        handler();
        return;
      }

      if (isTextEntry(e.target) && !ALWAYS_ACTIVE.has(combo)) return;

      const scoped = scopes.get(activeRef.current)?.get(combo);
      const handler = scoped ?? scopes.get('global')?.get(combo);
      if (!handler) return;
      // Only once a binding has been found: an unbound key keeps its browser behaviour, which
      // includes the space bar scrolling and the arrows moving a focused control.
      e.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return <HotkeyContext.Provider value={api}>{children}</HotkeyContext.Provider>;
}

/**
 * Bind combos in one scope, for as long as the calling component is mounted.
 *
 * `bindings` is read through a ref on every render, so the HANDLERS need not be stable; what
 * must be stable is the SET of combo names, since that is what the registration effect keys
 * on. Passing a fresh object literal each render is therefore fine.
 */
export function useHotkeys(scope: HotkeyScope, bindings: Record<string, () => void>): void {
  const ctx = useContext(HotkeyContext);
  if (!ctx) throw new Error('useHotkeys must be used inside <HotkeyProvider>');
  const latest = useRef(bindings);
  latest.current = bindings;
  // A string, not the object, so the effect re-runs when the combo SET changes and not when a
  // caller passes a new object holding the same keys.
  const combos = Object.keys(bindings).sort().join('|');

  useEffect(() => {
    const offs = combos
      .split('|')
      .filter((c) => c !== '')
      .map((combo) => ctx.register(scope, combo, () => latest.current[combo]?.()));
    return () => {
      for (const off of offs) off();
    };
  }, [ctx, scope, combos]);
}
