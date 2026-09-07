const BASE = self.location.pathname.replace(/service-worker\.js$/, "");
const CACHE = "infosec-english-v6";
const APP_SHELL = [BASE, `${BASE}manifest.json`, `${BASE}icon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("infosec-english-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // A cached inventory hides newly published MP3s even when the app requests no-store.
  if (url.origin === self.location.origin && url.pathname === `${BASE}audio/manifest.json`) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: "no-store" });
        if (!response.ok) throw new Error("Audio inventory unavailable");
        const manifest = await response.clone().json();
        if (manifest.version !== 1 || !manifest.items) throw new Error("Invalid audio inventory");
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
        return response;
      } catch {
        return await caches.match(event.request) || new Response("Audio inventory unavailable", { status: 503 });
      }
    })());
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(BASE))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(BASE))));
});
