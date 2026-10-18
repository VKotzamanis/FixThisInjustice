# STATUS

Single source of current state. Update in place. Last update: 2026-10-18 (restart cleanup).

## Next job
1. ROADMAP N1: owner uses the app at the gym on his phone; record findings with `docs/runbooks/phone-check.md`.
2. ROADMAP section 1 (broken now), then section 2 (training loop). Design before building items marked (design).

## Branches and tags
- `main`: cleanup done (`git log pre-cleanup-2026-10-17..main`).
- `wip/rest-word-game`: Wordle-style rest game, parked (ROADMAP F1). Red at park time: tsc `src/store/sessionMirror.ts:170` (exactOptionalPropertyTypes on `game?`); its title-case and catalogue failures no longer apply (those gates are gone).
- tag `archive/design-editor`: local design editor + type-role tokens (owner: never helped). Only the owner's intro text was taken onto main.
- tag `pre-cleanup-2026-10-17`: tree before the cleanup (old handoffs, plans, design rounds).
- Backup outside the repo, pre-history-rewrite: `~/Desktop/Claude/backups/FixThisInjustice-2026-10-18/` (all-branches bundle, WIP archive, `.nodeterm`).

## Gates
- All commands in `AGENTS.md` → Verify. Known red: App.test weekly-miss (ROADMAP B6).
- CI privacy check needs repo secret `PRIVACY_PATTERN` (same regex as `docs/private/privacy-pattern.txt`); without it CI prints SKIPPED.

## Doc drift (known)
- Kept older docs cite paths/lines that drifted: `docs/design/programme-horizon.md` (names files it planned, never built), `docs/design/2026-09-06-asset-manifest.md`, `docs/design/2026-09-01-copy-contract.md`, runbooks (1-2 each). Re-derive before trusting a line number.

## Never done
- No screen checked on a real device.
- Reminder Worker never deployed (`worker/wrangler.toml` placeholders); app shows reminders as not set up.
- Old-console import never run on real data (ROADMAP N5: remove).
- No sound files (`public/sfx/`), no motivation clip (`public/media/`), app icon still the previous app's.

## Decisions log
- 2026-10-18 restart: platform stays a web page; limelight only; design tools and review-catalogue machinery removed; docs cut to AGENTS/STATUS/ROADMAP/ARCHITECTURE/runbooks/design; owner-private material moved to `docs/private/` (gitignored); history scrubbed of private identifiers. Owner's answers: `docs/private/owner-feedback/restart-2026-10-18.md`.
