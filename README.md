# FixThisInjustice

A training console that runs in a phone browser. It builds a programme from your body data,
goal, equipment and weekly availability, then logs the sets you actually do.

It is a static web app. There are no accounts, no analytics and no server copy of your
training data. One optional Cloudflare Worker sends session reminders and does nothing else.

## What it holds

| Tab | Contents |
| --- | --- |
| Today | today's session, the rest of this week, and the weekly review |
| Plan | the generated programme, week by week |
| Train | the session under way: prescription, logged sets, rest timer, fluid, body mass |
| Targets | daily energy, protein and drink targets from the nutrition engine |
| Log | body mass against projection, weekly compliance, best reps, and records |
| Atlas | the specimen cards by rarity, with a locked slot for each card not yet drawn |
| Settings | readiness, profile, equipment, hydration, reminders, clip, skin, sound, data |

The tab list is declared once, in `src/ui/nav/views.ts`. Export is reached from the data
section of Settings rather than from the tab strip. Availability is set in the setup wizard.

Two things sit outside the strip. Reminders arrive as Web Push sent by the Worker. A week
that closes below its session target opens a short motivation clip, which you supply.

Three skins ship: `clinical`, `limelight` (the default) and `board`. A skin changes tokens,
wording, icons and optional sounds. It never changes a number, a unit or what a control does.

## Platforms

**iPhone and iPad: iOS 18.4 or later.** Add the site to the Home Screen and open it from the
icon. Reminders need that install, because iOS grants Web Push only to an installed web app.
Web Push reached installed iOS web apps in 16.4. The Screen Wake Lock this app uses during a
session stayed broken inside one until 18.4. `src/ui/hooks/useWakeLock.ts` records the
reason, and `docs/RUNBOOK-reminders.md` section 12 has the install steps.

**Android: Chrome.** Push is supported in a tab, so reminders work without installing. Install
from the browser menu anyway if you want the app full screen.

## Run it

Node 22 or later. `.nvmrc` pins the major version and `package.json` requires `>=22.12`.

```bash
npm ci             # install the exact package-lock.json tree
npm run dev        # http://localhost:5173/FixThisInjustice/
npm test           # vitest run
npm run test:tz    # the suite under UTC, Europe/Athens, America/New_York, America/Los_Angeles
npm run lint       # eslint .
npm run typecheck  # tsc -b
npm run build      # tsc -b && vite build, into dist/
npm run preview    # serves dist/
```

The dev URL carries `/FixThisInjustice/` because `vite.config.ts` sets `base` to it. The
service worker is built by `vite-plugin-pwa` and is not served in dev, so exercise install,
update and offline behaviour against `npm run preview`.

The Worker is a separate npm package with its own lockfile. Run `npm ci`, `npm run typecheck`
and `npm test` inside `worker/`.

## Deploy it

The published artefact is `dist/`, produced by the build. No file list is maintained by hand.

1. Set **Settings**, then **Pages**, then **Build and deployment**, then **Source: GitHub
   Actions**. This is done once.
2. Push to `main`. `.github/workflows/ci.yml` runs lint, types, the four-zone suite, the build
   and the content gates. `.github/workflows/deploy.yml` builds, repeats the gates and
   publishes `dist/`.
3. The site serves from `https://<owner>.github.io/FixThisInjustice/`.

`docs/DEPLOY-CUTOVER-NOTE.md` is the checklist for the first publication and for the rollback.

The reminder Worker is deployed separately and rarely. `docs/RUNBOOK-reminders.md` covers
Wrangler, the KV namespace, the VAPID key pair and the cron trigger. It also covers the two
GitHub repository variables and the smoke test on a phone.

## Your data

Everything the app records stays in your browser's storage on the device you used. It is not
synced and nobody else can read it. It lives under one key, `fti.v3`, and
`src/store/persistence.ts` is the only module allowed to touch web storage. A lint rule in
`eslint.config.js` fails the build if another module tries.

Settings has three exports: a JSON backup of the whole document, a plain-text summary, and an
`.ics` file of your upcoming sessions. Take the JSON backup and keep it somewhere you control.

Deleting is deliberate. A destructive action is enabled only after you have exported in the
same dialog, and it then asks you to type `DELETE`.

Two things leave the device, and only when you turn reminders on. The first is the push
subscription your browser vendor issues, which identifies a browser install and not a person.
The second is the instants of your next sessions, with the session label in the notification
text. The Worker stores nothing else.

The data is not encrypted at rest. Anyone holding the unlocked phone can read it.

**Shared origin.** This is a GitHub Pages project site, so it shares an origin with every
other project published under the same account. Any page on that origin can read this app's
storage. A custom domain or a dedicated user site closes it. Until then, publish nothing
untrusted to the same account.

**No personal data in the repository.** No medication, biometric or location string belongs in
tracked source. Both workflows grep the tree for the forbidden identifiers and fail on a hit.
The two review directories and `REFERENCES.md` are exempt, because they discuss the terms.

## Coming from the old console

If the previous version of this app is installed on the same device, its data is still there.
The first launch offers a one-way import. It asks two questions the old app never recorded:
which unit loads were typed in, and which unit body mass was typed in. Download the legacy
JSON the wizard offers before you keep the import. The old data is deleted only when you
delete it, from **Settings**, then **Delete legacy data**.

## Documentation

| Path | Contents |
| --- | --- |
| `docs/plans/` | the master plan and the eight numbered implementation plans |
| `docs/review/` | the security, code and content peer reviews the rewrite was built from |
| `docs/design/` | the three design rounds, the shipped direction, and the copy contract |
| `docs/RUNBOOK-reminders.md` | deploying and operating the reminder Worker |
| `docs/DEPLOY-CUTOVER-NOTE.md` | publishing the site for the first time, and rolling back |
| `docs/motivation-video.md` | where the motivation clip goes, and which format to use |
| `docs/sfx.md` | where skin sound effects go; none ship in this repository |
| `REFERENCES.md` | every external source used, with the method that fetched it |

## Licences

The icons and the mascot illustrations are own work, generated for this project and inlined by
`npm run icons:build`. `src/skins/limelight/icons.ts` and `illustrations.ts` carry the
provenance, and no third-party licence applies to them. The typefaces are Google Fonts
families installed as `@fontsource` packages, recorded as SIL Open Font License 1.1 in
`docs/design/round3/2026-09-01-round3-plan.md`. The motivation clip and any sound effects are
supplied by you and are not in this repository.
