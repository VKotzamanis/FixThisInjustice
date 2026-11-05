// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BUILD_INFO_FILE, buildInfo, utcDate } from './buildInfo.ts';

describe('build stamp (audit E06)', () => {
  it('takes the short commit from GITHUB_SHA and the UTC date of the build', () => {
    const at = new Date(Date.UTC(2026, 10, 4, 23, 30)); // 2026-11-04T23:30Z
    expect(buildInfo({ GITHUB_SHA: '0123456789abcdef' }, at)).toEqual({ commit: '0123456', date: '2026-11-04' });
  });

  it("says 'local' outside CI", () => {
    expect(buildInfo({}, new Date(Date.UTC(2026, 0, 2))).commit).toBe('local');
  });

  it('pads month and day', () => {
    expect(utcDate(new Date(Date.UTC(2026, 0, 2)))).toBe('2026-01-02');
  });

  it('is a .json file, which the precache globs do not match', () => {
    expect(BUILD_INFO_FILE.endsWith('.json')).toBe(true);
  });
});
