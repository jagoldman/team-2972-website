// Service worker for the public site and the portal (the same file is served on both hosts).
//
// What it does, and nothing more:
//   - keeps styles, scripts, fonts, icons and placeholder images, so the site opens fast and works offline;
//   - shows /offline.html when a page is requested while offline.
// What it never does: store a page. Every HTML page, /me.json, /apps.json, the sign-in and sign-out addresses,
// published content and anything else not listed below goes straight to the network, untouched. The portal's pages
// and /me.json hold a person's name and groups, so they must never sit in a cache.
// Signing out clears every cache (js/components.js asks for it; see "clear-caches" below).
//
// Change VERSION when this file's rules or the precached list change. Old caches are deleted on activate.

const VERSION = "v11";  // v11: a file is stored only when it is the server's own 200 of the right type, not redirected,
                       //      and not no-store or private (also for the precached files)
                       // v10: the two branches of release 8.3 together: v9 (the public site) and the portal's kit 0.5.0 font
                       //      (the shell kit's Archivo under /shell/fonts/: precached and stored); nothing else changes
                       // v9: the hero blur's mask is fully opaque over the face (D193): photo files renamed b1 -> b2
                       // v8: a face blurred at the owner's request in the hero photo (D193): new photo file names; no stored file may outlive it
                       // v7: the public site is design 8.2, light only (css/site.css, Big Shoulders and Libre Franklin)
                       // v6: /today.json and /today/ (the portal home's cards, release 8.1.5) are named in NEVER_STORE
                       // v5: the public site is Midnight & brass, dark only (new stylesheet and scripts; public pages no longer carry the theme script)
                       // v4: offline.html's theme script only reads the choice (never writes the shared cookie)
                       // v3: offline.html has the shell kit's theme script (one site-wide cookie, also on editor.)
                       // v2: styles and scripts come from the network first (an old copy no longer outlives a deploy)
const CACHE = `2972-static-${VERSION}`;     // every cache this worker makes starts with "2972-"
const OFFLINE_URL = "/offline.html";

// Fetched when the worker is installed (best effort, except the offline page itself)
const PRECACHE = [
  OFFLINE_URL,
  "/css/style.css",
  "/css/site.css",
  "/fonts/big-shoulders-latin.woff2",
  "/fonts/libre-franklin-latin.woff2",
  "/fonts/inter-latin.woff2",
  "/fonts/bricolage-grotesque-latin.woff2",
  "/shell/fonts/archivo-latin-var.woff2",
  "/pwa-icons/site/icon.svg",
];

// Only files that are the same for everyone may be stored: a path under one of these folders AND a file type below.
const STATIC_FOLDERS = ["/css/", "/js/", "/fonts/", "/shell/fonts/", "/pwa-icons/", "/assets/"];
const STATIC_TYPES = /\.(?:css|js|woff2|png|svg|webp|ico)$/i;
const CODE_TYPES = /\.(?:css|js)$/i;        // network first; see the fetch handler
// Never stored, even if a path above would match.
const NEVER_STORE = [
  /^\/me\.json$/, /^\/apps\.json$/,            // who is signed in, and what they may open
  /^\/today\.json$/, /^\/today\//,             // the portal home's cards and its Done (one person's own)
  /^\/outpost\.goauthentik\.io\//,             // sign-in and sign-out
  /^\/content\//, /^\/media\//,                // published content
  /^\/config\.js$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/healthz$/,
  /^\/portal\//,                               // the portal's own pages
];

function storable(url) {
  const p = url.pathname;
  if (NEVER_STORE.some((re) => re.test(p))) return false;
  return STATIC_FOLDERS.some((f) => p.startsWith(f)) && STATIC_TYPES.test(p);
}

// What may be stored (review item 5): only the server's own 200 for exactly this address (not the end of a redirect),
// of the type the address names, and not marked no-store or private. The same rule for the precached files.
const TYPE_OF = {
  css: /^text\/css\b/i,
  js: /^(?:text|application)\/(?:x-)?javascript\b/i,
  woff2: /^(?:font\/woff2|application\/font-woff2)\b/i,
  png: /^image\/png\b/i,
  svg: /^image\/svg\+xml\b/i,
  webp: /^image\/webp\b/i,
  ico: /^image\/(?:x-icon|vnd\.microsoft\.icon)\b/i,
  html: /^text\/html\b/i,                     // the offline page only (pages are never stored otherwise)
};
function keepable(path, response) {
  if (!response || response.redirected || !response.ok || response.status !== 200 || response.type !== "basic") return false;
  const ext = ((path.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
  const want = TYPE_OF[ext];
  if (!want || !want.test(response.headers.get("content-type") || "")) return false;
  return !/(?:^|[\s,])(?:no-store|private)(?:$|[\s,=])/i.test(response.headers.get("cache-control") || "");
}
// Fetches one file for the cache and stores it only when it may be kept; otherwise it fails (install's offline page
// must be kept; every other file is best effort).
async function precache(cache, path) {
  const response = await fetch(new Request(path, { cache: "reload" }));
  if (!keepable(path, response)) throw new Error(`not stored: ${path}`);
  await cache.put(path, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await precache(cache, OFFLINE_URL);
    await Promise.all(PRECACHE.slice(1).map((u) => precache(cache, u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("2972-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;                              // never touch a form post or any write
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                   // outside links: the browser's own rules

  // A page: always from the network. Only if that fails, the offline page. The page itself is never stored.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
    return;
  }

  if (!storable(url)) return;                                        // /me.json, /apps.json and the rest: not handled at all

  // Styles and scripts: from the network, so they always match the page (which is never cached), and the
  // stored copy only when offline. Their addresses never change between deploys, so a cache-first copy
  // would show new pages with old styles until a second visit.
  if (CODE_TYPES.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        // "no-cache" revalidates with the server (a 304 is cheap), so the browser's own HTTP cache cannot
        // hand back an old copy either: the container sends these files with no Cache-Control.
        const response = await fetch(request, { cache: "no-cache" });
        if (keepable(url.pathname, response)) cache.put(request, response.clone());
        return response;
      } catch (err) {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  // Any other shared file (fonts, icons, images): answer from the cache if there is a copy, and refresh the
  // copy in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request).then((response) => {
      if (keepable(url.pathname, response)) cache.put(request, response.clone());
      return response;
    });
    if (cached) { refresh.catch(() => {}); return cached; }
    return refresh;
  })());
});

// "clear-caches": delete everything this worker has stored (sent when someone signs out), then put back only the
// public offline page and styles, which hold nothing about anyone.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "clear-caches") return;
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("2972-")).map((n) => caches.delete(n)));
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map((u) => precache(cache, u).catch(() => {})));
  })());
});
