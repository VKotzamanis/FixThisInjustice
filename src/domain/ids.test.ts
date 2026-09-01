import { describe, expect, it } from 'vitest';
import { newId } from './ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns a version 4 UUID', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('does not repeat across 10000 calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      seen.add(newId());
    }
    expect(seen.size).toBe(10_000);
  });
});
