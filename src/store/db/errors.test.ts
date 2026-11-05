import { describe, expect, it } from 'vitest';
import { domExceptionWithCode } from '../testStorage';
import { isQuotaExceeded, messageOf } from './errors';

describe('isQuotaExceeded (finding H3 / A42, moved from persistence.ts)', () => {
  it('recognises the standard name, both legacy codes and the Firefox name', () => {
    expect(isQuotaExceeded(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceeded(domExceptionWithCode('Legacy', 22))).toBe(true);
    expect(isQuotaExceeded(domExceptionWithCode('Legacy', 1014))).toBe(true);
    expect(isQuotaExceeded({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isQuotaExceeded(new DOMException('blocked', 'SecurityError'))).toBe(false);
    expect(isQuotaExceeded(new Error('quota'))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});

describe('messageOf', () => {
  it('reads a message structurally and falls back to String()', () => {
    expect(messageOf(new DOMException('storage is full', 'QuotaExceededError'))).toBe('storage is full');
    expect(messageOf(42)).toBe('42');
  });
});
