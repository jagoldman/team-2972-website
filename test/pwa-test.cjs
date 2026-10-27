// The installable-app pieces, without a browser:
//   - the icon pack (files, pixel sizes, transparent or opaque corners, glyph inside the maskable safe zone)
//   - both web app manifests (site and portal)
//   - every page's <head> (manifest, icons, iOS tags, theme colours)
//   - the offline page
//   - the service worker: it must NEVER store a page, /me.json, /apps.json or anything else about a person
//   - the Caddy routes that make these files public on the portal host too
// Run: node test/pwa-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const exists = (f) => fs.existsSync(path.join(root, f));
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); } else { failed++; console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`); }
}

// ---------- a small PNG reader (8-bit RGB or RGBA, no interlacing), enough to look at pixels ----------
function decodePng(buf) {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const ch = type === 6 ? 4 : 3, stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, ch, px: (x, y) => { const i = (y * width + x) * ch; return [out[i], out[i + 1], out[i + 2], ch === 4 ? out[i + 3] : 255]; } };
}

// ---------- the icon pack ----------
const APPS = ["site", "portal", "tasks", "admin", "kickoff"];
const FILES = { "icon.svg": null, "icon-192.png": 192, "icon-512.png": 512, "maskable-512.png": 512, "apple-touch-icon.png": 180 };
const hashes = new Map();
for (const app of APPS) {
  for (const [file, size] of Object.entries(FILES)) {
    const rel = `pwa-icons/${app}/${file}`;
    check(`${rel} exists`, exists(rel));
    if (!exists(rel)) continue;
    if (!size) {
      const svg = read(rel);
      check(`${rel} is a plain SVG square (viewBox 0 0 512 512, no script or embedded image)`, /^<svg [^>]*viewBox="0 0 512 512"/.test(svg) && !/<script|<image|onload=|href="http/i.test(svg));
      continue;
    }
    let img;
    try { img = decodePng(fs.readFileSync(path.join(root, rel))); } catch (e) { check(`${rel} decodes`, false, e.message); continue; }
    check(`${rel} is ${size} x ${size} pixels`, img.width === size && img.height === size, `${img.width}x${img.height}`);
    const corner = img.px(0, 0), edge = img.px(size >> 1, 2);
    if (file === "icon-192.png" || file === "icon-512.png") {
      check(`${rel}: rounded corners are transparent`, corner[3] === 0, `corner alpha ${corner[3]}`);
      check(`${rel}: the body is opaque`, edge[3] > 250 || img.px(size >> 1, 8)[3] > 250);
    } else {
      check(`${rel}: full-bleed, the corner is opaque`, corner[3] === 255 && img.px(size - 1, size - 1)[3] === 255, `corner alpha ${corner[3]}`);
    }
    // the gold glyph must stay inside the safe zone: the inner 80% circle for maskable, a margin for the others
    const limit = (file === "maskable-512.png" ? 0.4 : 0.46) * size;
    let gold = 0, far = 0, farAt = "";
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const [r, g, b, a] = img.px(x, y);
      if (a > 200 && r > 190 && g > 140 && b < 110) {
        gold++;
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
        if (d > far) { far = d; farAt = `${x},${y}`; }
      }
    }
    check(`${rel}: has a gold glyph`, gold > size * size * 0.02, `${gold} gold pixels`);
    check(`${rel}: the glyph stays inside the ${file === "maskable-512.png" ? "maskable safe zone" : "icon margin"}`, far <= limit, `farthest gold pixel ${far.toFixed(0)} from the centre at ${farAt}, limit ${limit.toFixed(0)}`);
    if (file === "icon-512.png") hashes.set(app, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex"));
  }
}
check("every app has a different glyph (no two 512 icons are the same)", new Set(hashes.values()).size === APPS.length);
check("pwa-icons/README.md explains the pack", exists("pwa-icons/README.md") && /apple-touch-icon\.png/.test(read("pwa-icons/README.md")));
check("the icons are tracked, not ignored (they are not photos)", /!\/pwa-icons\/\*\*\/\*\.png/.test(read(".gitignore")));

// ---------- manifests ----------
const MANIFESTS = { "manifest.webmanifest": { app: "site", name: "Team 2972 Gears & Buccaneers", short: "Team 2972" }, "portal/manifest.webmanifest": { app: "portal", name: "Team 2972 Portal", short: "2972 Portal" } };
for (const [file, want] of Object.entries(MANIFESTS)) {
  let m;
  try { m = JSON.parse(read(file)); check(`${file} is valid JSON`, true); } catch (e) { check(`${file} is valid JSON`, false, e.message); continue; }
  check(`${file}: name and short_name`, m.name === want.name && m.short_name === want.short && m.short_name.length <= 12, `${m.name} / ${m.short_name}`);
  check(`${file}: starts at / and covers the whole site`, m.start_url === "/" && m.scope === "/" && m.id === "/");
  check(`${file}: standalone display`, m.display === "standalone");
  check(`${file}: dark default colours`, m.background_color === "#07090f" && m.theme_color === "#07090f");
  check(`${file}: has a language and a description`, m.lang === "en" && typeof m.description === "string" && m.description.length > 10);
  const icons = m.icons || [];
  const has = (size, purpose) => icons.some((i) => i.sizes === size && i.purpose === purpose && i.type === "image/png");
  check(`${file}: 192 and 512 icons for "any" and a 512 "maskable" icon`, has("192x192", "any") && has("512x512", "any") && has("512x512", "maskable"));
  check(`${file}: an SVG icon too`, icons.some((i) => i.type === "image/svg+xml" && i.sizes === "any"));
  check(`${file}: every icon is the ${want.app} icon and the file exists with the declared size`, icons.every((i) => {
    const rel = i.src.replace(/^\//, "");
    if (!i.src.startsWith(`/pwa-icons/${want.app}/`) || !exists(rel)) return false;
    if (i.type !== "image/png") return true;
    const d = decodePng(fs.readFileSync(path.join(root, rel)));
    return i.sizes === `${d.width}x${d.height}`;
  }));
}
check("the site and portal manifests have different names", JSON.parse(read("manifest.webmanifest")).name !== JSON.parse(read("portal/manifest.webmanifest")).name);

// ---------- every page's <head> ----------
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html")).concat(["portal/index.html", "portal/install.html"]);
for (const page of pages) {
  const html = read(page), head = html.slice(0, html.indexOf("</head>"));
  const portal = page.startsWith("portal/");
  const app = portal ? "portal" : "site";
  if (page === "offline.html") continue;
  check(`${page}: links the manifest`, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/.test(head));
  check(`${page}: favicon and Apple touch icon are the ${app} icons, and the files exist`, head.includes(`href="/pwa-icons/${app}/icon.svg"`) && head.includes(`href="/pwa-icons/${app}/apple-touch-icon.png"`) && exists(`pwa-icons/${app}/apple-touch-icon.png`));
  check(`${page}: installable-app tags for Android and iOS`, /name="mobile-web-app-capable"/.test(head) && /name="apple-mobile-web-app-capable"/.test(head) && new RegExp(`apple-mobile-web-app-title" content="${portal ? "2972 Portal" : "Team 2972"}"`).test(head));
  check(`${page}: theme colours for light and dark`, /name="theme-color" content="#f6f3ea" media="\(prefers-color-scheme: light\)"/.test(head) && /name="theme-color" content="#07090f" media="\(prefers-color-scheme: dark\)"/.test(head));
}

// ---------- the offline page ----------
const offline = read("offline.html");
check("offline.html is themed (theme snippet, stylesheet, color-scheme)", /localStorage\.getItem\("theme"\)/.test(offline) && /href="\/css\/style\.css"/.test(offline) && /name="color-scheme"/.test(offline));
check("offline.html needs nothing that is not stored offline (no content.js, config.js, loader)", !/content\.js|config\.js|components\.js|content-loader/.test(offline.replace(/<!--[\s\S]*?-->/g, "")));
check("offline.html is friendly: says offline, offers Try again and a way home", /You're offline/.test(offline) && /Try again/.test(offline) && /href="\/"/.test(offline));
check("offline.html is kept out of search results", /name="robots" content="noindex"/.test(offline));

// ---------- the service worker ----------
const swSource = read("sw.js");
function makeWorker({ fetchImpl }) {
  const listeners = {};
  const store = new Map();                                        // cache name -> Map(url -> Response)
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return { async put(req, res) { m.set(new URL(typeof req === "string" ? req : req.url, "https://site.example").pathname, res); },
               async add(req) { const r = typeof req === "string" ? new Request("https://site.example" + req) : req; const res = await fetchImpl(r); if (!res.ok) throw new Error("bad response " + res.status); m.set(new URL(r.url).pathname, res); },
               async match(req) { return m.get(new URL(typeof req === "string" ? req : req.url, "https://site.example").pathname); } };
    },
    async keys() { return [...store.keys()]; },
    async delete(name) { return store.delete(name); },
    async match(req) { const p = new URL(typeof req === "string" ? req : req.url, "https://site.example").pathname; for (const m of store.values()) if (m.has(p)) return m.get(p); return undefined; },
  };
  const self = { location: new URL("https://site.example/sw.js"), addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  // In a real worker, new Request("/offline.html") resolves against the worker's own address; Node needs it spelled out.
  class WorkerRequest extends Request { constructor(u, o) { super(typeof u === "string" && u.startsWith("/") ? "https://site.example" + u : u, o); } }
  const ctx = { self, caches, fetch: fetchImpl, Request: WorkerRequest, Response, URL, Promise, console };
  vm.createContext(ctx);
  vm.runInContext(swSource, ctx, { filename: "sw.js" });
  const pathsStored = () => [...store.values()].flatMap((m) => [...m.keys()]);
  return {
    store, pathsStored,
    async dispatch(type, extra) {
      const waits = [];
      const ev = { waitUntil: (p) => waits.push(p), ...extra };
      listeners[type](ev);
      await Promise.all(waits);
      return ev;
    },
    async request(url, { mode = "no-cors", method = "GET" } = {}) {
      const req = new Request(url, { method });
      Object.defineProperty(req, "mode", { value: mode });
      let handled = false, response;
      const ev = { request: req, respondWith: (p) => { handled = true; response = Promise.resolve(p); } };
      listeners.fetch(ev);
      return { handled, response: handled ? await response.catch((e) => e) : undefined };
    },
  };
}
const basic = (body, status = 200) => { const r = new Response(body, { status }); Object.defineProperty(r, "type", { value: "basic" }); return r; };
const okNetwork = async () => basic("from the network");

(async () => {
  // install and activate
  let w = makeWorker({ fetchImpl: okNetwork });
  await w.dispatch("install");
  check("install stores the offline page and the shared styles, fonts and icon", ["/offline.html", "/css/style.css", "/fonts/inter-latin.woff2", "/fonts/bricolage-grotesque-latin.woff2", "/pwa-icons/site/icon.svg"].every((p) => w.pathsStored().includes(p)));
  check("the cache name is versioned", [...w.store.keys()].every((n) => /^2972-static-v\d+$/.test(n)));
  w = makeWorker({ fetchImpl: async (r) => (new URL(r.url).pathname === "/css/style.css" ? basic("x", 404) : okNetwork()) });
  let ok = true; try { await w.dispatch("install"); } catch (e) { ok = false; }
  check("install still succeeds when a nice-to-have file is missing", ok && w.pathsStored().includes("/offline.html"));
  w = makeWorker({ fetchImpl: async (r) => (new URL(r.url).pathname === "/offline.html" ? basic("x", 404) : okNetwork()) });
  ok = true; try { await w.dispatch("install"); } catch (e) { ok = false; }
  check("install fails if the offline page itself cannot be fetched", !ok);

  w = makeWorker({ fetchImpl: okNetwork });
  await (await caches_open(w, "2972-static-v0")).add("/offline.html");
  await (await caches_open(w, "somebody-elses-cache")).add("/x.css");
  await w.dispatch("install");
  await w.dispatch("activate");
  check("activate deletes this worker's old caches", !w.store.has("2972-static-v0"));
  check("activate leaves other caches alone", w.store.has("somebody-elses-cache"));
  check("activate keeps the current cache", [...w.store.keys()].some((n) => /^2972-static-v\d+$/.test(n) && n !== "2972-static-v0"));

  // fetch rules
  const origin = "https://site.example";
  w = makeWorker({ fetchImpl: okNetwork });
  await w.dispatch("install");
  const before = w.pathsStored().length;
  for (const p of ["/", "/about.html", "/robots.html", "/robot.html?year=2025", "/portal/index.html"]) {
    const r = await w.request(origin + p, { mode: "navigate" });
    check(`page ${p}: answered from the network`, r.handled && (await r.response.text()) === "from the network");
  }
  check("no page was stored", w.pathsStored().length === before && !w.pathsStored().some((p) => /\.html$/.test(p) && p !== "/offline.html" || p === "/"));
  const down = makeWorker({ fetchImpl: async (r) => { if (new URL(r.url).pathname === "/offline.html") return basic("OFFLINE PAGE"); throw new TypeError("offline"); } });
  await down.dispatch("install");
  const off = await down.request(origin + "/portal/", { mode: "navigate" });
  check("a page asked for while offline shows the offline page", off.handled && (await off.response.text()) === "OFFLINE PAGE");

  const SHARED = ["/css/style.css", "/js/components.js", "/js/content.js", "/fonts/inter-latin.woff2", "/pwa-icons/portal/icon-192.png", "/pwa-icons/site/icon.svg", "/assets/placeholder-robot.svg"];
  for (const p of SHARED) {
    const x = makeWorker({ fetchImpl: okNetwork });
    const r = await x.request(origin + p);
    await new Promise((res) => setTimeout(res, 10));
    check(`shared file ${p}: handled and stored`, r.handled && x.pathsStored().includes(p));
  }
  const NEVER = ["/me.json", "/apps.json", "/outpost.goauthentik.io/sign_out", "/outpost.goauthentik.io/start", "/content/content.json", "/media/00000000000000000001-400.webp",
    "/config.js", "/sw.js", "/manifest.webmanifest", "/healthz", "/portal/index.html", "/portal/manifest.webmanifest", "/random.json",
    "/css/../me.json", "/js/../apps.json", "/css/app.json", "/js/x.json", "/css/x.html", "/fonts/..%2fme.json", "/ME.JSON", "/me.json?x=1", "/apps.json?v=2"];
  for (const p of NEVER) {
    const x = makeWorker({ fetchImpl: okNetwork });
    const r = await x.request(origin + p);
    await new Promise((res) => setTimeout(res, 10));
    check(`${p}: not handled and not stored`, !r.handled && x.pathsStored().length === 0, `handled=${r.handled}, stored=${x.pathsStored()}`);
  }
  {
    const x = makeWorker({ fetchImpl: okNetwork });
    const post = await x.request(origin + "/css/style.css", { method: "POST" });
    const other = await x.request("https://other.example/css/style.css");
    check("a POST is never touched", !post.handled);
    check("another site's files are never touched", !other.handled);
    const bad = makeWorker({ fetchImpl: async () => basic("nope", 404) });
    await bad.request(origin + "/css/style.css"); await new Promise((r) => setTimeout(r, 10));
    check("an error response is never stored", !bad.pathsStored().includes("/css/style.css"));
    const redirect = makeWorker({ fetchImpl: async () => { const r = new Response("x"); Object.defineProperty(r, "type", { value: "opaqueredirect" }); return r; } });
    await redirect.request(origin + "/css/style.css"); await new Promise((r) => setTimeout(r, 10));
    check("a redirected or opaque response is never stored", !redirect.pathsStored().includes("/css/style.css"));
  }
  check("the precache list holds no personal path", !/me\.json|apps\.json|outpost|portal\//.test(swSource.slice(swSource.indexOf("const PRECACHE"), swSource.indexOf("];", swSource.indexOf("const PRECACHE")))));

  // sign-out: clear everything, put back only the public files
  const c = makeWorker({ fetchImpl: okNetwork });
  await c.dispatch("install");
  await c.request(origin + "/js/components.js"); await c.request(origin + "/assets/placeholder-robot.svg"); await new Promise((r) => setTimeout(r, 10));
  check("(before sign-out) extra shared files are stored", c.pathsStored().includes("/js/components.js"));
  await c.dispatch("message", { data: { type: "clear-caches" } });
  check("clear-caches removes everything that was stored", !c.pathsStored().includes("/js/components.js") && !c.pathsStored().includes("/assets/placeholder-robot.svg"));
  check("clear-caches puts back only the public offline files", c.pathsStored().includes("/offline.html") && c.pathsStored().length <= 5);
  const n = c.pathsStored().length;
  await c.dispatch("message", { data: { type: "something-else" } });
  check("other messages do nothing", c.pathsStored().length === n);

  // components.js: sign-out links clear the caches first
  const comp = read("js/components.js");
  check("the sign-out link is marked data-signout in the portal header and page", /class="nav-login" data-signout>Sign out/.test(comp) && /id="sign-out" data-signout/.test(read("portal/index.html")));
  check("a click on a sign-out link clears the caches before going on, but never waits more than a second", /Promise\.race\(\[clearOfflineCaches\(\), new Promise\(\(r\) => setTimeout\(r, 1000\)\)\]\)/.test(comp) && /n\.startsWith\("2972-"\)/.test(comp) && /type: "clear-caches"/.test(comp));
  check("the service worker is only registered where browsers allow it (https or localhost)", /location\.protocol === "https:" \|\| \/\^\(localhost\|127/.test(comp));

  // Caddy: public on the portal host too, before the gate; only the exact icon files
  const caddy = read("container/Caddyfile");
  const portalBlock = caddy.slice(caddy.indexOf("handle @portal_host {"), caddy.indexOf("# ---- Public hosts"));
  check("portal host: the PWA files come before the gate (so they need no secret)", portalBlock.indexOf("import pwa_public") > 0 && portalBlock.indexOf("import pwa_public") < portalBlock.indexOf("import gate") && portalBlock.indexOf("/manifest.webmanifest") < portalBlock.indexOf("import gate"));
  check("portal host: its manifest is portal/manifest.webmanifest", /rewrite \* \/portal\/manifest\.webmanifest/.test(portalBlock));
  check("the icon route lists exactly the pack's apps and files", /\(site\|portal\|tasks\|admin\|kickoff\)\/\(icon\\\.svg\|icon-192\\\.png\|icon-512\\\.png\|maskable-512\\\.png\|apple-touch-icon\\\.png\)/.test(caddy));
  check("sw.js is never cached by the browser's HTTP cache (no-cache)", /handle \/sw\.js \{\s*header Cache-Control "no-cache"/.test(caddy));

  console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})();

async function caches_open(w, name) {                                 // helper: pre-create a cache with a file in it
  const cache = { async add(u) { w.store.get(name).set(u, basic("old")); } };
  w.store.set(name, new Map());
  return cache;
}
