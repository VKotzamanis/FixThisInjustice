# Runbook: reminders (Cloudflare Worker and Web Push)

Reminders need a server. No web API schedules a future local notification on its own, so
this app pushes from a Cloudflare Worker on a one minute cron. Deploying that Worker is a
one off operator task. Nothing in CI does it for you.

Run everything below from a machine with Node 22 and a browser. The repository root is the
working directory unless a step says otherwise.

The Worker stores three things per device: a random secret, a push subscription, and the
next three weeks of reminder instants. It stores no name, no body data, and no location.

Every claim about a limit or a command below names the file line or the `REFERENCES.md`
entry it came from.

## Who runs this, and when

Worker deploys are manual. `.github/workflows/ci.yml` typechecks and tests `worker/`, and
`.github/workflows/deploy.yml` publishes the client to GitHub Pages. Neither runs
`wrangler deploy`, and the repository holds no `CLOUDFLARE_API_TOKEN` secret.

That is deliberate. A deploy touches a KV namespace holding live push subscriptions, so a
person confirms each one. Run sections 1 to 10 once at setup. After that, run section 7
alone whenever `worker/src/` changes.

## 0. What you will end up with

| Thing | Where it lives | Public? |
| --- | --- | --- |
| Worker origin, such as `https://fti-reminders.<subdomain>.workers.dev` | GitHub repository variable `VITE_REMINDER_API` | yes |
| VAPID public key | GitHub repository variable `VITE_VAPID_PUBLIC_KEY`, and `worker/wrangler.toml` `[vars] VAPID_PUBLIC_KEY` | yes |
| VAPID private key, as a JWK JSON string | Cloudflare Worker secret `VAPID_PRIVATE_JWK` | no; never commit it |
| KV namespace id | `worker/wrangler.toml` `[[kv_namespaces]] id` | yes |
| Pages origin | `worker/wrangler.toml` `[vars] ALLOWED_ORIGIN` | yes |
| Your contact address | `worker/wrangler.toml` `[vars] ADMIN_CONTACT` | yes |

`worker/src/index.ts` lines 43 to 49 declare the variables the Worker reads at runtime:
`VAPID_PUBLIC_KEY`, `ALLOWED_ORIGIN`, and (through `PushEnv`) `ADMIN_CONTACT` and
`VAPID_PRIVATE_JWK`. Miss one and the Worker fails at the first request that needs it.

## 1. Create a free Cloudflare account

Open `https://dash.cloudflare.com/sign-up`. Sign up with an email address and a password.
The Workers Free plan needs no payment method. Confirm the address from the mail Cloudflare
sends.

## 2. Authenticate Wrangler

Every Wrangler command in this runbook runs from `worker/`. `worker/package.json` line 25
declares `wrangler` as `^4.128.0`, a caret range rather than a pin. What the lockfile resolves
it to is the pin: `worker/package-lock.json` gives 4.128.0, and that is the version installed
under `worker/node_modules/wrangler` and the version every `--help` line quoted below came
from. Wrangler is installed only in that package, so running it from the repository root makes
npx fetch a different version from the registry.

Change into the package once:

```bash
cd worker
```

Check which version answers there, before you trust a usage line quoted below:

```bash
npx wrangler --version
```

Log in:

```bash
npx wrangler login
```

A browser window opens and asks you to authorise Wrangler. Confirm that it worked:

```bash
npx wrangler whoami
```

Expect your account email and your account id.

## 3. Create the KV namespace

`worker/wrangler.toml` line 13 ships the placeholder `id = "REPLACE_WITH_KV_NAMESPACE_ID"`.
Replace it with a real namespace.

```bash
npx wrangler kv namespace create REMINDERS
```

The command prints a namespace id. Its usage line reads
`wrangler kv namespace create <namespace>`, quoted from its own `--help` output on the
installed 4.128.0. That help text also offers `--update-config`, which edits the Wrangler
configuration file for you. This runbook edits by hand so you can see the change.

Paste the id into `worker/wrangler.toml`, replacing the placeholder:

```toml
[[kv_namespaces]]
binding = "REMINDERS"
id = "<the id the command printed>"
```

Check that it took:

```bash
grep -n -A2 kv_namespaces wrangler.toml
```

The `id` line must no longer contain the word `REPLACE`. `wrangler deploy` fails loudly on
an invalid namespace id, so a surviving placeholder cannot reach production quietly.

## 4. Generate the VAPID key pair

```bash
npx @pushforge/builder vapid
```

That invocation is the tool's own documented form. `worker/node_modules/@pushforge/builder/dist/lib/commandLine/keys.js`
prints `Usage: npx @pushforge/builder <command>` and lists `vapid` as the only generating
command.

The command prints a public key, as a base64url string, and a private key, as a JWK JSON
object. Keep the terminal open. You need both in the next two steps.

Generate the pair once. Regenerating it invalidates every existing subscription, and every
device has to enable reminders again.

## 5. Store the private key as a Worker secret

```bash
npx wrangler secret put VAPID_PRIVATE_JWK
```

Paste the whole JWK JSON object on one line, braces included, then press Enter. The Worker
hands that string straight to `@pushforge/builder` (`worker/src/push.ts` line 68 passes
`privateJWK: env.VAPID_PRIVATE_JWK`), and the library accepts a JWK JSON string. Do not
reformat it.

The usage line reads `wrangler secret put <key>`, quoted from its own `--help` output on
the installed 4.128.0.

For local development, copy the example file instead:

```bash
cp .dev.vars.example .dev.vars
```

Edit `worker/.dev.vars` and paste the same JWK there. `worker/.gitignore` excludes it.
Never commit it.

## 6. Set the three plain variables

Edit `worker/wrangler.toml` and replace all three placeholders under `[vars]`:

```toml
[vars]
VAPID_PUBLIC_KEY = "<the public key from step 4>"
ADMIN_CONTACT = "mailto:<your email>"
ALLOWED_ORIGIN = "https://vkotzamanis.github.io"
```

`ADMIN_CONTACT` is the RFC 8292 contact the push service uses to reach you if your sender
misbehaves. `worker/src/push.ts` line 77 sends it on every push.

`ALLOWED_ORIGIN` is the exact scheme and host of the Pages site, with no trailing slash and
no path. `worker/src/index.ts` line 257 rejects any request whose `Origin` header differs
from it, and line 70 echoes it as `Access-Control-Allow-Origin`. A mismatch of one
character turns every browser call into a 403.

Confirm nothing is left:

```bash
grep -n REPLACE wrangler.toml
```

Expect no output.

## 7. Deploy the Worker

Return to the repository root. Sections 7, 8 and 13 run from there.

```bash
cd ..
```

Deploy:

```bash
npm --prefix worker run deploy
```

That script is `wrangler deploy` (`worker/package.json` line 15). The output ends with a
`https://fti-reminders.<subdomain>.workers.dev` URL and a line confirming the `* * * * *`
schedule from `worker/wrangler.toml` line 17. Write the URL down. Sections 8 and 9 need it.

## 8. Check the Worker is alive

```bash
curl -s https://fti-reminders.<subdomain>.workers.dev/v1/health
```

Expect `{"ok":true,"vapidPublicKey":"<the public key from step 4>"}`. `worker/src/index.ts`
line 264 builds that body.

Compare the key in the response against the one you generated in step 4. If they differ,
steps 4 and 6 disagree. Fix that before going further. A mismatched pair makes the push
service accept every push and deliver none.

Now watch a cron tick:

```bash
npm --prefix worker run tail
```

Within a minute you should see `tick devices=0 sent=0 failed=0 removed=0 writes=0`.
`worker/src/index.ts` lines 358 to 360 log it. Stop with Ctrl-C.

## 9. Set the two GitHub repository variables

Open **Settings**, then **Secrets and variables**, then **Actions**, then the **Variables**
tab, then **New repository variable**. Add both.

| Name | Value |
| --- | --- |
| `VITE_REMINDER_API` | the Worker origin from step 7, with no trailing slash |
| `VITE_VAPID_PUBLIC_KEY` | the public key from step 4 |

These are variables, not secrets. Both values are public by design. The browser calls the
Worker URL, and the push service is handed the VAPID public key.

`VITE_REMINDER_API` must be a bare origin. `build/cspPlugin.ts` fails the build on anything
else, and each rejection names its reason:

- a wildcard, line 57
- a scheme other than https, line 66
- credentials in the userinfo, line 71
- any path, query, fragment or trailing slash, lines 77 to 79

The build fails closed. With the variable unset, `connect-src` is `'self'` alone (line 52).
The page then ships a policy that cannot reach the Worker.

Both workflows now carry the pair at job level, `verify` in `.github/workflows/ci.yml` and
`build` in `.github/workflows/deploy.yml`. Job level matters. `scripts/check-dist-csp.sh`
line 35 reads `VITE_REMINDER_API` itself and asserts, at line 36, that the built
`connect-src` names exactly that origin. Scoped to the build step alone, the variable is
gone by the time that check runs, and the assertion passes without checking anything.

## 10. Redeploy Pages and verify the policy

Re-run the **Deploy to GitHub Pages** workflow. A build started before step 9 carries no
variables.

```bash
curl -s https://vkotzamanis.github.io/FixThisInjustice/ | grep -o "connect-src [^;]*"
```

Expect `connect-src 'self' https://fti-reminders.<subdomain>.workers.dev`. If it reads
`connect-src 'self'` alone, the build ran without `VITE_REMINDER_API`. Go back to step 9.

## 11. The free plan budget this Worker is designed for

Let `N` be the number of subscribed devices. The cron fires 1440 times a day
(`worker/wrangler.toml` line 17).

**KV reads.** Each tick reads `idx` once and each indexed device record once, so
`1440 * (1 + N)`. The free tier allows 100,000 reads a day (`REFERENCES.md` line 35). That
gives `N <= 68`.

`N` counts indexed devices, not people, and until the reaper shipped it only ever grew. A
record whose reminders have all fired is never pushed to. The push service therefore never
answers 410, and nothing deleted it. Such a record went on costing 1,440 reads a day and
holding one of the 100 slots for the life of the namespace. `worker/src/index.ts` line 345
now deletes it on the hourly reconcile tick, once it has gone `INERT_DEVICE_TTL_MS` without a
`PUT` (14 days, `worker/src/schedule.ts` line 84; the test is `isInert` at line 338). `N`
therefore tracks the devices that are still syncing, and this budget holds over years rather
than over the first fortnight.

**KV list requests.** The tick reconciles `idx` against the real key list only at minute 0
of the hour, so 24 list requests a day. The free tier allows 1,000. `REFERENCES.md` line
630 records that list requests are counted separately from reads. 24 is 2.4 percent of the
quota. `worker/src/index.ts` lines 186 to 196 state that arithmetic, and line 197
implements it. Reconciling every tick would need 1,440 list requests and exceed the quota
by 44 percent.

**KV writes.** Take 10 devices with 3 reminders each per day, so 30 instants.

- Sending writes the record once per tick that sent anything (`worker/src/index.ts` lines
  372 to 374). At most 30 writes. Reminders that fire in the same minute share one write.
- Pruning an expired instant writes the record once more, on a later tick. At most 30
  writes. See `worker/src/schedule.ts` lines 371 to 377, gated by `pruneDelta` at
  `worker/src/index.ts` line 372.
- A client sync writes the record once. At most 10 writes a day at one sync per device.
- `idx` is written only when a tick removed a device or the reconcile found an orphan
  (`worker/src/index.ts` lines 382 to 384). Zero in steady state, at most 24 a day. A reap
  removes a device, so it lands in this bullet, not in a new one.

That totals 70 writes a day in steady state, and at most 94 in the worst case. The cap is
1,000 a day (`REFERENCES.md` line 35). Writes are not the binding constraint.

**KV deletes.** The free plan allows 1,000 a day (`REFERENCES.md` line 629). Three things
delete a device record: a 404 or 410 from the push service, a value that cannot be parsed,
and the reaper. Only the reaper has a bound worth stating. It runs on the 24 reconcile ticks,
never on the other 1,416, and it deletes a given record once. That record can only return
through a `PUT`, and a `PUT` stamps `lastSyncedAt`, which puts the device another 14 days
away from being reapable. At the 100 device cap the worst single day is therefore 100
deletes, 10 percent of the quota, and that day can happen only once. The sustained rate is
`100 / 14`, about 7 deletes a day.

**Subrequests are the binding constraint.** The free plan allows 50 subrequests per
invocation. One tick issues `1 + N` KV reads, up to `N` KV writes, and one `fetch` per due
push. That is roughly `N <= 20` devices before a tick can trip the limit. The Workers limits
page gives `50/request` on the free plan against `10,000` on paid, quoted from its own
Subrequests table and recorded at `REFERENCES.md` line 645. It is also platform fact 6 of
`docs/plans/2026-09-01-05-reminders.md`. Watch this number, not the daily quotas.

**Not verified.** Whether Cron Trigger invocations consume the 100,000 requests a day quota.
The limits page separates the daily request cap from the cron section and never joins them
(`REFERENCES.md` line 645, re-read 2026-09-02). At 1,440 ticks a day the Worker stays inside
the cap either way.

The Worker also caps itself:

- 100 devices, `worker/src/index.ts` line 62. It answers 503 past that.
- 200 reminders per device, `worker/src/schedule.ts` line 46.
- A 64 KiB request body, `worker/src/index.ts` line 70.

## 12. Enable reminders on the phone

The panel is `src/ui/components/ReminderSettingsPanel.tsx`, mounted by Settings as one row.
What it offers is decided by one call, `pushAvailability()` in
`src/domain/reminders/client.ts` line 83, which reads the runtime's features. Nothing in the
panel or the client parses a user-agent string, so the app never tells a user their browser
cannot do something it can. Whether the page is running as an installed app is detected the
same way: `isInstalledPwa()` at line 61 reads the `(display-mode: standalone)` media query,
falling back to the older `navigator.standalone` flag.

`pushAvailability()` returns one of three values.

| Value | The runtime it describes | What the panel shows |
| --- | --- | --- |
| `ready` | `serviceWorker`, `PushManager` and `Notification` all present | the status line and the **Enable reminders** toggle; once reminders are on, also the day-of time and the lead time checkboxes |
| `needs-install` | service workers present, `PushManager` absent, and the page is not an installed app | the status line and the install guide, and no toggle: subscribing cannot succeed, so a switch would lead nowhere |
| `unsupported` | anything else | the status line alone |

The status line carries exactly one of seven strings. They are the `status.reminders*` keys in
`src/content/copy.ts`:

- `Reminders are not set up on this deployment.`
- `This browser cannot receive push notifications.`
- `Add this app to the Home Screen first.`
- `Notifications are blocked. Allow them in your browser site settings.`
- `Reminders are off.`
- `Reminders are on. Schedule not sent yet.`
- `Reminders are on. Schedule last sent at {time}.`

The last is a template. `{time}` is a wall clock in the PROFILE's timezone, never UTC and
never the phone's zone, so the reported time does not move when the user travels.

**iPhone and iPad, iOS 18.4 or later.** Install first, then enable. These four steps are the
ones the in-app install guide gives (`src/ui/components/InstallGuide.tsx`).

1. Open `https://vkotzamanis.github.io/FixThisInjustice/` in Safari.
2. Tap Share, the square with an upward arrow.
3. Scroll down, tap **Add to Home Screen**, then tap **Add**.
4. Open the app from the Home Screen icon.
5. Go to **Settings**, then **Reminders**, and turn on **Enable reminders**.
6. Allow notifications when the system asks.

Steps 1 to 4 are not optional on iOS. Safari delivers Web Push only to a web app installed on
the Home Screen, from iOS 16.4 (`REFERENCES.md` line 5). This app sets its floor at iOS 18.4
for a separate reason: Screen Wake Lock inside an installed web app was broken until that
release (platform fact 2 of `docs/plans/2026-09-01-05-reminders.md`), and the training screen
uses it.

**Android, Chrome.** Enable directly. Chrome receives push in a tab, so installing is
optional.

1. Open `https://vkotzamanis.github.io/FixThisInjustice/` in Chrome.
2. Go to **Settings**, then **Reminders**, and turn on **Enable reminders**.
3. Allow notifications when the system asks.

The in-app guide also gives Android install steps (open the browser menu, tap **Install app**,
then open it from the home screen icon). It shows them because a user reaches the guide from a
runtime that reported `needs-install`, and that user should not have to work out which half of
the page applies to the phone in their hand.

## 13. Smoke test on a phone

Do this on the phone that will actually use the app. Complete section 12 first.

1. In **Settings**, then **Availability**, add a slot on today's weekday starting five
   minutes from now.
2. Set the lead times to include 30 minutes before, so a lead instant also lands in the
   window.
3. Return to the Reminders panel. The last sent time should update within a few seconds.
4. On a laptop, confirm the Worker received it:

   ```bash
   npm --prefix worker run tail
   ```

   Expect a tick line reading `devices=1`.
5. Lock the phone and wait. The notification must arrive within about a minute of the
   instant.
6. Tap the notification. The app opens, or comes to the front, on the Today view.
7. Confirm it arrives exactly once, with no repeat on the following minutes.

Record the outcome in section 16, so a later regression has a baseline to compare against.

## 14. Troubleshooting

| Symptom | Likely cause | Check | Fix |
| --- | --- | --- | --- |
| `wrangler deploy` fails on an invalid namespace id | step 3 not applied | `grep -n REPLACE worker/wrangler.toml` | paste the real id from `npx wrangler kv namespace create REMINDERS` |
| `/v1/health` returns a key you do not recognise | `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_JWK` came from different runs of step 4 | compare the two | regenerate the pair, redo steps 5, 6 and 9; every device must enable again |
| Settings shows `Reminders are not configured in this build.` | the Pages build had no `VITE_REMINDER_API` or no `VITE_VAPID_PUBLIC_KEY` | `curl` the page and grep `connect-src` | add the repository variables (step 9) and re-run the deploy workflow |
| Settings shows `Add this app to the Home Screen first.` on iPhone | running in a Safari tab | look for the browser chrome | install to the Home Screen and reopen from the icon |
| Settings shows `This browser cannot receive push notifications.` | no service worker or no Push API | open the same page in another browser | use Safari on iOS 18.4 or later, or Chrome on Android |
| Enabling does nothing and the status stays `Reminders are off.` | the permission prompt was dismissed, not granted | the site's notification permission in browser or system settings | reset that permission and try again |
| Status stays `Reminders are on. Schedule not sent yet.` | the `PUT` failed | the browser devtools network tab, and `npm --prefix worker run tail` | a CSP `connect-src` violation means step 9 was skipped; a 403 means `ALLOWED_ORIGIN` does not match the Pages origin exactly |
| `PUT` returns 400 | an instant outside `[now - 1 h, now + 21 d]`, more than 200 instants, or a duplicate key | the JSON error body names the failing reminder index | usually a wrong device clock; check the phone's time and time zone |
| `PUT` returns 403 | the device id exists under a different secret | none | turn reminders off and on again, which mints a new device |
| `PUT` returns 413 | a request body over 64 KiB | `worker/src/index.ts` line 70 | reduce the number of reminders; 200 instants fit well inside the cap |
| `PUT` returns 503 | the device index is at the 100 device cap | `worker/src/index.ts` line 62 | wait for the hourly reaper, clear a device by hand (below), or raise the cap and redeploy |
| The tick logs `devices=1` but no notification arrives | the push was accepted and not displayed | `npm --prefix worker run tail` for a `push rejected: status=` line | 404 or 410 means the subscription died, so enable reminders again; 429 is rate limiting, and the next tick retries |
| The notification arrives more than once | two device records for one browser | `npm --prefix worker run tail` for two `devices=` entries | turn reminders off, wait for a tick reporting `devices=0`, then turn them on |
| `wrangler tail` shows `Exceeded CPU limit` | more due pushes in one tick than the free plan's 10 ms CPU allows | count devices | stagger the day of reminder time across devices, or move to the paid plan |
| Nothing appears in `wrangler tail` for minutes | the cron is not registered | `grep -n -A2 triggers worker/wrangler.toml` | confirm the file has `crons = ["* * * * *"]`, then redeploy |

### Clearing a device by hand

The cap is 100 devices, and a device that stopped syncing clears itself. The reaper deletes
any record with nothing left to send, once that record has gone 14 days without a `PUT`, on
the next tick at minute 0 of the hour. Do this by hand only when a 503 will not wait that
long, or when one device must be forgotten now.

Run both commands from `worker/`.

List what the namespace holds:

```bash
npx wrangler kv key list --binding REMINDERS --prefix dev: --remote
```

`--binding` reads "The binding name to the namespace to list" and `--prefix` reads "A prefix
to filter listed keys", both quoted from `npx wrangler kv key list --help` on the installed
4.128.0. The output is a JSON array, one object per key. The `dev:` prefix is what keeps
`idx` out of it: `idx` is the index, not a device.

Neither `--local` nor `--remote` carries a default in 4.128.0, and the two conflict, so name
the one you mean. `--remote` reads "Interact with remote storage": that is the deployed
namespace.

Delete one device:

```bash
npx wrangler kv key delete "dev:0f9b1a2c-3d4e-4f50-8a1b-2c3d4e5f6071" --binding REMINDERS --remote
```

The usage line reads `wrangler kv key delete <key>`, and `--binding` reads "The binding name
to the namespace to delete from", both quoted from `npx wrangler kv key delete --help`.

Leave `idx` alone. The next tick reads the deleted key, finds nothing, and drops the id from
`idx` in the write it was already making (`worker/src/index.ts` lines 382 to 384). Editing
the index by hand buys nothing and risks dropping a device that a concurrent `PUT` had just
added.

Deleting a record does not ban the device. Its next sync recreates it, because a `PUT` for an
unknown id is a create. To make the removal stick, switch reminders off on that phone first:
that deletes the record and drops the browser subscription in one step.

## 15. Rolling back

```bash
cd worker
```

```bash
npx wrangler rollback
```

The usage line reads `wrangler rollback [version-id]`, quoted from its own `--help` output
on the installed 4.128.0. Omit the id to roll back to the previous version.

Reminders stop arriving. Nothing else in the app is affected, because every other feature
runs offline against local state.

## 16. Smoke test log

| Date | Device | OS and browser | Arrival delay | Notes |
| --- | --- | --- | --- | --- |
| | | | | |
