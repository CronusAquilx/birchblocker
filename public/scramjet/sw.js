importScripts("/scramjet/controller.sw.js");
// Take over immediately so proxied game/site frames never fall through to the app (404).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if ($scramjetController.shouldRoute(event)) event.respondWith($scramjetController.route(event));
});
