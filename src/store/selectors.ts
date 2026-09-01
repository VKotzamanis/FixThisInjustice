import type { Profile } from '../domain/types';
import type { SaveErrorReason } from './index';
import { useAppStore } from './index';

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
 * Typed through SaveErrorReason rather than by repeating its members, so a new
 * failure mode reaches the UI instead of stopping at a stale literal union.
 */
export function useSaveError(): SaveErrorReason | null {
  return useAppStore((s) => s.status.lastSaveError);
}

/** Non-null when the stored document failed validation on load. */
export function useLoadError(): string | null {
  return useAppStore((s) => s.status.lastLoadError);
}
