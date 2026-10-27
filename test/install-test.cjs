// Install banner, /install page and Share button (MASTER_PLAN D63): the rules, with no browser.
//   - banner: hidden when installed, "Not now" remembered 30 days, "Don't show again", blocked storage
//   - iPhone/iPad detection (iPadOS says it is a Mac)
//   - the QR code is drawn offline from the vendored library (hash checked) and has the quiet zone
//   - Share falls back to Copy link
//   - the banner and install files are on the portal only; the Caddyfile gates /install
// Run: node test/install-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); } else { failed++; console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`); }
}

// ---------- vendored QR library ----------
const qrBytes = fs.readFileSync(path.join(root, "js/vendor/qrcode.js"));
check("qrcode.js is qrcode-generator 1.4.4 (sha256 and size)", crypto.createHash("sha256").update(qrBytes).digest("hex") === "18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780" && qrBytes.length === 56694);
check("the licence and provenance README are next to it", fs.existsSync(path.join(root, "js/vendor/qrcode-LICENSE.txt")) && /18ae399f/.test(read("js/vendor/README.md")));

// ---------- a tiny DOM, enough for js/install.js ----------
function makeNode(tag) {
  const n = { tag, children: [], attrs: {}, className: "", textContent: "", innerHTML: "", listeners: {}, removed: false };
  n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
  n.append = (...kids) => { kids.forEach((k) => n.children.push(typeof k === "string" ? { tag: "#text", textContent: k, children: [], attrs: {} } : k)); };
  n.replaceChildren = () => { n.children = []; };
  n.remove = () => { n.removed = true; };
  n.addEventListener = (ev, fn) => { (n.listeners[ev] ||= []).push(fn); };
  n.querySelector = (sel) => find(n, sel);
  n.contains = () => false;
  return n;
}
function find(n, sel) { // ".class" only
  const cls = sel.replace(".", "");
  for (const c of n.children) { if ((c.className || "").split(" ").includes(cls)) return c; const d = find(c, sel); if (d) return d; }
  return null;
}
function texts(n) { return (n.textContent || "") + n.children.map(texts).join(" "); }

function makeEnv({ ua = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130", platform = "Linux x86_64", touch = 0, standalone, displayStandalone = false, storage, share, clipboard } = {}) {
  const body = makeNode("body");
  const docListeners = {};
  const winListeners = {};
  const ctx = {
    console, Date, Number, String, setTimeout, CustomEvent: class { constructor(type) { this.type = type; } },
    navigator: { userAgent: ua, platform, maxTouchPoints: touch, standalone, share, clipboard },
    matchMedia: () => ({ matches: displayStandalone }),
    localStorage: storage,
    addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
  };
  ctx.window = ctx;
  ctx.document = {
    body, activeElement: null,
    createElement: makeNode,
    createElementNS: (ns, tag) => makeNode(tag),
    querySelector: () => null,
    addEventListener: (ev, fn) => { (docListeners[ev] ||= []).push(fn); },
    dispatchEvent: (e) => (docListeners[e.type] || []).forEach((f) => f(e)),
  };
  vm.createContext(ctx);
  vm.runInContext(qrBytes.toString("utf8"), ctx, { filename: "qrcode.js" });
  vm.runInContext(read("js/install.js") + "\n;globalThis.I = { isInstalledApp, isAppleMobile, bannerSuppressed, snoozeBanner, muteBanner, shareApp, qrSvg, showInstallBanner, initInstallBanner, runInstallPrompt, getBanner: () => installBanner, getDeferred: () => deferredInstall };", ctx, { filename: "install.js" });
  return { ctx, body, winListeners };
}
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
const blocked = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
const DAY = 24 * 60 * 60 * 1000;

// ---------- installed or not ----------
check("not installed in a normal tab", makeEnv().ctx.I.isInstalledApp() === false);
check("installed when display-mode is standalone", makeEnv({ displayStandalone: true }).ctx.I.isInstalledApp() === true);
check("installed when iOS navigator.standalone is true", makeEnv({ standalone: true }).ctx.I.isInstalledApp() === true);

// ---------- iPhone / iPad ----------
check("iPhone is Apple mobile", makeEnv({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari", platform: "iPhone" }).ctx.I.isAppleMobile());
check("iPad (older UA) is Apple mobile", makeEnv({ ua: "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) Safari" }).ctx.I.isAppleMobile());
check("iPadOS (Mac UA, touch screen) is Apple mobile", makeEnv({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", platform: "MacIntel", touch: 5 }).ctx.I.isAppleMobile());
check("a real Mac (no touch) is not", !makeEnv({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", platform: "MacIntel", touch: 0 }).ctx.I.isAppleMobile());
check("Android Chrome is not", !makeEnv({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", platform: "Linux armv8l", touch: 5 }).ctx.I.isAppleMobile());

// ---------- remembering the choice ----------
{
  const { ctx } = makeEnv();
  const s = memory();
  const t0 = 1_800_000_000_000;
  check("a first visit is not suppressed", ctx.I.bannerSuppressed(s, t0) === false);
  ctx.I.snoozeBanner(s, t0);
  check("Not now: hidden the next day", ctx.I.bannerSuppressed(s, t0 + DAY));
  check("Not now: hidden on day 29", ctx.I.bannerSuppressed(s, t0 + 29 * DAY));
  check("Not now: shows again after 30 days", ctx.I.bannerSuppressed(s, t0 + 30 * DAY) === false);
  const s2 = memory(); ctx.I.muteBanner(s2);
  check("Don't show again: hidden for good", ctx.I.bannerSuppressed(s2, t0 + 3650 * DAY));
  check("blocked storage: reads as not suppressed and writes do not throw", ctx.I.bannerSuppressed(blocked, t0) === false && (() => { ctx.I.snoozeBanner(blocked, t0); ctx.I.muteBanner(blocked); return true; })());
}

// ---------- the banner itself ----------
{
  const e = makeEnv({ storage: memory() });
  e.ctx.I.showInstallBanner();
  const b = e.ctx.I.getBanner();
  check("banner is a labelled region with the agreed title", b && b.attrs.role === "region" && b.attrs["aria-labelledby"] === "install-title" && /Add the Team 2972 app to your home screen/.test(texts(b)));
  check("other browsers: a How to install link to /install", /How to install/.test(texts(b)) && find(b, ".btn-outline").href === "/install");
  check("both dismiss buttons are present", /Not now/.test(texts(b)) && /Don't show again/.test(texts(b)));
  find(b, ".install-link").listeners.click[0]();
  check("Not now removes the banner and remembers it", e.ctx.I.getBanner() === null && e.ctx.localStorage.getItem("install-banner-later") !== null);
  e.ctx.I.showInstallBanner();
  check("a snoozed banner does not come back", e.ctx.I.getBanner() === null);
  e.ctx.I.showInstallBanner({ force: true });
  check("force shows it anyway (used by the contrast test)", e.ctx.I.getBanner() !== null);
}
{
  const e = makeEnv({ displayStandalone: true, storage: memory() });
  e.ctx.I.showInstallBanner();
  check("an installed app never shows the banner", e.ctx.I.getBanner() === null);
}
{
  const e = makeEnv({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari", platform: "iPhone", storage: memory() });
  e.ctx.I.showInstallBanner();
  const t = texts(e.ctx.I.getBanner());
  check("iPhone: steps Share, then Add to Home Screen, plus the notifications note", /Share/.test(t) && /Add to Home Screen/.test(t) && /Notifications/.test(t) && !/How to install/.test(t));
}
{
  const e = makeEnv({ storage: memory() });
  let prompted = 0;
  const ev = { preventDefault() { ev.prevented = true; }, prompt: async () => { prompted++; } };
  e.winListeners.beforeinstallprompt.forEach((f) => f(ev));
  check("beforeinstallprompt is stashed and the mini bar suppressed", ev.prevented && e.ctx.I.getDeferred() === ev);
  e.ctx.I.showInstallBanner();
  const btn = find(e.ctx.I.getBanner(), ".btn");
  check("Chrome/Edge/Android: an Install button", btn && btn.textContent === "Install");
  btn.listeners.click[0]().then(() => {
    check("Install calls prompt() once and the banner closes", prompted === 1 && e.ctx.I.getBanner() === null);
  });
  e.winListeners.appinstalled.forEach((f) => f());
  check("appinstalled clears the stashed prompt", e.ctx.I.getDeferred() === null);
}

// ---------- QR: offline, quiet zone, black on white from CSS ----------
{
  const { ctx } = makeEnv();
  const svg = ctx.I.qrSvg("http://portal.example.com/");
  const vb = svg.attrs.viewBox.split(" ").map(Number);
  const modules = vb[2] - 8;
  check("QR viewBox has a 4-module quiet zone on each side (version 1-40)", vb[2] === vb[3] && modules >= 21 && modules <= 177 && (modules - 21) % 4 === 0);
  const pathEl = svg.children.find((c) => c.tag === "path");
  const d = pathEl.attrs.d;
  const cells = d.match(/M(\d+) (\d+)h1v1h-1z/g) || [];
  check("QR draws dark modules only inside the code area", cells.length > 50 && cells.every((c) => { const [, x, y] = c.match(/M(\d+) (\d+)/); return x >= 4 && y >= 4 && x < vb[2] - 4 && y < vb[3] - 4; }));
  check("QR colours come from CSS classes, not inline colours", svg.children.every((c) => !("fill" in c.attrs)) && pathEl.attrs.class === "qr-fg");
  const src = read("js/install.js") + read("portal/install.html");
  check("no network call anywhere in the install code (no fetch, XHR, external URL)", !/fetch\(|XMLHttpRequest|sendBeacon|https?:\/\/(?!www\.w3\.org)/.test(src.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/.*$/gm, "")));
  check("the QR address is the portal address built from SITE_SCHEME + SITE_DOMAIN (PORTAL_URL)", /const url = PORTAL_URL;/.test(read("portal/install.html")) && /qrSvg\(url\)/.test(read("portal/install.html")));
}

// ---------- Share ----------
(async () => {
  const { ctx } = makeEnv();
  const data = { title: "t", text: "x", url: "http://portal.example.com/" };
  let shared = null, copied = null;
  const clip = { writeText: async (v) => { copied = v; } };
  check("share sheet used when present", (await ctx.I.shareApp(data, { share: async (d) => { shared = d; }, clipboard: clip })) === "shared" && shared.url === data.url && copied === null);
  check("no share sheet: copies the link", (await ctx.I.shareApp(data, { clipboard: clip })) === "copied" && copied === data.url);
  copied = null;
  check("share cancelled by the person: nothing is copied", (await ctx.I.shareApp(data, { share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }, clipboard: clip })) === "cancelled" && copied === null);
  check("share fails for another reason: falls back to copy", (await ctx.I.shareApp(data, { share: async () => { throw new Error("NotAllowed"); }, clipboard: clip })) === "copied");
  check("clipboard blocked as well: reports failed, no throw", (await ctx.I.shareApp(data, { clipboard: { writeText: async () => { throw new Error("denied"); } } })) === "failed");
  check("no clipboard at all: reports failed", (await ctx.I.shareApp(data, {})) === "failed");

  // ---------- where the files are used ----------
  const pub = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
  check("no public page loads the banner, the QR library or links to /install", pub.every((f) => { const h = read(f); return !/install\.js|qrcode\.js|initInstallBanner|\/install\b/.test(h); }), pub.filter((f) => /install\.js|qrcode\.js|\/install\b/.test(read(f))).join(","));
  check("portal home starts the banner; the install page does not", /initInstallBanner\(\)/.test(read("portal/index.html")) && !/initInstallBanner/.test(read("portal/install.html")));
  check("footer 'Install the app' link is on the portal only", /isPortalPage\(\) \? `<a href="\/install">Install the app<\/a>`/.test(read("js/components.js")));
  check("install page has the theme snippet in <head> before the stylesheet", (() => { const h = read("portal/install.html"); const s = h.indexOf('localStorage.getItem("theme")'); const c = h.indexOf('<link rel="stylesheet"'); return s > 0 && s < c && c < h.indexOf("</head>"); })());

  // ---------- Caddy ----------
  const caddy = read("container/Caddyfile");
  const portalBlock = caddy.slice(caddy.indexOf("handle @portal_host"), caddy.indexOf("# ---- Public hosts"));
  check("portal host: /install is rewritten to portal/install.html after the gate", portalBlock.indexOf("import gate") > 0 && portalBlock.indexOf("@install path /install /install/") > portalBlock.indexOf("import gate") && /rewrite \* \/portal\/install\.html/.test(portalBlock));
  const publicBlock = caddy.slice(caddy.indexOf("handle @public_host"), caddy.indexOf("# ---- Any other host"));
  check("public hosts: /install and /install/ are 404", /@portal_paths path [^\n]*\/install \/install\/[^\n]*\n\s*respond @portal_paths 404/.test(publicBlock));
  const directBlock = caddy.slice(caddy.indexOf("# ---- Any other host"));
  const di = directBlock.indexOf("@install_direct");
  check("direct requests: /install needs the secret", di > 0 && directBlock.slice(di, di + 260).includes("import gate"));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
