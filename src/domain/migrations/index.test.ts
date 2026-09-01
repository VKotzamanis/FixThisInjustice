import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from './index';
import { CURRENT_SCHEMA_VERSION } from '../schema';

describe('the migration chain is well-formed', () => {
  it('advances exactly one version per step', () => {
    for (const step of MIGRATIONS) {
      expect(step.to).toBe(step.from + 1);
    }
  });

  it('has no duplicate starting version', () => {
    const froms = MIGRATIONS.map((m) => m.from);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it('is empty at P1; P7 adds the v2 to v3 step', () => {
    expect(MIGRATIONS).toHaveLength(0);
  });
});

describe('migrate', () => {
  it('is the identity when the document is already current', () => {
    const doc = { schemaVersion: 3, marker: 'unchanged' };
    const result = migrate(doc, CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(doc);
      expect(result.applied).toEqual([]);
    }
  });

  it('refuses a document from a newer build', () => {
    const result = migrate({}, 4, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version of the app');
  });

  it('reports a gap in the chain rather than passing the document through', () => {
    // There is no v1 -> v2 step in P1, so this must fail loudly. A silent
    // pass-through would surface later as an unexplained schema error.
    const result = migrate({}, 1, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no migration from schema version 1 to 2');
  });
});
