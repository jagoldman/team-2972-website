// The public pages (design 8.2, light only, D190) in headless Chromium, in memory (no server, no docker), like
// portal-shell-test. Every public page at 320, 390 and 1440 px, with the OS set to dark, to light, and with a saved dark
// choice (the shared `theme` cookie and the old localStorage key) on top of a dark OS:
//   - the page is white, color-scheme is light, native form controls are light, and no theme switch exists
//   - no horizontal scroll, no console error, no failed request (published content and uploads are answered with 404 on purpose)
//   - every piece of visible text has at least 4.5:1 contrast (3:1 for large text) against what is behind it
//   - nothing is at opacity 0 at rest, no text is set over a photograph (the bumper is its own padded strip), no
//     upper-case label, no arrow on a link and no middle dot in the page's text
//   - both fonts load; Privacy and Terms are in the footer; the saved dark choice is left exactly as it was
// The same contrast check with the red bumper colour on every page. The bumper: a press swaps colour and words, the
// choice is there before the first paint of the next page, a throwing localStorage still swaps, reduced motion has no
// transition and nothing else on the site moves. Home in detail (320, 390, 1000, 1440); the season chart; the hero's
// srcset on a phone; both day-count states and the end of the season; the sections the live site keeps that the demo
// has no place for (with their data-ck marks); the editor preview's empty tiers; the header; keyboard walk-throughs.
// Optional: PUBLIC_TEST_SHOTS=<dir> writes a screenshot of every load there (viewport, not full page; full page with
//           PUBLIC_TEST_FULL=1); PUBLIC_TEST_PHOTO_MAP=<json file {"<Drive id>": "<image file>"}> answers those Drive photos
//           from local files (screenshots only; they never go into the repo).
// Needs Playwright with its Chromium from an existing install (nothing is added to landing):
//   LANDING_TEST_NODE_MODULES=/path/to/node_modules node test/public-test.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const modules = process.env.LANDING_TEST_NODE_MODULES;
if (!modules) {
  console.log("SKIP public-test: set LANDING_TEST_NODE_MODULES to a node_modules folder that has playwright");
  process.exit(2);
}
const { chromium } = createRequire(join(modules, "noop.js"))("playwright");
const SHOTS = process.env.PUBLIC_TEST_SHOTS || "";
const PHOTOS = process.env.PUBLIC_TEST_PHOTO_MAP ? JSON.parse(readFileSync(process.env.PUBLIC_TEST_PHOTO_MAP, "utf8")) : {};
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; if (process.env.VERBOSE) console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail !== undefined ? ` -- ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}

const PUBLIC = "http://landing.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".jpg": "image/jpeg" };
const PAGES = [["index", "/"], ["robots", "/robots.html"], ["robot", "/robot.html?year=2025"], ["robot-sparse", "/robot.html?year=2011"], ["sponsors", "/sponsors.html"], ["member", "/member.html"], ["mentor", "/mentor.html"],
  ["about", "/about.html"], ["resources", "/resources.html"], ["outreach", "/outreach.html"], ["media", "/media.html"], ["contact", "/contact.html"], ["privacy", "/privacy.html"], ["terms", "/terms.html"]];
const WIDTHS = [320, 390, 1440];
const MODES = [["os-dark", "dark", false], ["os-light", "light", false], ["saved-dark", "dark", true]];
const WHITE = "rgb(255, 255, 255)";
const FULL = Boolean(process.env.PUBLIC_TEST_FULL);
// config.js as Caddy fills it: the site's address and a manifest that lists the hero photo's blurred copies (D193). The
// blur table (window.PHOTO_BLUR) is the real file's.
const HERO = "1VgoMdevZH3syn0BvQq7QpFz09xrDS_rt";
const CONFIG = readFileSync(join(root, "config.js"), "utf8").replace('{{env "SITE_SCHEME"}}', "http").replace('{{env "SITE_DOMAIN"}}', "landing.test")
  .replace('{{readFile "img/drive/manifest.json"}}', JSON.stringify({ [HERO]: [400, 800, 1200, 1600] }));

async function newContext(browser, { width, scheme = "dark", saved = false, reducedMotion = "no-preference", scale = 1 }) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 800 }, colorScheme: scheme, reducedMotion, deviceScaleFactor: scale });
  const problems = [], google = [];   // google: every request to a Google host (D193)
  context.on("page", (p) => {
    p.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) problems.push(`console: ${m.text()}`); });
    p.on("response", (r) => { const u = new URL(r.url()); if (r.status() >= 400 && !/^\/(content|media)\//.test(u.pathname)) problems.push(`HTTP ${r.status()} ${u.pathname}`); });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (/(^|\.)(googleusercontent|googleapis|ggpht|gstatic|googledrive)\.com$|(^|\.)google\.[a-z.]+$/.test(url.hostname)) google.push(url.href);
    if (url.host === "lh3.googleusercontent.com") {
      const id = (url.pathname.match(/\/d\/([\w-]+)/) || [])[1];
      // D193: the hero (a face blurred at the owner's request) must never be asked for from Google.
      if (id === HERO) { problems.push(`PRIVACY: the hero photo was asked for from Google (${url.href})`); return route.abort(); }
      const file = PHOTOS[id];
      if (file && existsSync(file)) return route.fulfill({ contentType: "image/jpeg", body: readFileSync(file) });
      // No photo map: a plain grey 4:3 picture stands in, so photo boxes have a real size and the "no text over a photograph" check has something to find.
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#445"/></svg>' });
    }
    if (url.host !== "landing.test") return route.abort();
    if (url.pathname === "/config.js") return route.fulfill({ contentType: "text/javascript", body: CONFIG });
    // The hero's saved, blurred copies (D193); any other /img/drive file does not exist here.
    const saved = url.pathname.match(/^\/img\/drive\/([\w-]{20,}?)-b2-(\d+)\.webp$/);
    if (saved && saved[1] === HERO) {
      const file = PHOTOS[HERO];
      if (file && existsSync(file)) return route.fulfill({ contentType: file.endsWith(".png") ? "image/png" : "image/jpeg", body: readFileSync(file) });
      return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${saved[2]}" height="${saved[2] * 3 / 4}"><rect width="100%" height="100%" fill="#445"/></svg>` });
    }
    if (/^\/(content|media)\//.test(url.pathname)) return route.fulfill({ status: 404, body: "" });
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ contentType: TYPES[extname(file)] || "application/octet-stream", body: readFileSync(file) });
  });
  if (saved) {
    await context.addCookies([{ name: "theme", value: "dark", url: PUBLIC }]);
    await context.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch (e) { /* ignore */ } });
  }
  return { context, problems, google };
}

// Run inside the page: overflow, contrast, opacity, text over photos, dark controls.
function inspect() {
  const parse = (str) => { const m = String(str).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const blend = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [hi, lo] = lum(a) >= lum(b) ? [a, b] : [b, a]; return (lum(hi) + 0.05) / (lum(lo) + 0.05); };
  const backdrop = (el) => {   // what is behind an element: the nearest opaque backgrounds, blended from the page up
    const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let bg = [255, 255, 255, 1];
    for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) bg = blend(c, bg); }
    return bg;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyBg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme,
    dataTheme: document.documentElement.getAttribute("data-theme"), themeSwitch: document.querySelectorAll(".theme-switch").length, low: [], zero: [], overPhoto: [], upper: [], checked: 0, min: 99,
    marks: (document.body.innerText.match(/[↗→←]| · /g) || []), legal: !!document.querySelector('.ftr a[href="privacy.html"]') && !!document.querySelector('.ftr a[href="terms.html"]'),
    fonts: ["900 40px 'Big Shoulders'", "400 16px 'Libre Franklin'"].map((f) => document.fonts.check(f)) };
  const probe = document.createElement("input"); document.body.append(probe); out.inputScheme = getComputedStyle(probe).colorScheme; probe.remove();
  const imgs = [...document.querySelectorAll("img")].filter((i) => i.getClientRects().length && getComputedStyle(i).visibility !== "hidden").map((i) => ({ i, r: i.getBoundingClientRect() })).filter(({ i, r }) => r.width > 40 && r.height > 40 && i.complete && i.naturalWidth > 0);
  for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "IMG", "SVG", "PATH", "CIRCLE", "TITLE"].includes(el.tagName.toUpperCase())) continue;
    const cs = getComputedStyle(el);
    // Text in a closed disclosure is laid out by Chrome but not shown: skip it as the page's visitors never see it.
    if (el.closest("details:not([open]) > :not(summary)")) continue;
    if (el.closest("[hidden], [aria-hidden='true']") || cs.display === "none" || cs.visibility === "hidden" || !el.getClientRects().length) continue;
    const r0 = el.getBoundingClientRect();
    if (parseFloat(cs.opacity) === 0 && !el.closest(".vh") && r0.width > 1 && r0.height > 1) out.zero.push(el.tagName + "." + el.className);
    if (!(parseFloat(cs.opacity) >= 0) || opacityOf(el) < 0.2) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || el.closest(".vh") || cs.clipPath !== "none" && /inset/.test(cs.clipPath)) continue;
    if (cs.textTransform === "uppercase") out.upper.push(`${el.tagName.toLowerCase()} "${text.slice(0, 24)}"`);
    const fgc = parse(cs.color); if (!fgc) continue;
    const bg = backdrop(el), fg = fgc[3] < 1 ? blend(fgc, bg) : fgc;
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    const cr = ratio(fg, bg); out.checked++; out.min = Math.min(out.min, cr);
    if (cr < (large ? 3 : 4.5)) out.low.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${text.slice(0, 24)}" ${cr.toFixed(2)}:1`);
    for (const { i, r: ir } of imgs) {   // no text over a photograph
      // The bumper is a padded strip on its own opaque fill across the photo's base, as designed; its text is on the fill.
      if (i.contains(el) || el.contains(i) || el.closest("picture") || el.closest("#bumper")) continue;
      const w = Math.min(r.right, ir.right) - Math.max(r.left, ir.left), h = Math.min(r.bottom, ir.bottom) - Math.max(r.top, ir.top);
      if (w > 4 && h > 4) out.overPhoto.push(`${el.tagName.toLowerCase()} "${text.slice(0, 24)}" over ${i.getAttribute("src")}`);
    }
  }
  return out;
}

// Opens a page and waits for the content and the fonts.
async function open(page, path) {
  await page.goto(PUBLIC + path);
  await page.waitForFunction(() => document.documentElement.classList.contains("content-ready"), null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: FULL }); };

const browser = await chromium.launch();
try {
  // ---------- every page, three widths, three ways of asking for dark ----------
  for (const [mode, scheme, saved] of MODES) {
    for (const width of WIDTHS) {
      const { context, problems } = await newContext(browser, { width, scheme, saved });
      for (const [name, path] of PAGES) {
        const page = await context.newPage();
        const label = `${name} ${width}px ${mode}`;
        await open(page, path);
        const r = await page.evaluate(inspect);
        check(`${label}: white page, color-scheme light, light native controls, no data-theme, no theme switch`, r.bodyBg === WHITE && r.scheme === "light" && r.inputScheme === "light" && r.dataTheme === null && r.themeSwitch === 0, { bg: r.bodyBg, scheme: r.scheme, input: r.inputScheme, dataTheme: r.dataTheme, switch: r.themeSwitch });
        check(`${label}: no horizontal scroll`, r.overflow <= 0, `${r.overflow}px`);
        check(`${label}: visible text contrast (${r.checked} items, lowest ${r.min.toFixed(2)}:1)`, r.low.length === 0, r.low.slice(0, 4));
        check(`${label}: nothing at opacity 0 at rest`, r.zero.length === 0, r.zero.slice(0, 4));
        check(`${label}: no text over a photograph`, r.overPhoto.length === 0, r.overPhoto.slice(0, 3));
        check(`${label}: no upper-case label, no arrow and no middle dot in the page's text`, r.upper.length === 0 && r.marks.length === 0, { upper: r.upper.slice(0, 3), marks: r.marks });
        check(`${label}: both fonts loaded; Privacy and Terms in the footer`, r.fonts.every(Boolean) && r.legal, { fonts: r.fonts, legal: r.legal });
        if (saved) {
          const kept = await page.evaluate(() => ({ cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null, key: localStorage.getItem("theme") }));
          check(`${label}: the saved dark choice is left as it was`, kept.cookie === "dark" && kept.key === "dark", kept);
        }
        if (mode === "os-light" && width !== 320) await shot(page, `${name}-${width}`);
        await page.close();
      }
      check(`${mode} ${width}px: no console errors, script errors or failed requests on any page`, problems.length === 0, problems.slice(0, 5));
      await context.close();
    }
  }

  // ---------- the red bumper colour: contrast on every page, there before the first paint ----------
  for (const width of [390, 1440]) {
    const { context, problems } = await newContext(browser, { width });
    await context.addInitScript(() => {
      try { localStorage.setItem("2972-alliance", "red"); } catch (e) { /* ignore */ }
      // When the stylesheet's <link> arrives (the parser has run the head script before it), record the colour asked for.
      new MutationObserver((list, obs) => {
        for (const m of list) for (const n of m.addedNodes) if (n.nodeName === "LINK" && /site\.css/.test(n.getAttribute("href") || "")) { window.__allianceAtCss = document.documentElement.getAttribute("data-alliance"); obs.disconnect(); }
      }).observe(document, { childList: true, subtree: true });
    });
    for (const [name, path] of PAGES) {
      const page = await context.newPage();
      await open(page, path);
      const r = await page.evaluate(inspect);
      const red = await page.evaluate(() => ({ atCss: window.__allianceAtCss, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), login: getComputedStyle(document.querySelector(".nav-login")).backgroundColor }));
      check(`red ${name} ${width}px: the red choice is set before the stylesheet loads (no blue flash), and the accent is red`, red.atCss === "red" && red.accent === "#c3122a" && red.login === "rgb(195, 18, 42)", red);
      check(`red ${name} ${width}px: visible text contrast with the red accent (${r.checked} items, lowest ${r.min.toFixed(2)}:1)`, r.low.length === 0, r.low.slice(0, 4));
      if (name === "index" && width === 1440) await shot(page, "index-1440-red");
      await page.close();
    }
    check(`red ${width}px: no console errors or failed requests`, problems.length === 0, problems.slice(0, 5));
    await context.close();
  }

  // ---------- the bumper ----------
  {
    const { context, problems } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await open(page, "/");
    const before = await page.evaluate(() => { const b = document.getElementById("bumper"), s = getComputedStyle(b); return { alliance: document.documentElement.getAttribute("data-alliance"), label: b.getAttribute("aria-label"), words: [...b.children].map((c) => c.textContent).join("|"), bg: s.backgroundColor, transition: [s.transitionProperty, s.transitionDuration] }; });
    check("bumper: blue at first, says 'Swap to red bumpers' (words and aria-label), 2972 at each end", before.alliance === null && before.label === "Swap to red bumpers" && before.words === "2972|Swap to red bumpers|2972" && before.bg === "rgb(29, 67, 192)", before);
    check("bumper: its colour change is the site's one transition", before.transition[0] === "background-color" && before.transition[1] === "0.25s", before.transition);
    await page.click("#bumper");
    await page.mouse.move(5, 5);   // off the bumper: its hover colour is the pressed one
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => { const b = document.getElementById("bumper"); return { alliance: document.documentElement.getAttribute("data-alliance"), label: b.getAttribute("aria-label"), words: document.getElementById("bumperT").textContent, bg: getComputedStyle(b).backgroundColor, stored: localStorage.getItem("2972-alliance"), focus: document.activeElement.id }; });
    check("bumper: a press swaps to red, the words and aria-label say 'Swap to blue bumpers', the choice is kept", after.alliance === "red" && after.label === "Swap to blue bumpers" && after.words === "Swap to blue bumpers" && after.bg === "rgb(195, 18, 42)" && after.stored === "red", after);
    await page.keyboard.press("Enter");
    check("bumper: from the keyboard (Enter on the focused bumper) it swaps back to blue", await page.evaluate(() => document.documentElement.getAttribute("data-alliance") === "blue" && localStorage.getItem("2972-alliance") === "blue"));
    await page.click("#bumper");
    await open(page, "/about.html");
    const kept = await page.evaluate(() => ({ alliance: document.documentElement.getAttribute("data-alliance"), accent: getComputedStyle(document.querySelector('.nav-a[aria-current="page"]')).borderBottomColor }));
    check("bumper: the red choice survives a load of another page", kept.alliance === "red" && kept.accent === "rgb(195, 18, 42)", kept);
    // Nothing else on the site moves: no running animation and no other transition, on any page.
    const moving = [];
    for (const [name, path] of PAGES) {
      await open(page, path);
      const m = await page.evaluate(() => ({ anims: document.getAnimations().length, trans: [...document.querySelectorAll("body *")].filter((e) => e.id !== "bumper" && getComputedStyle(e).transitionDuration.split(",").some((d) => parseFloat(d) > 0)).map((e) => e.className).slice(0, 3) }));
      if (m.anims || m.trans.length) moving.push(`${name}: ${JSON.stringify(m)}`);
    }
    check("nothing moves by itself: no animation and no transition other than the bumper's, on every page", moving.length === 0, moving);
    check("bumper: no console errors", problems.length === 0, problems);
    await context.close();
  }
  {
    // localStorage that throws (blocked storage): the head script and the bumper still work; the swap is just not kept.
    const { context, problems } = await newContext(browser, { width: 390 });
    await context.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
    const page = await context.newPage();
    await open(page, "/");
    await page.click("#bumper");
    const r = await page.evaluate(() => ({ alliance: document.documentElement.getAttribute("data-alliance"), words: document.getElementById("bumperT").textContent }));
    check("bumper with a throwing localStorage: the page loads and a press still swaps to red", r.alliance === "red" && r.words === "Swap to blue bumpers" && problems.length === 0, { r, problems });
    const one = await page.evaluate(() => getComputedStyle(document.querySelectorAll(".bumper-n")[1]).display);
    check("bumper 390px: one 2972 is hidden under 720px", one === "none", one);
    await context.close();
    const rm = await newContext(browser, { width: 1440, reducedMotion: "reduce" });
    const p2 = await rm.context.newPage();
    await open(p2, "/");
    check("bumper with reduced motion: no transition", (await p2.evaluate(() => getComputedStyle(document.getElementById("bumper")).transitionDuration)) === "0s");
    await rm.context.close();
  }
  // The head script: exactly one, before the stylesheet, reading one stored value and setting one attribute.
  for (const [name, path] of PAGES) {
    const file = path === "/" ? "index.html" : path.slice(1).split("?")[0];
    const head = readFileSync(join(root, file), "utf8").split("</head>")[0];
    const scripts = head.match(/<script>[\s\S]*?<\/script>/g) || [];
    check(`${name}: one head script, the bumper's, before the stylesheet`, scripts.length === 1 && scripts[0] === '<script>try{var a=localStorage.getItem("2972-alliance");if(a==="red"||a==="blue")document.documentElement.setAttribute("data-alliance",a)}catch(e){}</script>' && head.indexOf(scripts[0]) < head.indexOf('href="css/site.css"'), scripts);
  }

  // ---------- Home (320, 390, 1000, 1440) ----------
  for (const width of [320, 390, 1000, 1440]) {
    const { context, problems } = await newContext(browser, { width });
    const page = await context.newPage();
    await open(page, "/");
    const h = await page.evaluate(() => {
      const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden]");
      const txt = (e) => (e ? e.textContent.replace(/\s+/g, " ").trim() : null);
      const small = [...document.querySelectorAll("a, button, [tabindex='0']")].filter(vis).filter((e) => !e.closest("p, li, td, figcaption, dd") || e.matches(".btn, .copy, .filter, .nav-a, .menu-btn")).map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 43.5 || r.width < 24).map(({ e, r }) => `${e.tagName.toLowerCase()} "${(e.textContent || "").trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      const wrap = document.querySelector("#record .log-scroll");
      const cols = [...document.querySelectorAll("#record .log-col")];
      const robots = [...document.querySelectorAll(".star a.robot-a")];
      const img = document.getElementById("hero-photo");
      return {
        h1: document.querySelectorAll("h1").length, headline: txt(document.querySelector("h1")),
        noAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt") || (vis(i) && !i.alt.trim() && !i.closest(".brand, .ftr-id"))).map((i) => i.src),
        small, btns: [...document.querySelectorAll(".hero .btns a")].map((a) => [txt(a), a.getAttribute("href"), a.classList.contains("btn-bumper")]),
        caption: txt(document.querySelector(".hero figcaption .cap")), school: !!document.querySelector(".hero .school-line img.wm"),
        hero: img && { srcset: img.getAttribute("srcset"), pos: img.style.objectPosition, ratio: Math.round(img.getBoundingClientRect().width / img.getBoundingClientRect().height * 100) / 100, priority: img.getAttribute("fetchpriority") },
        hint: txt(document.querySelector("#record .log-hint")), record: txt(document.querySelector("#record .record-line")),
        log: { left: wrap.scrollLeft, max: wrap.scrollWidth - wrap.clientWidth },
        seasons: cols.map((c) => [txt(c.querySelector(".log-year")), c.tagName === "A" ? c.getAttribute("href") : null, txt(c.querySelector(".log-name"))]),
        banners: [...document.querySelectorAll('#record .log-marks svg[role="img"] path')].map((p) => p.getAttribute("d")),
        markSizes: [...new Set([...document.querySelectorAll("#record .log-marks svg")].map((s) => `${s.getAttribute("width")}x${s.getAttribute("height")}`))],
        legend: [...document.querySelectorAll("#record .legend li")].map(txt),
        robots: robots.map((a) => ({ href: a.getAttribute("href"), name: txt(a.querySelector(".robot-name")), img: !!a.querySelector("img[alt]"), big: a.classList.contains("robot-big") })),
        seeAll: [...document.querySelectorAll(".star .more a")].map((a) => [txt(a), a.getAttribute("href")]),
        doors: [...document.querySelectorAll(".doors li")].map((li) => [txt(li.querySelector("h3")), li.querySelector("a").getAttribute("href")]),
        shop: { name: txt(document.querySelector("#shop-h")), machines: [...document.querySelectorAll(".tools li")].map(txt), more: document.querySelector("#shop-h").closest("section").querySelector(".more a").getAttribute("href") },
        spons: { heading: txt(document.querySelector("#spons-h")), names: [...document.querySelectorAll("#spons-h ~ .home-names li")].map(txt), imgs: document.querySelectorAll(".home-names img").length, all: [...document.querySelectorAll("#spons-h ~ .more a")].map((a) => [txt(a), a.getAttribute("href")]) },
        next: { head: [...document.querySelectorAll("#nextUp thead th")].map(txt), rows: [...document.querySelectorAll("#nextUp tbody tr")].map((tr) => [tr.className, ...[...tr.children].map(txt)]) },
        footer: { pages: [...document.querySelectorAll(".ftr-pages a")].map(txt), columns: getComputedStyle(document.querySelector(".ftr-pages")).columnCount, privacy: !!document.querySelector('.ftr-base a[href="privacy.html"]') && !!document.querySelector('.ftr-base a[href="terms.html"]'),
          login: !!document.querySelector(".ftr-pages a[href^='http'][href*='portal.']"), request: !!document.querySelector(".ftr-pages a[href$='/request']"), since: txt(document.querySelector(".ftr-id p + p")), wordmark: !!document.querySelector(".ftr-base img.wm-light") },
        brand: { n: txt(document.querySelector(".brand .brand-n")), name: txt(document.querySelector(".brand .brand-t")), nameShown: Boolean(vis(document.querySelector(".brand .brand-t"))) && getComputedStyle(document.querySelector(".brand .brand-t")).display !== "none" },
        data: { years: ROBOTS.map((r) => r.year), machines: HISTORY.workshop.machines, sponsors: SPONSOR_TIERS.find((t) => t.sponsors.length).sponsors.map((x) => x.name), n: ROBOTS.length },
      };
    });
    const L = `Home ${width}px`;
    check(`${L}: one h1, the newest award as the headline, every image has alt text`, h.h1 === 1 && h.headline === "Utah Regional winners, 2026." && h.noAlt.length === 0, { h1: h.h1, headline: h.headline, noAlt: h.noAlt });
    if (width <= 390) check(`${L}: every button and menu-bar link is a 44px tap target on a phone`, h.small.length === 0, h.small.slice(0, 5));
    check(`${L}: Join the team (the accent button) and Sponsor a season`, JSON.stringify(h.btns) === JSON.stringify([["Join the team", "member.html", true], ["Sponsor a season", "sponsors.html", false]]), h.btns);
    check(`${L}: the hero caption is live's, with the Dawson line beside it`, h.caption === "Utah Regional winners, 2026. The robot is Theseus." && h.school, h.caption);
    const ratio = width >= 1100 ? 2.5 : width >= 720 ? 2 : 1.33;
    check(`${L}: the hero photo: blurred copies only (D193) in a srcset of 400/800/1600, the content's crop, ${ratio}:1, fetched first`, h.hero && /-b2-400\.webp 400w, .*-b2-800\.webp 800w, .*-b2-1600\.webp 1600w/.test(h.hero.srcset) && !/google/.test(h.hero.srcset) && h.hero.pos === "50% 100%" && Math.abs(h.hero.ratio - ratio) < 0.03 && h.hero.priority === "high", h.hero);
    check(`${L}: the record as one sentence`, /^16 seasons since 2009, 2 event wins and \d+ events in the playoffs\.$/.test(h.record), h.record);
    check(`${L}: the season chart's hint`, h.hint === "Select a year to see that robot.", h.hint);
    const seasons = h.seasons.filter(([, href]) => href), empty = h.seasons.filter(([, href]) => !href);
    check(`${L}: every year with a season links to its robot; a year with none says "No season" and is not a link`, seasons.length === h.data.n && seasons.every(([y, href]) => href === `robot.html?year=${y}`) && empty.length > 0 && empty.every(([y, , n]) => !h.data.years.includes(y) && n === "No season"), h.seasons);
    check(`${L}: a won event is the banner mark; every mark is 22px; the legend names the four marks`, h.banners.filter((d) => d === "M4 1h14v20l-7-5.2L4 21z").length === 2 && JSON.stringify(h.markSizes) === '["22x22"]' && h.legend.join("|") === "Won the event|Alliance captain|Picked or in the playoffs|Played the event", { banners: h.banners.length, sizes: h.markSizes, legend: h.legend });
    if (width < 1100) check(`${L}: the season chart opens scrolled to the newest year`, h.log.max > 0 && h.log.left >= h.log.max - 1, h.log);
    const want = [...h.data.years].sort((a, b) => b - a).slice(0, 4);
    check(`${L}: The robots: the four newest, newest large, each with its photo (or Photo wanted) and name, linked to its page`, h.robots.length === 4 && h.robots.map((r) => r.href).join() === want.map((y) => `robot.html?year=${y}`).join() && h.robots[0].big && h.robots.every((r) => r.name), h.robots);
    check(`${L}: The robots: one button "See all 16 robots"`, JSON.stringify(h.seeAll) === JSON.stringify([["See all 16 robots", "robots.html"]]), h.seeAll);
    check(`${L}: Find your way in: Students, Sponsors, Mentors`, JSON.stringify(h.doors) === JSON.stringify([["Students", "member.html"], ["Sponsors", "sponsors.html"], ["Mentors", "mentor.html"]]), h.doors);
    check(`${L}: the workshop: its heading, each machine once as a list, About the team`, h.shop.name === "Our workshop" && h.shop.machines.join("|") === h.data.machines.join("|") && h.shop.more === "about.html", h.shop);
    check(`${L}: Recent sponsors, 2024 season: every name in type, one All sponsors button`, h.spons.heading === "Recent sponsors, 2024 season" && h.spons.names.join("|") === h.data.sponsors.join("|") && h.spons.imgs === 0 && JSON.stringify(h.spons.all) === JSON.stringify([["All sponsors", "sponsors.html"]]), h.spons);
    check(`${L}: Next event is a table (Event, Dates, Place, a hidden Starts), the next row first, ranges with an en dash, Denver at the Ritchie Center`, h.next.head.join("|") === "Event|Dates|Place|Starts" && h.next.rows[0][0] === "next" && h.next.rows[0][2] === "March 24–27, 2027" && h.next.rows.some((r) => /Ritchie Center, University of Denver, Denver/.test(r[3])), h.next);
    check(`${L}: the footer: 11 page links in two columns (Team login, Request an account), Privacy and Terms, Since 2008, the white wordmark`, h.footer.pages.length === 11 && h.footer.columns === "2" && h.footer.login && h.footer.request && h.footer.privacy && /Lafayette, Colorado\. Since 2008\.$/.test(h.footer.since) && h.footer.wordmark && h.footer.pages.includes("Team login"), h.footer);
    check(`${L}: the header shows 2972${width >= 900 ? " over the full team name" : " (the name is hidden on a phone, as designed)"}`, h.brand.n === "2972" && h.brand.name === "Gears & Buccaneers" && h.brand.nameShown === (width >= 900), h.brand);
    check(`${L}: no console errors or failed requests`, problems.length === 0, problems.slice(0, 3));
    await context.close();
  }
  // Home at 1440x900: the headline, both buttons and the bumper are on screen; the photo is at full brightness.
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await open(page, "/");
    const h = await page.evaluate(() => {
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
      const img = document.querySelector("#hero-photo"), c = img && getComputedStyle(img);
      return { h1: box(".hero h1"), btns: [...document.querySelectorAll(".hero .btns a")].map((a) => a.getBoundingClientRect().bottom), bumper: box("#bumper"), photo: box("#hero-photo"), filter: c && c.filter, opacity: c && c.opacity, vh: innerHeight };
    });
    check("Home 1440x900: the headline and both buttons are on screen, and the bumper starts on screen (as in the demo)", h.h1.bottom <= h.vh && h.btns.every((b) => b <= h.vh) && h.bumper.top < h.vh - 20, h);
    check("Home 1440x900: the bumper sits across the base of the photo; the photo is at full brightness", h.bumper.top < h.photo.bottom && h.bumper.bottom > h.photo.bottom && h.filter === "none" && h.opacity === "1", h);
    if (SHOTS) {
      await page.screenshot({ path: join(SHOTS, "home-hero-1440.png") });
      // A zoom on the blurred region (D193): the photo's rectangle, the ellipse's centre at the content's crop.
      const z = await page.evaluate(() => { const i = document.getElementById("hero-photo"), r = i.getBoundingClientRect(), nw = i.naturalWidth, nh = i.naturalHeight; const s = Math.max(r.width / nw, r.height / nh);
        const ox = (r.width - nw * s) * 0.5, oy = (r.height - nh * s) * 1.0; return { x: r.left + ox + 0.3825 * nw * s, y: r.top + scrollY + oy + 0.538 * nh * s, s, rw: r.width, rh: r.height }; });
      await page.screenshot({ path: join(SHOTS, "home-hero-1440-blur-zoom.png"), clip: { x: Math.max(0, z.x - 160), y: Math.max(0, z.y - 110), width: 320, height: 220 }, fullPage: true });
    }
    await context.close();
  }
  // The hero on a phone takes at most the 800 copy, even on a 2x screen; never Google.
  for (const [width, scale] of [[390, 1], [390, 2]]) {
    const { context, problems } = await newContext(browser, { width, scale });
    const page = await context.newPage();
    await open(page, "/");
    await page.waitForFunction(() => document.getElementById("hero-photo").complete);
    const src = await page.evaluate(() => document.getElementById("hero-photo").currentSrc);
    check(`Home ${width}px at ${scale}x: the hero loads the ${scale === 1 ? "400" : "800"} blurred copy (at most 800 on a phone)`, new RegExp(`/img/drive/${HERO}-b2-${scale === 1 ? 400 : 800}\\.webp$`).test(src) && problems.length === 0, { src, problems });
    await context.close();
  }
  // D193: with no saved blurred copy (a failed download), the hero shows no photo; Google is never asked.
  {
    const { context, problems } = await newContext(browser, { width: 1440 });
    await context.route("**/config.js", (route) => route.fulfill({ contentType: "text/javascript", body: CONFIG.replace(JSON.stringify({ [HERO]: [400, 800, 1200, 1600] }), "{}") }));
    const page = await context.newPage();
    await open(page, "/");
    const r = await page.evaluate(() => ({ img: !!document.getElementById("hero-photo"), bumper: !!document.getElementById("bumper"), noPhoto: !!document.querySelector(".hero-shot.no-photo") }));
    check("D193: no saved blurred hero: no hero photo (the bumper stays), and the original is never asked for from Google", !r.img && r.bumper && r.noPhoto && problems.length === 0, { r, problems });
    await context.close();
  }
  // D193 fail closed: when the blur list does not arrive (no config.js, one that does not parse, one without the list),
  // no page asks Google for anything and no Drive photo is on the page; the valid empty list behaves as before.
  {
    const EMPTY = 'window.SITE_ENV = { scheme: "http", domain: "landing.test", drivePhotos: "{}" };\nwindow.PHOTO_BLUR = { "format": 1, "photos": {} };';
    for (const [label, status, body, arrived] of [["config.js absent (404)", 404, "not found", false], ["config.js malformed (does not parse)", 200, 'window.SITE_ENV = { scheme: "http", ', false],
      ["config.js without the list", 200, 'window.SITE_ENV = { scheme: "http", domain: "landing.test", drivePhotos: "{}" };', false], ["config.js with the list in its old shape (no format marker)", 200, CONFIG.replace(/"format": 1,/, ""), false],
      ["the valid empty list", 200, EMPTY, true]]) {
      const { context, google } = await newContext(browser, { width: 1440 });
      await context.route("**/config.js", (route) => route.fulfill({ status, contentType: "text/javascript", body }));
      const page = await context.newPage();
      const onPage = [], drawn = [];
      for (const [name, path] of PAGES) {
        await open(page, path);
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } });
        await page.waitForTimeout(200);
        const r = await page.evaluate(() => ({ drawn: !!document.querySelector("main h1") && !!document.querySelector(".ftr"),
          google: [...document.querySelectorAll("img")].flatMap((i) => [i.getAttribute("src") || "", i.getAttribute("srcset") || ""]).concat([...document.querySelectorAll("a.shot, .pics a")].map((a) => a.getAttribute("href") || ""))
            .filter((u) => /googleusercontent|googleapis|ggpht|drive\.google|docs\.google/.test(u)) }));
        drawn.push(r.drawn); onPage.push(...r.google.map((u) => `${name}: ${u}`));
      }
      if (arrived) check(`D193 ${label}: photos behave as before (Drive photos come from Google when not saved, the hero too, as it is not in the list)`, google.length > 0 && google.some((u) => u.includes(HERO)) && drawn.every(Boolean), { google: google.length });
      else check(`D193 ${label}: every page is drawn, with no request to any Google host and no Google address on the page`, google.length === 0 && onPage.length === 0 && drawn.every(Boolean), { google: google.slice(0, 3), onPage: onPage.slice(0, 3), drawn });
      await context.close();
    }
  }
  // D193: one function for every Drive link form. Content edited as the editor does (setContent): the hero pasted as a
  // drive.google.com link shows its blurred copy; an unblurred photo pasted as a ?id= link loads by its ID; a Google
  // address that is not a Drive photo, and the hero in a form with no saved copy, show "Photo wanted" and are never requested.
  {
    const { context, google } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await open(page, "/robots.html");
    const other = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    const r = await page.evaluate(({ hero, other }) => {
      const robots = JSON.parse(JSON.stringify(ROBOTS));
      robots[0].image = `https://drive.google.com/file/d/${hero}/view?usp=sharing`;
      robots[1].image = `https://drive.usercontent.google.com/download?id=${other}&export=view`;
      robots[2].image = "https://lh3.googleusercontent.com/a/ACg8ocK-not-a-drive-photo";
      robots[3].image = `https://www.googleapis.com/drive/v3/files/${hero}?alt=media`;
      window.setContent({ ROBOTS: robots });
      const item = (i) => document.querySelector(`#robot-archive > li[data-ck="ROBOTS[${i}]"]`);
      const img = (i) => { const im = item(i).querySelector("img"); return im ? [im.getAttribute("src"), im.getAttribute("srcset")] : null; };
      return { a: img(0), b: img(1), c: { img: img(2), wanted: !!item(2).querySelector(".ph") }, d: img(3) };
    }, { hero: HERO, other });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((res) => setTimeout(res, 40)); } });
    await page.waitForTimeout(300);
    check("D193 forms: the hero pasted as a drive.google.com/file/d/ link shows only its blurred copies", r.a && /-b2-400\.webp$/.test(r.a[0]) && !/google/.test(r.a.join(" ")), r.a);
    check("D193 forms: the hero as a Drive API address shows its blurred copy too", r.d && /-b2-400\.webp$/.test(r.d[0]), r.d);
    check("D193 forms: an unblurred photo pasted as drive.usercontent ?id= loads by its ID from the one lh3 address", r.b && r.b[0] === `https://lh3.googleusercontent.com/d/${other}=w400`, r.b);
    check("D193 forms: a Google address that is not a Drive photo shows Photo wanted, no image", !r.c.img && r.c.wanted, r.c);
    check("D193 forms: Google is never asked for the hero or for the address it cannot reduce", !google.some((u) => u.includes(HERO) || u.includes("ACg8ocK")) && google.some((u) => u.includes(other)), google.filter((u) => u.includes(HERO) || u.includes("ACg8ocK") || u.includes(other)));
    await context.close();
  }
  // D193: a retired address of the hero supplied as content (as the Website editor can) shows the current blurred copy;
  // an old link-preview address shows nothing; no retired address is ever asked for.
  {
    const { context } = await newContext(browser, { width: 1440 });
    const asked = [];
    context.on("request", (rq) => asked.push(new URL(rq.url()).pathname));
    const page = await context.newPage();
    await open(page, "/robots.html");
    const r = await page.evaluate((hero) => {
      const robots = JSON.parse(JSON.stringify(ROBOTS));
      robots[0].image = `/img/drive/${hero}-1600.webp`;
      robots[1].image = `img/drive/${hero}-b1-800.webp`;
      robots[2].image = `http://landing.test/img/drive/${hero}-1600.webp`;
      robots[3].image = "/img/drive/og-image.jpg";
      robots[4].image = "img/drive/og-image-b1.jpg";
      window.setContent({ ROBOTS: robots, SITE: { ...SITE, heroImage: `/img/drive/${hero}-1600.webp` } });
      const item = (i) => document.querySelector(`#robot-archive > li[data-ck="ROBOTS[${i}]"]`);
      return [0, 1, 2, 3, 4].map((i) => { const im = item(i).querySelector("img"); return im ? im.getAttribute("src") : (item(i).querySelector(".ph") ? "Photo wanted" : null); });
    }, HERO);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((res) => setTimeout(res, 40)); } });
    await page.waitForTimeout(300);
    const cur = `/img/drive/${HERO}-b2-400.webp`;
    check("D193 retired: the hero's old addresses (old name, old mark, this site's full address) show the current b2 copy; old link-preview addresses show Photo wanted",
      JSON.stringify(r) === JSON.stringify([cur, cur, cur, "Photo wanted", "Photo wanted"]), r);
    const retired = asked.filter((p) => /^\/img\/drive\/(og-image(-b1)?\.jpg|[\w-]+-(b1-)?\d+\.webp)$/.test(p) && !p.includes("-b2-") && p.includes("/img/drive/") && (p.includes(HERO) || p.includes("og-image")));
    check("D193 retired: no retired address is ever requested", retired.length === 0, retired);
    await context.close();
  }
  // Editing targets the Website editor needs (exercised through setContent, as the editor's live preview does): the archive
  // keeps each tagline beside the stats; an unset outreach date and a photo with nothing to show get a target in the
  // editor's preview only; visitors see neither.
  for (const editor of [true, false]) {
    const { context } = await newContext(browser, { width: 1440 });
    if (editor) await context.addInitScript(() => { window.__editorOverlay = true; });
    await context.route("**/config.js", (route) => route.fulfill({ contentType: "text/javascript", body: CONFIG.replace(JSON.stringify({ [HERO]: [400, 800, 1200, 1600] }), "{}") }));
    const page = await context.newPage();
    const who = editor ? "editor preview" : "visitor";
    await open(page, "/robots.html");
    const rb = await page.evaluate(() => {
      const robots = JSON.parse(JSON.stringify(ROBOTS));
      robots[5].tagline = "A tagline added in the editor.";
      window.setContent({ ROBOTS: robots });
      return robots.map((r, i) => { const li = document.querySelector(`#robot-archive > li[data-ck="ROBOTS[${i}]"]`); return { tag: !!r.tagline, stats: !!r.stats,
        hasTag: !!li.querySelector(`[data-ck="ROBOTS[${i}].tagline"]`), hasStats: !!li.querySelector(`[data-ck="ROBOTS[${i}].stats"]`), text: (li.querySelector(`[data-ck="ROBOTS[${i}].tagline"]`) || {}).textContent }; });
    });
    check(`${who}: every archive card keeps its tagline (keyed) beside its stats, an added tagline too`, rb.every((x) => x.hasTag === x.tag && x.hasStats === x.stats) && rb[5].text === "A tagline added in the editor." && rb.filter((x) => x.tag && x.stats).length >= 4, rb.filter((x) => x.hasTag !== x.tag || x.hasStats !== x.stats));
    await open(page, "/outreach.html");
    const od = await page.evaluate(() => {
      const events = JSON.parse(JSON.stringify(OUTREACH_EVENTS));
      events[0].date = "";
      window.setContent({ OUTREACH_EVENTS: events });
      return events.map((e, i) => ({ date: e.date, target: !!document.querySelector(`[data-ck="OUTREACH_EVENTS[${i}].date"]`), words: (document.querySelector(`[data-ck="OUTREACH_EVENTS[${i}].date"]`) || {}).textContent }));
    });
    const unset = od.filter((x) => !x.date);
    check(`${who}: an unset outreach date (${unset.length}) ${editor ? "has a target the editor can click" : "shows nothing"}`, unset.length >= 3 && unset.every((x) => x.target === editor && (!editor || x.words === "No date set")), od);
    await open(page, "/");
    const hp = await page.evaluate((hero) => {
      window.setContent({ SITE: { ...SITE, heroImage: hero } });
      const t = document.querySelector('[data-ck="SITE.heroImage"]');
      return { img: !!document.getElementById("hero-photo"), target: !!t, type: t && t.getAttribute("data-ck-type"), spots: document.querySelectorAll(".editor-photo").length };
    }, HERO);
    check(`${who}: Home with the blurred hero unavailable: ${editor ? "a SITE.heroImage image target to replace it" : "no photo and no target"}`, !hp.img && hp.target === editor && (!editor || hp.type === "image") && (editor || hp.spots === 0), hp);
    await open(page, "/robot.html?year=2026");
    const rp = await page.evaluate((hero) => {
      const robots = JSON.parse(JSON.stringify(ROBOTS)); robots[0].image = hero; robots[0].gallery = [hero];
      window.setContent({ ROBOTS: robots });
      return { photo: !!document.getElementById("robot-photo"), target: !!document.querySelector('[data-ck="ROBOTS[0].image"]'), gallery: !!document.querySelector('[data-ck="ROBOTS[0].gallery[0]"]') };
    }, HERO);
    check(`${who}: a robot page whose photo and gallery photo cannot be shown ${editor ? "keeps both targets" : "shows neither"}`, !rp.photo && rp.target === editor && rp.gallery === editor, rp);
    await context.close();
  }
  // A draft with an outside link in rich text (setContent, as the editor's preview): the link opens in a new tab and says so.
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await open(page, "/about.html");
    const l = await page.evaluate(() => {
      const values = JSON.parse(JSON.stringify(VALUES));
      values[0].text = "Read the [FIRST core values](https://www.firstinspires.org/about/vision-and-mission) and [our robots](robots.html).";
      window.setContent({ VALUES: values });
      const [out, here] = document.querySelectorAll('[data-ck="VALUES[0].text"] a');
      return { out: out && [out.target, out.rel, out.querySelector(".vh") && out.querySelector(".vh").textContent, out.innerText.trim()], here: here && [here.target, !!here.querySelector(".vh")] };
    });
    check("rich text in a draft: an outside link opens in a new tab and tells a screen reader; a link on this site does neither", l.out && l.out[0] === "_blank" && l.out[1] === "noopener" && l.out[2] === " (opens in a new tab)" && l.out[3] === "FIRST core values" && l.here && l.here[0] === "" && !l.here[1], l);
    await context.close();
  }
  // The robots list follows the data (what the editor's live preview does: new content, the page re-renders)
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await open(page, "/");
    const after = await page.evaluate(() => {
      const robots = JSON.parse(JSON.stringify(ROBOTS));
      robots.push({ year: "2031", game: "Future Game", name: "Newbot", tagline: "A test robot." });
      robots[0].name = "Renamed";
      const ok = window.setContent({ ROBOTS: robots });
      return { ok, cards: [...document.querySelectorAll(".star a.robot-a")].map((a) => [a.getAttribute("href"), a.querySelector(".robot-name").textContent]),
        log: [...document.querySelectorAll("#record a.log-col")].pop().getAttribute("href"), wanted: !!document.querySelector('.star a[href="robot.html?year=2031"] .ph') };
    });
    check("Home: the robots follow edited robot data (a new 2031 season leads, with Photo wanted; a renamed robot shows its new name)", after.ok && after.cards.length === 4 && after.cards[0][0] === "robot.html?year=2031" && after.cards[0][1] === "Newbot" && after.cards[1][1] === "Renamed" && after.log === "robot.html?year=2031" && after.wanted, after);
    await page.focus("#record .log-scroll");
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return { year: e.matches("#record a.log-col"), style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }; });
    check("Home: a season-chart year focused from the keyboard has the 3px solid black outline", ring.year && ring.style === "solid" && ring.width === "3px" && ring.color === "rgb(0, 0, 0)", ring);
    await context.close();
  }
  // The season chart on a phone: opens at the newest year; the page's load event leaves it where the visitor put it.
  {
    const { context } = await newContext(browser, { width: 390 });
    const page = await context.newPage();
    await open(page, "/");
    const r = await page.evaluate(async () => {
      const w = document.querySelector("#record .log-scroll"), max = () => w.scrollWidth - w.clientWidth, frame = () => new Promise((res) => requestAnimationFrame(() => res()));
      const out = { start: [w.scrollLeft, max()] };
      w.scrollLeft = 0; await frame();
      dispatchEvent(new Event("load")); await frame();
      out.afterDrag = w.scrollLeft;
      w.slMoved = false; w.scrollLeft = 120; await frame();
      dispatchEvent(new Event("load")); await frame();
      out.afterMove = w.scrollLeft;
      w.scrollLeft = 30; w.slAutoLeft = 30; w.dispatchEvent(new WheelEvent("wheel", { deltaX: -40 })); await frame();
      dispatchEvent(new Event("load")); await frame();
      out.afterWheel = w.scrollLeft;
      return out;
    });
    check("Home 390px: the season chart opens at the newest year", r.start[1] > 0 && r.start[0] >= r.start[1] - 1, r);
    check("Home 390px: once the visitor has scrolled the chart, the page's load event leaves it where they put it", r.afterDrag === 0 && r.afterMove === 120 && r.afterWheel === 30, r);
    await open(page, "/robots.html");
    const rb = await page.evaluate(() => { const w = document.querySelector(".log-scroll"); return [w.scrollLeft, w.scrollWidth - w.clientWidth]; });
    check("Robots 390px: the season chart opens at the newest year too", rb[1] > 0 && rb[0] >= rb[1] - 1, rb);
    await context.close();
  }

  // Both day-count states, the day before, and the end of the season (the browser clock is set; no test hook in the page)
  for (const [when, expect] of [["2026-11-14T10:00:00-07:00", { line: "In 130 days" }], ["2027-01-22T10:00:00-07:00", { line: "In 61 days" }],
    ["2027-01-23T10:00:00-07:00", { big: "60" }], ["2027-03-01T10:00:00-07:00", { big: "23" }], ["2027-03-23T10:00:00-06:00", { line: "Starts tomorrow" }],
    ["2027-03-24T10:00:00-06:00", { line: "Starts today" }], ["2027-03-25T10:00:00-06:00", { line: "Happening now" }], ["2027-04-11T10:00:00-06:00", { over: true }]]) {
    const { context } = await newContext(browser, { width: 390 });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(when));
    await open(page, "/");
    const c = await page.evaluate(() => ({ cell: (document.querySelector("#nextUp tr.next .next-in") || {}).textContent, big: (document.querySelector("#nextUp .count-big") || {}).textContent,
      h2: document.querySelector("#nextUp h2").textContent, none: (document.querySelector("#nextUp .next-none") || {}).textContent, rows: document.querySelectorAll("#nextUp tbody tr").length }));
    const ok = expect.over ? c.h2 === "The season is over" && c.none === "Next season's events appear here when FIRST announces them." && c.rows === 0
      : expect.line ? c.h2 === "Next event" && c.cell === expect.line && c.big === undefined
      : c.big === expect.big && c.cell === `${expect.big} days to go`;
    check(`Home day count on ${when}: ${expect.over ? "the season is over" : expect.line ? `"${expect.line}"` : `the large number ${expect.big}, "days to go"`}`, ok, c);
    await context.close();
  }

  // ---------- the sections the live site keeps that the demo has no place for (with their data-ck marks) ----------
  {
    const { context, problems } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await open(page, "/robot.html?year=2025");
    const robot = await page.evaluate(() => { const i = ROBOTS.findIndex((r) => r.year === "2025"); const g = document.querySelector(`[data-ck="ROBOTS[${i}].gallery"]`);
      return { pics: g ? g.querySelectorAll("img").length : 0, want: ROBOTS[i].gallery.length, keyed: g ? [...g.querySelectorAll("img")].every((im, k) => im.getAttribute("data-ck") === `ROBOTS[${i}].gallery[${k}]`) : false, h2: g && g.closest(".sec").querySelector("h2").textContent,
        newTab: g ? [...g.querySelectorAll("a")].every((a) => a.target === "_blank" && /opens in a new tab/.test(a.textContent)) : false }; });
    check("Robot 2025: the Photos gallery is kept, every photo keyed for the editor and opening in a new tab", robot.pics === robot.want && robot.pics === 22 && robot.keyed && robot.h2 === "Photos" && robot.newTab, robot);
    await open(page, "/robot.html?year=2026");
    const r26 = await page.evaluate(() => ({ awards: [...document.querySelectorAll(".awards li")].map((l) => [l.textContent, !!l.querySelector('path[d="M4 1h14v20l-7-5.2L4 21z"]'), l.getAttribute("data-ck")]), stats: [...document.querySelectorAll(".statlist li")].map((l) => l.textContent),
      win: [...document.querySelectorAll(".tbl tr.win th")].map((t) => t.textContent), match: [...document.querySelectorAll(".tbl thead th")].map((t) => t.textContent), pn: [...document.querySelectorAll(".pn a")].map((a) => a.textContent), tba: [...document.querySelectorAll(".sec a")].map((a) => a.textContent).find((t) => /season on The Blue Alliance/.test(t)) }));
    check("Robot 2026: awards with the banner mark (keyed), stats as a list, the won event says Winner, Match data, Older, the season on The Blue Alliance",
      r26.awards.length === 1 && r26.awards[0][0] === "Utah Regional Winners" && r26.awards[0][1] && /awards\[0\]$/.test(r26.awards[0][2]) && r26.stats.length === 3 && r26.win.length === 1 && /Winner$/.test(r26.win[0]) && r26.match.join("|") === "Event|Rank|Record|Playoffs|Match data"
      && r26.pn.length === 1 && /^Older: 2025, /.test(r26.pn[0]) && r26.tba === "The 2026 season on The Blue Alliance (opens in a new tab)", r26);
    await open(page, "/robot.html?year=2011");
    const r11 = await page.evaluate(() => ({ photo: !!document.getElementById("robot-photo"), wide: document.querySelector(".robot-head .split > div").className, ask: [...document.querySelectorAll(".sec h2")].map((h) => h.textContent).includes("Help us fill in the archive") }));
    check("Robot 2011 (no photo): no tile, the text widens, the archive ask is there", !r11.photo && /s8/.test(r11.wide) && r11.ask, r11);
    await open(page, "/robot.html?year=1999");
    check("Robot not found keeps its page", (await page.textContent("h1")) === "Robot not found");
    await open(page, "/robots.html");
    const rb = await page.evaluate(() => { const i = ROBOTS.findIndex((r) => r.year === "2011"); const li = document.querySelector(`#robot-archive > li[data-ck="ROBOTS[${i}]"]`); const ph = li.querySelector("a.shot");
      return { href: ph && ph.getAttribute("href"), label: ph && ph.getAttribute("aria-label"), words: ph && ph.textContent, link: li.querySelector("a.robot-a").getAttribute("href"), h2: [...document.querySelectorAll("h2")].map((h) => h.textContent) }; });
    check("Robots: a robot with no photo has a Photo wanted tile that is a mail link, and its words link to its page", /^mailto:.*subject=Photo%20of%20the%202011%20robot$/.test(rb.href) && /Photo wanted/.test(rb.label) && /2011Photo wanted/.test(rb.words) && rb.link === "robot.html?year=2011" && rb.h2.includes("Every robot") && rb.h2.includes("Highlights"), rb);
    await open(page, "/about.html");
    const ab = await page.evaluate(() => ({ strategy: document.querySelectorAll('[data-ck="STRATEGY"] > li').length, keyed: [...document.querySelectorAll('[data-ck="STRATEGY"] > li')].every((l, k) => l.getAttribute("data-ck") === `STRATEGY[${k}]` && l.querySelector(`[data-ck="STRATEGY[${k}].name"]`)), h2: [...document.querySelectorAll("main h2")].map((h) => h.textContent), wins: [...document.querySelectorAll(".sheet dd")].pop().textContent }));
    check("About: How we work (STRATEGY, 7 lines, keyed) is kept between What we value and How the team grew; event wins with commas", ab.strategy === 7 && ab.keyed && ab.h2.join("|") === "What we value|How we work|How the team grew" && !/·/.test(ab.wins), ab);
    await open(page, "/sponsors.html");
    const sp = await page.evaluate(() => ({ tile: (() => { const li = document.querySelector("li.logo-tile"); return li && { ck: li.getAttribute("data-ck"), img: !!li.querySelector("img[data-sponsor-logo]"), failed: li.classList.contains("logo-failed"), name: getComputedStyle(li.querySelector(".sp-name")).display !== "none" && li.textContent.includes("Dawson School") }; })(),
      packet: (() => { const a = document.getElementById("packet-link"); return a && [a.textContent, a.className, a.target]; })(), hidden: document.querySelectorAll('section[hidden][data-ck^="SPONSOR_TIERS["]').length, drill: /miter saw, drill on drill presses, and prototype/.test(document.body.textContent) }));
    check("Sponsors: a real logo is a tile (keyed); when its file fails the name shows instead", sp.tile && /^SPONSOR_TIERS\[\d+\]\.sponsors\[\d+\]$/.test(sp.tile.ck) && sp.tile.img && sp.tile.failed && sp.tile.name, sp.tile);
    check("Sponsors: Read the sponsorship packet is the accent button, opening in a new tab; an empty tier is hidden; the machines sentence names the drill presses", sp.packet && sp.packet[0] === "Read the sponsorship packet (opens in a new tab)" && /btn-bumper/.test(sp.packet[1]) && sp.packet[2] === "_blank" && sp.hidden === 1 && sp.drill, sp);
    for (const p of ["member", "mentor"]) {
      await open(page, `/${p}.html`);
      const j = await page.evaluate(() => ({ cal: (() => { const a = document.getElementById("calendar-link"); return a && [a.getAttribute("data-ck-href"), a.target, a.textContent]; })(), first: document.querySelectorAll(".first-links a").length, year: document.querySelectorAll('[data-ck="ANNUAL_EVENTS"] > li').length }));
      check(`${p}: the Team calendar link (keyed) and the year at a glance are kept${p === "mentor" ? "; all three FIRST links" : ""}`, j.cal && j.cal[0] === "TEAM_CALENDAR_URL" && j.cal[1] === "_blank" && j.cal[2] === "Team calendar (opens in a new tab)" && j.year === 4 && (p !== "mentor" || j.first === 3), j);
    }
    await open(page, "/resources.html");
    const rs = await page.evaluate(() => ({ access: [...document.querySelectorAll('#request-access [data-ck^="REQUEST_ACCESS["] > a')].map((a) => [a.textContent, a.getAttribute("href").slice(0, 7)]), tools: [...document.querySelectorAll("#team-tools a")].map((a) => [a.textContent, a.getAttribute("data-ck-href")]),
      cad: document.querySelector("#cad-overview h2").textContent, logo: (() => { const a = [...document.querySelectorAll(".res-list a[download]")][0]; return a && [a.getAttribute("download"), a.target]; })(), self: (() => { const a = document.querySelector('.res-list a[href="#cad-overview"]'); return a && a.target; })(), hidden: [...document.querySelectorAll(".res-list a")].some((a) => a.getAttribute("href") === "#") }));
    check("Resources: Code, CAD and the Team Drive with both buttons and both Request access mail links; the CAD heading is live's; the logo downloads; #cad-overview stays on the page; # links stay hidden",
      rs.access.length === 2 && rs.access.every(([t, h]) => /^Request access/.test(t) && h === "mailto:") && rs.tools.length === 2 && rs.cad === "3D CAD/CAM Modeling Overview" && rs.logo && rs.logo[1] === "" && rs.self === "" && !rs.hidden, rs);
    await open(page, "/outreach.html");
    const oe = await page.evaluate(() => { const events = JSON.parse(JSON.stringify(OUTREACH_EVENTS)); events[2].date = "May 2026"; window.setContent({ OUTREACH_EVENTS: events });
      return { every: [...document.querySelectorAll("#outreach-grid > div")].map((d) => (d.textContent.match(/Every year\./) || []).length), date: (() => { const p = document.querySelector('#outreach-grid .when-line[data-ck="OUTREACH_EVENTS[2].date"]'); return p && p.textContent; })() }; });
    check("Outreach: an annual event says Every year.; any other date is shown above the name (keyed)", oe.every.join() === "1,1,0,0" && oe.date === "May 2026", oe);
    await open(page, "/media.html");
    const md = await page.evaluate(() => ({ photos: document.querySelectorAll('#photo-grid[data-ck="MEDIA_PHOTOS"] img').length, want: MEDIA_PHOTOS.length, h2: [...document.querySelectorAll("main h2")].map((h) => h.textContent), video: [...document.querySelectorAll("#video-grid li > span")].map((s) => s.textContent) }));
    check("Media: the MEDIA_PHOTOS grid is kept (keyed); Videos, In the press, Photos, Follow along", md.photos === md.want && md.photos === 8 && md.h2.join("|") === "Videos|In the press|Photos|Follow along" && md.video.every((t) => t.length > 0), md);
    check("kept sections: no console errors or failed requests", problems.length === 0, problems.slice(0, 3));
    await context.close();
    // The editor's preview (window.__editorOverlay) shows the empty tier so its hooks can be reached.
    const ed = await newContext(browser, { width: 1440 });
    await ed.context.addInitScript(() => { window.__editorOverlay = true; });
    const p2 = await ed.context.newPage();
    await open(p2, "/sponsors.html");
    const e = await p2.evaluate(() => ({ hidden: document.querySelectorAll('section[hidden][data-ck^="SPONSOR_TIERS["]').length, empty: document.querySelectorAll(".editor-empty").length }));
    check("editor preview: an empty sponsor tier is shown, with its empty-list spot", e.hidden === 0 && e.empty === 1, e);
    await ed.context.close();
  }

  // ---------- the header: Home "2972" and the name, every other page "2972 Team" ----------
  for (const width of [320, 390, 1280]) {
    const { context, problems } = await newContext(browser, { width });
    const page = await context.newPage();
    for (const [name, path] of PAGES) {
      await open(page, path);
      const h = await page.evaluate(() => {
        const brand = document.querySelector(".hdr .brand"), toggle = document.querySelector(".menu-btn"), tr = toggle.getBoundingClientRect();
        const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none";
        return { words: [...brand.querySelectorAll(".brand-n, .brand-t, .brand-one")].filter(shown).map((e) => e.textContent.trim()).join("|"), label: brand.textContent.replace(/\s+/g, " ").trim(),
          barH: Math.round(document.querySelector(".hdr-in").getBoundingClientRect().height), rule: getComputedStyle(document.querySelector(".hdr")).borderBottomWidth,
          clear: shown(toggle) ? brand.getBoundingClientRect().right <= tr.left : true, login: (document.querySelector(".nav-login") || {}).textContent, school: !!document.querySelector(".hdr-school img[alt='Dawson School']"), over: document.documentElement.scrollWidth - innerWidth };
      });
      const want = name === "index" ? (width >= 900 ? "2972|Gears & Buccaneers" : "2972") : "2972 Team";
      // The bar stays at the top of the screen when the page is scrolled.
      const stuck = await page.evaluate(async () => { scrollTo(0, 700); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const t = Math.round(document.querySelector(".hdr").getBoundingClientRect().top); scrollTo(0, 0); return t; });
      check(`header ${width}px ${name}: stays at the top when the page is scrolled`, stuck === 0, stuck);
      check(`header ${width}px ${name}: "${want}", the Dawson D, a ${width >= 900 ? "72" : "60"}px bar with the 3px black rule, clear of Menu, no sideways scroll`,
        h.words === want && h.school && h.barH >= (width >= 900 ? 72 : 60) && h.rule === "3px" && h.clear && h.over <= 0 && h.login === "Team login", h);
    }
    check(`header ${width}px: no console error or failed request`, problems.length === 0, problems);
    await context.close();
  }

  // ---------- keyboard ----------
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    const focused = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || (e.textContent + [...e.querySelectorAll("img")].map((i) => ` ${i.alt}`).join("")) || e.getAttribute("href") || "").replace(/\s+/g, " ").trim().slice(0, 60)}` : ""; });
    const ring = () => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
    await open(page, "/about.html");
    const seen = [];
    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => { const e = document.activeElement; return { cls: e.className, text: e.textContent, href: e.getAttribute("href"), top: e.getBoundingClientRect().top }; });
    check("keyboard: the first Tab reaches the skip link, shown on screen", skip.cls === "skip" && skip.text === "Skip to the page" && skip.href === "#about-page" && skip.top >= 0, skip);
    for (let i = 0; i < 9; i++) { await page.keyboard.press("Tab"); seen.push(await focused()); if (i < 8) check(`header keyboard: "${seen[i]}" shows a focus ring`, await ring()); }
    check("header keyboard: after the skip link: Dawson School, the team brand, Robots, About, Sponsors, Join, Resources, Team login", /Dawson School/.test(seen[0]) && /2972/.test(seen[1]) && seen[2].endsWith("Robots") && seen[3].endsWith("About") && seen[4].endsWith("Sponsors") && seen[5].endsWith("Join") && seen[6].endsWith("Resources") && /Team login/.test(seen[7]), seen);
    check("header keyboard: the current page is marked (aria-current)", await page.evaluate(() => document.querySelector('.nav a[aria-current="page"]').textContent.trim()) === "About");
    // Robots filters: the count and the list follow
    await open(page, "/robots.html");
    const items = () => page.$$eval("#robot-archive > li", (e) => e.length);
    check("Robots: all 16 seasons at first, All pressed", (await items()) === 16 && (await page.getAttribute('[data-filter="all"]', "aria-pressed")) === "true");
    await page.focus('[data-filter="all"]');
    await page.keyboard.press("Tab"); check("Robots filters: Tab moves to Event winners", (await focused()).endsWith("Event winners") && await ring());
    await page.keyboard.press("Space");
    check("Robots filters: Space shows only the two event winners and says so", (await items()) === 2 && (await page.textContent("#count")) === "Showing 2 of 16" && (await page.getAttribute('[data-filter="win"]', "aria-pressed")) === "true" && (await page.getAttribute('[data-filter="all"]', "aria-pressed")) === "false");
    await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
    check("Robots filters: Tab then Enter on Playoffs shows more seasons", (await page.getAttribute('[data-filter="po"]', "aria-pressed")) === "true" && (await items()) > 2 && (await items()) < 16, await items());
    await page.keyboard.press("Tab"); await page.keyboard.press("Space");
    check("Robots filters: In service shows the seasons marked In service", (await items()) === 2 && (await page.$$eval("#robot-archive > li", (e) => e.every((c) => /In service/.test(c.textContent)))));
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Space");
    check("Robots filters: back to All shows all 16", (await items()) === 16);
    // Join: two pages linked as tabs; the current one is marked
    await open(page, "/member.html");
    check("Join: Students is current, Mentors is a link", (await page.getAttribute('.tabs a[href="member.html"]', "aria-current")) === "page" && (await page.getAttribute('.tabs a[href="mentor.html"]', "aria-current")) === null);
    await page.focus('.tabs a[href="member.html"]');
    await page.keyboard.press("Tab");
    check("Join: Tab moves to Mentors with a focus ring", (await focused()).endsWith("Mentors") && await ring());
    await Promise.all([page.waitForURL("**/mentor.html"), page.keyboard.press("Enter")]);
    await page.waitForSelector(".tabs");
    check("Join: Enter opens the mentor page, where Mentors is current and the header still marks Join", (await page.getAttribute('.tabs a[href="mentor.html"]', "aria-current")) === "page" && (await page.evaluate(() => document.querySelector('.nav a[aria-current="page"]').textContent.trim())) === "Join");
    // Resources: category filters and search
    await open(page, "/resources.html");
    const links = () => page.$$eval("#resource-groups .res-list a", (e) => e.length);
    const all = await links();
    check("Resources: every set link is listed (the count line says so)", all > 40 && (await page.textContent("#res-count")) === `Showing ${all} links`, all);
    await page.focus("#res-q");
    await page.keyboard.type("wiring");
    check("Resources search: typing narrows the list and updates the count", (await links()) > 0 && (await links()) < 8 && (await page.textContent("#res-count")) === `Showing ${await links()} ${(await links()) === 1 ? "link" : "links"}`, await links());
    await page.fill("#res-q", "zzzzzz");
    check("Resources search: no match says so and offers to clear", /No link matches that search\./.test(await page.textContent("#resource-groups")) && (await page.textContent("[data-resclear]")) === "Clear the search");
    await page.focus("[data-resclear]"); await page.keyboard.press("Enter");
    check("Resources search: Clear (keyboard) empties the box, restores the list and focuses the box", (await links()) === all && (await page.inputValue("#res-q")) === "" && (await focused()).startsWith("input"));
    await page.focus('[data-rescat="Electronics"]'); await page.keyboard.press("Space");
    const elec = await links();
    check("Resources filters: Space on Electronics shows just that category", elec > 5 && elec < all && (await page.$$eval("#resource-groups .res-cat", (e) => e.length)) === 1 && (await page.getAttribute('[data-rescat="Electronics"]', "aria-pressed")) === "true");
    await page.fill("#res-q", "wiring");
    check("Resources filters and search work together", (await links()) > 0 && (await links()) < elec);
    // Copy address: copies (or selects) and says so, then its own words again
    await open(page, "/contact.html");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.click(".addr-big [data-copy]");
    check("Contact: Copy address says Copied", /^(Copied|Selected)$/.test(await page.textContent(".addr-big [data-copy]")));
    await page.close(); await context.close();
  }
  // The skip link on every page: the first thing Tab reaches, and Enter puts focus on the main landmark.
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    const bad = [];
    for (const [name, path] of PAGES) {
      await open(page, path);
      await page.keyboard.press("Tab");
      const first = await page.evaluate(() => { const e = document.activeElement; return { skip: e.classList.contains("skip"), href: e.getAttribute("href"), firstFocusable: document.querySelector("a[href], button, input, [tabindex]") === e }; });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => { const e = document.activeElement; return { main: e.tagName === "MAIN", id: e.id }; });
      if (!first.skip || !first.firstFocusable || !after.main || `#${after.id}` !== first.href) bad.push(`${name}: ${JSON.stringify({ first, after })}`);
    }
    check("every page: the skip link is the first focusable element and goes to the main landmark", bad.length === 0, bad.slice(0, 3));
    await context.close();
  }
  // The open phone menu on a short screen scrolls inside the screen; focus leaving the header closes it.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 420 } });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.host !== "landing.test") return route.abort();
      if (url.pathname === "/config.js") return route.fulfill({ contentType: "text/javascript", body: CONFIG });
      if (/^\/(content|media|img)\//.test(url.pathname)) return route.fulfill({ status: 404, body: "" });
      const p = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const file = normalize(join(root, p));
      if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: TYPES[extname(file)] || "application/octet-stream", body: readFileSync(file) });
    });
    const page = await context.newPage();
    await open(page, "/about.html");
    await page.click("#menuBtn");
    const m = await page.evaluate(() => { const n = document.querySelector(".nav"), r = n.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, scroll: n.scrollHeight > n.clientHeight, over: n.scrollHeight }; });
    check("phone menu on a 390x420 screen: it ends inside the screen and scrolls within itself", m.bottom <= m.vh && m.scroll, m);
    await page.focus(".nav-login");
    const login = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
    check("phone menu on a short screen: its last item (Team login) can be reached and is shown on screen", login.top >= 0 && login.bottom <= login.vh, login);
    await page.keyboard.press("Tab");
    const out = await page.evaluate(() => ({ expanded: document.getElementById("menuBtn").getAttribute("aria-expanded"), open: document.querySelector(".hdr").classList.contains("open"), inHeader: !!document.activeElement.closest(".hdr") }));
    check("phone menu: Tab past its last item (focus leaves the header) closes it", out.expanded === "false" && !out.open && !out.inHeader, out);
    await context.close();
  }
  // the phone menu from the keyboard
  {
    const { context } = await newContext(browser, { width: 390 });
    const page = await context.newPage();
    await open(page, "/");
    await page.focus("#menuBtn");
    await page.keyboard.press("Enter");
    check("phone menu: Enter on Menu opens it and says so (aria-expanded)", (await page.getAttribute("#menuBtn", "aria-expanded")) === "true" && (await page.isVisible('.nav a[href="robots.html"]')));
    const tall = await page.$$eval(".nav a", (as) => as.every((a) => a.getBoundingClientRect().height >= 44));
    check("phone menu: every item is at least 44px tall", tall);
    await page.keyboard.press("Tab");
    check("phone menu: Tab goes to the first link inside the menu", await page.evaluate(() => document.activeElement.closest(".nav") !== null && document.activeElement.getAttribute("href") === "robots.html"));
    await page.keyboard.press("Escape");
    check("phone menu: Escape closes it and puts focus back on Menu", (await page.getAttribute("#menuBtn", "aria-expanded")) === "false" && (await page.evaluate(() => document.activeElement.id)) === "menuBtn");
    if (SHOTS) { await page.click("#menuBtn"); await shot(page, "menu-390-open"); }
    await context.close();
  }
  // a stray data-theme="dark" on a public page cannot darken it (an old saved choice applied by something else)
  {
    const { context } = await newContext(browser, { width: 1440, scheme: "dark" });
    const page = await context.newPage();
    await open(page, "/about.html");
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); document.documentElement.classList.add("dark"); });
    const forced = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, paper: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim(), scheme: getComputedStyle(document.documentElement).colorScheme }));
    check("a forced data-theme=dark does not change the public page (white paper, light scheme)", forced.paper === "#ffffff" && forced.bg === WHITE && forced.scheme === "light", forced);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
