# Deploy and roll back

## Deploy
- Push `main`. `.github/workflows/ci.yml` runs every gate, fingerprints `dist/` (`scripts/dist-fingerprint.sh`) and uploads it as artifact `dist` (push only). On success `.github/workflows/deploy.yml` (workflow_run) publishes THAT artifact, never a rebuild, if: the CI run was a `push` of this repository (not a fork PR), its commit is still `main`'s HEAD (an older run finishing late skips), and the fingerprint differs from the live `content-sha256.txt` (docs-only commits publish nothing and installed apps see no update).
- After publishing, the deploy job polls the live `build-info.json` until it names the commit (up to 630 s; the Pages CDN caches for 600 s). `build/workflows.test.ts` fails CI if the deploy job or a guard is removed.
- Pages source must be "GitHub Actions" (set once, already done).
- Repo variables used at build (CI): reminder Worker URL and VAPID public key (see `docs/runbooks/reminders.md`); unset = reminders show "not set up on this deployment".
- Verify the live bundle, not the workflow status:
  ```
  U=https://vkotzamanis.github.io/FixThisInjustice
  curl -s "$U/build-info.json?x=$RANDOM"                         # commit of the live build
  JS=$(curl -s $U/ | grep -oE 'assets/index-[^"]+\.js' | head -1)
  curl -s "$U/$JS" | grep -c 'a string only your change adds'   # must be >= 1
  ```

## Roll back
- Site: Actions -> "Deploy to GitHub Pages" -> last good run -> Re-run all jobs. A re-run (attempt > 1) skips the HEAD check on purpose; it needs that CI run's `dist` artifact (kept 30 days). Older: `git revert` and push.
- Worker: `npx wrangler rollback` in `worker/` (`docs/runbooks/reminders.md`).
- Data: lives in each user's browser; a deploy never touches it. Schema changes must keep old documents loading (AGENTS rule 7).
- Rolling back past P2 (IndexedDB engine): the old build reads only `fti.v3`, which P2 refreshes on hide/pagehide (amendment AM-P2-1), so it shows data at most one app session old. Rolling forward again does NOT re-import writes the old build made during the rollback window (the new build reads IndexedDB, which already has records). If that window matters, export JSON from the old build and import it in the new one (Settings > Data).

## Pages deployment cancelled (seen 2026-11-05, 0d07655)
- Symptom: `deploy` job polls `updating_pages`, then an empty status, then `Timeout reached, aborting!` and `Canceled deployment with ID <sha>`. Artifact size normal, githubstatus.com green.
- Re-running the failed job does not help: the deployment ID is the commit SHA (`pages_build_version`), and a re-run of a cancelled SHA is cancelled within seconds (`Created deployment ... ##[error]Deployment cancelled.`). Push a new commit to `main` instead.

## Known risk
- GitHub Pages project site shares its origin with every Pages project on the account: any of them can read this app's storage. Publish nothing untrusted on the account. A custom domain closes it.
- Offline, `/FixThisInjustice` (no trailing slash) does not open: it is outside the service worker's scope `/FixThisInjustice/` (audit E15, reproduced in Chromium). Online, Pages redirects it to the slash form; the installed app's start_url has the slash. Not fixable here: a wider scope needs a `Service-Worker-Allowed` header, which Pages cannot set.
