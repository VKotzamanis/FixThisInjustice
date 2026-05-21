// sw.js — minimal app-shell service worker.
// Caches everything once, serves from cache, falls back to network.
// Bump CACHE_NAME to force a refresh after a deploy.

const CACHE_NAME = "weight-console-v4";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./data.js",
  "./console-content.js",
  "./core.jsx",
  "./tweaks-panel.jsx",
  "./console-store.jsx",
  "./console-shared.jsx",
  "./console-train.jsx",
  "./console-views.jsx",
  "./console-today-extras.jsx",
  "./console-video.jsx",
  "./console-fun.jsx",
  "./console-app.jsx",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  // CDN deps — cached after first hit
  "https://unpkg.com/react@18.3.1/umd/react.development.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      // Add one-by-one so a single 404 doesn't kill the install.
      Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Never intercept the Piped video iframe — let it talk to the network directly.
  if (req.url.includes("piped.")) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        // Stash a copy if it's same-origin or a known CDN.
        if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes("unpkg.com"))) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      // Cache-first for shell; network refreshes in background.
      return cached || network;
    })
  );
});
