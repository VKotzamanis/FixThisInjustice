import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted variable fonts (security constraint 19: no fonts.googleapis.com).
// Family names are 'JetBrains Mono Variable' and 'Geist Variable'; see
// src/ui/styles/tokens.css, added in Task 7.
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/geist';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing <div id="root">');
}

createRoot(container).render(
  <StrictMode>
    <p>FixThisInjustice — foundation scaffold</p>
  </StrictMode>,
);
