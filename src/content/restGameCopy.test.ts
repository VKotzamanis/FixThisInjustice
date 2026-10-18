// src/content/restGameCopy.test.ts
//
// The rest-game strings (ROADMAP F1, docs/design/rest-games.md) against the copy contract rules
// the brief names: Title Case for every naming key (R14, `titleCaseOffenders`), a button at most
// three words (R1), no emoji (R6). The keys are found by their `restWord` stem, not listed, so a
// key added later is checked without editing this file.
import { describe, expect, it } from 'vitest';
import { DEFAULT_COPY, LIMELIGHT_COPY, type CopyKey } from './copy';
import { NAMING_PREFIXES, hasEmoji, titleCaseOffenders, wordCount } from './copyContract';

const REST_GAME_KEYS = (Object.keys(DEFAULT_COPY) as CopyKey[]).filter((key) =>
  key.includes('restWord'),
);

describe('rest-game copy (ROADMAP F1)', () => {
  it('exists: the game reads its words from the table', () => {
    expect(REST_GAME_KEYS.length).toBeGreaterThan(0);
  });

  it('names every control, heading and label in Title Case (R14)', () => {
    for (const key of REST_GAME_KEYS) {
      if (!NAMING_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      expect({ key, offenders: titleCaseOffenders(DEFAULT_COPY[key]) }).toEqual({
        key,
        offenders: [],
      });
    }
  });

  it('keeps every button at three words or fewer (R1), with no emoji (R6)', () => {
    for (const key of REST_GAME_KEYS) {
      const value = DEFAULT_COPY[key];
      expect({ key, emoji: hasEmoji(value) }).toEqual({ key, emoji: false });
      if (!key.startsWith('button.')) continue;
      expect({ key, ok: wordCount(value) <= 3 }).toEqual({ key, ok: true });
    }
  });

  it('adds no limelight override: the base table is what ships, as with session editing', () => {
    for (const key of REST_GAME_KEYS) {
      expect({ key, overridden: key in LIMELIGHT_COPY }).toEqual({ key, overridden: false });
    }
  });
});
