# AGENTS.md: FixThisInjustice

Agent-only. Terse. Read with `docs/STATUS.md` (state) and `docs/ROADMAP.md` (work) before any change.

## What
- Phone-browser training log PWA. React 19, TS 5.9, Vite 8, Zustand 5, Zod 4, date-fns 4 + @date-fns/tz, Vitest 4.
- One localStorage document, key `fti.v3`, Zod-validated (`src/domain/schema.ts`). IndexedDB only for the user's motivation clip.
- Optional reminder Worker in `worker/` (separate npm package, Web Push via cron). Not deployed.
- Live: https://vkotzamanis.github.io/FixThisInjustice/ (GitHub Pages, public repo).
- One skin: limelight. Token layer kept so a skin can return.

## Rules (each one came from a real bug)
1. Never invent a citation, DOI, dose or coefficient. Health numbers and their sources live in `src/domain/nutrition.ts`, `src/domain/bodyfat.ts`, `src/domain/training/restTimer.ts`, `src/content/guidanceReferences.ts`. No source: say so and ship nothing.
2. Derive, never copy. A constant, rule or status in two places: derive it, or make one test read both from one source.
3. Stage with pathspecs (`git add -- <files>`), never `git add -A`.
4. Never silently rewrite the owner's words. If his copy breaks a rule, name the rule and let him choose. `src/content/introSlides.ts` is his prose; emoji and "weight"/"calories" allowed there.
5. Colours only through tokens in `src/ui/styles/tokens.css`. A hex literal in component CSS is a bug.
6. Only `src/store/persistence.ts` touches web storage; `toISOString()` only in `src/domain/dates.ts`. Both lint-enforced.
7. Stored-schema change: old documents must still load (coerce at parse, or migration + test). Never break a user's localStorage or an old JSON export.
8. Verify, don't trust. Re-run the gates yourself; a subagent's "passed" is a claim.
9. Agent docs terse: bullets and file:line, no prose, no counts a script can produce. One place per fact; `docs/STATUS.md` is updated in place, no dated handoffs.
10. No personal data in tracked files. Owner's private material lives in `docs/private/` (gitignored, this laptop only).

## Verify
```
npx tsc -b --force
npx eslint ./src ./scripts ./build
node scripts/check-no-emoji.mjs
bash scripts/check-private.sh        # pattern: docs/private/privacy-pattern.txt locally, PRIVACY_PATTERN secret in CI
npx vitest run --maxWorkers=1 src/domain src/content
npx vitest run --maxWorkers=1 src/ui
npx vitest run --maxWorkers=1 src/app src/store src/skins src/test src/config build
npm run build && bash scripts/check-dist-csp.sh
cd worker && npx tsc --noEmit -p . && npx vitest run --maxWorkers=1
```
- Machine: 16 GB shared with MATLAB. Always `--maxWorkers=1`, by group. "Test timed out" is not an assertion failure.
- Count test files run against `find src build -name '*.test.ts*' | wc -l`.
- Expected: zero failing tests (since 2026-10-18).

## Deploy
- Push `main` → `.github/workflows/ci.yml` → on success `.github/workflows/deploy.yml` publishes `dist/` to Pages. Rollback: `docs/runbooks/deploy.md`.
- Confirm the live bundle hash contains your change; a green workflow is not proof.
- PWA cache: the owner must open a private tab or clear site data to see a new build.
- Never push, force-push or change repo settings without the owner's yes.

## Owner
- Tests on his phone; users mix iPhone and Android.
- For decisions: publish an artifact that shows the options visually, with an answer box per item; read answers back from its db.
- Wants rulings, not questions. Ask only when the answer changes what the app claims or costs money.
- Writes long; requirements hide mid-paragraph. Read sentence by sentence.
- Prefers being contradicted with evidence (file:line) over agreement.
- Art: approved set in `src/assets/art/` (owner review 2026-10-18, spec `docs/design/asset-spec-2026-10-18.md`), app icons from his own sprite. New art goes through an owner review page first; register `docs/design/2026-09-04-icon-register.csv`.

## Map
- `src/domain`: pure logic (plan generator, progression, nutrition, body fat, schedule, schema, migrations, reminders instants)
- `src/store`: Zustand store, persistence, session mirror
- `src/ui`: views (Today, Plan, Train, Targets, Log, Atlas, Settings), setup wizard, intro
- `src/content`: copy (`src/content/copy.ts` base + `src/content/copy.limelight.ts` overlay), intro prose, cited guidance, specimen cards
- `src/skins`: skin context, sfx loader
- `build/`: CSP plugin. `scripts/`: emoji gate, CSP/media/sfx checks, icon inliner, tz city generator, alpha fixture
- `docs/feedback/alpha-fixture.json`: synthetic data reaching states a fresh install cannot (Settings → Data → import)
- `docs/private/` (gitignored): owner feedback verbatim, evidence reviews (verified sources), research runs, 2026-10-17 audit. Code comments citing review IDs (A22, M4, C1.09.5…) refer to `docs/private/evidence/`.
