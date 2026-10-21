# FixThisInjustice

A training log that runs in a phone browser. It builds a programme from your body data, goal, equipment and weekly availability, then logs the sets you actually do.

- Live: https://vkotzamanis.github.io/FixThisInjustice/ (add it to the Home Screen; iOS 18.4+ or Android Chrome)
- Your data stays in your browser: no accounts, no analytics, no server copy. Export a JSON backup from Settings.
- Optional session reminders need the Cloudflare Worker in `worker/` (not deployed yet).

## Use it on your phone
1. Open the live link in your normal browser (not a private tab: private tabs throw your data away).
2. Install it: iPhone Safari → Share → Add to Home Screen; Android Chrome → menu → Install app.
3. Always open it from the Home Screen icon. iOS can clear data of sites you have not installed after about a week.
4. Back up now and then: Settings → Data → Download JSON. There is no other copy of your training history.
5. New version not showing? Close the app fully and reopen it, or tap the update banner.

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
