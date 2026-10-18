# FixThisInjustice

A training log that runs in a phone browser. It builds a programme from your body data, goal, equipment and weekly availability, then logs the sets you actually do.

- Live: https://vkotzamanis.github.io/FixThisInjustice/ (add it to the Home Screen; iOS 18.4+ or Android Chrome)
- Your data stays in your browser: no accounts, no analytics, no server copy. Export a JSON backup from Settings.
- Optional session reminders need the Cloudflare Worker in `worker/` (not deployed yet).

## Run
Node 22.12+.
```
npm ci
npm run dev       # http://localhost:5173/FixThisInjustice/
npm test
npm run build     # dist/
```

## For agents
Start at `AGENTS.md`, then `docs/STATUS.md` and `docs/ROADMAP.md`.

MIT licence (`LICENSE`). Icons and mascots originate with this project; fonts are OFL-1.1 `@fontsource` packages.
