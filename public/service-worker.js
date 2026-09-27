const BASE = self.location.pathname.replace(/service-worker\.js$/, "");
const CACHE = "infosec-english-v7";
const OFFLINE_AUDIO = "infosec-commute-audio-v1";
const APP_SHELL = [BASE, `${BASE}manifest.json`, `${BASE}icon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    // The first visit loads JS before the worker takes control. Cache bundled
    // entry assets explicitly so the first course download also works offline.
    const html = await (await cache.match(BASE)).text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
      .map(match => new URL(match[1], self.location.origin + BASE))
      .filter(url => url.origin === self.location.origin).map(url => url.href);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("infosec-english-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // User-downloaded audio survives app updates. Safari requests byte ranges,
  // including while offline, so return an actual partial response when needed.
  if (url.origin === self.location.origin && url.pathname.startsWith(`${BASE}audio/commuting-segments/`)) {
    event.respondWith((async () => {
      const cache = await caches.open(OFFLINE_AUDIO);
      const saved = await cache.match(event.request.url);
      if (saved) return rangeResponse(saved, event.request.headers.get("range"));
      try { return await fetch(event.request); }
      catch { return new Response("Audio unavailable offline", { status: 503 }); }
    })());
    return;
  }
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
    if (response.ok && response.status !== 206 && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(BASE))));
});

async function rangeResponse(response, range) {
  if (!range) return response;
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid = () => new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return invalid();
  return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}`,
  } });
}
