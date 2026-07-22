// Kitteltext Service Worker – offline-fähig ohne Server.
// Strategie: stale-while-revalidate für alles Gleiche-Ursprungs (GET).
// Nach dem ersten vollständigen Laden funktioniert die App offline; der Katalog
// ist Teil des JS-Bundles und damit mitgecacht.
const CACHE = "kitteltext-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add("./")));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const netz = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      // Navigationsanfragen: bei Offline auf App-Shell zurückfallen
      if (req.mode === "navigate") {
        return cached || netz || cache.match("./");
      }
      return cached || netz;
    }),
  );
});
