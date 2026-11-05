# HANDOFF (next agent)

Agent doc. Written 2026-11-05, end of the Job 3 session. Replace it in place when your job is done; facts that last belong in `docs/STATUS.md`.

## State
- main: merge 9456106 (Job 3) + docs commit, pushed 2026-11-05. Before it, live was 04ce22b; 0d07655's Pages deployment was cancelled 3x by GitHub (re-run of a cancelled SHA cannot succeed: `docs/runbooks/deploy.md`).
- First action: `gh run list --limit 4`; confirm CI and Deploy (jobs `build` AND `deploy`) for HEAD, then `curl -s "https://vkotzamanis.github.io/FixThisInjustice/build-info.json?x=$RANDOM"` names HEAD's short SHA and the live `assets/index-*.js` contains "Replace". If not, fix and push (owner standing order).
- Last full Verify (merged tree, 2026-11-05): vitest 1632 + 1486 + 698 (264/264 files), e2e 194 passed + 3 skipped (`p4a-shots`, opt-in), worker 157, tsc/eslint/emoji/private/CSP pass.
- Worktrees and side branches: none (removed 2026-11-05). New parallel tracks: `git worktree add ../FixThisInjustice-<name> -b <branch>`, `cp -al node_modules`, delete `.tmp`, `.vite`, `.vitest`. Check the path does not already exist first.

## Read first (in order)
1. `AGENTS.md`.
2. `docs/STATUS.md`.
3. This file.
4. Owner's verbatim answers: `docs/private/owner-feedback/phone-week-2026-11-04.md`.
5. Owner review page https://claude.ai/artifact/3yj8bqQGczJkfoDbjjLSTd (ArtifactData, collection `answers`; no new answers since 2026-11-05 17:45 UTC).
6. Design: `DESIGN.md`, `PRODUCT.md`, `docs/design/p4-design-brief.md`. Burn/lit: `src/ui/effects/burnText.ts`, `litText.ts`, `BurnWord.tsx`, tokens `--burn-*`/`--lit-*`.
7. Programme engine: `docs/design/programme-engine.md` (incl. decision `engine-accessory-rotation`), `src/domain/plan/engine.ts`. Session editing + Replace: `docs/design/session-editing.md`.

## Job: act on the owner's phone reports
- He will report from his phone on:
  - iPhone notch and home-bar insets;
  - burn and lit words on iOS (WebKit canvas has no fontStretch: 75 % tab labels and eyebrow are CSS text there; GPU precision);
  - praise-word burn while the reps field keeps focus;
  - Android Back in the installed app (sheets incl. the new Replace sheet, More sheet, rest-game sheet);
  - form-video playback (YouTube player inside the sandboxed frame);
  - the new Replace button and sheet, and the Settings rotation switch, at real size.
- `systematic-debugging` before any fix. Reproduce in Playwright (chromium iphone13/pixel7, webkit-iphone13) where possible; quote his words verbatim into the owner-feedback file.
- Owner-gated, do not do: form-cue text for 38 exercises (his wording), moving-banner content ("for another time"), reminders (decided skipped; do not deploy the Worker).

## Job 3 (DONE 2026-11-05, owner item 11)
- Replace: 0387ca7 (`replaceChoices`), 59e572b (header button, `ReplaceSheet`, Undo toast), 7438873 (`e2e/replace.spec.ts`, webkit project too).
- Engine: 0df36d3 (R-A, 2-session adoption), e32bf91 (R-B rotation + `Profile.rotateAccessories`), d5194b2 (Settings switch), c4d8a48 (docs). Merge 9456106.
- Evidence: `docs/private/evidence/exercise-variation-2026-11-05.md` (V1-V16, all DOIs Crossref-checked; lead re-checked V1, V2, V3, V16).

## Known follow-ups (agent-fixable, low priority)
- Replace sheet quiet line shows raw muscle ids ("front-delt"); no display-name map exists.
- Rotation edges (programme-engine.md): an adopted swap equal to the slot's alternate re-alternates next cycle (no stored pin); a skip replacement onto home rotates back one cycle later; an alternate the user can no longer use (equipment change) stays; switch off freezes the current A/B state, it does not revert to home.
- ACSM 2009 "two consecutive training sessions" clause (STATUS decisions log): unverified; `progression.ts` unchanged.
- `ModalShell` `onClose` is a fresh arrow every render (audit A16 note).
- Per-record hydrate is 430 ms for 3 years of history in node (budget test 1290 ms); profile on a phone.
- A rolled-back pre-N4 build quarantines the new `ui` record (no `accent`): ui prefs only.
- The motivation-clip and sfx runbooks still cite the absent `REFERENCES.md`.
- `scripts/alpha-fixture.mjs` is not deterministic across runs.

## Process (what worked)
- Builders: `opus55-medium-builder`, several tasks per builder, per task `tsc -b` + commit with pathspecs, one full Verify per batch; the lead re-runs the gates after merging. Research: `sonnet55-high`, DOIs resolved on Crossref.
- Owner: "When I say so, just merge and push. GitHub's CI is the gate." After a push watch `gh run list` once, then check the live stamp.
- Paywalled full text: an unofficial PDF copy is refused by the permission classifier; record the claim as unverified instead.
