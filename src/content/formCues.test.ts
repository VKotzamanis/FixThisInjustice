import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, FORM_CUE_IDS } from '../domain/plan/library';
import { FORM_CUES, WARMUP_NOTICE } from './formCues';

/** Every cue string plus the warm-up notice, as one searchable blob. */
const blob = (): string => JSON.stringify(FORM_CUES) + WARMUP_NOTICE;

describe('FORM_CUES', () => {
  it('is keyed by exactly the ids the library says carry a cue', () => {
    // Master plan section 5: `formCueId === id` wherever a cue exists. The legacy file keyed
    // cues by display name and one key drifted, so that exercise silently had no cues at all
    // (content review section 6, last row). Set equality in BOTH directions is what makes that
    // failure mode impossible: an orphan key fails one side, a cue-less `formCueId` the other.
    const keys = [...Object.keys(FORM_CUES)].sort();
    const ids = [...FORM_CUE_IDS].sort();
    expect(keys).toEqual(ids);
    expect(Object.keys(FORM_CUES)).toHaveLength(FORM_CUE_IDS.length);
  });

  it('keys every cue to an exercise that exists in the library', () => {
    const orphans = Object.keys(FORM_CUES).filter((id) => EXERCISE_BY_ID[id] === undefined);
    expect(orphans).toEqual([]);
  });

  it('gives every cue at least two setup lines, two execution lines, one mistake and a tip', () => {
    for (const [id, cue] of Object.entries(FORM_CUES)) {
      expect(cue.setup.length, `${id} setup`).toBeGreaterThanOrEqual(2);
      expect(cue.execution.length, `${id} execution`).toBeGreaterThanOrEqual(2);
      expect(cue.mistakes.length, `${id} mistakes`).toBeGreaterThanOrEqual(1);
      expect(cue.tip, `${id} tip`).not.toBeNull();
      expect((cue.tip ?? '').trim().length, `${id} tip`).toBeGreaterThan(0);
      for (const line of [...cue.setup, ...cue.execution, ...cue.mistakes]) {
        expect(line.trim().length, `${id} line`).toBeGreaterThan(0);
      }
    }
  });

  it('carries a Valsalva caution on the back squat', () => {
    // Content review section 6, "Valsalva without caveat": keep the cue, add the contraindication.
    expect(FORM_CUES['barbell-back-squat']?.caution).toMatch(/arterial pressure/i);
  });

  it('ships no unverifiable number from the content review section 6', () => {
    const all = blob();
    expect(all).not.toMatch(/20\s*%\s*more weight/i); // push press
    expect(all).not.toMatch(/30\s*%/); // stair-climber rails
    expect(all).not.toMatch(/legs do 60/i); // rower
    expect(all).not.toMatch(/5-7 bodyweight pull-ups/i); // weighted pull-up equivalence
  });

  it('rewrites the heavy row to the strict standard instead of sanctioning cheat reps', () => {
    // Content review section 6, "Heavy row permits cheat reps", WRONG (unsafe). The legacy
    // "Barbell row (heavier)" cue read, verbatim:
    //   setup: "Same as Pendlay row, but you can use a slight cheat / TnT (touch-and-go)."
    //   tip:   "... 5-6 reps, slightly cheaty TnT is fine here."
    // The review's recommendation is "Delete the permission. Keep the strict standard."
    const row = JSON.stringify(FORM_CUES['barbell-row']);
    expect(row).not.toMatch(/cheat/i);
    expect(row).not.toMatch(/TnT/i);
    expect(row).not.toMatch(/touch-and-go/i);
    // The strict standard the review describes: neutral spine, hinge held, no torso heave.
    expect(row).toMatch(/neutral spine/i);
    expect(row).toMatch(/hold that angle for the whole set/i);
    expect(row).toMatch(/torso heave/i);
  });

  it('does not claim knee push-ups fail to transfer', () => {
    expect(JSON.stringify(FORM_CUES['push-up'])).not.toMatch(/don't transfer|do not transfer/i);
  });

  it('caps leg-press depth by lumbar position, not by a fixed angle', () => {
    const legPress = JSON.stringify(FORM_CUES['leg-press']);
    expect(legPress).not.toMatch(/STOP at 90/i);
    expect(legPress).toMatch(/lower back|lumbar/i);
  });

  it('prescribes no numbers in the warm-up notice', () => {
    expect(WARMUP_NOTICE).not.toMatch(/\d/);
    expect(WARMUP_NOTICE.trim().length).toBeGreaterThan(0);
  });

  it('contains no medication, stimulant or personal content', () => {
    const lower = blob().toLowerCase();
    for (const needle of [
      // Medication and location identifiers, assembled from two halves for exactly the reason
      // src/domain/plan/library.test.ts does it: a literal spelling here would make this test
      // file itself fail the repository's personal-data grep over src/ (master plan section 3).
      'vyvans' + 'e',
      'lisdexamfetamin' + 'e',
      'ymc' + 'a',
      'amphetamin' + 'e',
      // Personal literals the port drops (content review section 7).
      'thesis',
      '65 kg',
      'previous max',
      'forever',
      'wk 9',
      'wk 5',
    ]) {
      expect(lower).not.toContain(needle);
    }
  });

  it('uses no em-dash and no en-dash connector', () => {
    // Copy contract R5: no em-dash or en-dash as a connector; cues are exempt from the length
    // limits (R10) but not from this rule. Written as escapes so this file carries neither.
    const all = blob();
    expect(all).not.toContain('\u2014'); // em dash
    expect(all).not.toMatch(/\s\u2013\s/); // en dash used as a connector
  });
});
