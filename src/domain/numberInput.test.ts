import { describe, expect, it } from 'vitest';
import { parseDecimalInput } from './numberInput';

describe('parseDecimalInput (spec R4, audit C02/A03)', () => {
  it.each<[string, number]>([
    ['62,5', 62.5],
    ['62.5', 62.5],
    ['80', 80],
    ['0,125', 0.125],
    ['5.', 5],
    ['.5', 0.5],
    [' 7 ', 7],
    ['-5', -5],
    ['2,10', 2.1],
  ])('reads %s as %d', (text, value) => {
    expect(parseDecimalInput(text)).toBe(value);
  });

  it.each(['', '   ', 'abc', '1.234,5', '1,234.5', '1,2,3', '1,234', '2.100', '1e3', '1 234', '-', ','])(
    'refuses %s',
    (text) => {
      expect(parseDecimalInput(text)).toBeNull();
    },
  );
});
