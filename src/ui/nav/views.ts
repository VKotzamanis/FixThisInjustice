// src/ui/nav/views.ts
//
// Single source of truth for the view list: the tab strip, the hotkey digits and the spotlight
// palette all read it, so a view cannot appear in one place and be missing from another.
//
// STATE OF THE CUTOVER. Done: P8 Task 9 switched src/app/App.tsx over to this file. The shell
// imports ViewId, VIEWS, VIEW_IDS and isViewId from here and declares no list of its own, so
// the text-parity assertions that held the two lists in step are retired. What remains in
// src/ui/nav/views.test.ts is the guard against a list growing back in App.tsx, and the guard
// that every view named here has a switch arm there.
//
// The registry carries no baked `label` any more. It used to be read from the copy table at
// module load, which made it the CLINICAL string and only ever that: a module constant is
// baked before any skin is known. Every RENDERER reads `copyKey` through `useCopy()` instead
// (the tab strip in src/app/App.tsx, the palette in src/ui/components/Spotlight.tsx), and the
// last two callers with no React tree to read a skin from
// (src/ui/components/Spotlight.test.tsx, src/ui/nav/views.test.ts) now resolve
// `copy(view.copyKey)` themselves. With no reader left, `label` was dropped.

import type { CopyKey } from '../../content/copy';

/**
 * The views the shell can show.
 *
 * The ONE declaration of the list; src/app/App.tsx imports it. `UiPrefs.lastView` is a
 * persisted STRING and not this type: a document written by a later version can name a view
 * this build does not have, so callers narrow with `isViewId` rather than asserting.
 *
 * There is no 'export' member. ExportView is mounted inside Settings rather than routed, so a
 * member here would put a tab and a digit on a screen that is reached by a control.
 */
export type ViewId = 'today' | 'plan' | 'train' | 'targets' | 'log' | 'atlas' | 'settings';

export interface ViewDef {
  id: ViewId;
  /** The row's copy key: the ONE thing a renderer reads, through `useCopy()`. */
  copyKey: CopyKey;
  /**
   * The keyboard digit that switches to this view: the 1-based position in VIEWS.
   *
   * Stored rather than derived at the call site so the binding is stated once. P8 Task 9 binds
   * it; nothing in this task presses it.
   */
  digit: number;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'today', copyKey: 'nav.today', digit: 1 },
  { id: 'plan', copyKey: 'nav.plan', digit: 2 },
  { id: 'train', copyKey: 'nav.train', digit: 3 },
  { id: 'targets', copyKey: 'nav.targets', digit: 4 },
  { id: 'log', copyKey: 'nav.log', digit: 5 },
  // The specimen collection (P8 Task 5), added to the strip by P8 Task 9. Placed before
  // Settings because Settings is the last tab on every screen the app has ever had, and moving
  // it would move the one tab the user reaches by muscle memory.
  { id: 'atlas', copyKey: 'nav.atlas', digit: 6 },
  { id: 'settings', copyKey: 'nav.settings', digit: 7 },
];

/** The ids alone, DERIVED from VIEWS so the two cannot disagree. */
export const VIEW_IDS: readonly ViewId[] = VIEWS.map((v) => v.id);

/**
 * The top bar's moving instruction, one sentence per view (P10 Brief D). A `Record`, not a
 * lookup with a fallback: a view added to `VIEWS` with no row here is a compile error rather
 * than a blank line in the marquee, the same guarantee `ViewDef.copyKey` already gives the tab
 * strip. The shell reads it in src/app/App.tsx, through the same `useCopy()` every renderer
 * here uses, so a skin reaches these words exactly as it reaches everything else in the tab
 * strip.
 */
export const VIEW_INSTRUCTIONS: Record<ViewId, CopyKey> = {
  today: 'advice.todayInstruction',
  plan: 'advice.planInstruction',
  train: 'advice.trainInstruction',
  targets: 'advice.targetsInstruction',
  log: 'advice.logInstruction',
  atlas: 'advice.atlasInstruction',
  settings: 'advice.settingsInstruction',
};

/**
 * The name the top bar shows for each view, one per ViewId (round 2, `r2-onboarding.general`).
 *
 * "after onboarding, it should just say 'ATLAS' or 'LEG DAY' etc w.r.t. the context of what
 * specific page the user is viewing." A `Record`, like `VIEW_INSTRUCTIONS` above and for the same
 * reason: a view added to `VIEWS` with no row here is a compile error rather than a blank banner.
 *
 * WHY THESE POINT AT THE `nav.*` ROWS AND NOT AT SEVEN NEW ONES. A view has ONE name, and the tab
 * strip already renders it. Seven parallel rows carrying the same seven words would be a second
 * place to rename a view, and the pair would drift the first time only one of them was edited;
 * the copy contract already files a key rendered on several screens once, under the first screen
 * that renders it, rather than duplicating it per renderer. This table exists so the banner is
 * NEVER the instruction -- `VIEW_INSTRUCTIONS` is a sentence and a banner is a name -- and so
 * that the day a banner name has to differ from its tab, it is one edit here and nothing else.
 */
export const VIEW_TITLES: Record<ViewId, CopyKey> = {
  today: 'nav.today',
  plan: 'nav.plan',
  train: 'nav.train',
  targets: 'nav.targets',
  log: 'nav.log',
  atlas: 'nav.atlas',
  settings: 'nav.settings',
};

/**
 * The combo that opens the spotlight palette, in the notation P8 Task 9's hotkey registry
 * normalises to ('mod' is Meta or Control, so one binding covers both platforms).
 *
 * It is a CONSTANT here rather than a `window` keydown listener inside Spotlight.tsx on
 * purpose. Code review A54 was two listeners binding the same key and both running; Task 9
 * made exactly one listener possible, and a second one added here would be the defect that
 * task was written to remove. The palette is therefore a controlled component (`open` /
 * `onClose`) and this string is what the shell binds, through src/ui/hotkeys.tsx, to open it.
 */
export const SPOTLIGHT_COMBO = 'mod+k';

/** Whether a persisted `lastView` string names a view this build actually has. */
export function isViewId(value: string): value is ViewId {
  return VIEW_IDS.some((id) => id === value);
}
