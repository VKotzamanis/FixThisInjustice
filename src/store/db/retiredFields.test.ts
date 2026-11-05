// src/store/db/retiredFields.test.ts
//
// ROADMAP N4 / N7: `AppState.notes` (daily notes, never written or shown by any UI) and
// `UiPrefs.accent` (a colour no code read) were retired from the types and the schema without a
// schema-version bump. Rule 7: a document or export that still carries them must load, with
// both stripped from the running state, and nothing on disk is destroyed: `ui.accent` read from
// a stored record goes back onto it (audit B06 extras), and the `notes` object store is no longer
// read, so its records stay exactly as stored for a rolled-back build.
import { describe, expect, it } from 'vitest';
import v3MinimalJson from '../../domain/migrations/fixtures/v3-minimal.json?raw';
import { parseState } from '../../domain/schema';
import { makeBlankState } from '../../test/migrationFactories';
import { exportJson, importJson, loadDocument } from '../persistence';
import { assembleState } from './assemble';
import { createMemoryBackend } from './memoryBackend';
import { encodeOps } from './preserve';
import { ALL_STORES, groupRecords, splitDocument, splitState } from './records';

/** A current document with the two retired fields put back, as an older build wrote it. */
function documentWithRetiredFields(): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(makeBlankState())) as Record<string, unknown>;
  const profileId = String(doc.activeProfileId);
  doc.notes = { [profileId]: { '2026-01-05': 'an old daily note' } };
  doc.ui = { ...(doc.ui as Record<string, unknown>), accent: '#a3e635' };
  return doc;
}

describe('retired fields notes and ui.accent (ROADMAP N4)', () => {
  it('are no longer stored stores or fields of a new document', () => {
    const state = makeBlankState();
    expect(state).not.toHaveProperty('notes');
    expect(state.ui).not.toHaveProperty('accent');
    expect(ALL_STORES).not.toContain('notes');
    expect(splitState(state).some((p) => p.key === 'notes' || p.store === ('notes' as never))).toBe(false);
  });

  it('the captured v3 fixture, which carries ui.accent, still parses, with accent stripped', () => {
    const result = parseState(JSON.parse(v3MinimalJson));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.ui).not.toHaveProperty('accent');
  });

  it('an old export carrying both imports, with both stripped', () => {
    const result = importJson(JSON.stringify(documentWithRetiredFields()));
    if (!result.ok) throw new Error(result.error);
    expect(result.state).not.toHaveProperty('notes');
    expect(result.state.ui).not.toHaveProperty('accent');
    expect(exportJson(result.state)).not.toMatch(/"notes"|"accent"/);
  });

  it('old stored records carrying both load; accent is written back with the ui record', () => {
    const split = splitDocument(documentWithRetiredFields());
    if (!split.ok) throw new Error(split.error);
    const result = assembleState(groupRecords(split.puts));
    if (!result.ok) throw new Error(result.error);
    expect(result.quarantine).toEqual([]);
    expect(result.state).not.toHaveProperty('notes');
    expect(result.state.ui).not.toHaveProperty('accent');
    const ui = encodeOps({ clear: false, puts: [{ store: 'app', key: 'ui', value: result.state.ui }], deletes: [] }, result.preserved);
    expect(ui.puts[0]?.value).toMatchObject({ accent: '#a3e635' });
  });

  it('a first boot importing an old fti.v3 with both loads and keeps notes under a legacy key', async () => {
    const backend = createMemoryBackend({ legacy: JSON.stringify(documentWithRetiredFields()) });
    const outcome = await loadDocument(backend);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.state).not.toHaveProperty('notes');
    expect(outcome.quarantine).toEqual([]);
    expect(backend.disk.records.get('app')?.get('legacy:notes')).toBeDefined();
  });

  it('a database holding records in the old notes store loads, and leaves them in place', async () => {
    const backend = createMemoryBackend();
    const committed = await backend.commit({ clear: false, puts: splitState(makeBlankState()), deletes: [] }, 0, 3);
    expect(committed.ok).toBe(true);
    backend.disk.records.set('notes' as never, new Map([['p1', { '2026-01-05': 'kept' }]]));
    const outcome = await loadDocument(backend);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.state).not.toHaveProperty('notes');
    expect(backend.disk.records.get('notes' as never)?.get('p1')).toEqual({ '2026-01-05': 'kept' });
  });
});
