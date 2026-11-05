// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts/dist-fingerprint.sh');
const made: string[] = [];

function site(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fti-fp-'));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function fingerprint(dir: string): string {
  return execFileSync('bash', [SCRIPT, dir], { encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/dist-fingerprint.sh (audit E06)', () => {
  const base = { 'index.html': '<html>', 'assets/index-a.js': 'code', 'sw.js': 'sw' };

  it('prints one SHA-256', () => {
    expect(fingerprint(site(base))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores the per-build stamp and its own output file', () => {
    const a = site({ ...base, 'build-info.json': '{"commit":"aaaaaaa"}' });
    const b = site({ ...base, 'build-info.json': '{"commit":"bbbbbbb"}', 'content-sha256.txt': 'x' });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('changes when any shipped byte or path changes', () => {
    const a = fingerprint(site(base));
    expect(fingerprint(site({ ...base, 'assets/index-a.js': 'code2' }))).not.toBe(a);
    expect(fingerprint(site({ 'index.html': '<html>', 'assets/index-b.js': 'code', 'sw.js': 'sw' }))).not.toBe(a);
    expect(fingerprint(site({ ...base, 'media/clip.mp4': 'video' }))).not.toBe(a);
  });
});
