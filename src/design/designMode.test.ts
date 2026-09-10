/**
 * The gate. `?design=1` and nothing else.
 *
 * The table is the point: every near miss the owner might type, and every shape a URL picks up
 * on the way through a share sheet, has to be inert. A gate that opened on `?design` or on
 * `?design=true` would be a gate that opens by accident.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_PARAM, DESIGN_VALUE, isDesignMode } from './designMode';

describe('isDesignMode', () => {
  it('opens on ?design=1, wherever in the query it sits', () => {
    expect(isDesignMode('?design=1')).toBe(true);
    expect(isDesignMode('design=1')).toBe(true);
    expect(isDesignMode('?a=b&design=1')).toBe(true);
    expect(isDesignMode('?design=1&a=b')).toBe(true);
  });

  it('is inert for everything else', () => {
    for (const search of [
      '',
      '?',
      '?design',
      '?design=',
      '?design=0',
      '?design=2',
      '?design=true',
      '?design=on',
      '?designs=1',
      '?adesign=1',
      '?d=1',
      '#design=1',
    ]) {
      expect({ search, open: isDesignMode(search) }).toEqual({ search, open: false });
    }
  });

  it('names the parameter and the value it requires, so the URL can be written from one place', () => {
    expect(`?${DESIGN_PARAM}=${DESIGN_VALUE}`).toBe('?design=1');
  });
});
