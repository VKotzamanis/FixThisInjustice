// @vitest-environment node
//
// Audit E15: nothing asserted that deploy.yml keeps its deploy job (it was once lost to a bad
// edit, AGENTS.md Deploy), and E06/E07/E08 guards are one line each. This runs in `npm test`, so
// CI fails the moment one is removed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string => readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');
const deploy = read('deploy.yml');
const ci = read('ci.yml');

describe('deploy.yml', () => {
  it('has a build job and a deploy job that needs it and runs deploy-pages', () => {
    expect(deploy).toMatch(/^ {2}build:$/m);
    expect(deploy).toMatch(/^ {2}deploy:$/m);
    expect(deploy).toMatch(/^ {4}needs: build$/m);
    expect(deploy).toContain('uses: actions/deploy-pages@v5');
    expect(deploy).toContain("if: needs.build.outputs.publish == 'true'");
  });

  it('publishes only a successful push run of this repository (E08)', () => {
    expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(deploy).toContain("github.event.workflow_run.event == 'push'");
    expect(deploy).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
  });

  it("publishes only main's HEAD, except on a deliberate re-run (E07)", () => {
    expect(deploy).toContain('git ls-remote "$REPO_URL" refs/heads/main');
    expect(deploy).toContain('RUN_ATTEMPT: ${{ github.run_attempt }}');
  });

  it("ships CI's tested dist, never a second build (E15)", () => {
    expect(deploy).toContain('uses: actions/download-artifact@v8');
    expect(deploy).toContain('run-id: ${{ github.event.workflow_run.id }}');
    expect(deploy).not.toContain('npm run build');
    expect(deploy).not.toContain('npm ci');
  });

  it('skips a publish that changes no shipped byte (E06), and checks the live site after (E15)', () => {
    expect(deploy).toContain('content-sha256.txt');
    expect(deploy).toContain('build-info.json');
  });
});

describe('ci.yml', () => {
  it('fingerprints and uploads the tested dist on push only', () => {
    expect(ci).toContain('bash scripts/dist-fingerprint.sh dist > dist/content-sha256.txt');
    expect(ci).toContain('uses: actions/upload-artifact@v7');
    expect(ci).toMatch(/name: dist\n/);
    expect(ci.match(/if: github\.event_name == 'push'/g)?.length).toBe(2);
  });
});
