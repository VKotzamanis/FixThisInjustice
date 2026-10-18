import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vitest runs with globals: false, so Testing Library's automatic cleanup does
// not register itself. Without this, rendered trees accumulate across tests in
// a file and every query finds duplicates.
afterEach(() => {
  cleanup();
});

// jsdom has no 2D canvas: its getContext returns null AND logs "Not implemented" on every call.
// Boot, PhaseTransition and WeekStamp mount the dither wipe, which treats a null context as "no
// canvas" and cuts instantly (src/ui/components/DitherWipe.tsx), so every suite that mounts one
// of them printed that log. This returns the same null without it. A suite that draws installs its
// own fake with vi.spyOn (DitherWipe.test.tsx); restoreMocks hands this stub back afterwards.
// Guarded because build/cspPlugin.test.ts runs in the node environment, where there is no DOM.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
