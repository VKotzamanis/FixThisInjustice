# STATUS

Single source of current state. Update in place. Last update: 2026-10-21.

## Live
- https://vkotzamanis.github.io/FixThisInjustice/ serves everything built 2026-10-18 (verified by bundle content, not workflow status). Owner started using it on his phone 2026-10-21.
- Data lives only in each user's browser (`fti.v3`). Users install to Home Screen (iOS Safari can wipe non-installed site data after ~7 days) and export JSON backups from Settings → Data.

## Next job
1. Owner phone feedback (he is collecting it now; new agent session). Triage each item against `docs/ROADMAP.md`; log his words verbatim in `docs/private/owner-feedback/` (gitignored).
2. Owner wording calls pending: new copy keys are base-table only, no limelight voice yet (session editing, effort taps, programme lifecycle, Rest Word, warm-up notice "Got It"); ROADMAP N7, S1, S7.
3. Then ROADMAP open items: R4, B1a, B1c, L6 (design), L9, L10, F2-F5.

## What exists (2026-10-18 build)
- Cleanup: docs cut to AGENTS/STATUS/ROADMAP/ARCHITECTURE + runbooks + design; review-catalogue machinery, both design tools, clinical/board skins, old-console import removed.
- Fixes: B1-B6; review R1-R3, R5, R6.
- Training loop: edit/swap/skip/reorder/add exercises in a session (L1-L4), Update Programme from Settings + Start Next Programme + maintenance after goal (L5, L7, B1b, B1d), one-tap effort per set with a sourced hold rule (L8).
- Fun: Rest Word game (F1).
- Art (owner-reviewed on artifact pages): body-fat front+side torsos (men 10-35 %, women 20-45 %), slider icons, tape diagrams, 37 per-card Atlas icons (lazy), app icon + badge from the owner's own sprite, "her" sprite sheets (lifting/resting/crown) replacing the pink blob. Spec `docs/design/asset-spec-2026-10-18.md`; register `docs/design/2026-09-04-icon-register.csv`.
- Style: brat headings, pink stickers, status marks, lit-sign panels, rest-over flash, dither wipe, contrast sweep test (`src/ui/styles/limeContrast.test.ts`). Survey `docs/design/stylize-survey-2026-10-18.md`.
- Train/Log decluttered; warm-up + medical-clearance notice shows once per profile ("Got It"), not in Form Cues.

## Gates
- All commands in `AGENTS.md` → Verify. Expected: zero failing tests (2,904 app + 148 worker on 2026-10-18).
- Privacy: `scripts/check-private.sh` uses `docs/private/privacy-pattern.txt` locally and repo secret `PRIVACY_PATTERN` in CI (set 2026-10-18; CI prints PASS). On a fresh clone without the file it prints SKIPPED.
- Precache ~1.19 MB (37 card icons are lazy chunks, precached).

## Branches, tags, backups
- `main` only. Pushes: owner runs them (agents are blocked from push/force-push/secrets by the permission classifier).
- History scrubbed of private identifiers 2026-10-18 (0 hits in 420 commits). Tags: `pre-cleanup-2026-10-17` (old tree), `archive/design-editor`.
- Pre-scrub backup outside the repo: `~/Desktop/Claude/backups/FixThisInjustice-2026-10-18/`. Raw image originals (17 MB) local only: `agy-artifacts/gen-2026-10-18/` (gitignored).

## Never done / not working
- Reminder Worker never deployed (`worker/wrangler.toml` placeholders): reminders show "not set up"; no rest alarm with the screen locked (web limit, `docs/ARCHITECTURE.md`).
- No sound files (`public/sfx/`), no motivation clip (`public/media/`).
- Nothing tested on iOS Safari/Android hardware by an agent; layout checked only in headless Chromium at 320/400 px.

## Doc drift (known)
- Older docs cite drifted paths/lines: `docs/design/programme-horizon.md` (planned files never built), `docs/design/2026-09-06-asset-manifest.md`, `docs/design/2026-09-06-asset-prompts.md` (superseded by asset-spec-2026-10-18), `docs/design/2026-09-01-copy-contract.md`, runbooks. Re-derive before trusting a line number.

## Decisions log
- 2026-10-18 restart: platform stays a web page (TypeScript); limelight only; owner-private material in gitignored `docs/private/`; history scrubbed. Owner answers: `docs/private/owner-feedback/restart-2026-10-18.md`.
- 2026-10-18 art: owner rejected the generic stick-figure icon and blob-based icons; app icon = frame 0 of his own GIF sprite; "her" replaces every pink blob; per-card Atlas icons; body-fat chart as torsos with landmark lines (silhouettes "not descriptive").
- 2026-10-18 Train/Log: "keep it simple when we train", "too verbose": warm-up notice off Train (once-only), attendance rows "date n/m", records two lines.
