// The e2e harness builds documents and clicks words by itself, without importing app modules
// at runtime. This suite is what keeps those copies honest (AGENTS.md rule 2).
import { describe, expect, it } from 'vitest';
import { FORMAT, copyFor } from '../content/copy';
import { parseState } from '../domain/schema';
import { STORAGE_KEY } from '../store/persistence';
import {
  LABEL,
  STORAGE_KEY as E2E_STORAGE_KEY,
  deleteLabel,
  loadLabel,
  logLabel,
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
    expect(parsed.state.setupDraft?.stepIndex).toBe(7);
  });

  it('seeds under the key the app reads', () => {
    expect(E2E_STORAGE_KEY).toBe(STORAGE_KEY);
  });

  it('taps the words the app renders on the limelight skin', () => {
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
  });
});
