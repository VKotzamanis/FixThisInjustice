import { describe, expect, it } from 'vitest';
import alphaFixtureJson from '../../../docs/feedback/alpha-fixture.json?raw';
import v3MinimalJson from '../../domain/migrations/fixtures/v3-minimal.json?raw';
import { parseState } from '../../domain/schema';
import { assembleState } from './assemble';
import { encodeOps, EMPTY_PRESERVED } from './preserve';
import { diffStates, groupRecords, splitDocument, splitState, type RecordPut } from './records';

function split(text: string): RecordPut[] {
  const result = splitDocument(JSON.parse(text) as Record<string, unknown>);
  if (!result.ok) throw new Error(result.error);
  return result.puts;
}

function alpha(): Record<string, unknown> {
  return JSON.parse(alphaFixtureJson) as Record<string, unknown>;
}

function firstSetId(doc: Record<string, unknown>): string {
  const id = Object.keys(doc.sets as Record<string, unknown>)[0];
  if (id === undefined) throw new Error('the alpha fixture has sets');
  return id;
}

describe('assembleState reads what parseState reads (rule 2)', () => {
  it.each([
    ['the alpha fixture', alphaFixtureJson],
    ['the captured v3 fixture', v3MinimalJson],
  ])('%s assembles to the parsed document', (_name, text) => {
    const expected = parseState(JSON.parse(text));
    if (!expected.ok) throw new Error(expected.error);
    const result = assembleState(groupRecords(split(text)));
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toEqual(expected.state);
    expect(result.quarantine).toEqual([]);
  });

  it('round-trips through splitState: every stored record reads back as written', () => {
    const parsed = parseState(alpha());
    if (!parsed.ok) throw new Error(parsed.error);
    const result = assembleState(groupRecords(splitState(parsed.state)));
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toEqual(parsed.state);
  });
});

describe('one invalid record is quarantined, not the document (B01/B04)', () => {
  it('a set with rpe 7.3 is listed, every other set loads', () => {
    const doc = alpha();
    const sets = doc.sets as Record<string, Record<string, unknown>>;
    const bad = firstSetId(doc);
    sets[bad] = { ...sets[bad], rpe: 7.3 };
    const result = assembleState(groupRecords(split(JSON.stringify(doc))));
    if (!result.ok) throw new Error(result.error);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]).toMatchObject({ store: 'sets', key: bad, index: null });
    expect(result.quarantine[0]?.reason).toContain('rpe is recorded in 0.5 steps');
    expect(result.state.sets[bad]).toBeUndefined();
    expect(Object.keys(result.state.sets)).toHaveLength(Object.keys(sets).length - 1);
  });

  it('an assignment with an unknown status loses only that row, which stays on disk in place (B06)', () => {
    const doc = alpha();
    const profileId = doc.activeProfileId as string;
    const rows = (doc.assignments as Record<string, Record<string, unknown>[]>)[profileId] ?? [];
    const first = rows[0];
    if (first === undefined) throw new Error('the alpha fixture has assignments');
    rows[0] = { ...first, status: 'partial' };
    const result = assembleState(groupRecords(split(JSON.stringify(doc))));
    if (!result.ok) throw new Error(result.error);
    expect(result.quarantine).toEqual([
      expect.objectContaining({ store: 'assignments', key: profileId, index: 0, raw: rows[0] }),
    ]);
    expect(result.state.assignments[profileId]).toHaveLength(rows.length - 1);
    // Rewriting the list keeps the unreadable row on disk, after the readable ones.
    const ops = encodeOps(
      { clear: false, puts: [{ store: 'assignments', key: profileId, value: result.state.assignments[profileId] }], deletes: [] },
      result.preserved,
    );
    const written = ops.puts[0]?.value as unknown[];
    expect(written).toHaveLength(rows.length);
    expect(written[written.length - 1]).toEqual(rows[0]);
  });

  it('a record keyed by an unknown profile is quarantined as an orphan', () => {
    const doc = alpha();
    (doc.intake as Record<string, unknown>).ghost = [];
    const result = assembleState(groupRecords(split(JSON.stringify(doc))));
    if (!result.ok) throw new Error(result.error);
    expect(result.quarantine).toEqual([expect.objectContaining({ store: 'intake', key: 'ghost', index: null })]);
  });

  it('an invalid profile refuses the whole load, naming the field', () => {
    const doc = alpha();
    const profileId = doc.activeProfileId as string;
    const profiles = doc.profiles as Record<string, Record<string, unknown>>;
    profiles[profileId] = { ...profiles[profileId], displayName: 'A'.repeat(81) };
    const result = assembleState(groupRecords(split(JSON.stringify(doc))));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`profiles.${profileId}`);
  });
});

describe('unknown keys survive a rewrite (B06)', () => {
  it('a set field, a ui flag and a top-level field written by a newer build are kept', () => {
    const doc = alpha();
    const sets = doc.sets as Record<string, Record<string, unknown>>;
    const id = firstSetId(doc);
    sets[id] = { ...sets[id], futureField: 'kept' };
    doc.ui = { ...(doc.ui as Record<string, unknown>), futureFlag: true };
    doc.futureTopLevel = { a: 1 };
    const puts = split(JSON.stringify(doc));
    expect(puts).toContainEqual({ store: 'app', key: 'legacy:futureTopLevel', value: { a: 1 } });
    const result = assembleState(groupRecords(puts));
    if (!result.ok) throw new Error(result.error);
    const before = result.state;
    const set = before.sets[id];
    if (set === undefined) throw new Error('set loads');
    const after = { ...before, sets: { ...before.sets, [id]: { ...set, reps: 9 } }, ui: { ...before.ui, lastView: 'log' } };
    const ops = encodeOps(diffStates(before, after), result.preserved);
    expect(ops.puts).toContainEqual({ store: 'sets', key: id, value: expect.objectContaining({ reps: 9, futureField: 'kept' }) as unknown });
    expect(ops.puts).toContainEqual({ store: 'app', key: 'ui', value: expect.objectContaining({ lastView: 'log', futureFlag: true }) as unknown });
  });
});

describe('a .catch() repair never overwrites the stored answer (B10)', () => {
  it('lists the repair and writes the stored value back while the app still holds the substitute', () => {
    const doc = alpha();
    const profileId = doc.activeProfileId as string;
    const profiles = doc.profiles as Record<string, Record<string, unknown>>;
    const profile = profiles[profileId] ?? {};
    profiles[profileId] = { ...profile, equipment: 'garage-gym', body: { ...(profile.body as object), sex: 'x' } };
    const result = assembleState(groupRecords(split(JSON.stringify(doc))));
    if (!result.ok) throw new Error(result.error);
    expect(result.repairs).toEqual([
      { store: 'profiles', key: profileId, path: ['body', 'sex'], stored: 'x', readAs: 'nd' },
      { store: 'profiles', key: profileId, path: ['equipment'], stored: 'garage-gym', readAs: 'full-gym' },
    ]);
    const loaded = result.state.profiles[profileId];
    if (loaded === undefined) throw new Error('profile loads');
    const renamed = { ...result.state, profiles: { [profileId]: { ...loaded, displayName: 'Renamed' } } };
    const written = encodeOps(diffStates(result.state, renamed), result.preserved).puts[0]?.value as Record<string, unknown>;
    expect(written.displayName).toBe('Renamed');
    expect(written.equipment).toBe('garage-gym');
    expect((written.body as Record<string, unknown>).sex).toBe('x');
    // A value the user chose since wins.
    const chosen = { ...result.state, profiles: { [profileId]: { ...loaded, equipment: 'home' as const } } };
    const rewritten = encodeOps(diffStates(result.state, chosen), result.preserved).puts[0]?.value as Record<string, unknown>;
    expect(rewritten.equipment).toBe('home');
  });

  it('a legacy migration is not a repair', () => {
    const doc = alpha();
    const profileId = doc.activeProfileId as string;
    const profiles = doc.profiles as Record<string, Record<string, unknown>>;
    profiles[profileId] = { ...profiles[profileId], equipment: 'dumbbells-only' };
    const result = assembleState(groupRecords(split(JSON.stringify(doc))));
    if (!result.ok) throw new Error(result.error);
    expect(result.repairs).toEqual([]);
    expect(result.state.profiles[profileId]?.equipment).toBe('home');
  });
});

describe('diffStates writes only what changed identity', () => {
  it('a logged set is one put; a deleted set is one delete; an untouched document is nothing', () => {
    const parsed = parseState(alpha());
    if (!parsed.ok) throw new Error(parsed.error);
    const s = parsed.state;
    expect(diffStates(s, s)).toEqual({ clear: false, puts: [], deletes: [] });
    const id = Object.keys(s.sets)[0] ?? '';
    const set = s.sets[id];
    if (set === undefined) throw new Error('set');
    const added = { ...s, sets: { ...s.sets, fresh: { ...set, id: 'fresh' } } };
    expect(diffStates(s, added)).toEqual({ clear: false, puts: [{ store: 'sets', key: 'fresh', value: added.sets.fresh }], deletes: [] });
    const rest = Object.fromEntries(Object.entries(s.sets).filter(([key]) => key !== id));
    expect(diffStates(s, { ...s, sets: rest })).toEqual({ clear: false, puts: [], deletes: [{ store: 'sets', key: id }] });
    expect(encodeOps(diffStates(s, s), EMPTY_PRESERVED).puts).toEqual([]);
  });
});
