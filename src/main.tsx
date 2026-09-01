import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

// Self-hosted variable fonts (security constraint 19: no fonts.googleapis.com).
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/geist';

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
