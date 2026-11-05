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
// session-editing keys (docs/design/session-editing.md, "Copy keys added"), the four one-tap
// effort keys `button.effort{Easy,Solid,Hard,Max}` (ROADMAP L8), the programme lifecycle keys
// (docs/design/programme-lifecycle.md, "Copy keys"), the rest-game keys whose name contains
// `restWord` or `restGame` (ROADMAP F1 and P6, docs/design/rest-games.md; base table only, no
// limelight override; P6 retired three of the first eleven, listed in REMOVED_KEYS), and
// `button.gotIt`, the one control of the one-time warm-up notice on Train (owner 2026-10-18; base
// table only), and `status.staleSession{Completed,Released}` for the
// stale-session notice (spec R1, Task 6; base table only), and `error.setupRefused` for
// atomic setup refusal (spec R5, Task 9; base table only), and `status.externalWriteReplaced` for
// the other-window notice (audit B03, Task 10; base table only), and `button.addForgottenSet` for
// the finished-session amend (audit C10, Task 12; base table only), and `button.logAnyway` and
// `advice.loadLooksOff` for the load plausibility question (spec R4, Task 14; base table only),
// and `error.nameTooLong` and `error.startTimeRequired` for the wizard (spec R5, Task 15; base
// table only), and the four recovery-screen keys `hero.storedDataRefused`,
// `hero.storageUnreadable`, `status.writesPaused`, `label.importBackup` (B01, Task 17; base table
// only), and the four unreadable-records keys `hero.unreadableRecords`,
// `advice.unreadableRecordsKept`, `button.exportUnreadable`, `status.recordsUnreadable` (spec
// R13, P2 Task 8; base table only), and `banner.storageNearlyFull.{tag,body}` for the
// near-quota banner (audit B05, P2 Task 11; base table only), and `button.otherMirror` and
// `advice.videoOffline` for the form-video modal (ROADMAP L9; base table only), and
// `advice.programmeContinues` on the wizard review (ROADMAP L6; base table only). No snapshot row
// was changed to add them.
//
// Rows CHANGED on purpose (ROADMAP L6, docs/design/programme-horizon.md Q4: an open-ended
// programme has no N, so every "of N" goes): `status.bootWeek`, `status.sessionCursor` and `label.weekOfCount`.
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import resolvedBefore from './__fixtures__/limelight-resolved.json';
import { DEFAULT_COPY, copy, copyFor, type CopyKey } from './copy';
import { useCopy, useCopyOverrides } from './useCopy';
import { useAppStore } from '../store';

const BEFORE: Readonly<Record<string, string>> = resolvedBefore;

/** The one reason shared by every key the old console's import took with it (ROADMAP N5). */
const N5 = 'old-console import removed (N5)';

/**
 * The keys removed on purpose, each with its reason. The fixture keeps them: it is the snapshot,
 * and the last test below requires every listed key to be in it.
 *
 * The first seven named the skin picker or pointed at it, and the picker went with the two skins
 * it chose between: a radio group with one option chooses nothing. `hero.skin` is NOT here: it
 * also heads the sound and shortcut switches, which remain.
 *
 * The rest were rendered only by the old console's one-way import (the wizard, the Settings
 * reopen offer and the legacy delete with its bundle download), which the owner dropped on
 * 2026-10-18 (ROADMAP N5).
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
  'advice.deleteLegacy': N5,
  'advice.legacyApplyFailed': N5,
  'advice.legacyFound': N5,
  'advice.legacyNothingDeleted': N5,
  'advice.legacyOldDataDeleted': N5,
  'advice.legacyOldDataKept': N5,
  'advice.legacyRefused': N5,
  'advice.legacyStoreUnconfirmed': N5,
  'advice.legacyStored': N5,
  'advice.legacyUnitRequired': N5,
  'button.deleteLegacy': N5,
  'button.downloadLegacyJson': N5,
  'button.legacyApply': N5,
  'button.legacyClose': N5,
  'button.legacyDeleteOld': N5,
  'button.legacyDismiss': N5,
  'button.legacyKeepOld': N5,
  'button.legacyPreview': N5,
  'button.legacyReopen': N5,
  'disclosure.legacyBodyMassEvidence': N5,
  'disclosure.legacyTransfers': N5,
  'disclosure.whatTransfers': N5,
  'disclosure.whatWasNotMatched': N5,
  'disclosure.whatWasRefused': N5,
  'hero.legacyDone': N5,
  'hero.legacyImport': N5,
  'hero.legacyPreview': N5,
  'label.confirmDeleteLegacy': N5,
  'label.legacyBodyMassUnit': N5,
  'label.legacyLoadUnit': N5,
  'label.legacyMassUnitKg': N5,
  'label.legacyMassUnitLb': N5,
  'label.legacyUnitKg': N5,
  'label.legacyUnitLb': N5,
  'label.skipReason': 'Skip Today postpones; no reason field (spec R2)',
  'button.restWordDelete':
    'P6 QWERTY keyboard: its delete key is 3 half-columns wide and reads button.restWordDel',
  'button.restWordSubmit':
    'P6 QWERTY keyboard: its submit key is 3 half-columns wide and reads button.restWordEnter',
  'button.restWordLaunch':
    'P6: the launch control opens a picker of five games now and reads button.restGameLaunch',
  'button.nextInstance': 'L9: the source switch reads button.otherMirror (YouTube first, then mirrors)',
  'button.openClip': 'L9: the outbound clip link left the app (audit E05); the clip plays in the modal',
  'button.searchInstance': 'L9: the outbound mirror search left the app (audit E05); curated ids replace it',
  'label.videoSearch': 'L9: the heading of that search panel, removed with it',
  'step.programme': 'ROADMAP L6: the programme-length step was removed; the programme is open-ended',
  'quantity.programmeWeeks': 'ROADMAP L6: the length field went with the programme-length step',
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
