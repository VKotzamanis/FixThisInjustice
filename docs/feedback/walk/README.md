# The guided alpha walkthrough

Seven static pages, generated from `docs/feedback/catalogue.json` and the walk table in
`scripts/alpha-walk.mjs`. They follow the tester's path through the app rather than the code's
structure: one page per stage, one section per step, and a popup or a toast sits in the step that
opens it. Decision `alpha-guided-walkthrough` in
`docs/plans/2026-09-02-10-alpha-feedback-loop.md` records why, and supersedes
`alpha-feedback-review-pages`.

The eight per-screen pages under `docs/feedback/pages/` stay where they are. They are superseded
as the input to a round, not deleted: their part ids are the same ids these pages carry.

Regenerate after any change to a copy table, a component or the walk table:

```bash
node scripts/alpha-catalogue.mjs
node scripts/alpha-walk-pages.mjs
node scripts/alpha-walk-pages.mjs --check
```

The generator is deterministic: two runs on one tree produce byte-identical files.

## The pages, in order

| Page | Stage | Steps | Published |
| --- | --- | --- | --- |
| `w0-how-to-test.html` | 0, how to run the walkthrough | 0 | not yet |
| `w1-first-open.html` | 1, first open and setup | 15 | not yet |
| `w2-today.html` | 2, Today, first look | 16 | not yet |
| `w3-session.html` | 3, a training session | 15 | not yet |
| `w4-after.html` | 4, after the session | 16 | not yet |
| `w5-settings.html` | 5, settings and data | 16 | not yet |
| `w6-extras.html` | 6, extras and rare states | 11 | not yet |

89 steps over six walked stages. Every one of the 491 copy keys the catalogue places appears in
exactly one step, and all 102 live parts are covered.

## What a step carries

A step id (`w<stage>.<nn>`), a title, a **Do** line naming the control by the words the Limelight
app puts on it, a **You see** line, the part ids the step covers, the strings in the order the app
paints them, and one comment box. A step that needs a state the tester may not have is marked
skippable and says what it needs.

The assembled line is `- [<step id> | <part ids comma separated>] <comment>`, so a comment arrives
carrying both the place in the walk and the ledger key that reaches a task.

## Publishing

The coordinator publishes each page with the Artifact tool, one call per file, and must load the
`artifact-design` skill before writing or republishing any of them. A favicon is required on the
first publish of a page and is omitted on every redeploy, so a page keeps the icon it has. The same
file path redeploys to the same URL, so a regenerated page replaces its published version and the
link the owner has keeps working.

Record each URL in `urls.json`, then regenerate and republish so the pager links resolve. The file
already holds the seven page ids with empty strings; the pager falls back to `#` until they are
filled in.
