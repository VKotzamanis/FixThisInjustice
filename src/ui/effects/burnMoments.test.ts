import { describe, expect, it } from 'vitest';
import { copy, FORMAT, SKIN_COPY, type CopyKey } from '../../content/copy';
import type { CoachLine } from '../../domain/training/coach';
import { coachBurns, praiseWordOf, restOverWordOf, splitAround, stampWordOf } from './burnMoments';

const LIME = SKIN_COPY.limelight;
const line = (key: CopyKey): CoachLine => ({ key, params: {}, tone: 'coach' });

describe('burn moments (AM-4a-9)', () => {
  it('burns the short rest-over word, never the whole line', () => {
    expect(restOverWordOf(copy('notification.restOver', LIME))).toBe('rest over');
    expect(restOverWordOf(copy('notification.restOver'))).toBe('Rest over');
  });

  it('burns the stamp word as it stands', () => {
    expect(stampWordOf(copy('status.weekMetStamp', LIME))).toBe('MOTHER');
  });

  it('takes the praise word from the copy table, never a numeral or a slot', () => {
    expect(praiseWordOf(copy('coach.loadPr', LIME))).toBe('mother');
    expect(praiseWordOf(copy('coach.repPr', LIME))).toBe('mother');
    expect(praiseWordOf(copy('coach.topOfRange', LIME))).toBe('ate');
    expect(praiseWordOf(copy('coach.insideRange', LIME))).toBe('locked in');
    expect(praiseWordOf(copy('coach.aboveRange', LIME))).toBe('no crumbs');
    // The base table states facts only: nothing burns there.
    expect(praiseWordOf(copy('coach.topOfRange'))).toBeNull();
    expect(praiseWordOf(copy('coach.loadPr'))).toBeNull();
    expect(praiseWordOf('{reps} reps. 12.')).toBeNull();
  });

  it('burns a PR always and a met range only at the prescribed load', () => {
    expect(coachBurns(line('coach.loadPr'), { loadKg: 100, prescribedKg: null })).toBe(true);
    expect(coachBurns(line('coach.topOfRange'), { loadKg: 60, prescribedKg: 60 })).toBe(true);
    expect(coachBurns(line('coach.insideRange'), { loadKg: 60, prescribedKg: null })).toBe(false);
    expect(coachBurns(line('coach.insideRange'), { loadKg: 0, prescribedKg: 60 })).toBe(false);
    expect(coachBurns(line('coach.belowRange'), { loadKg: 60, prescribedKg: 60 })).toBe(false);
    expect(coachBurns(line('coach.underSuggested'), { loadKg: 40, prescribedKg: 60 })).toBe(false);
    expect(coachBurns(line('coach.setLogged'), { loadKg: 60, prescribedKg: 60 })).toBe(false);
  });

  it('finds the word as a whole sentence in the resolved line, not inside a value', () => {
    const text = FORMAT.withSlots('coach.topOfRange', { load: '60 kg', reps: 8 }, LIME);
    const parts = splitAround(text, 'ate');
    expect(parts).not.toBeNull();
    expect(parts?.join('')).toBe(text);
    expect(parts?.[1]).toBe('ate');
    expect(parts?.[0].endsWith('. ')).toBe(true);
    expect(splitAround('late. ate.', 'ate')).toEqual(['late. ', 'ate', '.']);
    expect(splitAround('plates', 'ate')).toBeNull();
  });
});
