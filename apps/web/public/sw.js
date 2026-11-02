// Retires the old offline service worker. The app no longer registers one, but a
// device that installed it (over HTTPS) keeps checking this URL for updates:
// this version clears its caches, unregisters itself and reloads open tabs.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
