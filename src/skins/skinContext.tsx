import { useEffect } from 'react';
import { useAppStore } from '../store';
import type { SkinId } from '../domain/types';

export type { SkinId } from '../domain/types';

/**
 * The three skins, in the order the Settings picker offers them and the order the Zod enum in
 * schema.ts lists them. Derived from nothing: the union in types.ts is the type and this is the
 * value, and the schema suite holds the two in step.
 */
export const SKIN_IDS: readonly SkinId[] = ['clinical', 'limelight', 'board'];

/**
 * The active skin, read from the one place it is stored.
 *
 * There is deliberately no React context behind this. A context provider fed from the store
 * would be a second copy of the same fact, and the failure it invites is the one that matters
 * here: a component reading the provider while the attribute on <html> follows the store, so
 * the copy and the colours disagree. One store field, one reader.
 */
export function useSkin(): SkinId {
  return useAppStore((state) => state.ui.skin);
}

/**
 * Mirrors `ui.skin` onto `document.documentElement.dataset.skin`, which is what the two
 * attribute-scoped blocks in src/ui/styles/tokens.css key on.
 *
 * WHY AN ATTRIBUTE AND NOT A CLASS. `:root[data-skin='limelight']` has the same specificity a
 * class would, but an attribute holds exactly one value: a class list can carry two skins at
 * once, and which one wins then depends on stylesheet order rather than on state.
 *
 * The write is imperative because <html> is outside the React tree. The cleanup removes the
 * attribute rather than restoring a previous value, so a test that renders and unmounts leaves
 * no global state behind; the app itself mounts this once, for the life of the document.
 */
export function useApplySkin(): void {
  const skin = useSkin();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.skin = skin;
    return () => {
      delete root.dataset.skin;
    };
  }, [skin]);
}
