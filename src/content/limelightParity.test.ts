// src/content/limelightParity.test.ts
//
// THE USER-FACING INVARIANT of the limelight-only change: every copy key the app still has
// resolves to exactly the string the shipped skin (limelight) resolved it to before the clinical
// and board skins were deleted.
//
// The fixture is a SNAPSHOT, not something this suite derives. It was taken on main at 9a87561,
// before the change, as `copyFor('limelight', key)` for every key of DEFAULT_COPY (583 keys), and
// is committed byte for byte. A table edit that changes what a user reads therefore fails here
// until someone replaces the fixture on purpose.
//
// Rows added to the fixture after the snapshot, on purpose, each with the string it ships: the
// session-editing keys (docs/design/session-editing.md, "Copy keys added"). No snapshot row
// was changed to add them.
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import resolvedBefore from './__fixtures__/limelight-resolved.json';
import { DEFAULT_COPY, copy, copyFor, type CopyKey } from './copy';
import { useCopy, useCopyOverrides } from './useCopy';
import { useAppStore } from '../store';

const BEFORE: Readonly<Record<string, string>> = resolvedBefore;

/**
 * The keys removed on purpose, each with its reason. All seven named the skin picker or pointed
 * at it, and the picker went with the two skins it chose between: a radio group with one option
 * chooses nothing. `hero.skin` is NOT here: it also heads the sound and shortcut switches, which
 * remain.
 */
const REMOVED_KEYS: Readonly<Record<string, string>> = {
  'advice.skinChanges': 'the picker note saying what a skin may change; no picker remains',
  'disclosure.skin': 'the top-bar disclosure that opened the picker during setup; removed with it',
  'label.changeVisualSettings':
    "the intro's final-slide arrow caption pointing at that top-bar control; the control is gone",
  'label.settingsSkin': 'the legend of the skin radio group; removed with the group',
  'option.skinBoard': 'the radio option for the deleted board skin',
  'option.skinClinical': 'the radio option for the deleted clinical skin',
  'option.skinLimelight': 'the radio option for limelight; a one-option radio group was removed',
};

const CURRENT_KEYS = Object.keys(DEFAULT_COPY) as CopyKey[];

/** Keys whose resolution differs from the snapshot, with both strings, for a readable failure. */
function mismatches(resolve: (key: CopyKey) => string): string[] {
  return CURRENT_KEYS.filter((key) => resolve(key) !== BEFORE[key]).map(
    (key) => `${key}: expected ${JSON.stringify(BEFORE[key])}, got ${JSON.stringify(resolve(key))}`,
  );
}

describe('limelight copy parity with main (9a87561)', () => {
  it('keeps every snapshot key except the listed removals, and adds none', () => {
    const expected = Object.keys(BEFORE)
      .filter((key) => !(key in REMOVED_KEYS))
      .sort();
    expect([...CURRENT_KEYS].sort()).toEqual(expected);
  });

  it('resolves every remaining key through copyFor to the snapshot string', () => {
    expect(mismatches((key) => copyFor('limelight', key))).toEqual([]);
  });

  it('resolves every remaining key to the snapshot string on the path the app renders', () => {
    // The store as created, with no skin ever written: the path a component takes when nothing
    // in a test or in the app has set `ui.skin`. There is no provider; useSkin reads the store.
    useAppStore.setState(useAppStore.getInitialState(), true);
    expect(useAppStore.getState().ui.skin).toBe('limelight');

    const lookup = renderHook(() => useCopy()).result.current;
    const overrides = renderHook(() => useCopyOverrides()).result.current;
    expect(mismatches(lookup)).toEqual([]);
    // The FORMAT frames resolve through `copy(key, overrides)`, so the table must agree as well.
    expect(mismatches((key) => copy(key, overrides))).toEqual([]);
  });

  it('lists only keys that existed in the snapshot and are gone now, each with a reason', () => {
    for (const [key, reason] of Object.entries(REMOVED_KEYS)) {
      expect({ key, inSnapshot: key in BEFORE, current: key in DEFAULT_COPY }).toEqual({
        key,
        inSnapshot: true,
        current: false,
      });
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});
