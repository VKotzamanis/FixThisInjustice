// src/ui/components/SpotlightButton.tsx
//
// The tap target that opens the spotlight palette.
//
// WHY IT IS ITS OWN FILE. The P8 draft put this button inside src/ui/components/TopBar.tsx.
// There is no TopBar in this codebase: src/app/App.tsx renders the tab strip inline, and this
// task may not edit App.tsx (P8 Task 9 owns it). A standalone control is therefore what can be
// delivered now and mounted in one line later; see the task report for where it must go.
//
// It exists at all because SPOTLIGHT_COMBO cannot be pressed on a phone. The palette is
// otherwise reachable only by keyboard, which on a touch device means not at all.

import type { ReactElement } from 'react';
import { copy } from '../../content/copy';
import './spotlight.css';

export function SpotlightButton({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <button type="button" className="spotlight-open" onClick={onOpen}>
      {copy('button.openSpotlight')}
    </button>
  );
}
