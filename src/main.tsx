import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

// Self-hosted variable font (security constraint 19: no fonts.googleapis.com), under the CSP
// `font-src 'self'`. Archivo is the one face limelight's tokens name (src/ui/styles/tokens.css,
// --mono and --sans). The clinical and board faces (JetBrains Mono, Geist, DM Mono, Space Mono)
// went with those skins; their packages are still listed in package.json.
//
// `@fontsource-variable/archivo` publishes no latin-only entry, so its extra subsets (the app's
// copy tables are ASCII, and the repository enforces that) are dropped from the precache by
// globIgnores in vite.config.ts instead.
import '@fontsource-variable/archivo/standard.css';

import './ui/styles/tokens.css';
import './ui/styles/crt.css';
import { App } from './app/App';
import { RootErrorBoundary } from './app/RootErrorBoundary';
import { notifyUpdateReady } from './app/UpdatePrompt';
import { startUpdateController } from './app/updateController';
import { runsStandalone, startInstallPromptCapture } from './app/installPrompt';
import { openAssignment } from './domain/schedule/staleSessions';
import { startPersistence, useAppStore } from './store';
import { createBrowserBackend } from './store/persistence';
import { startDurabilityWatch } from './app/storageDurability';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing <div id="root">');
}

// The store is the only writer; this subscription commits its records (spec R13).
startPersistence();

// Spec R8: Chromium may fire beforeinstallprompt before the first render; hold it from here.
startInstallPromptCapture();

// Spec R8: ask the browser to keep the data after setup (and at an installed launch).
// Standalone detection is runsStandalone() (src/app/installPrompt.ts), the one detector.
startDurabilityWatch({
  ready: () => useAppStore.getState().status.hydrated,
  hasProfile: () => useAppStore.getState().activeProfileId !== null,
  subscribeStore: (listener) => useAppStore.subscribe(listener),
  standalone: () => runsStandalone(),
});

/*
 * Service worker and the update model (spec R7): src/app/updateController.ts. vite.config.ts
 * keeps registerType 'prompt' and injectRegister false (the CSP forbids an inline script), so
 * this call is the only registration. immediate: true registers as soon as this module runs,
 * which makes a cold first visit installable without a second round trip.
 */
startUpdateController({
  register: registerSW,
  ready: () => useAppStore.getState().status.hydrated,
  // Any profile's open session counts: the banner, never a reload, while one is open.
  isSessionOpen: () => {
    const s = useAppStore.getState();
    return Object.keys(s.profiles).some((id) => openAssignment(s, id) !== null);
  },
  // P2 writes each action through to the record store at once (no debounced save), so there is
  // nothing pending to flush before a reload.
  flush: () => undefined,
  reload: () => {
    window.location.reload();
  },
  showBanner: notifyUpdateReady,
  subscribeStore: (listener) => useAppStore.subscribe(listener),
  doc: document,
  win: window,
});

/*
 * Spec R13: the stored records are read BEFORE the first render, so the intro and setup can never
 * flash over a stored profile. Until then #root shows index.html's one loading line. hydrate()
 * never rejects: a refused or unreachable store lands in status.lastLoadError.
 */
const root = createRoot(container);
void useAppStore
  .getState()
  .hydrate(createBrowserBackend())
  .then(() => {
    root.render(
      <StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </StrictMode>,
    );
  });
