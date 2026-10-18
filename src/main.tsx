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
import { startPersistence } from './store';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing <div id="root">');
}

// The store is the only writer; this subscription is the only caller of save().
startPersistence();

/*
 * Service-worker registration. vite.config.ts sets injectRegister: false
 * because the CSP forbids an inline <script>, so the registration is this call
 * and nothing else. immediate: true registers as soon as this module runs
 * rather than waiting for the window load event, which is what makes a cold
 * first visit installable without a second round trip.
 *
 * registerType is 'prompt', not 'autoUpdate': a waiting worker must not swap
 * the running code out from under a session whose last change has not been
 * flushed. onNeedRefresh hands the apply callback to UpdatePrompt, which is the
 * only thing that can call it, and only when the user clicks.
 */
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifyUpdateReady(() => {
      void updateServiceWorker(true);
    });
  },
});

createRoot(container).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
