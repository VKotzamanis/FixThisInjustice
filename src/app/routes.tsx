// src/app/routes.tsx
//
// Audit E09/F14: the screens split out of the main chunk. App.tsx imports these names from here
// instead of from the screen modules, so its JSX is unchanged. A screen module imported
// statically anywhere in the main chunk's graph would be pulled back in; routes.test.tsx holds
// the list of files that may import each screen.
import type { ReactElement } from 'react';
import { useAppStore } from '../store';
import { lazyRoute } from './lazyRoute';

const setupRoute = lazyRoute('setup', () => import('../ui/setup/SetupWizard').then((m) => m.SetupWizard));
const introRoute = lazyRoute('intro', () => import('../ui/intro/IntroSequence').then((m) => m.IntroSequence));
const atlasRoute = lazyRoute('atlas', () => import('../ui/views/AtlasView').then((m) => m.AtlasView));
const logRoute = lazyRoute('log', () => import('../ui/views/LogView').then((m) => m.LogView));
const settingsRoute = lazyRoute('settings', () => import('../ui/views/SettingsView').then((m) => m.SettingsView));

export const SetupWizard = setupRoute.Component;
export const AtlasView = atlasRoute.Component;
export const LogView = logRoute.Component;
export const SettingsView = settingsRoute.Component;

/**
 * The intro gate stays in the main chunk because it is a single store read; only the sequence it
 * opens is split. On every launch after the first, `introSeen` is true and the intro chunk is
 * never requested.
 */
export function IntroGate(): ReactElement | null {
  const introSeen = useAppStore((s) => s.ui.introSeen);
  return introSeen ? null : <introRoute.Component />;
}

/** Every split screen, loaded now. For tests that mount <App /> and query a screen at once. */
export function preloadRoutes(): Promise<void> {
  return Promise.all([
    setupRoute.preload(),
    introRoute.preload(),
    atlasRoute.preload(),
    logRoute.preload(),
    settingsRoute.preload(),
  ]).then(() => undefined);
}
