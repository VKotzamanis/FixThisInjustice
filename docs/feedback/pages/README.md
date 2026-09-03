# Alpha review pages

> Superseded on 2026-09-02 by the guided walkthrough under `docs/feedback/walk/` (decision
> `alpha-guided-walkthrough`). The owner asked to review the app in the order they meet it, with
> each popup inside the step that opens it. These eight per-screen pages stay committed as the
> reference grouping; their published URLs now point at the walkthrough.

Eight static pages, generated from `docs/feedback/catalogue.json`. They are the input the owner's
alpha pass writes into. Regenerate after any change to a copy table or a component:

```bash
node scripts/alpha-catalogue.mjs
node scripts/alpha-pages.mjs
```

The generator is deterministic: two runs on one tree produce byte-identical files.

## The pages, in order

| Page | Screens | Parts | Published |
| --- | --- | --- | --- |
| `00-how-to-test.html` | none | 0 | https://claude.ai/code/artifact/473aeeed-2dfc-4e91-9306-924a79d5ae2e |
| `01-boot-setup-readiness.html` | boot, shell, setup, readiness | 22 | https://claude.ai/code/artifact/e38217b5-2be4-4c4d-835b-bc105ab306f4 |
| `02-today.html` | today | 13 | https://claude.ai/code/artifact/3b7251c3-6108-452a-9bcc-5d91b0f5f6e4 |
| `03-train.html` | train | 8 | https://claude.ai/code/artifact/7a860268-608b-4935-8846-60606ff9b626 |
| `04-plan-targets.html` | plan, targets | 12 | https://claude.ai/code/artifact/09729435-7a5d-4a79-95bd-8a3f3b4d62b4 |
| `05-log-atlas.html` | log, atlas | 11 | https://claude.ai/code/artifact/091325a8-4c8b-4f31-8bc6-da03d72e2608 |
| `06-settings.html` | settings, install | 18 | https://claude.ai/code/artifact/9a46670c-9fd0-4c0f-9edd-ed7589beb488 |
| `07-popups-toasts.html` | popup, toast | 18 | https://claude.ai/code/artifact/e9832e9c-dc19-44f6-9c88-5ba1c0ec8627 |

102 parts in total. `node scripts/alpha-catalogue.mjs --count` prints that number from the tree.

## Publishing

The coordinator publishes each page with the Artifact tool, one call per file, and must load the
`artifact-design` skill before writing or republishing any of them. A favicon is required on the
first publish of a page and is omitted on every redeploy, so a page keeps the icon it has. The same
file path redeploys to the same URL, so a regenerated page replaces its published version and the
link the owner has keeps working.

Record each URL in `urls.json`, then regenerate and republish so the pager links resolve.
