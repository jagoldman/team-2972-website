// Light / dark theme: the logic and the rules that keep it correct. No browser needed.
//   - the switch's behaviour, including when localStorage is blocked
//   - every page has the no-flash snippet in <head>, before the stylesheet
//   - colours are defined once, as light-dark() tokens (no stray colour literals in the stylesheet)
// The visual side (contrast in both themes, following the system) is test/theme-test.sh.
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

// ---------- the theme code in js/components.js ----------
function makeEnv(storage) {
  const classes = new Set();
  const root = { dataset: {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) }, style: {} };
  const jar = new Map();
  const buttons = ["light", "dark", "system"].map((v) => {
    const b = { dataset: { theme: v }, pressed: null, setAttribute(k, val) { if (k === "aria-pressed") b.pressed = val; } };
    return b;
  });
  const ctx = {
    console,
    location: { host: "localhost", protocol: "http:", search: "", pathname: "/" },
    scrollY: 0,
    onContent() {},
    localStorage: storage,
  };
  ctx.window = ctx;
  ctx.matchMedia = () => ({ matches: false });
  ctx.addEventListener = (ev, fn) => { (ctx.__listeners ||= {})[ev] = fn; };
  ctx.document = {
    documentElement: root,
    body: { hasAttribute: () => false },
    querySelectorAll: (sel) => (sel === ".theme-switch button" ? buttons : []),
    querySelector: () => null,
    addEventListener() {},
  };
  // A cookie jar that keeps the last write's attributes, so tests can read them.
  ctx.cookieWrites = [];
  Object.defineProperty(ctx.document, "cookie", {
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    set: (v) => { ctx.cookieWrites.push(v); const [kv] = v.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i), val = kv.slice(i + 1); if (/Max-Age=0\b/i.test(v)) jar.delete(k); else jar.set(k, val); },
  });
  ctx.jar = jar;
  vm.createContext(ctx);
  vm.runInContext(read("js/components.js") + "\n;globalThis.T = { storedTheme, setTheme, applyTheme, renderThemeSwitch };", ctx, { filename: "components.js" });
  return { ctx, root, buttons };
}
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const blocked = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); }, removeItem() { throw new Error("SecurityError"); } };

{
  const store = memory();
  const { ctx, root, buttons } = makeEnv(store);
  check("default choice is System", ctx.T.storedTheme() === "system");
  ctx.T.setTheme("dark");
  check("Dark sets data-theme and is remembered", root.dataset.theme === "dark" && store._m.get("theme") === "dark" && ctx.T.storedTheme() === "dark");
  check("Dark also writes the site-wide theme cookie, the kit's way (D92)", ctx.jar.get("theme") === "dark" && /^theme=dark; Path=\/; Max-Age=34560000; SameSite=Lax$/.test(ctx.cookieWrites.at(-1)), ctx.cookieWrites.at(-1));
  check("Dark sets the dark class and color-scheme, as the kit's applyTheme does", root.classList.contains("dark") && !root.classList.contains("light") && root.style.colorScheme === "dark");
  check("the switch marks only the chosen button pressed", buttons.map((b) => b.pressed).join(",") === "false,true,false");
  ctx.T.setTheme("light");
  check("Light replaces Dark", root.dataset.theme === "light" && store._m.get("theme") === "light");
  ctx.T.setTheme("system");
  check("System removes data-theme and forgets the choice", root.dataset.theme === undefined && !store._m.has("theme") && buttons.map((b) => b.pressed).join(",") === "false,false,true");
  check("System clears the pinned color-scheme so the page follows the system setting", root.style.colorScheme === "");
  check("System deletes the theme cookie too", !ctx.jar.has("theme") && /Max-Age=0/.test(ctx.cookieWrites.at(-1)));
  ctx.jar.set("theme", "dark"); store.setItem("theme", "light");
  check("the cookie wins over the old localStorage key", ctx.T.storedTheme() === "dark");
  ctx.jar.delete("theme"); store.removeItem("theme");
  store.setItem("theme", "purple");
  check("an unknown stored value counts as System", ctx.T.storedTheme() === "system");
  store.setItem("theme", "dark");
  ctx.__listeners.storage({ key: "theme" });
  check("another tab's change is followed", root.dataset.theme === "dark");
  const html = ctx.T.renderThemeSwitch();
  check("the switch has Light, Dark and System buttons with names", ["Light", "Dark", "System"].every((n) => html.includes(`>${n}</span>`)) && (html.match(/<button/g) || []).length === 3);
  check("the switch is a labelled group", /role="group" aria-label="Colour theme"/.test(html));
  check("the stored choice shows as pressed when the switch is drawn", /data-theme="dark" aria-pressed="true"/.test(html));
}
{
  const { ctx, root } = makeEnv(blocked);
  let threw = false;
  try { ctx.T.storedTheme(); ctx.T.setTheme("dark"); ctx.T.setTheme("system"); ctx.T.setTheme("light"); } catch (e) { threw = true; }
  check("blocked localStorage never throws", !threw);
  check("blocked localStorage: the choice still applies for this visit", root.dataset.theme === "light");
  check("blocked localStorage: the cookie still carries the choice", ctx.T.storedTheme() === "light");
  ctx.jar.clear();
  check("blocked localStorage and no cookie: reads as System", ctx.T.storedTheme() === "system");
}

// ---------- every page declares both schemes ----------
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html")).concat(["portal/index.html", "portal/install.html"]);
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

  // Sol, review of ab09a9a: the editor serves landing's public pages at editor.<domain>/site/*. With no cookie and the
  // old key "dark", the head script migrates it; then the public switch picks Light, then System. A browser-like jar
  // (cookies keyed by name and domain) must end with one theme cookie, then none, and the page must follow.
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
    const page = read("index.html");
    const head = page.match(/<!-- theme-init: [^\n]*-->\n<script>([^\n]*)<\/script>/)[1];
    const runHead = () => {
      const attrs = {}; const r = { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, classList: { toggle() {} }, style: {} };
      const document = { documentElement: r }; Object.defineProperty(document, "cookie", cookieProp);
      vm.runInNewContext(head, { document, window: { localStorage: storage, matchMedia: () => ({ matches: false, addEventListener() {} }) }, location: { hostname: host, protocol: "https:" } });
      return attrs["data-theme"];
    };
    const themeCookies = () => [...jar.keys()].filter((k) => k.startsWith("theme|"));
    check("editor /site/ host: the head script migrates the old key onto the bare site domain", runHead() === "dark" && themeCookies().join() === "theme|example.org", themeCookies());

    // the public switch on the same host, with the editor's templated config (SITE_DOMAIN = example.org)
    const root = { dataset: {}, classList: { toggle() {} }, style: {} };
    const ctx = { console, location: { host, protocol: "https:", search: "", pathname: "/site/" }, scrollY: 0, onContent() {}, localStorage: storage,
      SITE_ENV: { scheme: "https", domain: "example.org" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
    ctx.window = ctx;
    ctx.document = { documentElement: root, body: { hasAttribute: () => false }, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
    Object.defineProperty(ctx.document, "cookie", cookieProp);
    vm.createContext(ctx);
    vm.runInContext(read("js/components.js") + "\n;globalThis.T = { setTheme, storedTheme };", ctx);
    ctx.T.setTheme("light");
    check("editor /site/ host: Light replaces it, one theme cookie, and a reload is light", themeCookies().join() === "theme|example.org" && jar.get("theme|example.org") === "light" && runHead() === "light", themeCookies());
    ctx.T.setTheme("system");
    check("editor /site/ host: System clears it, no theme cookie left, and a reload follows the system", themeCookies().length === 0 && runHead() === undefined && ctx.T.storedTheme() === "system", themeCookies());
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
check("the stylesheet defines its colours as light-dark() tokens", themed.length >= 30, `found ${themed.length}`);
check("the root asks for both schemes", /color-scheme: light dark;/.test(rootBlock));
check("an explicit choice is honoured (data-theme light and dark)", /:root\[data-theme="light"\] \{ color-scheme: light; \}/.test(css) && /:root\[data-theme="dark"\] \{ color-scheme: dark; \}/.test(css));
const bad = themed.filter((t) => !/^light-dark\(\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*\)$/i.test(t.value));
check("every light-dark() token holds two colours (it does not work for other values)", bad.length === 0, bad.map((t) => t.name).join(", "));

// Outside the token block, colours must be tokens. Allowed: the few places that are the same in both themes.
const ALLOWED = [
  ".brand-logo",                         // logo sits on a white disc
  "rgba(7, 9, 15, 0.35) 0%",             // hero wash over the photo (dark in both themes)
  "transparent 38%, rgba(7, 9, 15, 0.94)", // robot photo cards (dark in both themes)
  "background: rgba(7, 9, 15, 0.6);",    // the status pill on a robot photo
  "background: #ffffff;",                // sponsor tiles: logos are made for white
  ".sponsor-tile span { color: #0b1224",
  "-webkit-mask: linear-gradient(#000 0 0)", // mask shapes, not visible colours
  "rgba(7, 9, 15, 0.72), rgba(7, 9, 15, 0)", // scrim behind the nav over the hero photo (dark in both themes)
  "mask-composite",
];
const after = css.slice(css.indexOf(rootBlock) + rootBlock.length);
const literals = after.split("\n").filter((l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l) && !ALLOWED.some((a) => l.includes(a)));
check("no stray colour literals outside the tokens", literals.length === 0, literals.slice(0, 4).map((l) => l.trim().slice(0, 70)).join(" | "));
const gold = after.split("\n").filter((l) => /color: var\(--gold\)/.test(l) && !/background|border/.test(l) && !/text-stroke/.test(l));
check("gold is never used as text colour (text uses --accent, which passes AA in both themes)", gold.length === 0, gold.slice(0, 3).map((l) => l.trim().slice(0, 70)).join(" | "));
const onGold = after.split("\n").filter((l) => /background: var\(--gold(-2)?\)/.test(l) && /color: var\(--ink\)/.test(l));
check("text on a gold fill uses --on-gold, not the page colour", onGold.length === 0, onGold.slice(0, 3).map((l) => l.trim().slice(0, 70)).join(" | "));
check("the film grain is switched off in the light theme", /:root\[data-theme="light"\] \{ --grain: 0; \}/.test(css) && /prefers-color-scheme: light\) \{ :root:not\(\[data-theme="dark"\]\) \{ --grain: 0; \}/.test(css));

function finish() {
  console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
