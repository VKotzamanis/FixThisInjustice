// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shippedSfx } from './sfxManifest.ts';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('shippedSfx (audit E15)', () => {
  it('lists the .m4a files under public/sfx by skin, and nothing else', () => {
    const pub = mkdtempSync(join(tmpdir(), 'fti-sfx-'));
    made.push(pub);
    mkdirSync(join(pub, 'sfx', 'limelight'), { recursive: true });
    writeFileSync(join(pub, 'sfx', '.gitkeep'), '');
    writeFileSync(join(pub, 'sfx', 'limelight', 'rest_over.m4a'), 'x');
    writeFileSync(join(pub, 'sfx', 'limelight', 'notes.txt'), 'x');
    expect(shippedSfx(pub)).toEqual(['limelight/rest_over.m4a']);
  });

  it('is empty when the folder is absent', () => {
    expect(shippedSfx(join(tmpdir(), 'fti-no-such-public'))).toEqual([]);
  });

  it('matches the repository today: no sound ships', () => {
    expect(shippedSfx(join(process.cwd(), 'public'))).toEqual([]);
  });
});
