// The public pages (Midnight & brass, dark only) in headless Chromium, in memory (no server, no docker), like portal-shell-test.
// Every public page at 320, 390 and 1440 px, with the OS set to dark, to light, and with a saved light choice (the shared
// `theme` cookie and the old localStorage key) on top of a light OS:
//   - the page is the dark ink colour, color-scheme is dark, native form controls are dark, and no theme switch exists
//   - no horizontal scroll, no console error, no failed request (published content and uploads are answered with 404 on purpose)
//   - every piece of visible text has at least 4.5:1 contrast (3:1 for large text) against what is behind it
//   - nothing is at opacity 0 at rest, and no text is set over a photograph
//   - the saved light choice is left exactly as it was (the portal owns it)
// Keyboard walk-throughs: the header (and the phone Menu), the Robots filters, the Join switch, the Resources filters and search.
// Home at 1440x900 shows, without scrolling, the headline, both buttons, the whole hero photo and the next event.
// Optional: PUBLIC_TEST_SHOTS=<dir> writes a full-page screenshot of every load there;
//           PUBLIC_TEST_PHOTO_MAP=<json file {"<Drive id>": "<image file>"}> answers those Drive photos from local files (screenshots only).
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
const MODES = [["os-dark", "dark", false], ["os-light", "light", false], ["saved-light", "light", true]];
const INK = "rgb(16, 24, 39)";

async function newContext(browser, { width, scheme = "dark", saved = false, reducedMotion = "no-preference" }) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 800 }, colorScheme: scheme, reducedMotion });
  const problems = [];
  context.on("page", (p) => {
    p.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) problems.push(`console: ${m.text()}`); });
    p.on("response", (r) => { const u = new URL(r.url()); if (r.status() >= 400 && !/^\/(content|media)\//.test(u.pathname)) problems.push(`HTTP ${r.status()} ${u.pathname}`); });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.host === "lh3.googleusercontent.com") {
      const file = PHOTOS[(url.pathname.match(/\/d\/([\w-]+)/) || [])[1]];
      if (file && existsSync(file)) return route.fulfill({ contentType: "image/jpeg", body: readFileSync(file) });
      // No photo map: a plain grey 4:3 picture stands in, so photo boxes have a real size and the "no text over a photograph" check has something to find.
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#445"/></svg>' });
    }
    if (url.host !== "landing.test") return route.abort();
    if (url.pathname === "/config.js") return route.fulfill({ contentType: "text/javascript", body: 'window.SITE_ENV = { scheme: "http", domain: "landing.test", drivePhotos: "{}" };' });
    if (/^\/(content|media)\//.test(url.pathname)) return route.fulfill({ status: 404, body: "" });
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ contentType: TYPES[extname(file)] || "application/octet-stream", body: readFileSync(file) });
  });
  if (saved) {
    await context.addCookies([{ name: "theme", value: "light", url: PUBLIC }]);
    await context.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch (e) { /* ignore */ } });
  }
  return { context, problems };
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
    let bg = [16, 24, 39, 1];
    for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) bg = blend(c, bg); }
    return bg;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyBg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme,
    dataTheme: document.documentElement.getAttribute("data-theme"), themeSwitch: document.querySelectorAll(".theme-switch").length, low: [], zero: [], overPhoto: [], checked: 0, min: 99 };
  const probe = document.createElement("input"); document.body.append(probe); out.inputScheme = getComputedStyle(probe).colorScheme; probe.remove();
  const imgs = [...document.querySelectorAll("img")].filter((i) => i.getClientRects().length && getComputedStyle(i).visibility !== "hidden").map((i) => ({ i, r: i.getBoundingClientRect() })).filter(({ i, r }) => r.width > 40 && r.height > 40 && i.complete && i.naturalWidth > 0);
  for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "IMG", "SVG", "PATH", "CIRCLE", "TITLE"].includes(el.tagName.toUpperCase())) continue;
    const cs = getComputedStyle(el);
    if (el.closest("[hidden], [aria-hidden='true']") || cs.display === "none" || cs.visibility === "hidden" || !el.getClientRects().length) continue;
    const r0 = el.getBoundingClientRect();
    if (parseFloat(cs.opacity) === 0 && !el.closest(".vh") && r0.width > 1 && r0.height > 1) out.zero.push(el.tagName + "." + el.className);
    if (!(parseFloat(cs.opacity) >= 0) || opacityOf(el) < 0.2) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || el.closest(".vh") || cs.clipPath !== "none" && /inset/.test(cs.clipPath)) continue;
    const fgc = parse(cs.color); if (!fgc) continue;
    const bg = backdrop(el), fg = fgc[3] < 1 ? blend(fgc, bg) : fgc;
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    const cr = ratio(fg, bg); out.checked++; out.min = Math.min(out.min, cr);
    if (cr < (large ? 3 : 4.5)) out.low.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${text.slice(0, 24)}" ${cr.toFixed(2)}:1`);
    for (const { i, r: ir } of imgs) {   // no text over a photograph
      if (i.contains(el) || el.contains(i) || el.closest("picture")) continue;
      const w = Math.min(r.right, ir.right) - Math.max(r.left, ir.left), h = Math.min(r.bottom, ir.bottom) - Math.max(r.top, ir.top);
      if (w > 4 && h > 4) out.overPhoto.push(`${el.tagName.toLowerCase()} "${text.slice(0, 24)}" over ${i.getAttribute("src")}`);
    }
  }
  return out;
}

const browser = await chromium.launch();
try {
  // ---------- every page, three widths, three ways of asking for light ----------
  for (const [mode, scheme, saved] of MODES) {
    for (const width of WIDTHS) {
      const { context, problems } = await newContext(browser, { width, scheme, saved });
      for (const [name, path] of PAGES) {
        const page = await context.newPage();
        const label = `${name} ${width}px ${mode}`;
        await page.goto(PUBLIC + path);
        await page.waitForFunction(() => document.documentElement.classList.contains("content-ready"), null, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
        const r = await page.evaluate(inspect);
        check(`${label}: dark ink page, color-scheme dark, dark native controls, no data-theme, no theme switch`, r.bodyBg === INK && r.scheme === "dark" && r.inputScheme === "dark" && r.dataTheme === null && r.themeSwitch === 0, { bg: r.bodyBg, scheme: r.scheme, input: r.inputScheme, dataTheme: r.dataTheme, switch: r.themeSwitch });
        check(`${label}: no horizontal scroll`, r.overflow <= 0, `${r.overflow}px`);
        check(`${label}: visible text contrast (${r.checked} items, lowest ${r.min.toFixed(2)}:1)`, r.low.length === 0, r.low.slice(0, 4));
        check(`${label}: nothing at opacity 0 at rest`, r.zero.length === 0, r.zero.slice(0, 4));
        check(`${label}: no text over a photograph`, r.overPhoto.length === 0, r.overPhoto.slice(0, 3));
        if (saved) {
          const kept = await page.evaluate(() => ({ cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null, key: localStorage.getItem("theme") }));
          check(`${label}: the saved light choice is left as it was`, kept.cookie === "light" && kept.key === "light", kept);
        }
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${width}-${mode}.png`), fullPage: true });
        await page.close();
      }
      check(`${mode} ${width}px: no console errors, script errors or failed requests on any page`, problems.length === 0, problems.slice(0, 5));
      await context.close();
    }
  }

  // ---------- Home at 1440x900 (PUBLIC_REDESIGN_PROPOSAL §4, acceptance) ----------
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    await page.goto(PUBLIC + "/");
    await page.waitForFunction(() => document.documentElement.classList.contains("content-ready"));
    await page.waitForTimeout(800);
    const h = await page.evaluate(() => {
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
      const img = document.querySelector("#hero-photo"), c = img && getComputedStyle(img);
      return { h1: box(".hero h1"), btns: [...document.querySelectorAll(".hero .btns a")].map((a) => a.getBoundingClientRect().bottom), photo: box(".hero .photo"), filter: c && c.filter, opacity: c && c.opacity, mix: c && c.mixBlendMode,
        beforeBg: img && getComputedStyle(img.parentElement, "::after").content, next: box(".next-card"), name: box(".next-name"), dates: box(".next-card div"), vh: innerHeight, vw: innerWidth };
    });
    check("Home 1440x900: the headline is on screen", h.h1 && h.h1.bottom <= h.vh, h.h1);
    check("Home 1440x900: both buttons are on screen", h.btns.length === 2 && h.btns.every((b) => b <= h.vh), h.btns);
    check("Home 1440x900: the whole hero photo is on screen at full brightness", h.photo && h.photo.top >= 0 && h.photo.bottom <= h.vh && h.filter === "none" && h.opacity === "1" && h.mix === "normal" && (h.beforeBg === "none" || h.beforeBg === "normal"), h);
    check("Home 1440x900: the next event (name, dates, days to go) is on screen", h.next && h.next.bottom <= h.vh, h.next);
    await page.close();
    // reduced motion: the same page, nothing moves
    const rm = await newContext(browser, { width: 1440, reducedMotion: "reduce" });
    const p2 = await rm.context.newPage();
    await p2.goto(PUBLIC + "/");
    await p2.waitForFunction(() => document.documentElement.classList.contains("content-ready"));
    await p2.waitForTimeout(600);
    const m = await p2.evaluate(() => ({ beam: getComputedStyle(document.querySelector(".beam")).display, stats: [...document.querySelectorAll("[data-ticker]")].map((e) => [e.textContent, e.getAttribute("data-ticker")]), anims: document.getAnimations().length }));
    check("reduced motion: no border beam, the record numbers are final at once, nothing animates", m.beam === "none" && m.stats.length === 3 && m.stats.every(([t, n]) => t === n) && m.anims === 0, m);
    await rm.context.close();
    // motion allowed: the border beam runs on the next-event card and the numbers count up to the same final values
    const mo = await newContext(browser, { width: 1440 });
    const p3 = await mo.context.newPage();
    await p3.goto(PUBLIC + "/");
    await p3.waitForFunction(() => document.documentElement.classList.contains("content-ready"));
    await p3.waitForTimeout(300);
    const a = await p3.evaluate(() => ({ beam: getComputedStyle(document.querySelector(".beam")).display, running: document.getAnimations().some((x) => x.animationName === "beam") }));
    check("motion allowed: the next-event card has its border beam", a.beam === "block" && a.running, a);
    await p3.evaluate(() => document.querySelector(".stats").scrollIntoView());
    await p3.waitForTimeout(8000);
    const done = await p3.evaluate(() => [...document.querySelectorAll("[data-ticker]")].map((e) => [e.textContent, e.getAttribute("data-ticker")]));
    check("motion allowed: the record numbers end on the counted values", done.length === 3 && done.every(([t, n]) => t === n), done);
    await mo.context.close();
  }

  // ---------- keyboard ----------
  {
    const { context } = await newContext(browser, { width: 1440 });
    const page = await context.newPage();
    const focused = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || e.getAttribute("href") || "").trim().slice(0, 28)}` : ""; });
    const ring = () => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
    // header on desktop: school link, brand, five links, Team login, in that order, each with a focus ring
    await page.goto(PUBLIC + "/about.html");
    await page.waitForSelector(".site-header .nav-login");
    const seen = [];
    for (let i = 0; i < 9; i++) { await page.keyboard.press("Tab"); seen.push(await focused()); if (i < 8) check(`header keyboard: "${seen[i]}" shows a focus ring`, await ring()); }
    check("header keyboard: the order is school link, team brand, Robots, About, Sponsors, Join, Resources, Team Login", /^a:/.test(seen[0]) && /2972/.test(seen[1]) && seen[2].endsWith("Robots") && seen[3].endsWith("About") && seen[4].endsWith("Sponsors") && seen[5].endsWith("Join") && seen[6].endsWith("Resources") && /Team Login/.test(seen[7]), seen);
    check("header keyboard: the current page is marked (aria-current) and is not a link out", await page.evaluate(() => document.querySelector('.site-nav a[aria-current="page"]').textContent.trim()) === "About");
    // Robots filters: Tab to the chips, Space presses, the count and the cards follow, a second chip replaces the first
    await page.goto(PUBLIC + "/robots.html");
    await page.waitForSelector("[data-filter]");
    const cards = () => page.$$eval("#robot-archive .card", (e) => e.length);
    check("Robots: all 16 seasons at first, the All chip pressed", (await cards()) === 16 && (await page.getAttribute('[data-filter="all"]', "aria-pressed")) === "true");
    await page.focus('[data-filter="all"]');
    await page.keyboard.press("Tab"); check("Robots filters: Tab moves to Event winners", (await focused()).endsWith("Event winners") && await ring());
    await page.keyboard.press("Space");
    check("Robots filters: Space shows only the two event winners and says so", (await cards()) === 2 && (await page.textContent("#count")) === "Showing 2 of 16" && (await page.getAttribute('[data-filter="win"]', "aria-pressed")) === "true" && (await page.getAttribute('[data-filter="all"]', "aria-pressed")) === "false");
    await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
    check("Robots filters: Tab then Enter on Playoffs shows more seasons", (await page.getAttribute('[data-filter="po"]', "aria-pressed")) === "true" && (await cards()) > 2 && (await cards()) < 16, await cards());
    await page.keyboard.press("Tab"); await page.keyboard.press("Space");
    check("Robots filters: In service shows the seasons marked In service", (await cards()) === 2 && (await page.$$eval("#robot-archive .card", (e) => e.every((c) => /In service/.test(c.textContent)))));
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Space");
    check("Robots filters: back to All shows all 16", (await cards()) === 16);
    // Join switch: two links; Tab to Mentors, Enter goes there; the current one is marked
    await page.goto(PUBLIC + "/member.html");
    await page.waitForSelector(".seg");
    check("Join switch: Students is current, Mentors is a link", (await page.getAttribute('.seg a[href="member.html"]', "aria-current")) === "page" && (await page.getAttribute('.seg a[href="mentor.html"]', "aria-current")) === null);
    await page.focus('.seg a[href="member.html"]');
    await page.keyboard.press("Tab");
    check("Join switch: Tab moves to Mentors with a focus ring", (await focused()).endsWith("Mentors") && await ring());
    await Promise.all([page.waitForURL("**/mentor.html"), page.keyboard.press("Enter")]);
    await page.waitForSelector(".seg");
    check("Join switch: Enter opens the mentor page, where Mentors is current and the header still marks Join", (await page.getAttribute('.seg a[href="mentor.html"]', "aria-current")) === "page" && (await page.evaluate(() => document.querySelector('.site-nav a[aria-current="page"]').textContent.trim())) === "Join");
    // Resources: category chips and search
    await page.goto(PUBLIC + "/resources.html");
    await page.waitForSelector("#res-q");
    const links = () => page.$$eval("#resource-groups .res-list a", (e) => e.length);
    const all = await links();
    check("Resources: every set link is listed (the count line says so)", all > 40 && (await page.textContent("#res-count")) === `Showing ${all} links`, all);
    await page.focus("#res-q");
    await page.keyboard.type("wiring");
    check("Resources search: typing narrows the list, in all categories, and updates the count", (await links()) > 0 && (await links()) < 8 && (await page.textContent("#res-count")) === `Showing ${await links()} ${(await links()) === 1 ? "link" : "links"}`, await links());
    await page.fill("#res-q", "zzzzzz");
    check("Resources search: no match says so and offers to clear", /No resources match/.test(await page.textContent("#resource-groups")) && (await page.$("[data-resclear]")) !== null);
    await page.focus("[data-resclear]"); await page.keyboard.press("Enter");
    check("Resources search: Clear (keyboard) empties the box, restores the list and focuses the box", (await links()) === all && (await page.inputValue("#res-q")) === "" && (await focused()).startsWith("input"));
    await page.focus('[data-rescat="Electronics"]'); await page.keyboard.press("Space");
    const elec = await links();
    check("Resources chips: Space on Electronics shows just that category", elec > 5 && elec < all && (await page.$$eval("#resource-groups .res-cat", (e) => e.length)) === 1 && (await page.getAttribute('[data-rescat="Electronics"]', "aria-pressed")) === "true");
    await page.fill("#res-q", "wiring");
    check("Resources chips and search work together", (await links()) > 0 && (await links()) < elec);
    await page.close(); await context.close();
  }
  // the phone menu from the keyboard
  {
    const { context } = await newContext(browser, { width: 390 });
    const page = await context.newPage();
    await page.goto(PUBLIC + "/");
    await page.waitForSelector("#menuBtn");
    await page.focus("#menuBtn");
    await page.keyboard.press("Enter");
    check("phone menu: Enter on Menu opens it and says so (aria-expanded)", (await page.getAttribute("#menuBtn", "aria-expanded")) === "true" && (await page.isVisible('.site-nav a[href="robots.html"]')));
    await page.keyboard.press("Tab");
    check("phone menu: Tab goes to the first link inside the menu", await page.evaluate(() => document.activeElement.closest(".site-nav") !== null && document.activeElement.getAttribute("href") === "robots.html"));
    await page.keyboard.press("Escape");
    check("phone menu: Escape closes it and puts focus back on Menu", (await page.getAttribute("#menuBtn", "aria-expanded")) === "false" && (await page.evaluate(() => document.activeElement.id)) === "menuBtn");
    await context.close();
  }
  // a stray data-theme on a public page cannot lighten it (an old saved choice applied by something else)
  {
    const { context } = await newContext(browser, { width: 1440, scheme: "light" });
    const page = await context.newPage();
    await page.goto(PUBLIC + "/about.html");
    await page.waitForSelector(".site-header");
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); document.documentElement.classList.add("light"); document.documentElement.style.colorScheme = "light"; });
    const forced = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() }));
    check("a forced data-theme=light does not change the public tokens (the page keeps the ink colour)", forced.ink === "#101827" && forced.bg === INK, forced);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
