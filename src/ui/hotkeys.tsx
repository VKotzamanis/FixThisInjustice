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
// WHAT IS STILL ALLOWED TO LISTEN. Three window listeners remain in the app, and none of them
// is a binding:
//  - src/ui/components/ModalShell.tsx handles Escape and Tab for an open dialog. It owns the
//    dialog's own keys, which is why nothing here binds Escape on the app's behalf.
//  - src/ui/components/ToastQueue.tsx withdraws the front toast on Escape, already guarded
//    against an open dialog.
//  - useKonamiCode (src/ui/components/KonamiOverlay.tsx) is a SEQUENCE detector: it binds no
//    combo, calls no preventDefault, and cannot shadow a hotkey.
//
// SCOPES. 'global' is the app's own keys (the view digits, the palette). A ViewId scope is a
// key that means something only while that view is on screen. 'dialog' is the carve-out for a
// key that must work while a modal dialog is open, and it is the ONLY scope consulted then:
// with a dialog up, the keys behind it are not the user's to press.

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
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
