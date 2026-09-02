# Deploy cutover

The one-off checklist that publishes the rewritten app at
`https://vkotzamanis.github.io/FixThisInjustice/`, and the rollback if it goes wrong. Run it
once. Every later deploy is a push to `main` and nothing else.

`https://<owner>.github.io/FixThisInjustice/` is what `base` in `vite.config.ts` and
`start_url` in the web app manifest assume. Renaming the repository means changing all three.

## 0. Before you start

Confirm the push target:

```bash
git remote -v
```

Expect `origin` pointing at the GitHub repository. It was unset when this note was written on
2026-09-02, so add it before step 4 if `git remote -v` still prints nothing.

Reminders are optional. Steps 2 and 3 are skipped if you do not want them, and the build
succeeds without them. Everything else in the app runs offline against local state.

## 1. Set the Pages source

**Settings**, then **Pages**, then **Build and deployment**, then **Source: GitHub Actions**.
Not "Deploy from a branch".

Without this, `actions/deploy-pages` fails with `Error: Failed to create deployment
(status: 404)` and nothing is published.

This also stops the branch-based build that served the old console. Read the rollback section
below before you change it, because switching the source is the step that is hard to undo.

## 2. Set the two repository variables

Only if you want reminders. **Settings**, then **Secrets and variables**, then **Actions**,
then the **Variables** tab.

| Variable | Value |
| --- | --- |
| `VITE_REMINDER_API` | the Worker origin, a bare origin with no trailing slash |
| `VITE_VAPID_PUBLIC_KEY` | the VAPID public key |

Both come from `docs/RUNBOOK-reminders.md` section 9, which is also where the exact format
rules are. `build/cspPlugin.ts` fails the build on a value that is not a bare origin.

Without the variables the build still succeeds. It falls closed to `connect-src 'self'` and
Settings shows `Reminders are not configured in this build.`

## 3. Deploy the Worker

Only if you want reminders, and before step 4 so the origin exists when the site is built.
`docs/RUNBOOK-reminders.md` sections 1 to 8 cover the account, `wrangler login`, the KV
namespace, the VAPID key pair, the secret, the plain variables and the health check. The
deploy itself is one command from the repository root:

```bash
npm --prefix worker run deploy
```

## 4. Push

```bash
git push origin main
```

Both workflows trigger on a push to `main`. `deploy.yml` also accepts a manual
`workflow_dispatch` run.

Watch the Actions tab. Expect `CI` green, including the step that prints
`legacy gate: clean`, and `Deploy to GitHub Pages` green with a deployment URL.

## 5. Check the published site

Open the URL in a desktop browser. In the console:

```js
navigator.serviceWorker.getRegistrations().then((rs) =>
  console.log(rs.map((r) => ({ scope: r.scope, script: r.active && r.active.scriptURL }))),
);
caches.keys().then(console.log);
```

Expect one registration whose scope ends in `/FixThisInjustice/`, and a cache name containing
`workbox-precache`. The old console's cache was `weight-console-v5`. If that name is still
listed, the old worker is still in control: close every tab for the origin and reopen. If it
survives that, unregister it once from the same console and reload.

```js
navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
```

## 6. First open on a phone that has the old app

Open the deployed URL in the phone's browser, not in the installed old app. Then add it to the
Home Screen and open it from the icon.

The import offer is a panel above the app, not a route and not a modal. It appears only when
four things hold together, which `src/ui/migration/MigrationGate.tsx` states:

- the legacy document `fti.console.v2` is on this device;
- the decision is still `pending`, so no earlier import or dismissal has closed it;
- a profile exists, because every migrated record is keyed by a profile id;
- a plan exists, because the migration matches legacy days against its sessions.

The last two are why the offer usually appears on the second open. Complete the setup wizard
first, then reopen the app.

Then, in the panel:

1. Answer the load unit question. It is never defaulted, because the old store held a bare
   number. The wrong answer rescales the whole load history by the pound to kilogram factor.
2. Check the body mass unit. It defaults to pounds, with the evidence shown, and can be
   overruled.
3. Read the report. The set count must match what the old app logged. Its Export view printed
   `Sets logged: N`, and the skipped list names every refused record with a reason.
4. Type `IMPORT` to commit. Nothing is written before that word, and the legacy keys are left
   untouched by the import itself.

**The export the wizard requires comes next, and only at the delete.** The download button
writes one bundle holding all three legacy keys as raw text: `fti.console.v2`, `fti.plan.v1`
and `fti.video.instance` (`readLegacyBundle` in `src/store/persistence.ts`). Save that file off
the phone. `ConfirmDestructive` enables the delete only after the download has happened in the
same dialog, and it then asks you to type `DELETE`.

Nothing forces you to delete. A user who never presses it keeps the old keys indefinitely.

## Rollback

**The site.** Open Actions, then `Deploy to GitHub Pages`, then the last successful run from
before the cutover, then **Re-run all jobs**. A re-run checks out that run's commit, so it
rebuilds and republishes that version. Reverting the commit and pushing does the same thing
with a longer history.

That restores an earlier *Actions* deployment. It does not restore the hand-uploaded,
branch-based site that served the old console, because step 1 changed the Pages source. To get
that back, set **Source** to **Deploy from a branch** again and point it at the branch that
holds the old files. The old tree itself is not lost: it is in git history, at the parent of
the commit that deleted `legacy/`.

**The Worker.** `npx wrangler rollback` from `worker/`, per `docs/RUNBOOK-reminders.md`
section 15. Reminders stop arriving and nothing else changes.

**The data.** The legacy keys survive the whole cutover. They are removed only when the user
runs the delete in step 6, so until then the old console can read its own data unchanged.

## Known risk, carried deliberately

A GitHub Pages *project* site shares its origin with every other project published under the
same `github.io` account, so this app's storage is reachable from any other page on that
origin (security review M4, master plan section 9). The README repeats it. A custom domain or
a dedicated user site closes it.
