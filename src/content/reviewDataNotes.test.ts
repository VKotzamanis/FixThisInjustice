// src/content/reviewDataNotes.test.ts
//
// The R10 contract for the review step's "Your Data" block. Modelled on bodyEquations.test.ts:
// exempt from R1 to R4 and from R9, not from R5, R6 or R11.
//
// The last test is the one that matters here, the way the DOI cross-check is the one that
// matters in bodyEquations.test.ts: the module names ExportView's controls by quoting the same
// strings copy.ts resolves them to, so a control renamed in copy.ts fails HERE instead of
// leaving this module's wording to drift silently out of date.
import { describe, expect, it } from 'vitest';

import { DEFAULT_COPY } from './copy';
import {
  REVIEW_DATA_HOW_TO_MOVE,
  REVIEW_DATA_HOW_TO_RESET,
  REVIEW_DATA_WHERE_IT_LIVES,
} from './reviewDataNotes';

const ROWS = [REVIEW_DATA_WHERE_IT_LIVES, REVIEW_DATA_HOW_TO_MOVE, REVIEW_DATA_HOW_TO_RESET];

describe('the review data notes obey the rules R10 does not exempt', () => {
  it('R5: no em dash, and no en dash used as a connector', () => {
    for (const row of ROWS) {
      expect({ row, dash: /—|–/.test(row) }).toEqual({ row, dash: false });
    }
  });

  it('R6: no emoji', () => {
    for (const row of ROWS) {
      expect({ row, emoji: /\p{Extended_Pictographic}/u.test(row) }).toEqual({
        row,
        emoji: false,
      });
    }
  });

  it('R11: names the defined quantity, never a colloquial stand-in', () => {
    for (const row of ROWS) {
      expect({ row, loose: /\bweight\b|\bcalories\b/i.test(row) }).toEqual({ row, loose: false });
    }
  });

  it('states no URL, because a string is not a place to put a link', () => {
    for (const row of ROWS) {
      expect({ row, url: /https?:\/\//.test(row) }).toEqual({ row, url: false });
    }
  });
});

describe('the data-portability fact names the controls ExportView actually renders', () => {
  /*
   * Every one of these four is quoted directly from DEFAULT_COPY rather than retyped, so a
   * rename in copy.ts is what this test catches: retyping the same words here as a second
   * literal would let the two drift and both still pass.
   */
  const NAMED_KEYS = [
    'hero.exportImport',
    'label.downloads',
    'button.downloadJson',
    'label.importSection',
  ] as const;

  it.each(NAMED_KEYS)('quotes DEFAULT_COPY[%s] verbatim', (key) => {
    expect(REVIEW_DATA_HOW_TO_MOVE).toContain(DEFAULT_COPY[key]);
  });
});

describe('the reset fact says plainly that it cannot be undone', () => {
  it('states there is no way back', () => {
    expect(REVIEW_DATA_HOW_TO_RESET).toContain('no way back');
  });

  it('names the reversible-looking thing it warns about: clearing cookies and site data', () => {
    expect(REVIEW_DATA_HOW_TO_RESET).toContain('cookies and site data');
  });
});
