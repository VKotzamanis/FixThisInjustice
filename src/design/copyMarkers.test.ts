/**
 * The copy key marker.
 *
 * THE ASSERTION THAT MATTERS MOST is the first one: with marking off, `copy()` returns the table
 * string CHARACTER FOR CHARACTER. Design Mode ships, so "it changes nothing for an ordinary
 * viewer" has to be executable rather than a paragraph, and this is the half of that claim that
 * lives in the content layer rather than in the panel.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_COPY, copy, copyFor } from '../content/copy';
import {
  findCopyMarks,
  hasCopyMarker,
  isMarkingCopyKeys,
  markCopyValue,
  setCopyKeyMarking,
  stripCopyMarkers,
} from './copyMarkers';

afterEach(() => {
  setCopyKeyMarking(false);
});

describe('marking is off unless the query parameter asked for it', () => {
  it('is off by default, because no test navigates to ?design=1', () => {
    expect(isMarkingCopyKeys()).toBe(false);
  });

  it('returns the table string identically, with no wrapper of any kind', () => {
    for (const [key, value] of Object.entries(DEFAULT_COPY)) {
      const returned = copy(key as never);
      expect({ key, returned }).toEqual({ key, returned: value });
      // Not "looks the same": the same length, so no zero-width character rode along.
      expect({ key, length: returned.length }).toEqual({ key, length: value.length });
    }
  });

  it('adds nothing to a skin lookup either, overridden or inherited', () => {
    expect(copyFor('limelight', 'status.rest')).toBe('catch ur breath');
    expect(copyFor('board', 'status.rest')).toBe('GATE HOLD');
    // `button.reload` has no row in either skin table, so both fall through to the default.
    expect(copyFor('limelight', 'button.reload')).toBe(DEFAULT_COPY['button.reload']);
    expect(copyFor('board', 'button.reload')).toBe(DEFAULT_COPY['button.reload']);
  });
});

describe('marking is on', () => {
  it('carries the key without changing what a reader sees', () => {
    setCopyKeyMarking(true);
    const marked = copy('button.reload');

    expect(marked).not.toBe('Reload');
    expect(stripCopyMarkers(marked)).toBe('Reload');
    expect(findCopyMarks(marked)).toEqual([
      { key: 'button.reload', value: 'Reload', start: 0, end: marked.length },
    ]);
  });

  it('marks the SKIN value when one is selected, not the clinical one', () => {
    setCopyKeyMarking(true);
    const marked = copyFor('limelight', 'status.rest');
    expect(findCopyMarks(marked)[0]).toEqual({
      key: 'status.rest',
      value: 'catch ur breath',
      start: 0,
      end: marked.length,
    });
  });

  it('every marker character is Default_Ignorable, so an undecorated marker draws nothing', () => {
    setCopyKeyMarking(true);
    for (const character of copy('button.reload')) {
      const point = character.codePointAt(0) ?? 0;
      const ascii = point >= 0x20 && point <= 0x7e;
      const tag = point >= 0xe0000 && point <= 0xe007f;
      expect({ point, ok: ascii || tag }).toEqual({ point, ok: true });
    }
  });

  it('survives a FORMAT frame, and leaves the frame itself unmarked', () => {
    setCopyKeyMarking(true);
    // This is the shape `FORMAT.stepOf` produces: literal text around one marked run.
    const composed = `Step 1 of 8: ${copy('label.units')}`;
    const marks = findCopyMarks(composed);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.key).toBe('label.units');
    expect(marks[0]?.value).toBe('Units on the Weight Plates');
    expect(stripCopyMarkers(composed)).toBe('Step 1 of 8: Units on the Weight Plates');
  });
});

describe('the codec itself', () => {
  it('round-trips a key with dots and capitals', () => {
    const marked = markCopyValue('advice.bodyFatOptional', 'Optional.');
    expect(findCopyMarks(marked)[0]).toEqual({
      key: 'advice.bodyFatOptional',
      value: 'Optional.',
      start: 0,
      end: marked.length,
    });
  });

  it('finds several runs in one string, in order', () => {
    const text = `${markCopyValue('a.one', 'ONE')} and ${markCopyValue('b.two', 'TWO')}`;
    expect(findCopyMarks(text).map((mark) => mark.key)).toEqual(['a.one', 'b.two']);
  });

  it('refuses to mark a value that already carries a marker, rather than nesting', () => {
    const once = markCopyValue('a.one', 'ONE');
    expect(markCopyValue('b.two', once)).toBe(once);
  });

  it('reports no marker in ordinary text', () => {
    expect(hasCopyMarker('Reload')).toBe(false);
    expect(hasCopyMarker('')).toBe(false);
    expect(findCopyMarks('Reload')).toEqual([]);
  });
});
