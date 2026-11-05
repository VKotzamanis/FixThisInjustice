import { describe, expect, it } from 'vitest';
import { broadcastRevisionChannel } from './channel';

describe('the revision channel (B03)', () => {
  it('delivers a revision to every other instance on the origin, never to the sender', async () => {
    const name = `fti.revision.test.${String(Math.random())}`;
    const a = broadcastRevisionChannel(name);
    const b = broadcastRevisionChannel(name);
    const heardByA: number[] = [];
    const heard = new Promise<number>((resolve) => {
      b.subscribe(resolve);
    });
    a.subscribe((r) => heardByA.push(r));
    a.announce(7); // [commits]
    expect(await heard).toBe(7);
    expect(heardByA).toEqual([]);
  });
});
