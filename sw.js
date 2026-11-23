/* TUSI service worker. Keeps the app working offline. It only caches the app's own files.
   Your numbers live in IndexedDB on this device and are never touched here. */
"use strict";
const VERSION = "1.0.1";
const CACHE = "tusi-app-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "app.css",
  "engine.js",
  "store.js",
  "backup.js",
  "app.js",
  "outfit-latin.woff2",
  "manrope-latin.woff2",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tusi-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    /* The app page opens from the cache, so it starts offline. Other pages, like the test page, go to the network. */
    const scope = new URL(self.registration.scope).pathname;
    const isApp = url.pathname === scope || url.pathname === scope + "index.html";
    const shell = () => caches.open(CACHE).then((c) => c.match("index.html"));
    event.respondWith(isApp ? shell().then((hit) => hit || fetch(req)) : fetch(req).catch(shell));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
