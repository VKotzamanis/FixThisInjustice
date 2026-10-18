# STATUS

Single source of current state. Update in place. Last update: 2026-10-18 (restart cleanup).

## Next job
1. ROADMAP N1: owner uses the app at the gym on his phone; record findings with `docs/runbooks/phone-check.md`.
2. ROADMAP section 1 (broken now), then section 2 (training loop). Design before building items marked (design).

## Branches and tags
- `main`: cleanup done (`git log pre-cleanup-2026-10-17..main`). Limelight-only merged (14aceec); parity pinned by `src/content/limelightParity.test.ts` + `src/content/__fixtures__/limelight-resolved.json`.
- Not pushed. `origin/main` is the pre-cleanup state. History scrub of private identifiers: pending owner approval (procedure and checks: `docs/private/history-scrub.md`); push only after the owner's yes.
- `wip/rest-word-game`: parked source of ROADMAP F1, kept. Ported onto main's base as `worktree-agent-aa432776b4f6670e4` (all gates green there; `docs/design/rest-games.md`), not merged.
- tag `archive/design-editor`: local design editor + type-role tokens (owner: never helped). Only the owner's intro text was taken onto main.
- tag `pre-cleanup-2026-10-17`: tree before the cleanup (old handoffs, plans, design rounds).
- Backup outside the repo, pre-history-rewrite: `~/Desktop/Claude/backups/FixThisInjustice-2026-10-18/` (all-branches bundle, WIP archive, `.nodeterm`).

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
- 2026-10-18 restart: platform stays a web page; limelight only; design tools and review-catalogue machinery removed; docs cut to AGENTS/STATUS/ROADMAP/ARCHITECTURE/runbooks/design; owner-private material moved to `docs/private/` (gitignored); history scrub of private identifiers pending owner approval. Owner's answers: `docs/private/owner-feedback/restart-2026-10-18.md`.
