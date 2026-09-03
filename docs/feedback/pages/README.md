# Alpha review pages

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
| `00-how-to-test.html` | none | 0 | not yet |
| `01-boot-setup-readiness.html` | boot, shell, setup, readiness | 22 | not yet |
| `02-today.html` | today | 13 | not yet |
| `03-train.html` | train | 8 | not yet |
| `04-plan-targets.html` | plan, targets | 12 | not yet |
| `05-log-atlas.html` | log, atlas | 11 | not yet |
| `06-settings.html` | settings, install | 18 | not yet |
| `07-popups-toasts.html` | popup, toast | 18 | not yet |

102 parts in total. `node scripts/alpha-catalogue.mjs --count` prints that number from the tree.

## Publishing

The coordinator publishes each page with the Artifact tool, one call per file, and must load the
`artifact-design` skill before writing or republishing any of them. A favicon is required on the
first publish of a page and is omitted on every redeploy, so a page keeps the icon it has. The same
file path redeploys to the same URL, so a regenerated page replaces its published version and the
link the owner has keeps working.

Record each URL in `urls.json`, then regenerate and republish so the pager links resolve.
