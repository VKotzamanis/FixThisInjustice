# ARCHITECTURE

Decisions and why. Source: master plan 2026-09-01 (now in `docs/private/evidence/`), restart audit 2026-10-18.

| Topic | Choice | Why | Rejected |
|---|---|---|---|
| Platform | Static PWA (Vite + React + TS), GitHub Pages, installable via Add to Home Screen. Confirmed 2026-10-18 | Distribution by link to iPhone and Android, no store, no install friction (owner: no .apk / Play Protect). Phone downloads ~266 KB JS gz once, then offline from cache (measured 2026-10-18) | Capacitor: iOS build needs macOS + Xcode + $99/yr, machine is Linux. Expo/React Native: same distribution barrier + UI rewrite. Changing language: anything in a browser is JS/WASM anyway |
| Platform limit accepted | Rest alarm cannot ring with the screen locked on iOS without a push server | No web API schedules a local notification (Notification Triggers ended). Screen Wake Lock keeps the screen on during a session (`src/ui/hooks/useWakeLock.ts`, iOS 18.4+ installed) | Deploying the Worker just for this (ROADMAP N2, later) |
| iOS floor | 18.4, installed to Home Screen | Wake Lock broken in installed web apps before 18.4; Web Push only for installed apps (16.4+) | |
| Reminders | Client computes instants, uploads to a Cloudflare Worker (cron every minute, KV, Web Push via `@pushforge/builder`) | Only way to notify without the app open | `.ics` alarms (unproven, kept as courtesy export), ntfy (second app), Durable Object alarms (overkill) |
| Storage | IndexedDB `fti`: one object store per AppState map field + `app` (singletons, meta: schemaVersion, revision); per-record Zod validation on read, invalid records quarantined in place; one transaction per action; BroadcastChannel `fti.revision` + revision check; `fti.v3` imported once on first boot and left as a fallback, plus a whole-document rollback mirror to `fti.v3` on hide/pagehide (AM-P2-1); clip in its own database `fti-assets` | No 5 MiB single-key cap, no whole-document rewrite per action, one bad record no longer refuses the rest; boot waits for one read (static loading line) | One localStorage document (B01, B03, B05, B08); many localStorage keys (same cap, no cross-key transaction); OPFS + SQLite WASM (bundle, iOS unverified); server sync (privacy) |
| Privacy | No accounts, no analytics, no server copy of training data. Data unencrypted at rest | Personal tool | |
| Shared origin | Accepted risk: any page on `vkotzamanis.github.io` can read this app's storage | Pages project site | Custom domain or dedicated user site closes it |
| State | Zustand with selectors, debounced save, flush on pagehide/visibility | Monolithic state re-rendered the tree | Context + reducer, Redux |
| Dates | date-fns 4 + `@date-fns/tz`, explicit IANA zone; `toISOString` banned outside `src/domain/dates.ts` | Civil dates shifted a day in the old app | Temporal polyfill, Luxon |
| CSP | `<meta>` generated at build (`build/cspPlugin.ts`); `frame-src` from `src/config/videoInstances.ts`; `connect-src` = Worker origin or `'self'`; fonts self-hosted (`font-src 'self'`); gated by `scripts/check-dist-csp.sh` | Pages cannot set headers; policy and runtime list cannot drift | `frame-ancestors` in meta (ignored by browsers) |
| Skins | Limelight only (2026-10-18). Tokens in `src/ui/styles/tokens.css`; copy = `src/content/copy.ts` base + `src/content/copy.limelight.ts` overlay. A skin never changes a number, unit or control | Owner tests and wants limelight ("brat") only | Clinical, board (removed) |
| Health numbers | Every coefficient carries its source next to it; unverified values ship nowhere | The app makes health claims | |
| Progression | Double progression per exercise from logged history (`src/domain/training/progression.ts`); calendar deload every 4th week | Sourced in the evidence review | RPE-driven: planned (ROADMAP L8) |
| PRNG | splitmix32 seeded via xmur3 (specimen draws) | mulberry32 never emits ~1/3 of values (measured) | mulberry32 |
| Media formats | AAC `.m4a`/MP3, H.264 + AAC `.mp4` | Safari lacks Vorbis/WebM | Ogg, WebM |
