// src/ui/nav/views.test.ts
//
// The registry exists to stop a view being named in one place and missing from another. Until
// P8 Task 9 switches src/app/App.tsx over to it, App.tsx still owns its own `ViewId` union and
// its own `NAV` array, so THIS suite is the thing holding the two in step: it reads App.tsx as
// text and asserts the registry names the same ids in the same order.
//
// Read as text rather than imported because App.tsx exports neither `NAV` nor the array behind
// it, and exporting a value purely to let a test see it would be a change to App.tsx that this
// task is not permitted to make (another agent holds that file). The regexes are anchored on
// the two declarations' exact shapes and every one of them is asserted to have matched, so a
// refactor that renames or reshapes them fails here loudly instead of silently asserting
// nothing.

import { describe, expect, it } from 'vitest';
import { copy } from '../../content/copy';
// ?raw rather than node:fs, the convention the reminders, hydration and migration suites
// already use: tsconfig.app.json pins `types` to vite/client, so the node builtins have no
// declarations here. It also makes the read a build-time input, which a rename breaks loudly.
import APP_SOURCE from '../../app/App.tsx?raw';
import { VIEWS, VIEW_IDS } from './views';
import type { ViewId } from './views';

/** The ids in `export type ViewId = 'today' | ... ;` as written in App.tsx, in source order. */
function unionIdsFromApp(): string[] {
  const union = /export type ViewId =([^;]+);/.exec(APP_SOURCE);
  expect(union, 'App.tsx no longer declares `export type ViewId = ...;`').not.toBeNull();
  return Array.from((union?.[1] ?? '').matchAll(/'([a-z]+)'/g), (m) => m[1] ?? '');
}

/** The ids in App.tsx's `NAV` array literal, in the order the tab strip renders them. */
function navIdsFromApp(): string[] {
  const nav = /const NAV[^=]*=\s*\[([\s\S]*?)\];/.exec(APP_SOURCE);
  expect(nav, 'App.tsx no longer declares `const NAV ... = [ ... ];`').not.toBeNull();
  return Array.from((nav?.[1] ?? '').matchAll(/\{\s*id:\s*'([a-z]+)'/g), (m) => m[1] ?? '');
}

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
  settings: copy('nav.settings'),
};

describe('the view registry', () => {
  it('names the same ids, in the same order, as the ViewId union in App.tsx', () => {
    expect(unionIdsFromApp()).toHaveLength(VIEW_IDS.length);
    expect(VIEW_IDS).toEqual(unionIdsFromApp());
  });

  it('names the same ids, in the same order, as the NAV array in App.tsx', () => {
    expect(navIdsFromApp()).toHaveLength(VIEW_IDS.length);
    expect(VIEW_IDS).toEqual(navIdsFromApp());
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
