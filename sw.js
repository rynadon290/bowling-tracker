// The minimum Chrome will accept for a real installed PWA icon.
//
// Chrome's Android installability check requires a registered service
// worker with a fetch handler -- without one, "Add to Home Screen"
// silently degrades to a plain bookmark shortcut with a generic icon,
// rather than a real installed app using the manifest's icon. That's
// almost certainly why the manifest fix alone didn't produce an icon.
//
// This is deliberately NOT a real offline/caching strategy. A fetch
// handler that intercepts everything and gets the caching wrong can
// serve stale app code indefinitely -- worse than no service worker at
// all. So it does the one thing required (exists, listens for fetch)
// and otherwise gets out of the way: every request just goes to the
// network, same as if this file didn't exist.
//
// Real offline support -- caching the app shell, working at the lanes
// with no signal -- is a separate, deliberate project. This unblocks
// installability today without pretending to be that project.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
