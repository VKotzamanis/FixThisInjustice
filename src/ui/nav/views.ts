// src/ui/nav/views.ts
//
// Single source of truth for the view list: the tab strip, the hotkey digits and the spotlight
// palette all read it, so a view cannot appear in one place and be missing from another.
//
// STATE OF THE CUTOVER. src/app/App.tsx still declares its own `ViewId` union and its own `NAV`
// array; P8 Task 9 is the task that switches the shell over to this file. Until it does, the
// two lists are held in step by src/ui/nav/views.test.ts, which reads App.tsx as text and
// asserts the ids and their order match. That test is the reason the duplication is safe to
// leave standing for one task: it fails the moment either list moves without the other.
//
// The labels are read from the copy table at module load, exactly as App.tsx reads them, so a
// reworded tab is one edit in src/content/copy.ts and not two.

import { copy } from '../../content/copy';

/**
 * The views the shell can show.
 *
 * Kept identical to the union in src/app/App.tsx, including order. `UiPrefs.lastView` is a
 * persisted STRING and not this type: a document written by a later version can name a view
 * this build does not have, so callers narrow with `isViewId` rather than asserting.
 */
export type ViewId = 'today' | 'plan' | 'train' | 'targets' | 'log' | 'settings';

export interface ViewDef {
  id: ViewId;
  /** The tab label, from the copy table. */
  label: string;
  /**
   * The keyboard digit that switches to this view: the 1-based position in VIEWS.
   *
   * Stored rather than derived at the call site so the binding is stated once. P8 Task 9 binds
   * it; nothing in this task presses it.
   */
  digit: number;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'today', label: copy('nav.today'), digit: 1 },
  { id: 'plan', label: copy('nav.plan'), digit: 2 },
  { id: 'train', label: copy('nav.train'), digit: 3 },
  { id: 'targets', label: copy('nav.targets'), digit: 4 },
  { id: 'log', label: copy('nav.log'), digit: 5 },
  { id: 'settings', label: copy('nav.settings'), digit: 6 },
];

/** The ids alone, DERIVED from VIEWS so the two cannot disagree. */
export const VIEW_IDS: readonly ViewId[] = VIEWS.map((v) => v.id);

/**
 * The combo that opens the spotlight palette, in the notation P8 Task 9's hotkey registry
 * normalises to ('mod' is Meta or Control, so one binding covers both platforms).
 *
 * It is a CONSTANT here rather than a `window` keydown listener inside Spotlight.tsx on
 * purpose. Code review A54 was two listeners binding the same key and both running; Task 9
 * exists to make exactly one listener possible, and a second one added here would be the
 * defect that task is written to remove. The palette is therefore a controlled component
 * (`open` / `onClose`) and this string is what Task 9 binds to open it.
 */
export const SPOTLIGHT_COMBO = 'mod+k';

/** Whether a persisted `lastView` string names a view this build actually has. */
export function isViewId(value: string): value is ViewId {
  return VIEW_IDS.some((id) => id === value);
}
