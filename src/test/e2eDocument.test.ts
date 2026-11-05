// The e2e harness builds documents and clicks words by itself, without importing app modules
// at runtime. This suite is what keeps those copies honest (AGENTS.md rule 2).
import { describe, expect, it } from 'vitest';
import { FORMAT, copyFor } from '../content/copy';
import { parseState } from '../domain/schema';
import { STORAGE_KEY } from '../store/persistence';
import { APP_STORE, MAP_STORES, META_KEY, RECORD_DB_NAME, SINGLETON_KEYS } from '../store/db/records';
import {
  LABEL,
  RECORD_APP_STORE,
  RECORD_DB_NAME as E2E_RECORD_DB_NAME,
  RECORD_MAP_STORES,
  RECORD_META_KEY,
  RECORD_SINGLETONS,
  STORAGE_KEY as E2E_STORAGE_KEY,
  deleteLabel,
  loadLabel,
  logLabel,
  massLabel,
  postMassLabel,
  preMassLabel,
  repsLabel,
} from '../../e2e/support/constants';
import { e2eDocument, reviewDraft } from '../../e2e/support/document';

describe('the e2e document builder', () => {
  it('builds a returning-user document the loader accepts unchanged', () => {
    const doc = e2eDocument();
    const parsed = parseState(JSON.parse(JSON.stringify(doc)) as unknown);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state).toEqual(doc);
  });

  it('builds a first-run document with a resumable review-step draft', () => {
    const parsed = parseState(
      JSON.parse(JSON.stringify(e2eDocument({ profile: false, setupDraft: reviewDraft() }))) as unknown,
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.setupDraft?.stepIndex).toBe(6); // review: STEPS has 7 entries since ROADMAP L6
  });

  it('seeds under the key the app reads', () => {
    expect(E2E_STORAGE_KEY).toBe(STORAGE_KEY);
  });

  it('taps the words the app renders on the limelight skin', () => {
    expect(LABEL.todayTab).toBe(copyFor('limelight', 'nav.today'));
    expect(LABEL.logTab).toBe(copyFor('limelight', 'nav.log'));
    expect(LABEL.settingsTab).toBe(copyFor('limelight', 'nav.settings'));
    expect(LABEL.moreTab).toBe(copyFor('limelight', 'nav.more'));
    expect(LABEL.start).toBe(copyFor('limelight', 'button.startSession'));
    expect(LABEL.finish).toBe(copyFor('limelight', 'button.finishSession'));
    expect(LABEL.skipToday).toBe(copyFor('limelight', 'button.skipToday'));
    expect(LABEL.confirmSkip).toBe(copyFor('limelight', 'button.confirmSkip'));
    expect(LABEL.undo).toBe(copyFor('limelight', 'button.undo'));
    expect(LABEL.looksGood).toBe(copyFor('limelight', 'label.looksGood'));
    expect(loadLabel(1)).toBe(FORMAT.quantityWithUnit(FORMAT.setLoadQuantity(1), 'kg'));
    expect(repsLabel(1)).toBe(FORMAT.setRepsQuantity(1));
    expect(logLabel(1)).toBe(FORMAT.logSetLabel(1));
    expect(deleteLabel(1)).toBe(FORMAT.deleteSetLabel(1));
    expect(LABEL.logTab).toBe(copyFor('limelight', 'nav.log'));
    expect(LABEL.logBodyMass).toBe(copyFor('limelight', 'button.logBodyMass'));
    expect(LABEL.editEntry).toBe(copyFor('limelight', 'button.editEntry'));
    expect(LABEL.saveEntry).toBe(copyFor('limelight', 'button.saveEntry'));
    expect(LABEL.fluidLoss).toBe(copyFor('limelight', 'advice.fluidLoss'));
    expect(LABEL.finishAnyway).toBe(copyFor('limelight', 'button.finishAnyway'));
    expect(LABEL.trainTab).toBe(copyFor('limelight', 'nav.train'));
    expect(LABEL.targetsTab).toBe(copyFor('limelight', 'nav.targets'));
    expect(LABEL.planRow).toBe(copyFor('limelight', 'nav.plan'));
    expect(LABEL.atlasRow).toBe(copyFor('limelight', 'nav.atlas'));
    expect(LABEL.settingsRow).toBe(copyFor('limelight', 'nav.settings'));
    expect(LABEL.findRow).toBe(copyFor('limelight', 'button.openSpotlight'));
    expect(LABEL.dismiss).toBe(copyFor('limelight', 'button.dismiss'));
    expect(massLabel()).toBe(FORMAT.quantityWithUnit(copyFor('limelight', 'quantity.bodyMass'), 'kg'));
    expect(preMassLabel()).toBe(FORMAT.quantityWithUnit(copyFor('limelight', 'quantity.preSessionBodyMass'), 'kg'));
    expect(postMassLabel()).toBe(FORMAT.quantityWithUnit(copyFor('limelight', 'quantity.postSessionBodyMass'), 'kg'));
  });

  it('reads the recovery words the app renders (plan Task 17)', () => {
    expect(LABEL.recoveryHeading).toBe(copyFor('limelight', 'hero.storedDataRefused'));
    expect(copyFor('limelight', 'status.writesPaused').startsWith(LABEL.writesPaused)).toBe(true);
  });

  it('reads the record database the app writes (P2 Task 12)', () => {
    expect(E2E_RECORD_DB_NAME).toBe(RECORD_DB_NAME);
    expect(RECORD_APP_STORE).toBe(APP_STORE);
    expect(RECORD_META_KEY).toBe(META_KEY);
    expect([...RECORD_MAP_STORES]).toEqual([...MAP_STORES]);
    expect([...RECORD_SINGLETONS]).toEqual([...SINGLETON_KEYS]);
    expect(LABEL.settingsTab).toBe(copyFor('limelight', 'nav.settings'));
    expect(LABEL.logTab).toBe(copyFor('limelight', 'nav.log'));
    expect(LABEL.trainTab).toBe(copyFor('limelight', 'nav.train'));
    expect(LABEL.unreadableHeading).toBe(copyFor('limelight', 'hero.unreadableRecords'));
  });
});
