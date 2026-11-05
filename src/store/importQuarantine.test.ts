// src/store/importQuarantine.test.ts
//
// Audit B04: a JSON import used to be all-or-nothing and named only the first issue, so one
// `rpe: 7.3` refused a whole backup and the user fixed a phone-typed JSON file one error at a
// time. Import now reads through the same per-record path as a load (assembleState): an invalid
// record is quarantined and listed, every other record imports, and a refusal lists every issue.
import { describe, expect, it } from 'vitest';
import alphaFixtureJson from '../../docs/feedback/alpha-fixture.json?raw';
import { useAppStore, whenPersisted } from './index';
import { importJson } from './persistence';
import { bootMemoryStore } from './testBackend';

type Doc = Record<string, Record<string, Record<string, unknown>>>;

function alpha(): Doc {
  return JSON.parse(alphaFixtureJson) as Doc;
}

function setIds(doc: Doc): string[] {
  return Object.keys(doc.sets ?? {});
}

/** The alpha fixture with two invalid sets and one invalid body-mass row. */
function damaged(): { text: string; badSets: string[] } {
  const doc = alpha();
  const sets = doc.sets ?? {};
  const [a, b] = setIds(doc);
  if (a === undefined || b === undefined) throw new Error('the alpha fixture has sets');
  sets[a] = { ...sets[a], rpe: 7.3 };
  sets[b] = { ...sets[b], reps: -1 };
  const profileId = 'alpha-demo'; // the alpha fixture's one profile
  const mass = (doc.bodyMass ?? {})[profileId] as unknown as Record<string, unknown>[];
  mass[0] = { ...mass[0], massKg: 'heavy' };
  return { text: JSON.stringify(doc), badSets: [a, b] };
}

describe('import quarantines invalid records instead of refusing the file (audit B04)', () => {
  it('imports every valid record and lists every invalid one', () => {
    const { text, badSets } = damaged();
    const result = importJson(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.quarantine.map((q) => `${q.store}:${q.key}:${String(q.index)}`).sort()).toEqual(
      [`sets:${badSets[0] ?? ''}:null`, `sets:${badSets[1] ?? ''}:null`, `bodyMass:alpha-demo:0`].sort(),
    );
    expect(result.quarantine.find((q) => q.key === badSets[0])?.reason).toContain('rpe is recorded in 0.5 steps');
    for (const id of badSets) expect(result.state.sets[id]).toBeUndefined();
    expect(Object.keys(result.state.sets)).toHaveLength(setIds(alpha()).length - 2);
  });

  it('refuses a file whose profiles cannot be read, naming every bad profile', () => {
    const doc = alpha();
    const profiles = doc.profiles ?? {};
    const id = Object.keys(profiles)[0] ?? '';
    profiles[id] = { ...profiles[id], units: 'cubits' };
    profiles.second = { ...profiles[id], id: 'second', units: 'furlongs' };
    const result = importJson(JSON.stringify(doc));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(`profiles.${id}`);
      expect(result.error).toContain('profiles.second');
    }
  });

  it('refuses a file missing a required top-level field, naming each one', () => {
    // An empty or truncated file must not replace everything with nothing.
    const result = importJson('{"schemaVersion":3}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('profiles');
      expect(result.error).toContain('sets');
      expect(result.error).toContain('ui');
    }
  });

  it('the store installs the readable records and keeps the unreadable ones on disk as stored', async () => {
    const backend = await bootMemoryStore();
    const { text, badSets } = damaged();
    const result = useAppStore.getState().importJson(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.quarantine).toHaveLength(3);
    await whenPersisted();
    const status = useAppStore.getState().status;
    expect(status.quarantine).toHaveLength(3);
    expect(useAppStore.getState().sets[badSets[0] ?? '']).toBeUndefined();
    // Kept exactly as stored ('advice.unreadableRecordsKept'): the whole set records and the
    // bad list item are on disk, beside the imported records.
    const disk = backend.disk.records;
    expect(disk.get('sets')?.get(badSets[0] ?? '')).toMatchObject({ rpe: 7.3 });
    const massList = disk.get('bodyMass')?.get('alpha-demo') as Record<string, unknown>[];
    expect(massList.some((m) => m.massKg === 'heavy')).toBe(true);
  });
});
