import { describe, expect, it } from 'vitest';
import { UPDATE_POLL_INTERVAL_MS, decideUpdate } from './updatePolicy';

describe('decideUpdate (spec R7)', () => {
  it.each([
    // sessionOpen, hidden, interacted -> decision
    [true, false, false, 'prompt'],
    [true, false, true, 'prompt'],
    [true, true, false, 'prompt'],
    [true, true, true, 'prompt'],
    [false, false, false, 'apply'], // cold launch / fresh resume, nothing touched yet
    [false, true, true, 'apply'], // the user left the app
    [false, true, false, 'apply'],
    [false, false, true, 'defer'], // in use, no session: wait for a safe moment
  ] as const)('session %s, hidden %s, interacted %s -> %s', (sessionOpen, hidden, interacted, want) => {
    expect(decideUpdate({ sessionOpen, hidden, interacted })).toBe(want);
  });

  it('polls every 30 min', () => {
    expect(UPDATE_POLL_INTERVAL_MS).toBe(1_800_000); // [ms]
  });
});
