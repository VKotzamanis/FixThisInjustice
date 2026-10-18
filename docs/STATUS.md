# STATUS

Single source of current state. Update in place. Last update: 2026-10-18 (restart cleanup).

## Next job
1. ROADMAP N1: owner uses the app at the gym on his phone; record findings with `docs/runbooks/phone-check.md`. Nothing built 2026-10-18 has been seen on a device.
2. Owner wording calls: new copy keys are base-table only (no limelight voice yet): session editing, effort taps, programme lifecycle, Rest Word, plus ROADMAP N7.
3. Then ROADMAP: R4, B1a, B1c, L6 (design), L9, L10, F2-F5.

## Branches and tags
- Art + styling built 2026-10-18 afternoon (ROADMAP 3b); not pushed yet.
- `main` only. Built 2026-10-18 on top of the cleanup: B1-B6, N5, N7, L1-L5, L7, L8, F1, review fixes R1-R3/R5/R6 (`git log --oneline pre-cleanup-2026-10-17..main`).
- Pushed and deployed 2026-10-18 (live bundle verified). History scrubbed by the owner (0 private terms in 420 commits, 0 in messages); `PRIVACY_PATTERN` secret set, CI privacy check runs (PASS). Agents cannot push, force-push or write secrets (classifier): the owner runs those with `!`.
- tag `archive/design-editor`: local design editor (owner: never helped). tag `pre-cleanup-2026-10-17`: tree before the cleanup.
- Backup outside the repo, pre-history-rewrite: `~/Desktop/Claude/backups/FixThisInjustice-2026-10-18/`.

## Gates
- All commands in `AGENTS.md` → Verify. Known red: App.test weekly-miss (ROADMAP B6).
- Privacy check: `scripts/check-private.sh` reads `docs/private/privacy-pattern.txt` locally (this laptop only) or repo secret `PRIVACY_PATTERN` in CI (not set yet). Neither present (fresh clone, CI today): prints SKIPPED, exits 0.

## Doc drift (known)
- Kept older docs cite paths/lines that drifted: `docs/design/programme-horizon.md` (names files it planned, never built), `docs/design/2026-09-06-asset-manifest.md`, `docs/design/2026-09-01-copy-contract.md`, runbooks (1-2 each). Re-derive before trusting a line number.

## Never done
- No screen checked on a real device.
- Reminder Worker never deployed (`worker/wrangler.toml` placeholders); app shows reminders as not set up.
- Old-console import never run on real data (ROADMAP N5: remove).
- No sound files (`public/sfx/`), no motivation clip (`public/media/`), app icon still the previous app's.

## Decisions log
- 2026-10-18 restart: platform stays a web page; limelight only; design tools and review-catalogue machinery removed; docs cut to AGENTS/STATUS/ROADMAP/ARCHITECTURE/runbooks/design; owner-private material moved to `docs/private/` (gitignored); history scrubbed of private identifiers (owner ran it). Owner's answers: `docs/private/owner-feedback/restart-2026-10-18.md`.
