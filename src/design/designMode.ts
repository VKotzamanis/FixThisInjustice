/**
 * DESIGN MODE, THE GATE.
 *
 * Design Mode is developer-facing chrome for the owner: a panel that writes CSS custom
 * properties onto `<html>` so a colour, a face or a spacing can be judged in the real app, on
 * the real device, in all three skins, and exported as a patch a script applies back to
 * `src/ui/styles/tokens.css`.
 *
 * <!-- decision: design-mode-ships-gated-on-a-query-parameter | status: adopted | supersedes: design-mode-dead-stripped-from-production -->
 *
 * WHY IT SHIPS, against what docs/plans/2026-09-10-16-design-mode.md Task 1a originally said.
 * That plan required `import.meta.env.DEV` plus a CI grep asserting the marker is absent from
 * the built bundle. The owner does his design work ON HIS PHONE, against the DEPLOYED app; a
 * dev-only mode would oblige him to run a dev server on a laptop he is not using, which is the
 * same as not having the tool at all. So the gate is the query parameter alone and the mode
 * ships. The plan document has been amended rather than left to contradict this file.
 *
 * WHAT MAKES THAT SAFE, stated so the next reader does not have to reconstruct it:
 *   - It writes ONLY to the viewer's own `localStorage`, under one namespaced key of its own.
 *   - It NEVER writes to the Zustand document and never touches a profile. It creates and
 *     destroys no user data. `src/design/DesignPanel.test.tsx` asserts the store object is
 *     identical before and after opening, editing and closing the panel.
 *   - It is unreachable without `?design=1`, and with the parameter absent the gate renders
 *     nothing and registers no listener at all.
 *   - Its writes are inline custom properties on `<html>`, which are per-tab and per-device.
 *     Nothing another viewer loads is affected in any way.
 *
 * ITS OWN LABELS ARE NOT APP COPY. They are deliberately NOT in `src/content/copy.ts` and have
 * no catalogue part and no walk step: the copy contract, the catalogue and the walk pages exist
 * to pin what a USER reads, and pinning a developer tool's control names there would add forty
 * strings to a byte-for-byte fixture that nothing in the product renders. Do not "fix" this by
 * moving them into the copy tables.
 */

/** The query parameter that opens the panel. Nothing else does: no shortcut, no long press. */
export const DESIGN_PARAM = 'design';

/** The value it must carry. `?design=0`, `?design` and `?design=true` are all inert. */
export const DESIGN_VALUE = '1';

/**
 * True when this location asks for Design Mode.
 *
 * Takes the search string rather than reading `window.location` itself, so the rule is a pure
 * function a test can drive with a table instead of a jsdom navigation.
 */
export function isDesignMode(search: string): boolean {
  return new URLSearchParams(search).get(DESIGN_PARAM) === DESIGN_VALUE;
}
