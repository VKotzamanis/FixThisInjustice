// src/ui/effects/burnMoments.ts
//
// WHICH word burns, and WHEN (AM-4a-9 owner answers, 2026-11-05). Pure; no wording is added:
// every burnt word is cut out of a string the copy table already holds.
//
//  - Rest end: the first sentence of `notification.restOver` ("rest over" on limelight), on the
//    rest bar, START_DELAY_REST_MS after the rest-over pulse starts (the 3 x 500 ms pulse ends).
//  - The week stamp's word (`status.weekMetStamp`, MOTHER), STAMP_DELAY_MS after it lands.
//  - The coach line of a logged set: a personal record ("mother", the PR word) or a set finished
//    well (prescribed reps at the prescribed load: "ate", "locked in", "no crumbs").
//
// Never a numeral: a candidate with a digit or a {slot} is refused here, so no quantity can burn.
import type { CopyKey } from '../../content/copy';
import type { CoachLine } from '../../domain/training/coach';

/** [ms] The rest-over pulse: 3 x 500 ms (train.css ll-rest-over-pulse); the burn starts after it. */
export const START_DELAY_REST_MS = 1500;
/** [ms] The stamp's landing (limelight.css ll-stamp-land, 700 ms); the burn starts after it. */
export const STAMP_DELAY_MS = 700;
/** [words] A burnt word is short: a word or a two-word phrase, never a sentence. */
const MAX_WORDS = 2;

/** Coach keys that announce a personal record (the PR word lands with them). */
const PR_KEYS: ReadonlySet<CopyKey> = new Set<CopyKey>(['coach.loadPr', 'coach.repPr']);
/** Coach keys reached only by a set at or above the prescribed rep range (coach.ts rungs 4-6). */
const MET_REPS_KEYS: ReadonlySet<CopyKey> = new Set<CopyKey>([
  'coach.topOfRange',
  'coach.insideRange',
  'coach.aboveRange',
  'coach.aboveRangeOne',
]);

/** Sentences of a template, split on '. ' and the final '.', trimmed, empties dropped. */
function sentences(template: string): string[] {
  return template
    .split(/\.(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** A short, numeral-free, slot-free phrase, or false. */
function burnable(phrase: string): boolean {
  return !/[\d{}]/.test(phrase) && phrase.split(/\s+/).length <= MAX_WORDS;
}

/**
 * The praise word of a coach template: a short, numeral-free sentence that is NOT the first one
 * (the first states the fact; the praise follows it). Null when the template has none (the base
 * table states facts only, so a base-table user sees no burn).
 */
export function praiseWordOf(template: string): string | null {
  const rest = sentences(template).slice(1);
  return rest.find(burnable) ?? null;
}

/** The rest-over word: the first sentence of the rest-over line, when it is short. */
export function restOverWordOf(line: string): string | null {
  const first = sentences(line)[0];
  return first !== undefined && burnable(first) ? first : null;
}

/** The stamp word burns as it is, when short and numeral-free. */
export function stampWordOf(word: string): string | null {
  const w = word.trim();
  return w !== '' && burnable(w) ? w : null;
}

/** Facts of the logged set the coach line is about. */
export interface LoggedSetFacts {
  /** [kg] the set's load; 0 = bodyweight, null = none recorded. */
  loadKg: number | null;
  /** [kg] the load the engine prescribed for it, or null when it named none. */
  prescribedKg: number | null;
}

/**
 * Does this coach line earn a burn? A personal record always; a met rep range only when the set
 * carried the prescribed load (the coach ladder reaches rungs 4-6 only inside the load deadband
 * of a named suggestion, coach.ts rung 3), so a set with no prescribed load never burns.
 */
export function coachBurns(line: CoachLine, set: LoggedSetFacts): boolean {
  if (PR_KEYS.has(line.key)) return true;
  if (!MET_REPS_KEYS.has(line.key)) return false;
  return set.prescribedKg !== null && set.loadKg !== null && set.loadKg > 0;
}

/**
 * Splits a resolved sentence around its praise word: [before, word, after], or null when the
 * word is not present as a whole sentence (an override that moved it). Matches the LAST
 * occurrence that starts the string or follows '. ', so a slot value never matches.
 */
export function splitAround(text: string, word: string): [string, string, string] | null {
  let at = text.lastIndexOf(word);
  while (at >= 0) {
    const startsSentence = at === 0 || text.slice(Math.max(0, at - 2), at) === '. ';
    const end = at + word.length;
    const endsSentence = end === text.length || text[end] === '.';
    if (startsSentence && endsSentence) return [text.slice(0, at), word, text.slice(end)];
    at = at === 0 ? -1 : text.lastIndexOf(word, at - 1);
  }
  return null;
}
