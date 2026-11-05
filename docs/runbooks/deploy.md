# Deploy and roll back

## Deploy
- Push `main`. `.github/workflows/ci.yml` runs gates; on success `.github/workflows/deploy.yml` (workflow_run) builds that commit and publishes `dist/` to Pages.
- Pages source must be "GitHub Actions" (set once, already done).
- Repo variables used at build: reminder Worker URL and VAPID public key (see `docs/runbooks/reminders.md`); unset = reminders show "not set up on this deployment".
- Verify the live bundle, not the workflow status:
  ```
  U=https://vkotzamanis.github.io/FixThisInjustice
  JS=$(curl -s $U/ | grep -oE 'assets/index-[^"]+\.js' | head -1)
  curl -s "$U/$JS" | grep -c 'a string only your change adds'   # must be >= 1
  ```

## Roll back
- Site: Actions → "Deploy to GitHub Pages" → last good run → Re-run all jobs (allowed 30 days, 50 re-runs). Older: `git revert` and push.
- Worker: `npx wrangler rollback` in `worker/` (`docs/runbooks/reminders.md`).
- Data: lives in each user's browser; a deploy never touches it. Schema changes must keep old documents loading (AGENTS rule 7).
- Rolling back past P2 (IndexedDB engine): the old build reads only `fti.v3`, which P2 refreshes on hide/pagehide (amendment AM-P2-1), so it shows data at most one app session old. Rolling forward again does NOT re-import writes the old build made during the rollback window (the new build reads IndexedDB, which already has records). If that window matters, export JSON from the old build and import it in the new one (Settings > Data).

## Known risk
- GitHub Pages project site shares its origin with every Pages project on the account: any of them can read this app's storage. Publish nothing untrusted on the account. A custom domain closes it.
