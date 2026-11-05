// src/ui/nav/viewActive.ts
//
// Audit F02 keeps every visited view mounted and hidden. A view that holds something only while
// it is ON SCREEN (Train's wake lock, audit C17) reads this instead of assuming mounted = shown.
import { createContext, useContext } from 'react';

/** True for the subtree of the view on screen; the shell provides it per view slot. */
export const ViewActiveContext = createContext(true);

export function useViewActive(): boolean {
  return useContext(ViewActiveContext);
}
