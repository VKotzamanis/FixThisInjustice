# Build brief: art wiring + styling (owner picks, 2026-10-18)

Agent-only. Owner approved all art in `src/assets/art/` and ticked all 10 survey items (`docs/design/stylize-survey-2026-10-18.md`, details, file:line, costs). App icons already built in `public/icons/` from the owner's sprite (frame 0 of `agy-artifacts/SpriteAI_Vasileios/Untitled-sprite-40x40px-11f.gif`).

## Rules for every visual change
- Read AGENTS.md first (rules, Verify). Limelight only: lime `--lime` #8ace00, ink #000, pink #ff5fcb, Archivo display (`.ll-display`), panel class `.ll-panel`; tokens in `src/ui/styles/tokens.css`. Colours only via tokens; fix undefined tokens you touch (`--bad`, `--line-1` per survey).
- Text contrast >= 4.5:1 (>= 3:1 for >= 24 px bold). Pink text on lime is banned (1.41:1). State changes must not rely on colour/luminance alone.
- `prefers-reduced-motion: reduce`: no movement; use an instant/static equivalent. Flashes <= 3 per second (WCAG 2.3.1). Any rAF/canvas loop stops on `document.hidden` and ends when done.
- CSP is self-only: no network, no new runtime dependencies, no inline `<script>`. SVG art is inlined (import `?raw`) so `currentColor` works.
- Phone first: test layout at 320 and 400 px width; touch targets >= 44 px; nothing wider than the viewport.
- Strings via the copy table (`src/content/copy.ts`), Title Case labels, no emoji; keep `src/content/limelightParity.test.ts` green (append new keys to its fixture deliberately; never change existing rows).
- Missed-week Intervention and the motivation popup show NO mascot (recorded veto, `src/ui/components/Intervention.tsx`).
- Do not change any number, unit, health text or what a control does.
- Test-first for behaviour (render tests for presence/absence, reduced-motion branches, data attributes). Visual CSS gets at least a test that the class/token is applied.
- The impeccable design hook may add findings after UI edits: fix real problems; never add ignore rules.

## Gates (all, zero failures)
`npx tsc -b --force`, `npx eslint ./src ./scripts ./build`, `node scripts/check-no-emoji.mjs`, `bash scripts/check-private.sh` (SKIPPED in a worktree is fine), the three vitest groups with `--maxWorkers=1` one at a time (16 GB machine, other builders running), `npm run build && bash scripts/check-dist-csp.sh`. Count test files vs `find src build -name '*.test.ts*' | wc -l`. Report precache delta in KiB.

## Commit
Worktree branch only, pathspec staging, conventional message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No merge, no push. Report: what the user sees where, tests added, gate summary lines, precache delta, commits, anything not done.
