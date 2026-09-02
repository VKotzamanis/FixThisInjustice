// src/ui/nav/views.test.ts
//
// The registry exists to stop a view being named in one place and missing from another.
//
// WHAT CHANGED IN P8 TASK 9, AND WHY THE OLD ASSERTIONS ARE GONE. Until that task, App.tsx
// owned its own `ViewId` union and its own `NAV` array, and this suite read App.tsx as text to
// hold the two lists in step. Task 9 switched the shell over: App.tsx now imports `VIEWS`,
// `VIEW_IDS`, `ViewId` and `isViewId` from this file and declares no list of its own, so the
// old ids-and-order assertions would compare the registry against itself and pass whatever
// happened. They are RETIRED, and replaced by the two things the cutover can still get wrong:
// a list growing back inside App.tsx, and a view that is in the registry but routed nowhere.
//
// App.tsx is still read as text rather than imported, because what is asserted about it is the
// absence of a declaration and the presence of a switch arm, neither of which is a value a
// module can export.

import { describe, expect, it } from 'vitest';
import { copy } from '../../content/copy';
// ?raw rather than node:fs, the convention the reminders, hydration and migration suites
// already use: tsconfig.app.json pins `types` to vite/client, so the node builtins have no
// declarations here. It also makes the read a build-time input, which a rename breaks loudly.
import APP_SOURCE from '../../app/App.tsx?raw';
import { VIEWS, VIEW_IDS } from './views';
import type { ViewId } from './views';

/**
 * The label each id must carry. Quoted from the copy table rather than written out, so a
 * reworded tab fails in the copy suite and not here (copy contract: "test assertions quote the
 * default table").
 */
const EXPECTED_LABEL: Record<ViewId, string> = {
  today: copy('nav.today'),
  plan: copy('nav.plan'),
  train: copy('nav.train'),
  targets: copy('nav.targets'),
  log: copy('nav.log'),
  atlas: copy('nav.atlas'),
  settings: copy('nav.settings'),
};

describe('the view registry', () => {
  it('is the only place the view list is written: App.tsx declares none of its own', () => {
    // The two declarations Task 9 removed. A regrown list is exactly the drift the earlier
    // parity assertions existed to catch, and the only way it can come back.
    expect(APP_SOURCE).not.toMatch(/export type ViewId\s*=\s*'/);
    expect(APP_SOURCE).not.toMatch(/const NAV\b/);
    expect(APP_SOURCE).toMatch(/from '\.\.\/ui\/nav\/views'/);
  });

  it('has a switch arm in App.tsx for every view it names', () => {
    // A view in the registry with no arm is a tab, a digit and a palette row that all lead to
    // an empty screen. The arm is matched as source text because App.tsx exports no routing
    // table to read.
    for (const id of VIEW_IDS) {
      expect(APP_SOURCE, `App.tsx routes no view '${id}'`).toContain(`view === '${id}'`);
    }
  });

  it('names the Atlas, which P8 Task 9 added', () => {
    expect(VIEW_IDS).toContain('atlas');
  });

  it('labels every view from the copy table', () => {
    for (const view of VIEWS) {
      expect(view.label).toBe(EXPECTED_LABEL[view.id]);
    }
  });

  it('numbers the hotkey digits 1..n in registry order, with no gap or repeat', () => {
    // The digits are what P8 Task 9 binds; a gap would leave a view unreachable by keyboard and
    // a repeat would bind one key to two views.
    expect(VIEWS.map((v) => v.digit)).toEqual(VIEWS.map((_, i) => i + 1));
  });

  it('derives VIEW_IDS from VIEWS rather than restating it', () => {
    expect(VIEW_IDS).toEqual(VIEWS.map((v) => v.id));
  });
});
