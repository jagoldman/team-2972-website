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
  const attrs = {};
  const root = { dataset: {}, };
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
  check("the switch marks only the chosen button pressed", buttons.map((b) => b.pressed).join(",") === "false,true,false");
  ctx.T.setTheme("light");
  check("Light replaces Dark", root.dataset.theme === "light" && store._m.get("theme") === "light");
  ctx.T.setTheme("system");
  check("System removes data-theme and forgets the choice", root.dataset.theme === undefined && !store._m.has("theme") && buttons.map((b) => b.pressed).join(",") === "false,false,true");
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
  check("blocked localStorage: reads as System", ctx.T.storedTheme() === "system");
}

// ---------- every page: the no-flash snippet comes before the stylesheet ----------
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html")).concat(["portal/index.html", "portal/install.html"]);
for (const page of pages) {
  const html = read(page);
  const css = html.indexOf('<link rel="stylesheet"');
  const snippet = html.indexOf('localStorage.getItem("theme")');
  check(`${page}: theme snippet is in <head>, before the stylesheet`, snippet > 0 && css > 0 && snippet < css && snippet < html.indexOf("</head>"));
  check(`${page}: snippet is guarded by try/catch and only accepts light or dark`, /try\{var t=localStorage\.getItem\("theme"\);if\(t==="light"\|\|t==="dark"\)document\.documentElement\.dataset\.theme=t\}catch\(e\)\{\}/.test(html));
  check(`${page}: declares color-scheme light dark`, /<meta name="color-scheme" content="light dark" \/>/.test(html));
}

// ---------- the stylesheet: colours are defined once ----------
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

console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
