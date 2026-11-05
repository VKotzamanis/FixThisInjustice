// src/ui/nav/routerState.ts
//
// The router's module state (src/ui/nav/router.ts), kept in a module that imports nothing, so
// src/test/setup.ts can reset it after every test WITHOUT importing the store. A setup file that
// imports the store loads it (and the domain modules under it) before a test file's vi.mock
// takes effect, which silently un-mocks them (measured: src/store/scheduleActions.test.ts).

/** How the next view change was asked for: from a tab or Back (restore), or by the app (top). */
export const routerState = {
  restoreNext: false,
  /** [px] the offset each view was left at. One shell, one window scroller. */
  savedScroll: new Map<string, number>(),
};

/** Test seam (src/test/setup.ts): forget offsets and the pending restore flag. */
export function resetRouterForTests(): void {
  routerState.savedScroll.clear();
  routerState.restoreNext = false;
}
