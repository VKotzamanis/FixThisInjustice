/**
 * The copy contract as a live check, over strings that are DELIBERATELY BAD.
 *
 * `copy.test.ts` proves the shipped tables obey the rules. This file proves the rules still catch
 * a string that breaks them, which is a different claim and the one Design Mode depends on: a
 * validator that never fires is indistinguishable from one that is not wired up.
 *
 * The four cases the design-mode plan names as its acceptance criterion - a four-word `button.`,
 * an em dash, an emoji, a lower-case `label.` - are each asserted below by rule id.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_COPY } from './copy';
import {
  checkCopyValue,
  hasConnectorEnDash,
  hasEmDash,
  hasEmoji,
  quantityAdvisories,
  sentenceCount,
  titleCaseOffenders,
  wordCount,
} from './copyContract';

/** The rule ids a value trips, as a sorted list, for a compact assertion. */
function rules(key: string, value: string, table: 'DEFAULT_COPY' | 'LIMELIGHT_COPY'): string[] {
  return checkCopyValue(key, value, table)
    .map((violation) => violation.rule)
    .sort();
}

describe('the four cases the plan names', () => {
  it('R1: a four-word button is flagged, a three-word one is not', () => {
    expect(rules('button.continue', 'Go On To The Next', 'DEFAULT_COPY')).toContain('R1');
    expect(rules('button.continue', 'Continue', 'DEFAULT_COPY')).toEqual([]);
    // The message names the number, so the owner does not have to count.
    const violation = checkCopyValue('button.continue', 'Go On To The Next', 'DEFAULT_COPY')[0];
    expect(violation?.message).toContain('at most 3 words');
    expect(violation?.message).toContain('is 5');
  });

  it('R5: an em dash is flagged wherever it appears', () => {
    expect(rules('advice.unitsOnce', 'Set once — change later.', 'DEFAULT_COPY')).toContain('R5');
    expect(rules('advice.unitsOnce', 'Set once: change later.', 'DEFAULT_COPY')).toEqual([]);
  });

  it('R6: an emoji is flagged, and U+2600 to U+27BF counts as one', () => {
    // U+2642 MALE SIGN sits inside the range round three fixed, so it is rejected as an emoji
    // even though it is a text-default symbol. That is the rule as written, deliberately.
    // WRITTEN AS AN ESCAPE, and that is not evasion of the gate it is testing.
    // scripts/check-no-emoji.mjs scans every tracked `src/content/copy*.ts`, which this file
    // matches by name, and it scans whole files rather than only their string literals. A
    // literal U+2642 here would fail that gate while proving nothing this escape does not.
    expect(rules('label.sex', 'Sex \u2642', 'DEFAULT_COPY')).toContain('R6');
  });

  it('R14: a lower-case label is flagged, and the skin tables are exempt', () => {
    expect(rules('label.units', 'units on the weight plates', 'DEFAULT_COPY')).toContain('R14');
    // Limelight is deliberately lower case; applying R14 to it would destroy that decision the
    // first time the rule was obeyed. scripts/check-title-case.mjs skips it for the same reason.
    expect(rules('label.units', 'units on the weight plates', 'LIMELIGHT_COPY')).toEqual([]);
  });
});

describe('the rest of the executable contract', () => {
  it('R2 and R3 cap a hero at eight words and an advice line at twelve', () => {
    expect(rules('hero.yourAnswers', 'One Two Three Four Five Six Seven Eight', 'DEFAULT_COPY')).toEqual(
      [],
    );
    expect(
      rules('hero.yourAnswers', 'One Two Three Four Five Six Seven Eight Nine', 'DEFAULT_COPY'),
    ).toContain('R2');
    // Thirteen real words. Single letters would not do: `s` and `g` are unit symbols and the
    // count excludes them, which is the rule working rather than a loophole.
    expect(
      rules(
        'advice.x',
        'one two three four five six seven eight nine ten eleven twelve thirteen',
        'DEFAULT_COPY',
      ),
    ).toContain('R3');
  });

  it('R3 exempts the three keys R9 puts behind a why? disclosure', () => {
    // The exemption list is shared with copy.test.ts, so the panel cannot disagree with the gate.
    const long = DEFAULT_COPY['advice.goalRecompositionCost'];
    expect(wordCount(long)).toBeGreaterThan(12);
    expect(rules('advice.goalRecompositionCost', long, 'DEFAULT_COPY')).toEqual([]);
  });

  it('R4 caps a banner at two sentences', () => {
    expect(rules('banner.update.body', 'One. Two.', 'DEFAULT_COPY')).toEqual([]);
    expect(rules('banner.update.body', 'One. Two. Three.', 'DEFAULT_COPY')).toContain('R4');
  });

  it('R5 allows an en dash between digits and refuses it as a connector', () => {
    expect(hasConnectorEnDash('6–8 reps')).toBe(false);
    expect(hasConnectorEnDash('sets – reps')).toBe(true);
    expect(hasEmDash('a — b')).toBe(true);
  });

  it('R8 binds the default table alone, because the board shouts on purpose', () => {
    expect(rules('status.rest', 'Rest!', 'DEFAULT_COPY')).toContain('R8');
    expect(rules('status.rest', 'rest!', 'LIMELIGHT_COPY')).toEqual([]);
  });

  it('refuses a URL, because a string is not a place to put a link', () => {
    expect(rules('advice.x', 'See https://example.org for more.', 'DEFAULT_COPY')).toContain('URL');
  });
});

describe('R11, which is an advisory rather than a gate', () => {
  it('prompts on the bare quantity words', () => {
    expect(quantityAdvisories('Enter your weight')).toEqual([
      { wrong: 'weight', right: 'body mass' },
    ]);
    expect(quantityAdvisories('Daily calories')).toEqual([{ wrong: 'calories', right: 'kcal' }]);
  });

  it('leaves the four legitimate compounds alone, which is why it is not a gate', () => {
    for (const value of [
      DEFAULT_COPY['label.units'],
      DEFAULT_COPY['option.experienceAdvanced'],
      DEFAULT_COPY['option.accessBodyweight'],
      DEFAULT_COPY['option.accessHomeAndBodyweight'],
    ]) {
      expect({ value, advisories: quantityAdvisories(value) }).toEqual({ value, advisories: [] });
    }
  });

  it('is reported at advisory severity, so nothing treats it as a merge gate', () => {
    const found = checkCopyValue('advice.x', 'Enter your weight', 'DEFAULT_COPY');
    expect(found.map((violation) => [violation.rule, violation.severity])).toEqual([
      ['R11', 'advisory'],
    ]);
  });
});

describe('the helpers this module shares with copy.test.ts and check-title-case.mjs', () => {
  it('counts words the way the contract defines them', () => {
    expect(wordCount('60 kg x 8')).toBe(1); // numerals and units are not words
    expect(wordCount('Reload {sets} Now')).toBe(2); // a slot is a number at runtime
  });

  it('counts sentences the way R4 defines them', () => {
    expect(sentenceCount('One. Two.')).toBe(2);
    expect(sentenceCount('One')).toBe(1);
  });

  it('finds emoji across all four ranges the check names', () => {
    expect(hasEmoji('\u2642')).toBe(true); // U+2600 to U+27BF, the sex symbols
    expect(hasEmoji('Reload')).toBe(false);
  });

  it('names the words R14 says were not capitalised', () => {
    expect(titleCaseOffenders('Units on the weight Plates')).toEqual(['weight']);
    expect(titleCaseOffenders('Units on the Weight Plates')).toEqual([]);
    expect(titleCaseOffenders('Set Up on iPhone')).toEqual([]); // FIXED, a trademark
    expect(titleCaseOffenders('+30 s Delay')).toEqual([]); // R12, the case is the quantity
  });
});
