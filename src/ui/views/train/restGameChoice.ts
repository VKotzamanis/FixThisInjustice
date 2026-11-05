// src/ui/views/train/restGameChoice.ts
//
// The game last picked in this lifting session (P6, plan D4), offered first at the next rest.
// Module memory on purpose: it survives leaving Train and coming back, it is gone after a reload,
// and it is never stored. The brief allows no store write but recordRestGameWin, and AGENTS rule 6
// keeps web storage in src/store/persistence.ts.
import type { RestGameFamily } from '../../../domain/fun/restGames';

let choice: { sessionId: string; family: RestGameFamily } | null = null;

/** The pick for this session, or null when nothing was picked in it. */
export function rememberedRestGameChoice(sessionId: string): RestGameFamily | null {
  return choice !== null && choice.sessionId === sessionId ? choice.family : null;
}

export function rememberRestGameChoice(sessionId: string, family: RestGameFamily): void {
  choice = { sessionId, family };
}

/** For tests: start each case with no pick. */
export function forgetRestGameChoice(): void {
  choice = null;
}
