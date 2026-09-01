# Deploy cutover: one manual step

Before the first run of `.github/workflows/deploy.yml` succeeds, a human must set the repository's Pages source once: **Settings → Pages → Build and deployment → Source: GitHub Actions** (not "Deploy from a branch"). Without it, `actions/deploy-pages` fails with `Error: Failed to create deployment (status: 404)` and nothing is published.

The site then serves from `https://<owner>.github.io/FixThisInjustice/`, which is what `base` in `vite.config.ts` and `start_url` in the web app manifest assume; renaming the repository means changing all three together.

Known risk, carried deliberately (security review M4, master plan §9): a GitHub Pages *project* site shares its origin with every other project published under the same `github.io` account, so this app's localStorage is reachable from any other page on that origin. P7's README repeats this sentence.
