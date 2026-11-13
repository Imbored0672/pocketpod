const CACHE = "pocketpod-shell-v1.1.1-aero-scroll-fix";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json", "./pocketpod-icon.svg", "./pocketpod-icon-180.png", "./pocketpod-icon-512.png"];
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(FILES);
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith("pocketpod-shell-") && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", response.clone());
        return response;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) { throw error; }
  })());
});
