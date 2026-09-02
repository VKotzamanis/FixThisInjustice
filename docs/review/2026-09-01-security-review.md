# Security review — FTI Console PWA

Date: 2026-09-01
Scope: `index.html`, `sw.js`, `manifest.json`, `data.js`, `console-content.js`, `core.jsx`,
`console-store.jsx`, `console-shared.jsx`, `console-train.jsx`, `console-video.jsx`,
`console-today-extras.jsx`, `console-views.jsx`, `console-fun.jsx`, `tweaks-panel.jsx`,
`console-app.jsx`.
Method: static read of every file above, plus five reproduction scripts run under Node 4 timezones
to confirm the date and state-shape findings empirically rather than by inspection.
Deployment target reviewed as stated: GitHub Pages, `https://vkotzamanis.github.io/FixThisInjustice/`.

The repository has **zero commits** and no git remote at review time. Findings about publication
therefore describe the state that deploying this tree would create, not a breach that has occurred.

---

## Summary

| ID | Severity | Title | Location |
|----|----------|-------|----------|
| C1 | Critical | Unvalidated import bricks the app permanently, with no in-app recovery | `console-views.jsx:597-620`, `console-store.jsx:114-117`, `console-store.jsx:290-357` |
| H1 | High | Prescription medication dose and full health profile shipped as public static assets | `data.js:5-18,211,216,219,223,235-239,285-286`, `console-content.js:584-585,602-603` |
| H2 | High | One-click, unconfirmed, permanent data wipe in the persistent footer | `console-app.jsx:179-181` |
| H3 | High | localStorage quota failure is swallowed — silent, permanent data loss | `console-store.jsx:49-51`, `core.jsx:15-17`, `console-views.jsx:614` |
| H4 | High | Date helpers mix UTC and local time; program day shifts by one across DST and by timezone | `console-store.jsx:53-63,68-77` |
| M1 | Medium | No Content-Security-Policy, and the architecture forbids adding a strict one | `index.html:1-24,1496-1512` |
| M2 | Medium | Third-party video iframe with no `sandbox`, on hardcoded community-run hosts | `console-video.jsx:21-28,106-116` |
| M3 | Medium | Service worker caches cross-origin scripts unverified and fakes offline readiness | `sw.js:35,54-73` |
| M4 | Medium | Shared `vkotzamanis.github.io` origin exposes localStorage to every other project | `console-store.jsx:6`, `manifest.json:5-6` |
| M5 | Medium | No schema version or migration; three uncoordinated storage keys | `console-store.jsx:6`, `core.jsx:6`, `console-video.jsx:30` |
| M6 | Medium | Primary set-log path accepts negative, unbounded, and infinite weight/reps | `console-train.jsx:92-99` |
| M7 | Medium | `waterTarget` drives an unbounded render loop | `console-views.jsx:199` |
| M8 | Medium | Unauthenticated `message` listeners and wildcard `postMessage`; dev tooling shipped | `tweaks-panel.jsx:171,209-212,251-258` |
| L1 | Low | Google Fonts stylesheet: no SRI possible, leaks client IP, breaks offline | `index.html:22-24` |
| L2 | Low | React *development* builds served in production | `index.html:1496-1497` |
| L3 | Low | No `Referrer-Policy` | `index.html:3-24` |
| L4 | Low | Service worker `SKIP_WAITING` handler validates nothing | `sw.js:40-44` |
| L5 | Low | `DEPLOY.md` is inverted against reality and would ship the stale `console.html` | `DEPLOY.md:11-53` |
| L6 | Low | Invalid set submission fails silently with no user feedback | `console-train.jsx:92-99` |
| I1 | Info | No XSS sink exists anywhere in the codebase (verified absent) | — |
| I2 | Info | The import merge is not prototype-pollutable (verified absent) | — |
| I3 | Info | No tracking, analytics, or outbound telemetry (verified absent) | — |
| I4 | Info | No secrets, keys, or credentials (verified absent) | — |

Counts: 1 Critical, 4 High, 8 Medium, 6 Low, 4 Info.

---

## C1 — Unvalidated import bricks the app permanently (Critical)

`console-views.jsx:597-620`:

```js
if (typeof parsed !== "object" || parsed === null) {
  setImportStatus({ ok: false, msg: "not an object — expected an export from this app" });
  return;
}
...
const fresh = { ...defaultState(), ...parsed, bootSeen: true };
localStorage.setItem("fti.console.v2", JSON.stringify(fresh));
setTimeout(() => location.reload(), 800);
```

`typeof parsed !== "object"` is the *entire* validation. No field is type-checked or
range-checked. The merged object is written to localStorage and the page is reloaded, so the
untrusted shape becomes the boot state before any code inspects it. `console-store.jsx:114-117`
then rehydrates it with the same unchecked spread.

**Failure scenario.** Import this file:

```json
{"week": 999}
```

`console-store.jsx:293` evaluates `PLAN.volume[998]` → `undefined`; line 326 evaluates
`vol.deload` → `TypeError`. Reproduced against the real `PLAN` from `data.js`:

```
THROW week:999 (out of range)     -> TypeError: Cannot read properties of undefined (reading 'deload')
THROW day:99  (out of range)      -> TypeError: Cannot read properties of undefined (reading 'exercises')
THROW weightLog: 5 (wrong type)   -> TypeError: s.weightLog is not iterable
THROW week: null                  -> TypeError: Cannot read properties of undefined (reading 'deload')
```

`PLAN.volume` and `PLAN.weight_curve_lb` have 24 entries and `PLAN.days` has 7, so any `week`
outside 1–24 or `day` outside 1–7 throws.

**Impact.** The throw happens inside the `derived` `useMemo` in `usePlanStore`, which
`App()` calls at `console-app.jsx:13` — *above* every `ErrorBoundary`. The boundaries at
`console-app.jsx:156-158` wrap only the view children at lines 168-174, so they never see this
error. The whole React tree fails to mount: black screen. The hostile state is already persisted,
so every subsequent load reproduces the crash. The two recovery affordances — `reset()`
(`console-store.jsx:280`) and the `$ rm -rf logs/` button (`console-app.jsx:179`) — both live
inside the tree that no longer renders. Recovery requires browser devtools or clearing site data,
which also destroys the user's real logs.

A hostile file is not required. A file exported by a future schema version, or hand-edited by the
user, reaches the same state. `week` and `day` are clamped on the setter path
(`console-store.jsx:140-141`) but the persisted and imported paths bypass those clamps entirely.

**Fix.** Parse imported JSON through a schema validator (Zod or Valibot) that is the single
gate for both `localStorage` rehydration and file import. Reject rather than coerce; on rejection
keep existing state and show the validation error. Independently, make the render path total:
clamp `week`/`day` at read time in the selector, and treat a missing `PLAN.volume[i]` as a
recoverable default rather than dereferencing it. Mount an error boundary *above* the store hook
so a store-level throw still renders a recovery UI that can export and clear state.

---

## H1 — Prescription medication and health profile shipped as public static assets (High)

`data.js:211,216,223`:

```js
{ time: "08:30", what: "Wake. Vyvanse 40 mg. Vietnamese coffee (1–2 sticks).", tag: "stim" },
{ time: "12:30", what: "Vyvanse peak. Whey + whole milk. Thesis.", tag: "feed" },
{ meal: "Fasted gym", what: "Vyvanse + Vietnamese coffee", kcal: 70, p: 1 },
```

Full inventory of health data in the two content files:

- `data.js:5-18` — body composition profile: `weight_kg: 95.3`, `bf_pct: 27`, `fat_kg: 25.7`,
  `lean_kg: 69.6`, targets.
- `data.js:211` — **named drug and exact dose: Vyvanse 40 mg**, with time of administration.
- `data.js:216` — Vyvanse pharmacokinetic timing ("Vyvanse peak").
- `data.js:219` — Magnesium glycinate 200–400 mg.
- `data.js:223` — Vyvanse in the meal table.
- `data.js:235-239` — full supplement stack with doses.
- `data.js:285-286` — "Vyvanse + caffeine elevate HR", "Vyvanse causes mild dehydration".
- `console-content.js:584-585` — "Lisdexamfetamine raises resting heart rate by 5-15 bpm…".
- `console-content.js:602-603` — "…someone on 40 mg lisdexamfetamine plus training".
- `console-store.jsx:394-399` — `COMPOUND_LIFTS`, commented as the Vyvanse + caffeine RPE gate.
- `console-shared.jsx:353` — a `VyvanseCurve` component is exported and rendered in the UI.

Lisdexamfetamine is a controlled substance in most jurisdictions. Combined with the body-composition
profile and a personal daily schedule ("Gym. Fasted. YMCA empty." at `data.js:212`, which also
discloses a routine location and time), this is special-category health data under GDPR Art. 9 and
is directly attributable — the deployment URL carries the user's surname.

`DEPLOY.md:16` explicitly instructs uploading `data.js` and labels it "your plan / meals /
supplements". Following that document publishes the medication data.

**Failure scenario.** The tree is pushed to a public repository and GitHub Pages is enabled.
`https://vkotzamanis.github.io/FixThisInjustice/data.js` is then world-readable, indexed by search
engines, and archived. Because the repository has no commits yet, this is still preventable; once
committed, the data persists in git history even if a later commit removes it.

**Impact.** Permanent, non-retractable disclosure of prescription drug use to any employer,
insurer, immigration authority, or search engine. Git history makes deletion ineffective.

**Fix.** Health content must not be a build-time constant in a public artifact. In the rewrite:
keep `PLAN` free of personal data — ship it as a neutral template, and load the subject profile,
schedule, medication, and supplement entries from the same validated localStorage state as the
logs, entered by the user at setup. If a seed file is genuinely wanted for local development, keep
it out of the deployed bundle and out of git (`.gitignore` plus a committed `data.example.js` with
placeholder values). If any part of this tree is ever committed, treat the medication lines as
requiring history rewrite, not a follow-up commit. Verify before the first push:
`git grep -nEi 'vyvanse|lisdexamfetamine|bf_pct' -- '*.js' '*.jsx'` must return nothing.

---

## H2 — One-click unconfirmed permanent data wipe (High)

`console-app.jsx:176-183`:

```jsx
<div className="foot">
  <span>// FTI · Console · daily companion · all data on this device</span>
  <span>
    <button onClick={() => { localStorage.removeItem("fti.console.v2"); location.reload(); }}>
      $ rm -rf logs/
    </button>
```

This button renders inside `<main>` on every view. It destroys all logged data on a single click:
no `confirm()`, no undo, no export prompt. The sibling `reset()` at `console-store.jsx:280-287`
does gate on `confirm()`, so the guard was understood and simply omitted here.

**Failure scenario.** A user on a phone scrolls to the bottom of the Today view — where the
footer sits directly below the content they were reading — and mis-taps. Twenty-four weeks of set
logs, weight check-ins, daily notes and the sealed time capsule are gone, irreversibly, with a
page reload as the only feedback.

**Impact compounds with the absence of framing protection.** GitHub Pages sends no
`X-Frame-Options`, and there is no `frame-ancestors` CSP (see M1), so any site can iframe this app.
A clickjacking overlay needs exactly one click on a known-position element to destroy the user's
data. There is no confirmation step to interrupt it.

The wipe is also incomplete: it removes only `fti.console.v2`, leaving `fti.plan.v1`
(`core.jsx:6`) and `fti.video.instance` (`console-video.jsx:30`) orphaned.

**Fix.** Delete this control. Destructive actions get a typed-confirmation dialog and an
automatic export beforehand, and they clear every key the app owns. Add `frame-ancestors 'none'`
to the CSP (M1) so the clickjacking path is closed regardless.

---

## H3 — Silent quota failure causes silent permanent data loss (High)

`console-store.jsx:49-51`:

```js
function saveV2(s) {
  try { localStorage.setItem(STORE_KEY_V2, JSON.stringify(s)); } catch (e) {}
}
```

The same empty catch appears at `core.jsx:16` and `console-video.jsx:64`. `console-views.jsx:611-619`
is the only write that surfaces an error, and only for the import path.

**Failure scenario.** localStorage is capped at roughly 5 MB per origin. State grows without
bound: `sets` gains a key per logged set (24 weeks × 7 days × ~6 exercises × 4 sets ≈ 4,000 entries),
`notes` gains an unbounded free-text entry per day, `water` one per day, `specimens` one per card,
and `timeCapsule` holds arbitrary user prose. On a shared `username.github.io` origin (M4) the
budget is shared with every other project the user hosts, so exhaustion can arrive far earlier than
this app's own growth predicts.

Once the quota is hit, `setItem` throws `QuotaExceededError`, the catch discards it, and
`saveV2` returns normally. React state has already updated, so the UI shows the set as logged, the
checkmark appears, the toast fires. Nothing is persisted. The user continues an entire training
session believing it is recorded. On the next reload, every entry since the quota was first hit is
gone, with no error ever shown.

**Impact.** Silent, unbounded, permanent loss of the exact data the application exists to keep.
The failure is invisible at the moment it occurs and only discovered later, when the cause is no
longer diagnosable by the user.

**Fix.** Never swallow a storage write error. Catch `QuotaExceededError` specifically, surface a
blocking banner ("changes are no longer being saved"), and offer immediate export. Instrument
storage size and warn at 80% of budget. For the rewrite, move persistence to IndexedDB via `idb`
— quota is orders of magnitude larger, writes are transactional and genuinely asynchronous, and
failures are reportable. Add a test that fills the quota and asserts the UI enters a visible
degraded state rather than reporting success.

---

## H4 — Date helpers mix UTC and local time (High)

`console-store.jsx:53-63`:

```js
const todayISO = () => new Date().toISOString().slice(0, 10);
function isoDaysBetween(a, b) {
  const da = new Date(a + "T00:00:00");   // parsed as LOCAL time
  const db = new Date(b + "T00:00:00");   // parsed as LOCAL time
  return Math.floor((db - da) / 86400000);
}
function isoOffset(iso, days) {
  const d = new Date(iso + "T00:00:00");  // LOCAL in
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);    // UTC out
}
```

Two distinct defects. `toISOString()` is UTC; `new Date("YYYY-MM-DDT00:00:00")` without an offset
is local per ECMA-262. `todayISO` and `isoOffset` therefore convert local dates through UTC, and
`isoDaysBetween` subtracts two local instants whose separation is not a whole number of days across
a DST transition.

Measured under Node, four timezones (`scratchpad/datecheck.js`):

```
TZ=Europe/Athens
  local 2026-09-02 00:30 -> todayISO returns 2026-09-01     (previous day)
  isoOffset('2026-09-02', 0) = 2026-09-01                   (identity is broken)
  isoDaysBetween(2026-03-28, 2026-03-30) = 1                (2 calendar days)
  isoDaysBetween(2026-01-05, 2026-06-22) = 167              (true elapsed 168)
TZ=America/New_York
  local 2026-09-02 23:30 -> todayISO returns 2026-09-03     (next day)
  isoDaysBetween(2026-03-07, 2026-03-09) = 1                (2 calendar days)
  isoDaysBetween(2026-01-05, 2026-06-22) = 167              (true elapsed 168)
TZ=UTC — all correct.
```

**Failure scenario, timezone.** In Athens (UTC+3 in summer) the user finishes a late session and
logs water at 00:30. `setWaterToday` (`console-store.jsx:262`) writes to `water["2026-09-01"]` —
yesterday's bucket, which is already full. The counter appears not to advance. The calendar day
rolls over at 03:00 local, not midnight. In New York the opposite: the day rolls at 20:00, so the
evening's notes and water land on tomorrow.

**Failure scenario, DST.** `programPosition` (`console-store.jsx:68-77`) derives the training day
from `isoDaysBetween(startDate, todayISO())`. A user starting 2026-01-05 in Athens crosses the EU
spring-forward on 2026-03-29. From that day on, `day_idx` is one lower than the true elapsed count
— permanently, for the remaining 20 weeks. `week` and `doW` (lines 74-75) shift with it, so the
app shows Push day when the user is due Pull, and the auto-sync at `console-store.jsx:122-133`
overwrites any manual correction whenever the view is `today` or `train`.

**Impact.** The program silently desynchronises from the calendar for every user not in UTC. The
streak counter (`console-store.jsx:328-351`), which walks backwards from `pos.day_idx`, breaks at
the same boundary. This corrupts training data rather than merely displaying it wrongly, and it
does so without any error.

**Fix.** Use a date library with explicit civil-date semantics — `date-fns` (`startOfDay`,
`differenceInCalendarDays`, `formatISO`) or the Temporal API via a polyfill (`Temporal.PlainDate`,
whose `until()` is exact and DST-free by construction). Never round-trip a civil date through
`toISOString`. Format local dates with `getFullYear`/`getMonth`/`getDate`, or `formatISO(d, {
representation: 'date' })`. Persist the user's IANA timezone at setup so the day boundary is
defined and stable. Test the three DST transitions and at least one UTC+ and one UTC- zone as
fixtures; the check is that `differenceInCalendarDays` returns 168 for a 168-day program in every
timezone.

---

## M1 — No Content-Security-Policy, and the architecture forbids a strict one (Medium)

`index.html` has no `<meta http-equiv="Content-Security-Policy">`. GitHub Pages sends no CSP
header and offers no way to configure one, so the meta tag is the only available mechanism.

The inline script at `index.html:14-21` requires `'unsafe-inline'` (or a hash/nonce) for
`script-src`. More fundamentally, `index.html:1498` loads `@babel/standalone`, and lines 1502-1512
load every application module as `type="text/babel"`. Babel compiles that JSX to JavaScript in the
browser and evaluates it, which requires `'unsafe-eval'`. A CSP containing `'unsafe-eval'` and
`'unsafe-inline'` provides essentially no script-injection protection, so this architecture cannot
be meaningfully secured by CSP at all — the defect is structural, not a missing tag.

The absence also means no `frame-ancestors` directive, which is what leaves H2's clickjacking path
open.

**Fix.** The Vite rewrite removes the cause: JSX is compiled at build time, so no `unsafe-eval` is
needed, and no inline script is needed if the service-worker registration moves into a module.
Ship a strict policy as a meta tag, since Pages cannot set headers:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  frame-src https://invidious.nerdvpn.de https://inv.nadeko.net;
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'none';
  object-src 'none'">
```

Note that `frame-ancestors` and sandbox directives are honoured in a meta tag by current browsers,
but `report-uri` is not. Self-host fonts (L1) so `font-src 'self'` holds. Enumerate the Invidious
hosts in `frame-src` explicitly rather than allowing `https:`.

---

## M2 — Third-party iframe with no sandbox, on hardcoded community hosts (Medium)

`console-video.jsx:106-116`:

```jsx
<iframe
  key={`${idx}-${reloadKey}`}
  src={embedUrl}
  title={title}
  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
  allowFullScreen
  referrerPolicy="no-referrer"
/>
```

`referrerPolicy="no-referrer"` is correct and the URL is not injectable — `embedUrl`
(`console-video.jsx:75-77`) interpolates `inst.host` from the hardcoded `INSTANCES` array and
`videoId`, which is gated by `YT_ID_RE = /^[A-Za-z0-9_-]{11}$/` at line 33 and tested at line 44.
The search path uses `encodeURIComponent` at lines 80-81. The `<a>` elements carry
`rel="noopener noreferrer"`. That part is sound.

The gap is `sandbox`. Without it the framed document runs with full privileges. A cross-origin
iframe can navigate the top-level browsing context when it has sticky user activation — which
playing a video supplies — so a compromised instance can replace the whole app with a phishing
page. It also receives the four permissions granted in `allow`.

The trust base is six community-run hosts hardcoded at `console-video.jsx:21-28`, including
hobbyist domains (`yt.chocolatemoo53.com`, `inv.thepixora.com`, `invidious.f5.si`). All six resolve
in DNS today (checked 2026-09-01), so nothing is currently abandoned. The structural risk is that
a lapsed registration can be re-registered by anyone, after which the new owner serves arbitrary
JavaScript inside the user's app with top-navigation capability, and the app will keep trying it
because the list is a compile-time constant.

**Fix.** Add `sandbox="allow-scripts allow-same-origin allow-presentation"` — omitting
`allow-top-navigation` and `allow-popups` — and keep `referrerPolicy="no-referrer"`. Pin the hosts
in `frame-src` (M1) so the browser enforces the allowlist independently of the array. Move the
instance list to runtime configuration so a compromised host can be dropped without a redeploy,
and prefer a single well-governed instance over rotating through six.

---

## M3 — Service worker caches cross-origin scripts unverified and fakes offline readiness (Medium)

`sw.js:31-38`:

```js
caches.open(CACHE_NAME).then((c) =>
  Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
).then(() => self.skipWaiting())
```

`sw.js:62-67`:

```js
const network = fetch(req).then((res) => {
  if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes("unpkg.com"))) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(req, copy));
  }
  return res;
})
```

Three defects.

**Swallowed install failures.** `c.add(u).catch(() => null)` means a failed fetch of any shell
entry — including the three unpkg scripts at `sw.js:26-28` — is discarded, install still resolves,
and `skipWaiting()` activates a service worker whose cache is incomplete. The app then advertises
offline support it does not have. When the user next opens it without a network, `caches.match`
misses, `fetch` rejects, `.catch(() => cached)` returns `undefined`, and `e.respondWith(undefined)`
produces a network error. React never loads: blank screen, offline, with no diagnostic. The comment
at line 34 states the intent ("so a single 404 doesn't kill the install"), but the cost is that a
broken install is indistinguishable from a good one.

**Unverified cross-origin caching.** Both `c.add()` at line 35 and `c.put()` at line 66 store
unpkg responses with no integrity check — the SRI hashes exist only on the `<script>` tags in
`index.html:1496-1498`, and `cache.add`/`fetch` do not consult them. The document's SRI check does
still run against whatever the service worker serves, so a poisoned cache entry cannot execute.
The consequence is instead a permanent hard failure: once a bad response is in the cache, every
subsequent load serves it, SRI rejects it, React never initialises, and the cache never self-heals
because `cached || network` at line 71 prefers the cached copy. Recovery requires bumping
`CACHE_NAME`, which the user cannot do.

**Stale exclusion.** `sw.js:58` skips URLs containing `piped.`. `grep -rn "piped"` over the whole
tree returns exactly one hit — that line itself. The app moved to Invidious
(`console-video.jsx:21-28`) and the guard was never updated, so third-party video navigations now
pass through `e.respondWith(fetch(req))` instead of going direct. Re-issuing a navigation request
this way changes redirect handling (navigation requests carry `redirect: "manual"`), which can
break instances that redirect on `/embed/`. I did not verify this in a browser; the stale guard
itself is certain, the downstream breakage is a mechanism I could not confirm without one.

Scope is `./` (`manifest.json:5-6`), which resolves to the repository subdirectory on a project
Pages site, so it does not reach sibling projects.

**Fix.** Use `vite-plugin-pwa` with Workbox rather than hand-rolling. Bundle React at build time
so there is no cross-origin script to cache and the SRI/cache interaction disappears. Let install
fail loudly when a precache entry fails — Workbox's precache manifest is content-hashed and
all-or-nothing by design. Use `StaleWhileRevalidate` with an explicit expiration policy for
same-origin assets and `NetworkOnly` for anything third-party, matched by origin rather than by
`String.includes`, which `piped.` and `unpkg.com` both rely on and which matches substrings
anywhere in the URL including the query string.

---

## M4 — Shared origin exposes localStorage to every other project (Medium)

Storage is keyed on `fti.console.v2` (`console-store.jsx:6`) at origin
`https://vkotzamanis.github.io`. Every GitHub Pages project site for one account shares that single
origin; the repository name is only a path prefix. The same-origin policy is defined on origin, not
path.

**Failure scenario.** The user publishes any second project to `vkotzamanis.github.io`. A page in
that project — or a script injected into it, or a third-party dependency it loads — reads
`localStorage.getItem("fti.console.v2")` and obtains the complete training log, daily notes, and
time capsule. Nothing in this app can prevent it. The same applies to the quota budget, which is
shared across all of them and feeds H3.

**Fix.** Host the rewrite on its own origin (a custom domain, or a dedicated
`<name>.github.io` user site) if the data is to stay in web storage. Note in the deployment
documentation that Pages project sites share an origin, so this is a hosting decision rather than
a code one. Moving to IndexedDB (H3) does not help — it is also origin-scoped.

---

## M5 — No schema version or migration; three uncoordinated storage keys (Medium)

`console-store.jsx:114-117`:

```js
const [s, setS] = useState(() => {
  const persisted = loadV2();
  return { ...defaultState(), ...(persisted || {}) };
});
```

The key name `fti.console.v2` encodes a version, but nothing reads it: there is no version field
inside the payload, no migration step, and no rejection of an unrecognised shape. The `v2` suffix
is documentation, not a mechanism. Spreading defaults under the persisted object supplies missing
keys but cannot correct a key whose *type* changed, which is what C1 exploits.

Three keys exist with no coordination: `fti.console.v2` (`console-store.jsx:6`), `fti.plan.v1`
(`core.jsx:6`, written by the `usePlanState` hook that `core.jsx` still exports), and
`fti.video.instance` (`console-video.jsx:30`). Import (`console-views.jsx:614`) writes only the
first; export (`console-views.jsx:709`) serialises only the first; the wipe button
(`console-app.jsx:179`) removes only the first. A restore therefore leaves stale data from the
other two keys in place, and the export is not a complete backup.

**Fix.** Put an explicit integer `schemaVersion` inside the payload. On load, validate against the
current schema; if the version is lower, run an ordered chain of pure migration functions, each
tested against a captured fixture of the previous shape; if it is higher, refuse to load and offer
export rather than silently downgrading. Consolidate to one key. Make export/import cover the
entire persisted surface and assert a round-trip property test: `import(export(state)) === state`.

---

## M6 — Primary set-log path accepts negative, unbounded, and infinite values (Medium)

`console-train.jsx:92-99`:

```js
const submit = () => {
  const wn = parseFloat(w), rn = parseInt(r, 10);
  if (!isNaN(wn) && !isNaN(rn)) {
    onLog({ weight: wn, reps: rn });
```

`!isNaN` is the only check, and the inputs at lines 127-135 carry no `min` or `max`. This is the
path that records every set — the application's primary data.

The other numeric inputs *are* bounded, and correctly: body weight is gated on
`lb > 100 && lb < 300` (`console-views.jsx:422,427` and `console-today-extras.jsx:147,152`), and
push-ups on `n > 0 && n < 200` (`console-train.jsx:432,437`) and `n >= 0 && n < 200`
(`console-today-extras.jsx:190`). Both NaN and Infinity fail those comparisons. The set-log path is
the outlier.

**Failure scenario.** Typing `-5` into weight and `-3` into reps stores `{weight: -5, reps: -3}`.
`makeCoachLine` (`console-store.jsx:10-40`) then compares against history — `weight > lastBest.weight`
is false, so it falls through to line 36 and emits "-5 kg × -3 · clean rep in target range".
`suggestedLoad` (line 252) will later propose `-2.5` kg. A value of `1e12` propagates into the same
comparisons and into the chart scaling.

Infinity cannot arrive through the UI (`<input type="number">` sanitises non-numeric text to `""`)
but arrives through import: `JSON.parse('{"weight":1e999}')` yields `Infinity`, confirmed. It then
reaches `core.jsx:92`, where `yAt(p.lb).toFixed(1)` produces the literal string `"Infinity"` and the
SVG `d` attribute becomes `"M 36.0 Infinity"`. React sets it, the browser rejects the path, and the
chart silently stops drawing with no error. `JSON.stringify` writes Infinity back out as `null`,
so a subsequent export/import cycle converts it to `null` and then to a different failure.

**Impact.** Physically impossible values enter the permanent record and drive the load-progression
logic that the user trains against. Charts fail silently rather than visibly.

**Fix.** Validate at the boundary with the same schema used for import (C1): weight a finite number
in a plausible range (say 0 < w ≤ 500 kg), reps a positive integer ≤ 100. Use `Number.isFinite`,
never `!isNaN` — `isNaN(Infinity)` is `false`, which is exactly the gap here. Add `min`, `max` and
`step` to the inputs so the browser blocks the common case, and reject rather than clamp so the
user sees what happened (see L6).

---

## M7 — `waterTarget` drives an unbounded render loop (Medium)

`console-views.jsx:199`:

```jsx
{Array.from({ length: s.waterTarget }, (_, i) => (
```

`s.waterTarget` defaults to 7 (`console-store.jsx:95`) and has no setter in the store, so the UI
cannot change it — but it is a persisted field, so import (C1) sets it freely.

**Failure scenario.** Import `{"waterTarget": 100000000}`. React attempts to construct one hundred
million elements on the Today view, which is the default view. The tab freezes and the renderer is
killed. This is not catchable: an `ErrorBoundary` intercepts throws, not a hang, and the value is
persisted, so every reload repeats it. Same end state as C1, by a different route.

**Fix.** Covered by schema validation (C1): bound `waterTarget` to a small integer range. As
defence in depth, clamp any state-derived loop bound at the render site — `Math.min(24,
Math.max(1, n))` — so no persisted value can drive an unbounded loop. The same applies to
`console-today-extras.jsx:178`, where `target` comes from `PLAN.pushup_progression[s.week - 1]` and
throws on an out-of-range `week`.

---

## M8 — Unauthenticated message listeners, wildcard postMessage, dev tooling in production (Medium)

`tweaks-panel.jsx:251-258`:

```js
const onMsg = (e) => {
  const t = e?.data?.type;
  if (t === '__activate_edit_mode') setOpen(true);
  else if (t === '__deactivate_edit_mode') setOpen(false);
};
window.addEventListener('message', onMsg);
window.parent.postMessage({ type: '__edit_mode_available' }, '*');
```

Neither this listener nor the one at `tweaks-panel.jsx:209-212` checks `e.origin` or `e.source`.
Both accept messages from any origin. Senders at lines 171, 220, 258 and 264 use `'*'` as the
target origin unconditionally.

The reachable effects are minor — open or close the tweaks panel, set a `railEnabled` flag — so
this is not a data-exfiltration path today. It matters for two reasons. First, `useTweaks` is
called by `App()` at `console-app.jsx:15`, so line 171 fires a wildcard `postMessage` to
`window.parent` on every tweak change; combined with the absent `frame-ancestors` (M1), a page that
frames the app receives them. Second, the payload is a design-tool protocol
(`__edit_mode_set_keys`, `deck-stage`, `omelette` feature flags) that has no role in a training
console.

`tweaks-panel.jsx` is 568 lines of development tooling, loaded in production at `index.html:1510`
and listed in `DEPLOY.md:29` as a file to upload. It also carries a second, competing tweak system:
`useTweaks` holds its state in React only, while `console-store.jsx:144` writes a parallel
`s.tweaks` object into persisted state that `App()` never reads — dead state that still consumes
quota (H3).

**Fix.** Do not ship the tweaks panel. If an equivalent is wanted in the rewrite, gate it behind
`import.meta.env.DEV` so it is tree-shaken out of the production bundle. Any `message` listener
that survives must check `e.origin` against an explicit allowlist as its first statement, and no
`postMessage` should use `'*'` — name the target origin. Delete the unused `s.tweaks` branch so
there is one source of truth.

---

## L1 — Google Fonts: no SRI, client IP disclosure, offline breakage (Low)

`index.html:22-24` preconnects to `fonts.googleapis.com`/`fonts.gstatic.com` and loads a
stylesheet from Google. Subresource Integrity cannot be applied — the CSS is generated per
user-agent, so its hash is not stable. Every load discloses the user's IP address and User-Agent to
Google, on an app whose stated premise is "all data on this device" (`console-app.jsx:177`). The
stylesheet is render-blocking and is not in the service worker's `SHELL` list (`sw.js:6-29`), so
the installed PWA falls back to system fonts offline. It also forces `style-src`/`font-src` to
allow a third party in any CSP (M1).

**Fix.** Self-host the two families with `@fontsource/jetbrains-mono` and `@fontsource/geist`,
which Vite fingerprints and bundles. `style-src 'self'; font-src 'self'` then holds, the fonts work
offline, and nothing is disclosed to Google.

## L2 — React development builds in production (Low)

`index.html:1496-1497` loads `react.development.js` and `react-dom.development.js`. These are
several times larger than the production builds, run development-only invariant checks on every
render, and emit verbose component-stack diagnostics to the console. The SRI hashes are correct and
the version is pinned, so the integrity posture is sound — this is the wrong artifact, not an
unverified one. Vite's production build resolves it automatically.

## L3 — No Referrer-Policy (Low)

`index.html` sets no `<meta name="referrer">`, and GitHub Pages sends no header, leaving the
browser default (`strict-origin-when-cross-origin` in current browsers — adequate, but unstated and
not enforced). The video iframe and its links set `referrerPolicy="no-referrer"` and
`rel="noopener noreferrer"` individually (`console-video.jsx:114,128,134`), which is correct.
Add `<meta name="referrer" content="no-referrer">` so the document-wide default is explicit.

## L4 — Service worker SKIP_WAITING handler validates nothing (Low)

`sw.js:40-44` calls `self.skipWaiting()` on any message with `type: "SKIP_WAITING"`, without
checking `event.origin` or `event.source`. Service worker clients are same-origin by definition and
the effect is limited to activating an already-installed worker, so exposure is small. In the
rewrite, check `event.source` is a controlled client and let `vite-plugin-pwa` own the update
prompt.

## L5 — DEPLOY.md is inverted against the current tree (Low)

`DEPLOY.md:16-38` lists `console.html` as "the app" to upload and renamed to `index.html`, and
lists `index.html` under "Do NOT upload — design canvas (dev only)". The brief states the opposite:
`index.html` is the live entry point and `console.html` is the stale duplicate. The two files differ
by 20 lines, and the divergence is the Invidious instance-rotation UI (`.vmod-instance`,
`.vmod-inst-*` styles) that `console-video.jsx:95-104` renders. Following this document ships the
stale shell, whose CSS does not cover the current video modal. `DEPLOY.md:16` also instructs
uploading `data.js`, which is the H1 disclosure path.

**Fix.** Delete `console.html` and rewrite or delete `DEPLOY.md`. In the Vite rewrite the deployed
artifact is `dist/`, produced by the build, so a hand-maintained file list stops existing.

## L6 — Invalid set submission fails silently (Low)

`console-train.jsx:92-99`: when `isNaN(wn) || isNaN(rn)`, `submit()` returns having done nothing.
The user presses LOG and receives no response — no message, no focus change, no styling. The same
silence applies to the range-gated inputs at `console-views.jsx:422` and `console-train.jsx:432`:
entering 95 kg where the gate is `lb > 100` discards the input without explanation. Surface a
validation message on rejection.

---

## Absent issue classes

Stated explicitly so the rewrite does not spend effort re-litigating them.

- **Cross-site scripting: absent.** `grep` for `dangerouslySetInnerHTML`, `innerHTML`,
  `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `srcdoc` and
  `javascript:` across all `.jsx`, `.js` and `.html` files returns zero hits in application code.
  Every user-controlled string — custom exercise names (`console-store.jsx:269-278`), daily notes
  (`console-store.jsx:263`), meal swaps (`console-store.jsx:264`), the time capsule
  (`console-fun.jsx:362`) — reaches the DOM only through JSX children, which React escapes. The
  time capsule renders as `<pre>{store.s.timeCapsule.note}</pre>`; a note containing
  `<img src=x onerror=alert(1)>` displays as literal text.
- **Prototype pollution: absent.** The import merge at `console-views.jsx:613` uses object spread,
  which copies own enumerable properties by `CreateDataProperty` (define semantics), not `Set`.
  Verified: importing `{"__proto__":{"polluted":"yes"}}` leaves `({}).polluted === undefined`. The
  `__proto__` key survives as an inert own property and round-trips through `JSON.stringify`.
  This is a property of the spread operator, not of any deliberate guard — `Object.assign` in the
  same position *would* reach the `__proto__` setter, so the rewrite must not substitute one for
  the other. C1 is a state-shape injection, not a pollution vector.
- **Tracking and telemetry: absent.** No analytics, beacons, error reporting, or WebSocket. The
  only `fetch` in the codebase is `sw.js:62`. The "telemetry" in `console-store.jsx:178` is a local
  toast-message generator, not network traffic.
- **Secrets: absent.** A scan for API keys, tokens, passwords, bearer credentials, AWS and GitHub
  key prefixes, and PEM blocks across all JS/JSX/HTML/JSON returns nothing. The sensitive data here
  is personal (H1), not credential.
- **URL injection in the video modal: absent.** `videoId` is gated by an 11-character
  `[A-Za-z0-9_-]` regex, hosts come from a compile-time array, and search terms pass through
  `encodeURIComponent`. The iframe's missing `sandbox` (M2) is a privilege problem, not an
  injection one.
- **Insecure transport: absent.** No `http://` URLs. GitHub Pages serves HTTPS with HSTS.

---

## Constraints for the rewrite

Enforceable rules, each tied to a finding above. "Enforceable" means a linter, type checker, test,
or CI step can fail the build when it is violated.

**Data validation**

1. Adopt a runtime schema validator (Zod or Valibot) and define one schema for persisted state.
   Every entry point into state — localStorage rehydration, file import, and paste-import — passes
   through `schema.safeParse`. No `as` cast, no spread of unvalidated data. (C1, M5, M6, M7)
2. Reject invalid state rather than coercing it. On failure, keep the last known-good state, show
   the validation error, and offer export. Never write unvalidated data to storage. (C1)
3. Bound every numeric field in the schema: weight `0 < w <= 500`, reps `1 <= r <= 100` integer,
   `week` 1–24, `day` 1–7, `waterTarget` 1–24. Use `Number.isFinite`, never `!isNaN`. (M6, M7)
4. Store an explicit `schemaVersion` integer inside the payload. Write an ordered migration chain
   with a captured fixture per version, and a test that every fixture migrates to the current
   schema. Refuse to load a version newer than the code. (M5)
5. Property test the round trip: `parse(serialize(state))` deep-equals `state`, over generated
   states. This catches the `Infinity → null` asymmetry in M6.

**Rendering and crash containment**

6. Mount an error boundary *above* the store provider, not only around views, so a store-level
   throw still renders a recovery UI capable of exporting and clearing state. (C1)
7. Never index a plan array with an unvalidated value. Selectors clamp first and return a typed
   default when a lookup misses. TypeScript `noUncheckedIndexedAccess: true` makes this a compile
   error rather than a convention. (C1, M7)
8. Clamp every state-derived loop bound at the render site. (M7)

**Storage**

9. Move persistence to IndexedDB via `idb`. Surface write failures — catch `QuotaExceededError`
   explicitly, show a blocking banner, offer export. No empty `catch` blocks around storage
   operations; enforce with an ESLint `no-empty` rule that has no `allowEmptyCatch` exemption. (H3)
10. One storage key, owned by one module. Export and import cover the entire persisted surface;
    the wipe path clears everything the app owns. (M5)
11. Destructive actions require typed confirmation and take an automatic export first. Delete the
    `$ rm -rf logs/` control outright. (H2)

**Dates**

12. Use `date-fns` or `Temporal` for all date arithmetic. Ban `toISOString()` on civil dates —
    an ESLint `no-restricted-syntax` rule on `CallExpression[callee.property.name='toISOString']`
    keeps it out. (H4)
13. Persist the user's IANA timezone at setup and derive the day boundary from it. (H4)
14. Test date logic against fixtures in at least `Europe/Athens`, `America/New_York` and `UTC`,
    covering both DST transitions. The assertion is that a 168-day program measures 168 days in
    every zone. (H4)

**Content Security Policy and headers**

15. Ship the strict CSP meta tag from M1. Because GitHub Pages cannot set headers, the meta tag is
    the enforcement point; `frame-ancestors 'none'` in it closes the clickjacking path. (M1, H2, M8)
16. No inline `<script>`, no `eval`, no `new Function`, no runtime JSX compilation. Vite makes this
    the default; verify it holds by checking the built `dist/index.html` in CI. (M1)
17. Add `<meta name="referrer" content="no-referrer">`. (L3)

**Third-party**

18. Bundle React and every dependency at build time. No CDN script tags, so no SRI to maintain and
    no cross-origin cache interaction. (M3, L2)
19. Self-host fonts via `@fontsource`. No `fonts.googleapis.com`. (L1)
20. Every third-party iframe carries `sandbox` without `allow-top-navigation` or `allow-popups`,
    plus `referrerPolicy="no-referrer"`, and its host is listed in `frame-src`. (M2)
21. Move the Invidious instance list to runtime configuration so a compromised host can be dropped
    without a redeploy. (M2)
22. Every `message` listener checks `e.origin` against an allowlist as its first statement. No
    `postMessage` uses `'*'`. (M8)

**Service worker**

23. Use `vite-plugin-pwa` (Workbox). Do not hand-write a service worker. Precaching is
    content-hashed and all-or-nothing; a failed precache must fail the install visibly. (M3)
24. Route by origin, not `String.includes`. Third-party requests are `NetworkOnly`. Same-origin
    assets get `StaleWhileRevalidate` with an explicit expiration policy. (M3)

**Personal data**

25. No health data in the source tree. `PLAN` ships as a neutral template; the subject profile,
    schedule, medication and supplement entries live in validated user state entered at setup.
    (H1)
26. Add a CI grep gate that fails on medication or biometric identifiers in tracked files:
    `git grep -nEi 'vyvanse|lisdexamfetamine|bf_pct|weight_kg' -- '*.ts' '*.tsx' '*.js' '*.json'`
    must return nothing. (H1)
27. Host on a dedicated origin if web storage holds health data — a GitHub Pages *project* site
    shares its origin with every other project on the account. Record this in the deploy doc as a
    hosting requirement, not a preference. (M4)

**Build hygiene**

28. Development tooling is gated behind `import.meta.env.DEV` so it is tree-shaken from production.
    (M8)
29. The deployed artifact is `dist/`, produced by the build. Delete `console.html` and the
    hand-maintained file list in `DEPLOY.md`. (L5)
30. Reject invalid input with a visible message. No silent no-op on a user-initiated action. (L6)

---

## What I did not check

- **No browser execution.** Every finding is from static reading plus Node reproductions of the
  extracted pure functions. I did not load the app in a browser, so I did not observe the C1 black
  screen, the M7 hang, or the H3 quota banner's absence at runtime. The logic that produces them is
  confirmed; the rendered outcome is inferred.
- **The M3 navigation-redirect claim is unverified.** That the `piped.` exclusion is stale is
  certain (one grep hit, in the guard itself). That routing Invidious iframe navigations through
  `e.respondWith(fetch(req))` breaks redirect handling is a mechanism I could not confirm without
  a browser, and I have not marked it as established.
- **No live HTTP requests.** I did not fetch the deployed site, the unpkg URLs, the Google Fonts
  stylesheet, or any Invidious instance. I did not verify the three SRI hashes at
  `index.html:1496-1498` against the actual files — they are correctly formed and pinned, but I did
  not recompute them. The only network operation I ran was DNS resolution of the six Invidious
  hostnames.
- **Files outside the stated scope.** `design-canvas.jsx` (47 KB), `prototype-almanac.html`,
  `prototype-console.html`, `prototype-protocol.html`, `PROJECT_SUMMARY.md`, `screenshots/` and
  `uploads/` were excluded from the review, though `uploads/` may warrant a separate check for
  personal data given H1. I read `console.html` only far enough to diff it against `index.html`.
- **Partial reads.** I read `console-shared.jsx`, `console-fun.jsx`, `console-train.jsx`,
  `console-today-extras.jsx` and `tweaks-panel.jsx` targeted at the sinks named in the brief
  (storage, numeric parsing, `postMessage`, render loops, XSS) rather than end to end. The
  codebase-wide greps covering those sink classes were exhaustive; a logic bug in an unread region
  that touches none of them would not have surfaced.
- **Not assessed:** dependency vulnerabilities in React 18.3.1 / Babel 7.29.0 (no advisory lookup
  performed); accessibility; the correctness of the training programme itself; `manifest.json`
  beyond scope and `start_url`; whether the six Invidious instances are currently trustworthy
  (only that all six resolve in DNS as of 2026-09-01, which says nothing about who controls them).
- **No threat model for a shared device.** localStorage is unencrypted and readable by anyone with
  the unlocked device or a filesystem copy of the browser profile. Whether that matters is a
  decision about the deployment context, not a code defect, so I did not raise it as a finding.

---

## Addendum, 2026-09-02: I4 is superseded

**I4 (Info, "No secrets, keys, or credentials (verified absent)") no longer holds.** It
described the legacy console, which had no server. The P5 reminders work gave the app one.

`AppState.pushDevice.secret` is 256 bits from the CSPRNG, base64url, 43 characters
(`src/domain/reminders/client.ts`). It is the bearer credential for `PUT` and
`DELETE /v1/devices/{id}` on the Cloudflare Worker: whoever holds it can overwrite or delete
that device's reminder schedule. It is persisted in the local document under `fti.v3`
alongside everything else, so this app now stores a credential, not only data.

Scope, and what changed:

- The secret authorises exactly one device's Worker record. It reads no data, reaches no
  other device, and grants nothing inside the app.
- **It is excluded from exports as of this commit.** `exportJson` in
  `src/store/persistence.ts` writes `"pushDevice": null`, so a document the user mails,
  syncs to cloud storage, or hands to someone helping them cannot be used against their
  Worker record. The live store and the browser's own `localStorage` copy keep the device;
  only the file projection drops it. Covered by `src/store/persistence.test.ts`,
  `src/ui/views/ExportView.test.tsx` and `src/store/reminderActions.test.ts`.
- It remains in `localStorage`, unencrypted and readable by anyone with the unlocked device
  or a copy of the browser profile. That is the shared-device threat the "Not assessed"
  section above already declined to raise as a finding, and nothing here changes it.

Residual, recorded in `docs/plans/2026-09-01-05-reminders.md`: an imported document can carry
`reminderSettings.enabled = true` with no device, which the panel reports as "Reminders are
on. Schedule not sent yet." until the user switches the toggle off and on.
