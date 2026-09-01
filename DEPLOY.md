# Publish your FTI Console as a phone app

No terminal. No git CLI. Everything below is done from your **browser**.

You'll end up with a URL like `fti-console.netlify.app` (or `yourname.github.io/fti`) that you install on your phone with one tap.

---

## What you're publishing — the file list

You only need **19 files** — the original core plus the new fun-mechanics modules. Everything else is scratch work and should NOT be uploaded.

> **Updating an existing deploy?** If you've published before, you only need to re-upload the files that **changed** since last time. GitHub's web upload preserves files you don't touch; on Netlify a fresh drag-and-drop replaces everything (safe — your **data lives on the phone**, not the server).

### ✅ Upload these

```
console.html              ← the app
data.js                   ← your plan / meals / supplements
core.jsx                  ← shared logic
console-store.jsx         ← state + persistence
console-shared.jsx        ← chrome / charts / spotlight
console-views.jsx         ← Today / Plan / Log / Protocols / Export + Import
console-train.jsx         ← workout mode (auto-advance inputs, bonus sets)
console-content.js        ← form cues + specimen card library
console-fun.jsx           ← Atlas, capsule, drops, toasts, error boundary, PWA toast
console-app.jsx           ← root <App /> component (must load last)
console-today-extras.jsx  ← schedule + meals + nutrition on Today
console-video.jsx         ← inline form-video modal
tweaks-panel.jsx          ← Tweaks panel
manifest.json             ← PWA metadata
sw.js                     ← service worker (offline)
icon-192.png              ← home-screen icon
icon-512.png              ← splash icon
icon-maskable-512.png     ← Android adaptive icon
```

### ❌ Do NOT upload

```
index.html                ← design canvas (dev only)
design-canvas.jsx         ← canvas component (dev only)
prototype-*.html          ← early drafts
.design-canvas.state.json ← canvas layout cache
screenshots/              ← internal review images
DEPLOY.md                 ← this file
```

### One small rename before you upload

The web expects the homepage to be called `index.html`. Rename **`console.html` → `index.html`** at upload time so visiting the bare URL opens the app.

> If you forget, the app still works — the URL just becomes `your-site/console.html` instead of `your-site/`.

---

## Troubleshooting: black screen after deploying

Symptom: tab title shows "FTI · Console" but the page is solid black.

Cause: a `.jsx` file failed to load (404 or wrong path). Locally, files load instantly; on a web host with network latency, a missing file is fatal because `App` references components that never get defined.

Fix:
1. Open the deployed URL in a desktop browser.
2. Press **F12** → **Network** tab → reload the page.
3. Look for any row in red / status `404`. That's the missing file. Re-upload it.

99% of the time it's because **one file got skipped during upload**, or **the upload list is missing a file** (the upload list above is the canonical 16). Make sure all 16 are present in the repo / Netlify deploy.

---

## Path A — Netlify drag-and-drop (2 minutes, recommended)

This is the fastest possible route. No account required to start, no Git, no commits.

1. **In this project**, download just the files above as a folder.
   - Easiest: select them all in the file tree, right-click → download as zip, then unzip on your computer.
   - Rename `console.html` → `index.html` inside the unzipped folder.

2. Open **<https://app.netlify.com/drop>** in your browser.

3. Drag the folder onto the page.

4. Wait ~10 seconds. You'll get a URL like `https://amazing-curie-1234ab.netlify.app`.

5. (Optional) Click **Site settings → Change site name** → pick something like `fti-console`. Your URL becomes `https://fti-console.netlify.app`.

6. (Optional) Make a free Netlify account so the site sticks around forever. Otherwise it expires in 24h.

### Updating later

Just drag the folder onto the **same site's Deploys page** (`Deploys` tab in your Netlify dashboard). Old deploy is replaced. Done.

---

## Path B — GitHub Pages from the browser (10 minutes, version history)

Use this if you want every change tracked. **No `git` install needed** — GitHub's web UI handles everything.

### One-time setup

1. **Create the repo.**
   - Go to <https://github.com/new>.
   - Name it `fti-console` (or whatever). Public is fine. **Do not** add a README or .gitignore — empty repo.
   - Click **Create repository**.

2. **Upload the files.**
   - On the empty repo page, click the **"uploading an existing file"** link.
   - Drag the 15 files (with `console.html` renamed to `index.html`) onto the upload box. Wait for them to upload.
   - Scroll down, type `initial deploy` in the commit message, click **Commit changes**.

3. **Turn on Pages.**
   - In the repo, click **Settings → Pages** (left sidebar).
   - Under **Source**, pick **Deploy from a branch**.
   - Branch: `main`, folder: `/ (root)`. Click **Save**.
   - Wait ~1 minute. Refresh the page. You'll see:
     > Your site is live at `https://yourname.github.io/fti-console/`

That URL is your app.

### Updating later

All from the browser:

1. Open the file you want to edit on github.com (e.g. `data.js`).
2. Click the pencil icon (✏️) top-right.
3. Make changes. Scroll down → **Commit changes**.
4. Wait ~30 seconds for Pages to rebuild. Refresh your phone.

To upload a **new** file, on any folder page click **Add file → Upload files**.

To replace several files at once: **Add file → Upload files**, drag the new versions on top, commit. GitHub overwrites by name.

---

## Install on your phone

Once your URL works in a browser:

### Android (Chrome / Brave / Firefox)
1. Open the URL.
2. Tap menu (⋮) → **Install app** (or **Add to Home Screen**).
3. Tap the new home-screen icon. Boots fullscreen, no browser chrome.

### iOS (Safari only)
1. Open the URL.
2. Tap Share (□↑) → **Add to Home Screen**.
3. Tap home-screen icon.

The first launch downloads the service worker. After that, it works fully offline — sets, logs, timer, charts. The only thing that needs the internet is the inline video player.

---

## When you change something

1. Edit + upload via your method above (Netlify drag, or GitHub web edit).
2. Open the app on your phone.
3. **Close it fully and reopen.** The service worker auto-detects the new version and swaps in.
4. If you don't see the change after 30s: in the browser go to your URL, pull-to-refresh once, then close. The PWA picks up the fresh cache on next open.

> Cache-busting tip: if the change *really* won't appear, bump the `CACHE` constant at the top of `sw.js` (e.g. `fti-v1` → `fti-v2`) and re-upload. Forces every install to re-fetch.

---

## Backups — your data is per-device

The app stores everything in **localStorage on the phone you're using**. Nothing syncs.

To back up:

1. Open the app.
2. Go to **Export** (nav item 6, or press `6`).
3. Click **DOWNLOAD .json**. Save the file in Drive / iCloud / wherever.

To restore on a new phone, paste the JSON into your browser DevTools console:

```js
localStorage.setItem("fti.console.v2", JSON.stringify(/* paste the JSON contents here */));
```

Then reload the app. Everything's back.

> If you want true cross-device sync later, the next iteration would be a tiny serverless function backed by a free tier of Supabase or a $1/month VPS. Not needed for daily personal use.

---

## My pick

**Netlify drag-and-drop.** You're publishing for one user (you), iterating informally, and you don't need a public commit history of "added 5 lb to bench, week 4." Drag the folder, get the URL, install on phone — done in 2 minutes.

Use **GitHub Pages** if you want a permanent URL tied to your account, an audit trail of every plan tweak, or to occasionally edit the plan from a desktop browser without re-uploading.

Either way, the app on your phone is identical.
