// Themes: the logic and the rules that keep it correct. No browser needed.
//   - the PUBLIC pages are dark only (Midnight & brass, docs/PUBLIC_REDESIGN_PROPOSAL.md §5b): no theme script, no
//     switch, no storage handlers, and they never touch the shared theme cookie
//   - the PORTAL, its install page and the offline page keep light / dark / system: every one has the no-flash
//     snippet in <head>, before the stylesheet
//   - colours are defined once, as tokens (no stray colour literals in the stylesheet)
// The visual side (contrast, following the system on the portal, staying dark on public pages) is test/theme-test.sh.
// Run: node test/theme-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`); }
}

// ---------- the public pages' script: no theme code at all ----------
// js/components.js builds the public header and footer. It must not read, write or follow the theme: not the
// switch (removed), not the saved choice, not the OS setting, and never the shared `theme` cookie that the portal's
// app bar owns. Loaded with a saved light choice in both the cookie and localStorage, it must leave both alone.
{
  const jar = new Map([["theme", "light"]]);
  const cookieWrites = [];
  const store = new Map([["theme", "light"]]);
  const storageCalls = [];
  const ctx = {
    console, location: { host: "localhost", protocol: "http:", search: "", pathname: "/" }, scrollY: 0, onContent() {},
    localStorage: { getItem: (k) => { storageCalls.push(["get", k]); return store.get(k) ?? null; }, setItem: (k, v) => { storageCalls.push(["set", k]); store.set(k, v); }, removeItem: (k) => { storageCalls.push(["remove", k]); store.delete(k); } },
    navigator: {}, Image: class { set src(v) {} },
    matchMedia: () => ({ matches: true, addEventListener() { throw new Error("components.js must not follow the OS setting"); } }),
    addEventListener(ev) { ctx.__listeners.push(ev); }, __listeners: [],
  };
  ctx.window = ctx;
  ctx.document = {
    documentElement: { dataset: {}, classList: { toggle() { throw new Error("no theme classes"); } }, style: {}, setAttribute() { throw new Error("no attributes on <html>"); } },
    body: { hasAttribute: () => false }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => ({}),
    addEventListener(ev) { ctx.__listeners.push("document:" + ev); },
  };
  Object.defineProperty(ctx.document, "cookie", {
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    set: (v) => { cookieWrites.push(v); },
  });
  vm.createContext(ctx);
  vm.runInContext(read("js/content.js"), ctx, { filename: "content.js" });
  vm.runInContext(read("js/components.js") + "\n;mountLayout();", ctx, { filename: "components.js" });
  check("public pages: running js/components.js with a saved light choice writes no cookie", cookieWrites.filter((c) => /^theme=/.test(c)).length === 0, cookieWrites.join(" | "));
  check("public pages: ...and never touches the old localStorage key", storageCalls.length === 0, JSON.stringify(storageCalls));
  check("public pages: ...and the saved light choice is still there for the portal", jar.get("theme") === "light" && store.get("theme") === "light");
  check("public pages: no storage or visibilitychange handler follows a theme change", !ctx.__listeners.includes("storage") && !ctx.__listeners.includes("document:visibilitychange"), ctx.__listeners.join(","));
  const src = read("js/components.js");
  check("js/components.js has no theme switch, theme storage or OS-setting code", !/setTheme|applyTheme|storedTheme|renderThemeSwitch|bindThemeSwitch|THEME_KEY|theme-switch|prefers-color-scheme/.test(src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")));
}

// ---------- which pages are public (dark only) and which follow the theme ----------
const PUBLIC_PAGES = ["about", "contact", "index", "media", "member", "mentor", "outreach", "privacy", "resources", "robot", "robots", "sponsors", "terms"].map((n) => `${n}.html`);
const allHtml = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
const pages = allHtml.filter((f) => !PUBLIC_PAGES.includes(f)).concat(["portal/index.html", "portal/install.html"]);   // themed pages
check("every .html page is either public (dark only) or themed", PUBLIC_PAGES.every((f) => allHtml.includes(f)) && allHtml.length === PUBLIC_PAGES.length + 2, allHtml.join(","));
for (const page of PUBLIC_PAGES) {
  const html = read(page), head = html.slice(0, html.indexOf("</head>"));
  check(`${page}: dark only from the first paint (data-site="public" on <html>, color-scheme dark, no inline script)`,
    /<html lang="en" data-site="public">/.test(html) && /<meta name="color-scheme" content="dark" \/>/.test(head) && !/color-scheme" content="[^"]*light/.test(head), head.match(/<meta name="color-scheme"[^>]*>/));
  check(`${page}: theme-color is the Midnight page colour only`, (head.match(/name="theme-color"/g) || []).length === 1 && /<meta name="theme-color" content="#101827" \/>/.test(head));
  check(`${page}: no theme script in <head> (nothing reads, writes or follows the saved choice or the OS setting)`, !/theme-init|localStorage|matchMedia|prefers-color-scheme|<script>/.test(head), "head has a script or theme code");
  check(`${page}: no theme switch markup`, !/theme-switch|data-theme/.test(html));
}
for (const page of pages) {
  check(`${page}: declares color-scheme light dark`, /<meta name="color-scheme" content="light dark" \/>/.test(read(page)));
}

// ---------- every page: the shell kit's theme script (D92 cookie, then the old localStorage key) ----------
// Runs the head script from each page in a sandbox, for the cases the Sol review of 0b0f687 reproduced.
function runHeadScript(html, { cookie = "", stored = null, host = "portal.example.org", https = true, sysDark = false }) {
  const m = html.match(/<!-- theme-init: [^\n]*-->\n<script>([^\n]*)<\/script>/);
  if (!m) return null;
  const attrs = {}; const classes = new Set(); const writes = [];
  const jar = new Map(cookie ? cookie.split(";").map((c) => c.trim().split("=")) : []);
  const r = {
    setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; },
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, style: {},
  };
  const document = { documentElement: r };
  Object.defineProperty(document, "cookie", {
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    set: (v) => { writes.push(v); const [kv] = v.split(";"); const [k, val] = kv.split("="); jar.set(k.trim(), val); },
  });
  const store = new Map(stored ? [["theme", stored]] : []);
  const mq = { matches: sysDark, listeners: [], addEventListener: (ev, fn) => mq.listeners.push(fn) };
  const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null) }, matchMedia: () => mq };
  const ctx = { document, window, location: { hostname: host, protocol: https ? "https:" : "http:" } };
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx);
  // later events: the person picks System elsewhere (cookie and key gone), then the OS setting changes
  const pickSystem = () => { jar.delete("theme"); store.delete("theme"); };
  const osChange = (dark) => { mq.matches = dark; mq.listeners.forEach((fn) => fn()); };
  const now = () => ({ theme: attrs["data-theme"], dark: classes.has("dark"), scheme: r.style.colorScheme });
  return { ...now(), writes, pickSystem, osChange, now };
}
for (const page of pages) {
  const html = read(page);
  const at = html.indexOf("<!-- theme-init: ");
  check(`${page}: the kit's theme script is in <head>, before the stylesheets`, at > 0 && at < html.indexOf('<link rel="stylesheet"') && at < html.indexOf("</head>"));
  check(`${page}: no second (localStorage-only) theme snippet`, !html.includes('try{var t=localStorage.getItem("theme")'));
  let r = runHeadScript(html, { cookie: "theme=dark", stored: "light" });
  check(`${page}: cookie dark + old key light → dark (the cookie wins, as in the app bar)`, r && r.theme === "dark" && r.dark && r.scheme === "dark" && r.writes.length === 0, JSON.stringify(r));
  r = runHeadScript(html, { stored: "light", sysDark: true });
  if (page === "offline.html") {
    // read-only: shown from the service worker's cache, it must not write the shared cookie
    check(`${page}: no cookie + old key light → light, and nothing is written (read-only)`, r && r.theme === "light" && !r.dark && r.writes.length === 0, JSON.stringify(r));
    check(`${page}: its head script has no cookie or storage write at all`, !/\.cookie\s*=|setItem|removeItem/.test(read(page).match(/<!-- theme-init: [^\n]*-->\n<script>([^\n]*)<\/script>/)[1]));
  } else {
    check(`${page}: no cookie + old key light → light, and the key moves into a site-wide cookie`, r && r.theme === "light" && !r.dark && r.writes.length === 1 && /^theme=light; Path=\/; Max-Age=34560000; SameSite=Lax; Domain=\.example\.org; Secure$/.test(r.writes[0]), JSON.stringify(r));
  }
  r = runHeadScript(html, { cookie: "theme=dark", sysDark: true });
  r.pickSystem(); r.osChange(false);
  const after = r.now();
  check(`${page}: explicit Dark, then System, then the OS turns light → light, no data-theme (Sol, kit 0.1.4)`, after.theme === undefined && !after.dark && after.scheme === "light", JSON.stringify(after));
  r = runHeadScript(html, { cookie: "theme=purple", sysDark: true });
  check(`${page}: nothing valid stored → follows the system, sets no data-theme`, r && r.theme === undefined && r.dark && r.writes.length === 0, JSON.stringify(r));
}

// The generator's browser-side cookie attributes equal the kit's cookieAttributes for every kind of host, and the
// pages hold the generator's current output (re-run it after a shell sync).
(async () => {
  const gen = await import(path.join(root, "scripts/theme-init.mjs"));
  const kit = await import(path.join(root, "shell/core.js"));
  const cases = [
    ["portal.2972robotics.example", "https", "2972robotics.example"], ["www.example.org", "https", "example.org"],
    ["portal.localhost", "http", "localhost"], ["localhost", "http", "localhost"], ["127.0.0.1", "http", "127.0.0.1"],
    ["portal.example.org", "http", "example.org"],
  ];
  for (const [hostname, scheme, domain] of cases) {
    const got = vm.runInNewContext(gen.RUNTIME_ATTRS, { location: { hostname, protocol: `${scheme}:` } });
    const want = kit.cookieAttributes({ scheme, domain }, kit.COOKIE_MAX_AGE);
    check(`theme cookie attributes on ${scheme}://${hostname} match the kit's`, got === want, `${got} vs ${want}`);
  }
  for (const page of gen.PAGES) check(`${page}: holds the current scripts/theme-init.mjs output`, read(page).includes(gen.snippet(page)));
  check("offline.html is the only read-only page", JSON.stringify(gen.READ_ONLY_PAGES) === '["offline.html"]');

  // One list of landing's hosts in the head script and in components.js.
  const compList = (read("js/components.js").match(/const SITE_SUBDOMAINS = (\[[^\]]*\]);/) || [])[1];
  check("js/components.js and scripts/theme-init.mjs list the same site subdomains", compList && JSON.stringify(JSON.parse(compList)) === JSON.stringify(gen.SITE_SUBDOMAINS), compList);

  // Sol, review of ab09a9a: the editor serves landing's pages at editor.<domain>/site/*. With no cookie and the old key
  // "dark", a themed page's head script migrates it onto the bare site domain (one cookie). Public pages are dark only
  // and never write it. A browser-like jar (cookies keyed by name and domain) must hold exactly one theme cookie.
  {
    const host = "editor.example.org";
    const jar = new Map();                                     // "name|domain" -> value; domain "" = host-only
    const visible = () => [...jar].filter(([k]) => { const d = k.split("|")[1]; return d === "" || host === d || host.endsWith("." + d); });
    const cookieProp = {
      get: () => visible().map(([k, v]) => `${k.split("|")[0]}=${v}`).join("; "),
      set: (str) => {
        const [kv, ...attrs] = str.split(";").map((x) => x.trim());
        const i = kv.indexOf("="); const name = kv.slice(0, i), value = kv.slice(i + 1);
        const dom = (attrs.find((a) => /^domain=/i.test(a)) || "").replace(/^domain=\.?/i, "").toLowerCase();
        if (dom && host !== dom && !host.endsWith("." + dom)) return;          // a browser rejects a foreign domain
        const key = `${name}|${dom}`;
        if (attrs.some((a) => /^max-age=0$/i.test(a))) jar.delete(key); else jar.set(key, value);
      },
    };
    const store = new Map([["theme", "dark"]]);
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const page = read("portal/index.html");
    const head = page.match(/<!-- theme-init: [^\n]*-->\n<script>([^\n]*)<\/script>/)[1];
    const runHead = () => {
      const attrs = {}; const r = { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, classList: { toggle() {} }, style: {} };
      const document = { documentElement: r }; Object.defineProperty(document, "cookie", cookieProp);
      vm.runInNewContext(head, { document, window: { localStorage: storage, matchMedia: () => ({ matches: false, addEventListener() {} }) }, location: { hostname: host, protocol: "https:" } });
      return attrs["data-theme"];
    };
    const themeCookies = () => [...jar.keys()].filter((k) => k.startsWith("theme|"));
    check("editor /site/ host: a themed page's head script migrates the old key onto the bare site domain", runHead() === "dark" && themeCookies().join() === "theme|example.org", themeCookies());

    // The public pages carry no head script, so on the same host they write no cookie at all: the one theme cookie
    // stays the portal's.
    const before = JSON.stringify([...jar]);
    check("editor /site/ host: a public page has no head script, so it writes and removes no theme cookie", !/<script>/.test(read("index.html").slice(0, read("index.html").indexOf("</head>"))) && JSON.stringify([...jar]) === before);
  }
  finish();
})();

// ---------- the stylesheet: colours are defined once ----------
// The names landing shares with the shell kit hold the kit's values, light and dark (D101).
{
  const kitCss = read("shell/tokens.css");
  const lightBlock = kitCss.slice(kitCss.indexOf(":root {"), kitCss.indexOf("@media (prefers-color-scheme: dark)"));
  const darkBlock = kitCss.slice(kitCss.indexOf(':root[data-theme="dark"]'));
  const val = (block, name) => (block.match(new RegExp(`\\s${name}:\\s*([^;]+);`)) || [])[1];
  const landing = read("css/style.css");
  const SHARED = { "--ink": "--bg", "--ink-2": "--surface-2", "--ink-3": "--surface", "--accent": "--accent-ink", "--line": "--line", "--line-2": "--line-2",
    "--text": "--text", "--text-2": "--text-2", "--mute": "--mute", "--gold": "--gold", "--gold-2": "--gold-2", "--on-gold": "--on-gold", "--tint": "--tint", "--tint-2": "--tint-2" };
  const off = [];
  for (const [mine, kit] of Object.entries(SHARED)) {
    const v = (landing.match(new RegExp(`\\s${mine}:\\s*([^;]+);`)) || [])[1] || "";
    const ld = v.match(/^light-dark\((.+?),\s*(#[0-9a-f]+|rgba\([^)]*\))\)$/i);
    const [l, d] = ld ? [ld[1].trim(), ld[2].trim()] : [v, v];
    const kl = val(lightBlock, kit), kd = val(darkBlock, kit) || kl;
    if (l !== kl || d !== kd) off.push(`${mine} ${l}/${d} vs kit ${kit} ${kl}/${kd}`);
  }
  check("landing's shared colour tokens equal the shell kit's, light and dark", off.length === 0, off.join(" | "));
}
const css = read("css/style.css");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")) + 1);
const tokens = [...rootBlock.matchAll(/^\s*(--[\w-]+):\s*(.+?);/gm)].map((m) => ({ name: m[1], value: m[2] }));
const themed = tokens.filter((t) => t.value.startsWith("light-dark("));
check("the portal's token block defines its colours as light-dark() tokens", themed.length >= 19, `found ${themed.length}`);
check("the root asks for both schemes", /color-scheme: light dark;/.test(rootBlock));
check("an explicit choice is honoured on themed pages (data-theme light and dark)", /:root\[data-theme="light"\] \{ color-scheme: light; \}/.test(css) && /:root\[data-theme="dark"\] \{ color-scheme: dark; \}/.test(css));
const bad = themed.filter((t) => !/^light-dark\(\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*\)$/i.test(t.value));
check("every light-dark() token holds two colours (it does not work for other values)", bad.length === 0, bad.map((t) => t.name).join(", "));

// The public block: one fixed dark set, the approved Midnight & brass values (PUBLIC_REDESIGN_PROPOSAL §5b).
const pubStart = css.indexOf(':root[data-site="public"], :root[data-site="public"][data-theme] {');
const pubBlock = pubStart < 0 ? "" : css.slice(pubStart, css.indexOf("}", pubStart) + 1);
const pub = Object.fromEntries([...pubBlock.matchAll(/^\s*(--[\w-]+):\s*(.+?);/gm)].map((m) => [m[1], m[2]]));
check("the public token block exists, after the portal's, and is dark", pubStart > css.indexOf(rootBlock) && /color-scheme: dark;/.test(pubBlock));
check("the public token block applies even with a stray data-theme (an old saved light choice)", /:root\[data-site="public"\]\[data-theme\]/.test(pubBlock));
const APPROVED = { "--ink": "#101827", "--ink-2": "#152033", "--ink-3": "#1c293b", "--text": "#f3f5fa", "--text-2": "#c5cfdd", "--mute": "#b4c0d1",
  "--gold": "#e6b849", "--accent": "#e6b849", "--gold-2": "#f2cd74", "--accent-2": "#f2cd74", "--on-gold": "#101827" };
const wrong = Object.entries(APPROVED).filter(([k, v]) => (pub[k] || "").toLowerCase() !== v);
check("the public tokens are the approved Midnight & brass values", wrong.length === 0, wrong.map(([k, v]) => `${k} ${pub[k]} vs ${v}`).join(", "));
check("the public block has no light-dark() (it is one fixed theme)", !/light-dark\(/.test(pubBlock));
// WCAG contrast of the approved pairs (the browser run checks every page; this guards the palette itself)
{
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const ratio = (a, b) => { const [hi, lo] = lum(a) >= lum(b) ? [a, b] : [b, a]; return (lum(hi) + 0.05) / (lum(lo) + 0.05); };
  const weak = [];
  for (const fg of ["--text", "--text-2", "--mute", "--accent", "--accent-2"]) for (const bg of ["--ink", "--ink-2", "--ink-3"]) if (ratio(pub[fg], pub[bg]) < 4.5) weak.push(`${fg} on ${bg} ${ratio(pub[fg], pub[bg]).toFixed(2)}`);
  if (ratio(pub["--on-gold"], pub["--gold"]) < 4.5) weak.push("--on-gold on --gold");
  if (ratio(pub["--on-gold"], pub["--gold-2"]) < 4.5) weak.push("--on-gold on --gold-2");
  check("the public palette passes WCAG AA (4.5:1) for every text pair", weak.length === 0, weak.join(", "));
}

// Outside the token blocks, colours must be tokens. Allowed: the few places that are the same in both themes.
const ALLOWED = [
  ".brand-logo",                         // logo sits on a white disc
  "transparent 38%, rgba(7, 9, 15, 0.94)", // robot photo cards on Home (dark in both themes); removed with the reel
  "background: #ffffff;",                // sponsor logo tiles: logos are made for white
  ".sponsor-tile span { color: #0b1224",
  "-webkit-mask: linear-gradient(#000 0 0)", // mask shapes, not visible colours
  "mask-composite",
];
const after = css.slice(pubStart + pubBlock.length);
const literals = after.split("\n").filter((l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l) && !ALLOWED.some((a) => l.includes(a)));
check("no stray colour literals outside the tokens", literals.length === 0, literals.slice(0, 4).map((l) => l.trim().slice(0, 70)).join(" | "));
const gold = after.split("\n").filter((l) => /color: var\(--gold\)/.test(l) && !/background|border/.test(l) && !/text-stroke/.test(l));
check("gold is never used as text colour (text uses --accent, which passes AA in both themes)", gold.length === 0, gold.slice(0, 3).map((l) => l.trim().slice(0, 70)).join(" | "));
const onGold = after.split("\n").filter((l) => /background: var\(--gold(-2)?\)/.test(l) && /color: var\(--ink\)/.test(l));
check("text on a gold fill uses --on-gold, not the page colour", onGold.length === 0, onGold.slice(0, 3).map((l) => l.trim().slice(0, 70)).join(" | "));
// the retired effects are gone from the stylesheet and the scripts
const RETIRED = /\.marquee|\.tilt|\.magnetic|\.cursor-dot|\.footer-giant|\.kicker|\[data-reveal\]|\.scroll-cue|\.rise\b|--grain|kenburns|\.fade-in|--giant|--aurora/;
check("the stylesheet has none of the retired effects (marquee, grain, magnetic, tilt, pointer glow, parallax, reveal, giant footer number)", !RETIRED.test(css), (css.match(RETIRED) || [])[0]);
check("no page or script keeps a retired effect's hook (data-reveal, magnetic, tilt, marquee, parallax, pointer glow)",
  !allHtml.concat(["js/components.js"]).some((f) => /data-reveal|\bmagnetic\b|\btilt\b|marquee|--py|--mx|splitWords|setupCursor/.test(read(f))));

function finish() {
  console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
