# HANDOFF (next agent)

Agent doc. Written 2026-11-05 at the end of the AAA-rebuild session. Replace it in place when your job is done; facts that last belong in `docs/STATUS.md`.

## State
- Live: main `6164a9c`. CI (verify, worker, e2e on chromium iphone13/pixel7 and webkit-iphone13) and Deploy (build + deploy) are green. Pages serves it.
- Phases P0-P8 of the rebuild are shipped:
  - P0: Playwright harness.
  - P1: owner bugs + critical audit findings.
  - P2: IndexedDB per-record storage.
  - P3: schedule.
  - P3a: 28 new exercises + inventory filter.
  - P4a: shell and design.
  - P4b: platform.
  - P5: measurements.
  - P6: rest games.
  - P7: open-ended programme engine (L6), form videos for 68/68, worker E10, burn cel switch, WebKit e2e.
  - P8: wizard split + coverage sweep.
- Coverage audit: `docs/private/audit-2026-11-04/coverage.md`. Every agent-fixable finding of the 120 is closed, plus the ROADMAP items (B1c, R4, N4, S4).

## Read first (in order)
1. `AGENTS.md`: rules 1-10, Verify block, Deploy, Owner.
2. `docs/STATUS.md`.
3. This file.
4. `docs/plans/2026-11-04-aaa-rebuild-spec.md`: rulings R1-R13.
5. Owner's verbatim answers: `docs/private/owner-feedback/phone-week-2026-11-04.md` (gitignored; all review answers incl. items 8-11).
6. Owner review page: https://claude.ai/artifact/3yj8bqQGczJkfoDbjjLSTd. Read it with the ArtifactData tool:
   - collection `answers`, docs `tabs`, `icons`, `ticker`, `shadow`, `vignette`, `postponed`, `typeface`, `glow`, `burn`, `burnLook`, `burnGlow`, `burnCopy`, `cursorWording`;
   - collection `tuning`, doc `adaptation`.
7. Design system:
   - `DESIGN.md`
   - `PRODUCT.md`
   - `docs/design/p4-design-brief.md`
   - `docs/design/critique-2026-11-04.md`
   - craft floor `/home/vx/Desktop/Claude/web-assets/.claude/skills/impeccable/reference/craft-floor.md`
8. Burn effect (owner-approved, faithful look, glow on):
   - code: `src/ui/effects/burnText.ts` (switch `BURN_LOOK`), `src/ui/effects/burnMoments.ts`, `src/ui/effects/BurnWord.tsx`, `burnWord.css`;
   - tokens `--burn-*` in `src/ui/styles/tokens.css`;
   - research: `docs/private/design-2026-11-04/holo-alarm-burn.md`;
   - owner's original shader: `/home/vx/Desktop/Claude/phone-glow-build/alarm/assets/web/lyrics-core.js:242-291` (read-only).
9. Nord Glow reference (fonts, effects, licences): `docs/private/design-2026-11-04/phone-glow-reference.md`.
10. Programme engine: `docs/design/programme-engine.md`, `src/domain/plan/engine.ts`. Form videos: `docs/design/form-videos.md`.

## Job 1: DONE 2026-11-05 (items 8 and 10; item 11 still open, see below)
- Commits: 0bb58c6 (static lit renderer `src/ui/effects/litText.ts`: ONE shared offscreen WebGL context, frames cached as 2D canvases, max 64; `--lit-*` tokens; `--panel-glow` on), 3a9aa71 (`LitWord`, BurnWord `rest="lit"`), 41928bf (header brand + title, lime tab labels, rest-over word at rest, rest-sheet eyebrow), fe78282 (counter: bare number, `SessionNumber`, burns once per completed session via `burnMoments.claimSessionAdvance`, named "Session n"; limelight `status.sessionCursor` row removed, fixture updated), 265e796 (glow fade inside the lit canvas; e2e in `e2e/burn.spec.ts`), 6e65668 (glow room in the title/tab clips; `litText.widthMatches` refuses a frame whose width differs from the DOM word), 289b586 (counter at normal width).
- Decisions: the current tab label stays plain ink on its pink sticker (lime on pink 1.41:1); `status.sessionEyebrow` ("ep. 1, Lower A" on Train) still says "ep.": owner's call; `SessionIndicator` is not mounted anywhere, it only got the bare number through `FORMAT.planPosition`; with `--panel-glow` on, `Echo` words also get the static CSS glow.
- Follow-up DONE: burn haze rectangle. One glow fade for burn and lit (`burnText.ts` `GLOW_FADE`, `edgeFade`, `glowFade`; `uFade` switch removed); glow and flame tongues reach alpha 0 at the outermost canvas pixel; glyph pixels unchanged (headless Chromium readback, border alpha 134 -> 0). Test `burnText.test.ts` "fades glow and flames to zero alpha".
- WebKit canvas has no fontStretch: the 75 % tab labels and the 75 % eyebrow stay plain CSS text (glow shadow) on iOS; the header title, brand, rest-over word and counter (100 %) are lit. Owner still to see both on a phone.

### Original brief (kept for reference)
- Item 8 (`glow`, "change"): "Can you instead use the font and shader font that we use on (9) but with lime green accents? no burn affect needed."
  - Build a STATIC variant of the burn renderer: same font (Archivo 900 wide, as `BurnWord`) and the faithful shader look (cel bands / halftone / ink outline per `holo-alarm-burn.md`), recoloured to lime accents, with no heat animation and no flames.
  - Use it for the lime words on the black lit-sign panels: header brand and page title, current tab label, rest bar word, panel eyebrows. Never numerals in set entry.
  - Fallbacks: static (no rAF), CSS text when WebGL is absent, reduced motion unaffected.
  - Keep `--panel-glow` as the switch and set it on.
- Item 10 (`cursorWording`, "keep"): "Just change the "EP.12" to just the number and use the font shade and burn effect from 9."
  - The session counter (limelight `status.sessionCursor`, `FORMAT.planPosition`; SessionIndicator, Today eyebrow, header) shows the bare number, e.g. `12`.
  - Render it in the burn font and shader, and burn it once when the number advances (a completed session), using burnMoments' once-per-moment rule.
  - Keep an accessible name ("Session 12").
  - This edits owner copy on his own instruction (AGENTS rule 4 satisfied: he asked).
- Item 11 (`tuning/adaptation`, "change" with 50 and 2 = the current defaults, empty note): ASK the owner what he wants changed before touching `LOW_ADHERENCE_FRACTION` / `CONSISTENT_SKIP_MIN` (`src/domain/plan/engine.ts`).
- Verify:
  - unit tests for the static shader variant and the counter;
  - e2e (`e2e/burn.spec.ts` pattern) on chromium and webkit;
  - the contrast sweep (`e2e/p4a-sweeps.spec.ts`) stays green;
  - then the AGENTS Verify block.
  - Machine is 16 GB shared: `--maxWorkers=1`, one heavy process at a time.

## Job 2: owner-gated items (do only when he answers)
- Reminder Worker deploy. Needs his `npx wrangler login` in `worker/`, then follow `docs/runbooks/reminders.md`. Put `ADMIN_CONTACT` (his email) in as a Worker SECRET, never in `worker/wrangler.toml` (public repo, rule 10). Set the GitHub repo variables `VITE_REMINDER_API` and `VITE_VAPID_PUBLIC_KEY`, then push.
- Real-device checks he must report:
  - iPhone notch and home-bar insets;
  - burn on iOS (canvas has no fontStretch in WebKit; GPU precision);
  - praise-word burn while the reps field keeps focus;
  - Android Back in the installed app;
  - the YouTube player inside the sandboxed frame.
- Form-cue text for 38 exercises: his wording; do not write it.
- Moving-banner content: his job "for another time".

## Known follow-ups (agent-fixable, low priority)
- `ModalShell` `onClose` is a fresh arrow every render (audit A16 note).
- Per-record hydrate is 430 ms for 3 years of history in node (budget test 1290 ms); profile on a phone.
- A rolled-back pre-N4 build quarantines the new `ui` record (no `accent`): ui prefs only.
- The motivation-clip and sfx runbooks still cite the absent `REFERENCES.md`.
- `scripts/alpha-fixture.mjs` is not deterministic across runs.

## Process (what worked)
- Codex hit its usage limit mid-session. The owner then asked for Claude Opus 5.5 medium builders (`opus55-medium-builder`) in BATCH mode: per task `tsc -b` + commit; full gates once per batch.
- Parallel tracks ran in sibling worktrees `../FixThisInjustice-*` with hardlinked `node_modules` (`cp -al`, then delete `.tmp`, `.vite`, `.vitest`). Port 4174 is for one e2e runner at a time.
- Owner instruction at the end: "Stop with all those checks. Just merge and push". The lead pushes; CI is the gate. Watch `gh run list` once per push.
- Old worktrees can be removed (`git worktree remove --force ...`). First copy `../FixThisInjustice-design/docs/private/design-2026-11-04/` (critique screenshots, only there) into the main tree's `docs/private/`.
