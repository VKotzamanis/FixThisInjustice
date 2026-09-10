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
| `w0-how-to-test.html` | 0, how to run the walkthrough | 0 | https://claude.ai/code/artifact/689fcd9e-b9cc-47bb-bf4e-4a97513aaf86 |
| `w1-first-open.html` | 1, first open and setup | 15 | https://claude.ai/code/artifact/d36b9b36-1d1e-4d9d-8127-ca34dd90354a |
| `w2-today.html` | 2, Today, first look | 16 | https://claude.ai/code/artifact/dacce295-70d9-4b01-b5f4-d1429c61c821 |
| `w3-session.html` | 3, a training session | 15 | https://claude.ai/code/artifact/d8f1afba-e66e-41f4-aa47-96a5b3405407 |
| `w4-after.html` | 4, after the session | 16 | https://claude.ai/code/artifact/cc1d3d0a-526e-4908-bcf6-fba51a8e6361 |
| `w5-settings.html` | 5, settings and data | 16 | https://claude.ai/code/artifact/2bbc42f4-3606-4d1c-9935-45ab35eb223f |
| `w6-extras.html` | 6, extras and rare states | 11 | https://claude.ai/code/artifact/e9f5b735-5b02-43bf-9d2c-24837bbee94d |

### Round pages

A round page walks only what CHANGED, in the order the tester meets it, so the feedback is about
the deltas rather than the whole app again. It is written by hand, not generated: which changes
matter and what each one WAS is a judgement the generator cannot make. It still quotes the
Limelight strings from `catalogue.json` rather than from memory, and it carries the same
localStorage persistence and paste-back assembly the generated pages use.

| Page | Round | Steps | Published |
| --- | --- | --- | --- |
| `r2-onboarding.html` | 2 | 20 | https://claude.ai/code/artifact/7aef9f95-c092-4bb2-babd-cf3d71152349 |
| `r3-onboarding.html` | 3 | 17 | https://claude.ai/code/artifact/09d04fba-46d3-427e-92ed-12cf5463c806 |

Round 3's page also carries a closing block naming what is deliberately NOT done, so the tester is
not hunting for it: the three owner-supplied assets, the ten Title Case strings that are still
questions, the deferred just-in-time scheduler, r2.17's unresolved half, and the fact that the DOI
audit proves citations resolve and not that they support the sentences beside them.

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
