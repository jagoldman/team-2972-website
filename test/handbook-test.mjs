// The handbook at /handbook (release 8.3.1, D222-D224) in headless Chromium, in memory (no server, no docker), like
// public-test. Caddy's routes are mirrored: /handbook answers handbook/index.html; test/container-test.sh checks the
// real ones. At 1280 x 900, 390 x 844, 375 x 667 and 320 x 568, light and dark:
//   - the title and the draft line show; both of the site's fonts load; no request leaves the site (no Google host);
//     no sideways scroll; no script error; the link back to the home page shows (rail on a wide screen, top on a phone)
//   - every link in the contents rail scrolls to its section (the phone menu opens and closes); every in-page link has a target
//   - dark mode uses the page's dark colours; the print stylesheet hides the rail
//   - with JavaScript off the contents and every section are readable, and nothing scrolls sideways
//   - the text of every section is the source's (when HANDBOOK_SOURCE names the owner's file)
//   - the resources page's handbook link is "Team 2972 Program Handbook (working draft)" and goes to /handbook
// Optional: HANDBOOK_SHOTS=<dir> writes the screenshots the brief asks for (and the source's top at 1280 beside them).
// Needs Playwright: LANDING_TEST_NODE_MODULES=/path/to/node_modules node test/handbook-test.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const modules = process.env.LANDING_TEST_NODE_MODULES;
if (!modules) { console.log("SKIP handbook-test: set LANDING_TEST_NODE_MODULES to a node_modules folder that has playwright"); process.exit(2); }
const { chromium } = createRequire(join(modules, "noop.js"))("playwright");
const SHOTS = process.env.HANDBOOK_SHOTS || "";
const SOURCE = process.env.HANDBOOK_SOURCE || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; if (process.env.VERBOSE) console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail !== undefined ? ` -- ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}

const SITE = "http://landing.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const CONFIG = readFileSync(join(root, "config.js"), "utf8").replace('{{env "SITE_SCHEME"}}', "http").replace('{{env "SITE_DOMAIN"}}', "landing.test").replace('{{readFile "img/drive/manifest.json"}}', "{}");
const SIZES = [[1280, 900], [390, 844], [375, 667], [320, 568]];
const ANCHORS = ["short-version", "about", ...Array.from({ length: 13 }, (_, i) => `s${i + 1}`), "acknowledgment"];

async function newContext(browser, { width, height, scheme = "light", js = true, reducedMotion = "reduce", allowOutside = false }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, javaScriptEnabled: js, reducedMotion });
  const problems = [], outside = [];
  context.on("page", (p) => {
    p.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) problems.push(`console: ${m.text()}`); });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== SITE) { outside.push(url.href); return allowOutside ? route.continue() : route.abort(); }
    let p = decodeURIComponent(url.pathname);
    if (p === "/config.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: CONFIG });
    if (p === "/__source") return route.fulfill({ status: 200, contentType: "text/html", body: readFileSync(SOURCE) });
    if (/^\/(content|media|img)\//.test(p)) return route.fulfill({ status: 404, body: "" });
    if (p === "/handbook") p = "/handbook/index.html";       // Caddy's rewrite (container/Caddyfile, "handbook")
    else if (p === "/") p = "/index.html";
    const file = normalize(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] || "application/octet-stream", body: readFileSync(file) });
  });
  return { context, problems, outside };
}
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), ...opts }); };

const browser = await chromium.launch();
try {
  // ---- every size, light and dark, with JavaScript ----
  for (const [width, height] of SIZES) for (const scheme of ["light", "dark"]) {
    const L = `${width}x${height} ${scheme}`;
    const { context, problems, outside } = await newContext(browser, { width, height, scheme });
    const page = await context.newPage();
    const res = await page.goto(`${SITE}/handbook`);
    await page.evaluate(() => document.fonts.ready);
    check(`${L}: /handbook answers 200`, res.status() === 200, res.status());
    check(`${L}: the title`, (await page.title()) === "Team 2972 Program Handbook | Gears & Buccaneers", await page.title());
    check(`${L}: the h1`, (await page.textContent("h1")) === "Team 2972 Program Handbook");
    check(`${L}: the draft line shows`, await page.isVisible("text=Working draft. Not finalized and subject to change."));
    const fonts = await page.evaluate(() => ["Bricolage Grotesque", "Libre Franklin"].map((f) => [f, document.fonts.check(`16px "${f}"`) && [...document.fonts].some((ff) => ff.family.replace(/"/g, "") === f && ff.status === "loaded")]));
    check(`${L}: both of the site's fonts load (Bricolage Grotesque, Libre Franklin)`, fonts.every(([, ok]) => ok), fonts);
    const faces = await page.evaluate(() => [getComputedStyle(document.querySelector("h1")).fontFamily, getComputedStyle(document.body).fontFamily]);
    check(`${L}: headings in Bricolage Grotesque, text in Libre Franklin`, faces[0].startsWith('"Bricolage Grotesque"') && faces[1].startsWith('"Libre Franklin"'), faces);
    check(`${L}: no sideways scroll`, await noSideways(page));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${L}: the page's ${scheme} paper (the site's white; near-black in dark)`, bg === (scheme === "dark" ? "rgb(11, 12, 14)" : "rgb(255, 255, 255)"), bg);
    const wide = width >= 900;
    const home = wide ? ".rail-brand .home-link" : ".home-top";
    check(`${L}: the link back to the home page (${wide ? "in the rail" : "at the top"})`, (await page.isVisible(home)) && (await page.getAttribute(home, "href")) === "/" && !(await page.isVisible(wide ? ".home-top" : ".rail-brand .home-link")));
    if (scheme === "light") {
      if (width === 1280) { await shot(page, "1280-top"); }
      if (width === 390) await shot(page, "390-top");
      if (width === 375) await shot(page, "375-top");
      if (width === 320) await shot(page, "320-top");
    } else if (width === 1280 || width === 390) await shot(page, `${width}-dark-top`);

    // Every rail link scrolls to its section.
    const hrefs = await page.$$eval(".rail ol a", (as) => as.map((a) => a.getAttribute("href")));
    check(`${L}: the rail lists every section in order`, JSON.stringify(hrefs) === JSON.stringify(ANCHORS.map((a) => `#${a}`)), hrefs);
    if (!wide) check(`${L}: the phone menu starts closed`, (await page.getAttribute("#menu", "open")) === null);
    const missed = [];
    for (const href of hrefs) {
      if (!wide) { await page.click(".rail summary"); if ((await page.getAttribute("#menu", "open")) === null) { missed.push(`${href}: menu did not open`); continue; } }
      if (!wide && href === "#s6" && width === 390) await shot(page, "390-contents-open");
      await page.click(`.rail a[href="${href}"]`);
      await page.waitForTimeout(60);
      const top = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, href.slice(1));
      const atEnd = await page.evaluate(() => Math.ceil(window.scrollY + innerHeight) >= document.documentElement.scrollHeight - 2);
      if (!((top >= 0 && top <= 80) || (atEnd && top >= 0 && top < innerHeight))) missed.push(`${href} top ${Math.round(top)}`);
      if (!wide && (await page.getAttribute("#menu", "open")) !== null) missed.push(`${href}: menu stayed open`);
      if (width === 1280 && scheme === "light" && href === "#s6") await shot(page, "1280-shop-safety");
      if (width === 1280 && scheme === "light" && href === "#acknowledgment") await shot(page, "1280-acknowledgment");
      if (width === 320 && scheme === "light" && href === "#s6") await shot(page, "320-shop-safety");
    }
    check(`${L}: every rail link scrolls to its section${wide ? "" : " (and the phone menu opens and closes)"}`, missed.length === 0, missed);
    if (wide) {
      const cur = await page.evaluate(() => document.querySelector(".rail ol a.is-current")?.getAttribute("href"));
      check(`${L}: the current section is marked in the rail`, cur === "#acknowledgment", cur);
    }
    const broken = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute("href")).filter((h) => !document.getElementById(h.slice(1))));
    check(`${L}: every in-page link has a target`, broken.length === 0, broken);
    check(`${L}: no sideways scroll after the walk`, await noSideways(page));
    check(`${L}: no request left the site (no Google host)`, outside.length === 0, outside);
    check(`${L}: no script error`, problems.length === 0, problems);
    await context.close();
  }

  // ---- the anchors the short version and the acknowledgment name ----
  {
    const { context } = await newContext(browser, { width: 1280, height: 900 });
    const page = await context.newPage();
    await page.goto(`${SITE}/handbook`);
    const ids = await page.evaluate(() => ["s5-4", "s6-2", "s6-4", "s2-6", "s9-3", "s10-2", "s7-1", "s7-3", "s7-4", "s8-7", "s10-3", "s11-3", "acknowledgment"].filter((id) => !document.getElementById(id)));
    check("the anchors the short version links to are all there", ids.length === 0, ids);
    await page.emulateMedia({ media: "print" });
    const print = await page.evaluate(() => ["rail", "progress", "status", "home-top"].map((c) => getComputedStyle(document.querySelector(`.${c}`)).display));
    check("print: the rail, progress bar, status pill and phone home link are hidden", print.every((d) => d === "none"), print);
    await page.emulateMedia({ media: "screen" });
    // The text is the owner's: every section's text equals the source's.
    if (SOURCE && existsSync(SOURCE)) {
      const grab = () => page.evaluate(() => ({
        secs: [...document.querySelectorAll("[data-nav]")].map((s) => [s.id, s.textContent.replace(/\s+/g, " ").trim()]),
        rail: [...document.querySelectorAll(".rail ol")].map((o) => o.textContent.replace(/\s+/g, " ").trim()),
        mast: document.querySelector(".mast").textContent.replace(/\s+/g, " ").trim(),
        foot: document.querySelector(".foot").textContent.trim(),
        ids: [...document.querySelectorAll("[id]")].map((e) => e.id).filter((id) => id !== "progress"),
      }));
      const ours = await grab();
      await page.goto(`${SITE}/__source`);
      const theirs = await grab();
      // The one change the owner asked for (2026-11-19): the status line says "Not finalized and subject to change."
      theirs.mast = theirs.mast.replace("Not yet approved by the Head Coach or the school.", "Not finalized and subject to change.");
      check("content: every section's text, the masthead, the contents and the footer are the source's", JSON.stringify(ours) === JSON.stringify(theirs),
        ours.secs.filter((s, i) => JSON.stringify(s) !== JSON.stringify(theirs.secs[i])).map((s) => s[0]));
      check(`content: ${ours.secs.length} sections and ${ours.ids.length} anchors`, ours.secs.length === 16 && ours.ids.length === theirs.ids.length);
    } else console.log("note: HANDBOOK_SOURCE not set, the text comparison with the owner's file is skipped");
    await context.close();
  }

  // ---- JavaScript off ----
  for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
    const L = `no JS ${width}`;
    const { context, outside } = await newContext(browser, { width, height, js: false });
    const page = await context.newPage();
    await page.goto(`${SITE}/handbook`);
    check(`${L}: the contents are open and readable`, (await page.isVisible('.rail a[href="#s1"]')) && (await page.isVisible('.rail a[href="#acknowledgment"]')));
    const pos = await page.evaluate(() => getComputedStyle(document.querySelector(".rail")).position);
    check(`${L}: the contents ${width >= 900 ? "stay in the rail (sticky)" : "are a plain list that scrolls away (not sticky)"}`, pos === (width >= 900 ? "sticky" : "static"), pos);
    await page.click('.rail a[href="#s6"]');
    const top = await page.evaluate(() => document.getElementById("s6").getBoundingClientRect().top);
    check(`${L}: a contents link still goes to its section`, top >= 0 && top <= 80, top);
    const unread = await page.evaluate(() => [...document.querySelectorAll("[data-nav]")].filter((s) => s.offsetHeight < 40 || getComputedStyle(s).visibility !== "visible").map((s) => s.id));
    check(`${L}: every section is readable`, unread.length === 0, unread);
    check(`${L}: no sideways scroll`, await noSideways(page));
    check(`${L}: no request left the site`, outside.length === 0, outside);
    if (width === 390) { await page.evaluate(() => scrollTo(0, 0)); await shot(page, "390-no-js-top"); }
    await context.close();
  }

  // ---- the resources page links to it ----
  {
    const { context, problems } = await newContext(browser, { width: 1280, height: 900 });
    const page = await context.newPage();
    await page.goto(`${SITE}/resources.html`);
    const link = page.locator("a", { hasText: "Team 2972 Program Handbook (working draft)" });
    await link.first().waitFor();
    check("resources: one handbook link", (await link.count()) === 1, await link.count());
    check("resources: it goes to /handbook in the same tab", (await link.getAttribute("href")) === "/handbook" && (await link.getAttribute("target")) === null, await link.getAttribute("href"));
    check("resources: the old Google Doc link is gone", (await page.locator('a[href*="docs.google.com/document/d/1cmYx"]').count()) === 0);
    await link.click();
    await page.waitForURL(`${SITE}/handbook`);
    check("resources: the link opens the handbook", (await page.textContent("h1")) === "Team 2972 Program Handbook");
    check("resources: no script error", problems.length === 0, problems);
    await context.close();
  }

  // ---- the source's own top at 1280, beside ours (its Google fonts allowed, for the picture only) ----
  if (SHOTS && SOURCE && existsSync(SOURCE)) {
    const { context } = await newContext(browser, { width: 1280, height: 900, allowOutside: true });
    const page = await context.newPage();
    await page.goto(`${SITE}/__source`, { waitUntil: "networkidle" }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await shot(page, "1280-source-top");
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`handbook-test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
