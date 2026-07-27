// Minimal service worker — exists only to satisfy PWA installability
// requirements (Chrome on Android requires a registered service worker with
// a fetch handler before it will offer "Add to Home Screen"). Deliberately
// does NOT cache anything yet: this app is under active development, and a
// stale cached version being served instead of the real latest deploy would
// cause more harm than good right now. Every request passes straight through
// to the network, unchanged. Offline caching can be layered on top of this
// later, once the app itself is more settled.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
