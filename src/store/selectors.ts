import type { Profile } from '../domain/types';
import type { SaveError } from './index';
import { useAppStore } from './index';
import { readRaw } from './persistence';

/**
 * The profile the app is currently operating on, or null before setup.
 *
 * Selector subscriptions are the point of Zustand here: the legacy store passed
 * one useState object into every view, so every keystroke re-rendered the whole
 * tree (A48). A component that reads only the active profile re-renders only
 * when that profile's object identity changes.
 *
 * The lookup returns the stored object itself, not a derived copy, so the
 * snapshot is referentially stable between renders — a new object per render
 * would make useSyncExternalStore loop.
 */
export function useActiveProfile(): Profile | null {
  return useAppStore((s) => {
    const id = s.activeProfileId;
    if (id === null) return null;
    return s.profiles[id] ?? null;
  });
}

/** True once hydrate() has run, whether or not it found a stored document. */
export function useHydrated(): boolean {
  return useAppStore((s) => s.status.hydrated);
}

/**
 * Non-null while the last persistence write failed; drives the blocking banner.
 * Typed through SaveError rather than by repeating its members, so a new
 * failure mode reaches the UI instead of stopping at a stale literal union.
 */
export function useSaveError(): SaveError | null {
  return useAppStore((s) => s.status.lastSaveError);
}

/** Non-null when the stored document failed validation on load. */
export function useLoadError(): string | null {
  return useAppStore((s) => s.status.lastLoadError);
}

/**
 * The raw text of the document that failed to load, for the recovery exports.
 *
 * The snapshot taken at hydrate time comes first and a live read is only the
 * fallback, because storage can move on underneath the banner — a wipeAll(), a
 * write from another tab, a store that has since become unreachable — while
 * the snapshot stays the user's copy of data the schema could not read. Null
 * only when there is nothing to offer at all.
 *
 * readRaw() is called during render rather than folded into the store selector
 * so a store update does not re-read Web Storage; the fallback is reached only
 * while the snapshot is null. Both branches return a string, which
 * useSyncExternalStore compares by value, so neither can loop.
 */
export function useLastLoadRaw(): string | null {
  const snapshot = useAppStore((s) => s.status.lastLoadRaw);
  return snapshot ?? readRaw();
}
