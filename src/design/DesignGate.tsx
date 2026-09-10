/**
 * The one entry point into Design Mode.
 *
 * NO HOOKS IN THIS COMPONENT, on purpose. The whole panel - its state, its effects, its
 * `localStorage` reads - lives in `DesignPanel`, which is not mounted at all without the query
 * parameter. So in an ordinary session this renders `null` on first commit and registers
 * nothing: no effect, no listener, no storage read, no attribute write.
 *
 * The gate reads `window.location.search` here rather than inside the panel so the decision is
 * made once, at the boundary, and `isDesignMode` stays a pure function a test can drive with a
 * table (src/design/designMode.test.ts).
 */
import type { ReactElement } from 'react';
import { isDesignMode } from './designMode';
import { DesignPanel } from './DesignPanel';

export function DesignGate(): ReactElement | null {
  if (!isDesignMode(window.location.search)) return null;
  return <DesignPanel />;
}
