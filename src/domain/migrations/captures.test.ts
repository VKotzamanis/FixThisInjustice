// src/domain/migrations/captures.test.ts
//
// Audit B16: migration discipline enforced by tests, not convention. Every captured document
// under ./fixtures (one per release, written by scripts/capture-schema-fixture.mjs from that
// build) is checked both ways:
//   old -> new  every capture, of every version, still loads in this build, through the
//               whole-document parse (import) AND the per-record path (IndexedDB load), with
//               nothing quarantined or repaired;
//   new -> new  this build's own document round-trips: the newest capture of the current
//               version is reproduced BYTE FOR BYTE by parse + export, and survives the record
//               split and reassembly. A stored-shape change fails here until a new capture is
//               taken (and the old one keeps loading, which is rule 7);
//   unknown     keys this build does not know, at the top level, on a record, nested in a
//               record and on a list item, are kept on disk (audit B06).
import { describe, expect, it } from 'vitest';
import { assembleState } from '../../store/db/assemble';
import { encodeOps } from '../../store/db/preserve';
import { groupRecords, legacyExtraKey, splitDocument, splitState, type RecordPut } from '../../store/db/records';
import { exportJson } from '../../store/persistence';
import { CURRENT_SCHEMA_VERSION, parseState } from '../schema';

const TEXT: Record<string, string> = import.meta.glob<string>('./fixtures/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const CAPTURE = /\/v(\d+)-capture-([^/]+)\.json$/;

/** Captures of the current version, newest label last (labels are ISO dates). */
const CURRENT_CAPTURES = Object.keys(TEXT)
  .filter((path) => CAPTURE.exec(path)?.[1] === String(CURRENT_SCHEMA_VERSION))
  .sort();

function split(doc: Record<string, unknown>): RecordPut[] {
  const result = splitDocument(doc);
  if (!result.ok) throw new Error(result.error);
  return result.puts;
}

function newest(): { path: string; text: string } {
  const path = CURRENT_CAPTURES.at(-1);
  if (path === undefined) throw new Error('no capture of the current schema version');
  return { path, text: TEXT[path] ?? '' };
}

describe('captured documents (audit B16)', () => {
  it(`holds a capture of the current schema version (v${String(CURRENT_SCHEMA_VERSION)})`, () => {
    expect(CURRENT_CAPTURES.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(TEXT))('%s loads in this build, whole and per record', (path) => {
    const doc = JSON.parse(TEXT[path] ?? '') as Record<string, unknown>;
    const parsed = parseState(doc);
    if (!parsed.ok) throw new Error(`${path}: ${parsed.error}`);
    const assembled = assembleState(groupRecords(split(doc)));
    if (!assembled.ok) throw new Error(`${path}: ${assembled.error}`);
    expect(assembled.quarantine).toEqual([]);
    expect(assembled.repairs).toEqual([]);
    expect(assembled.state).toEqual(parsed.state);
  });

  it('the newest current capture is what this build writes, byte for byte', () => {
    const { path, text } = newest();
    const parsed = parseState(JSON.parse(text));
    if (!parsed.ok) throw new Error(parsed.error);
    // A failure here means this build stores a different shape: take a new capture with
    // `node scripts/capture-schema-fixture.mjs <date>` and keep this one (rule 7).
    expect({ path, same: exportJson(parsed.state) === text }).toEqual({ path, same: true });
  });

  it("this build's document round-trips through its records", () => {
    const parsed = parseState(JSON.parse(newest().text));
    if (!parsed.ok) throw new Error(parsed.error);
    const assembled = assembleState(groupRecords(splitState(parsed.state)));
    if (!assembled.ok) throw new Error(assembled.error);
    expect(assembled.state).toEqual(parsed.state);
    // Same content; key ORDER differs (assembleState builds the document store by store), which
    // no reader depends on, so the exports are compared as JSON values, not as text.
    expect(JSON.parse(exportJson(assembled.state))).toStrictEqual(JSON.parse(exportJson(parsed.state)));
  });

  it('keeps keys this build does not know, at every depth, when it rewrites the records', () => {
    const doc = JSON.parse(newest().text) as Record<string, Record<string, unknown>>;
    const active: unknown = Reflect.get(doc, 'activeProfileId');
    if (typeof active !== 'string') throw new Error('the capture has an active profile');
    const profileId = active;
    const setId = Object.keys(doc.sets ?? {})[0] ?? '';
    const sets = doc.sets as Record<string, Record<string, unknown>>;
    const profiles = doc.profiles as Record<string, { body: Record<string, unknown> }>;
    const assignments = doc.assignments as Record<string, Record<string, unknown>[]>;
    sets[setId] = { ...sets[setId], futureSetField: 1 };
    const profile = profiles[profileId];
    if (profile === undefined) throw new Error('the capture has an active profile');
    profile.body = { ...profile.body, futureBodyField: 'x' };
    const firstAssignment = assignments[profileId]?.[0];
    if (firstAssignment === undefined) throw new Error('the capture has assignments');
    firstAssignment.futureItemField = true;
    (doc as Record<string, unknown>).futureTopLevel = { kept: true };

    const puts = split(doc);
    expect(puts).toContainEqual({ store: 'app', key: legacyExtraKey('futureTopLevel'), value: { kept: true } });
    const assembled = assembleState(groupRecords(puts));
    if (!assembled.ok) throw new Error(assembled.error);
    expect(assembled.quarantine).toEqual([]);
    expect(assembled.state.sets[setId]).not.toHaveProperty('futureSetField');

    // Rewrite every record, as a full replace would, and read what goes to disk.
    const written = encodeOps({ clear: false, puts: splitState(assembled.state), deletes: [] }, assembled.preserved).puts;
    const at = (store: string, key: string): unknown => written.find((p) => p.store === store && p.key === key)?.value;
    expect(at('sets', setId)).toMatchObject({ futureSetField: 1 });
    expect(at('profiles', profileId)).toMatchObject({ body: { futureBodyField: 'x' } });
    expect((at('assignments', profileId) as Record<string, unknown>[])[0]).toMatchObject({ futureItemField: true });
  });
});
