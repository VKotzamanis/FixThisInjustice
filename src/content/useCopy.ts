import { useCallback } from 'react';
import { SKIN_COPY, copyFor } from './copy';
import type { CopyKey } from './copy';
import { useSkin } from '../skins/skinContext';

/**
 * The React binding for the copy tables.
 *
 * WHY THIS IS A SEPARATE MODULE. `copy.ts` holds the tables and stays free of React and of the
 * store: a Node script, a Vitest unit test and a future server render all read a string from it
 * without pulling Zustand in. This file is the one place where the two meet, so the dependency
 * points one way and only from here.
 *
 * WHY NOT A CONTEXT. `src/skins/skinContext.tsx` decided that: a provider fed from the store is a
 * second copy of the same fact, and the failure it invites is a component reading the provider
 * while the attribute on <html> follows the store, so the words and the colours disagree. One
 * store field, one reader.
 *
 * MIGRATION. Components still calling `copy(key)` render the clinical string, which is what they
 * rendered before this module existed. Swapping such a call for `useCopy()` is a per-component
 * change with a per-component test, so it belongs to the task that owns the component rather than
 * to the task that ships the tables.
 */
export function useCopy(): (key: CopyKey) => string {
  const skin = useSkin();
  // Stable per skin, so a component may put it in a dependency array without re-running an effect
  // on every render.
  return useCallback((key: CopyKey): string => copyFor(skin, key), [skin]);
}

/**
 * The active skin's override table, for the `FORMAT` frames.
 *
 * A frame that carries a value takes the same `overrides` table `copy()` takes
 * (`FORMAT.withSlots`, `FORMAT.milestoneSets`, `FORMAT.planPositionLabel`, ...), so a component
 * that renders a number needs the table rather than the lookup. Passing this is the whole of what
 * a call site has to do to make a formatted string follow the skin.
 */
export function useCopyOverrides(): Readonly<Partial<Record<CopyKey, string>>> {
  // No memo: `SKIN_COPY` is frozen at module scope, so this returns the same reference for the
  // same skin already, and a `useMemo` around a constant lookup would be ceremony.
  return SKIN_COPY[useSkin()];
}
