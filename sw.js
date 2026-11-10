/* SP2 Dåsekontrol – service worker
 *
 * NY VERSION: ret kun VERSION herunder (fx "1.0.1") og upload. Telefonen viser så
 * beskeden "Der er en ny version". Registreringer og billeder ligger i IndexedDB
 * og røres ALDRIG af service workeren. Tegninger ligger i deres egen cache
 * (DRAW_CACHE), som heller ikke slettes ved opdatering.
 */
const VERSION = "1.4.0";
const SHELL_CACHE = "sp2-app-" + VERSION;
const DRAW_CACHE = "sp2-tegninger-v1"; // skift kun navn hvis tegningerne udskiftes
const SHELL = [
  "./", "index.html", "style.css", "app.js", "data.js", "sync.js", "config.js", "manifest.webmanifest",
  "ikoner/icon-192.png", "ikoner/icon-512.png", "ikoner/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(async (u) => {
      const r = await fetch(new Request(u, { cache: "reload" }));
      if (!r.ok) throw new Error("Kunne ikke hente " + u);
      await c.put(u, r);
    }));
  })());
  // Ingen skipWaiting her: brugeren vælger selv "Opdater nu".
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      // Slet kun gamle app-filer. Tegnings-cachen bevares altid.
      if (k.startsWith("sp2-app-") && k !== SHELL_CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
  if (e.data === "version" && e.ports[0]) e.ports[0].postMessage(VERSION);
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes("/tegninger/")) {
    e.respondWith((async () => {
      const c = await caches.open(DRAW_CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(SHELL_CACHE);
    if (req.mode === "navigate") {
      return (await c.match("index.html")) || fetch(req);
    }
    const hit = await c.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
