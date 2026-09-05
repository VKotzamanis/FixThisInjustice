// src/domain/alphaFixture.test.ts
//
// The committed alpha fixture still describes the states it was built for.
//
// Alpha round 1, claim C0.2: twenty-two of the walkthrough's eighty-nine steps need a state a
// fresh install cannot reach, so they were unreviewable. scripts/alpha-fixture.mjs builds a
// document that reaches them by driving the store's own actions. This suite is the assertion
// that the committed output still does, so a schema change or a generator edit fails here
// rather than at the moment the owner tries to review a screen.
//
// ?raw rather than node:fs because tsconfig.app.json pins `types` to the vite client types,
// the convention src/content/alphaCatalogue.test.ts already uses.
import { describe, expect, it } from 'vitest';

import fixtureJson from '../../docs/feedback/alpha-fixture.json?raw';
import { SPECIMEN_CARDS, SPECIMEN_RARITIES } from '../content/specimenCards';
import { parseState } from './schema';

const PROFILE_ID = 'alpha-demo';

const parsed = parseState(JSON.parse(fixtureJson) as unknown);
if (!parsed.ok) throw new Error(`alpha-fixture.json fails the schema: ${parsed.error}`);
const doc = parsed.state;

describe('the alpha fixture loads', () => {
  it('parses against the live schema at the current version', () => {
    expect(doc.schemaVersion).toBe(3);
    expect(doc.activeProfileId).toBe(PROFILE_ID);
  });

  it('is imperial with no body-fat estimate, the two paths round 1 could not otherwise show', () => {
    const profile = doc.profiles[PROFILE_ID];
    expect(profile?.units).toBe('imperial');
    // null routes RMR to Mifflin-St Jeor and protein to the body-mass rule: the fallback branch.
    expect(profile?.body.baselineBodyFatPct).toBeNull();
  });
});

describe('the fixture reaches the states a fresh install cannot', () => {
  it('carries at least one missed week, which four walkthrough steps need', () => {
    const reviews = doc.weeklyReviews[PROFILE_ID] ?? [];
    const missed = reviews.filter((r) => !r.paused && r.delta < 0);
    expect(reviews.length).toBeGreaterThanOrEqual(8);
    expect(missed.length).toBeGreaterThanOrEqual(1);
  });

  it('carries a plan long enough to hold an ended block and a deload', () => {
    const cursor = doc.cursors[PROFILE_ID];
    const plan = cursor === undefined ? undefined : doc.plans[cursor.planId];
    expect(plan?.weeks).toBeGreaterThanOrEqual(12);
    expect(plan?.blocks.filter((b) => b.isDeload).length).toBeGreaterThanOrEqual(2);
    // The cursor stands inside the plan, not at either end: a mid-programme state.
    expect(cursor?.nextSessionIndex).toBeGreaterThan(0);
    expect(cursor?.nextSessionIndex).toBeLessThan(plan?.sessions.length ?? 0);
  });

  it('carries both a completed and a skipped assignment', () => {
    const statuses = new Set((doc.assignments[PROFILE_ID] ?? []).map((a) => a.status));
    expect(statuses.has('completed')).toBe(true);
    expect(statuses.has('skipped')).toBe(true);
  });

  it('carries one Atlas card of every rarity, and leaves the rest locked', () => {
    const acquired = Object.keys(doc.specimens[PROFILE_ID]?.acquired ?? {});
    const rarities = new Set(
      acquired
        .map((id) => SPECIMEN_CARDS.find((c) => c.id === id)?.rarity)
        .filter((r): r is (typeof SPECIMEN_RARITIES)[number] => r !== undefined),
    );
    expect([...rarities].sort()).toEqual([...SPECIMEN_RARITIES].sort());
    // The locked slot is a walkthrough step of its own, so the set must not be complete.
    expect(acquired.length).toBeLessThan(SPECIMEN_CARDS.length);
  });

  it('carries a body-mass series, reminder settings and a time capsule', () => {
    expect((doc.bodyMass[PROFILE_ID] ?? []).length).toBeGreaterThanOrEqual(8);
    expect(doc.reminderSettings[PROFILE_ID]?.enabled).toBe(true);
    expect(doc.capsules[PROFILE_ID]).not.toBeNull();
  });

  it('carries no personal identifier, because it is committed to a public repository', () => {
    const text = fixtureJson.toLowerCase();
    for (const term of ['vyvanse', 'lisdexamfetamine', 'ymca', 'amphetamine']) {
      expect({ term, present: text.includes(term) }).toEqual({ term, present: false });
    }
  });
});
