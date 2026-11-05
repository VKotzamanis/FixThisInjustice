// src/ui/views/train/useSheetDismiss.ts
//
// Back and Escape close the game sheet (P6, plan D5), now through the ONE overlay stack (spec R6,
// src/ui/overlay/overlayStack.ts), which P6 D5 said would absorb this hook: one history entry
// while the sheet is open, Back closes it, Escape closes it when it is the top overlay (a Form
// Cues dialog opened above it takes Escape first). NON-modal: no scroll lock, no focus trap, so
// the next set stays loggable with the sheet open (P6 D1).
import { useOverlay } from '../../overlay/overlayStack';

export function useSheetDismiss(onDismiss: () => void): void {
  useOverlay(onDismiss, { modal: false });
}
