// The portal's shared app bar and home grid (D101), and the public pages without them, in headless Chromium.
// No server, no docker: every request is answered from this checkout in memory (Playwright routing), with a fake
// /me.json per user, test/fixtures/apps.json, and blocked outside requests. Fake hosts: portal.landing.test and
// landing.test, so links and cookies behave as on a real domain (no port).
//   - tiles per group (admin, mentor, student, parent, alumni, mentor|parent, no group, a non-site group): home
//     grid main tiles then More, and the Apps menu showing the same list
//   - More in the Apps menu: collapsed by default, opened and closed from the keyboard; launcher Enter / Escape
//   - every app link opens a new tab with rel=noopener
//   - mode: competition-only and build-only tiles follow the mode cookie, also when the tab comes back
//   - theme: the cookie wins over the old localStorage key (Sol, 0b0f687), and the bar's choice sets both
//   - 320px: no horizontal scroll (portal home, menus open, /install, public home), in light and dark
//   - sign-out link (INTEGRATION §1)
//   - public hosts: no app bar, no shell script, no identity fetch; the 2972_in "Portal" label still works;
//     public pages are dark only (Midnight & brass): a theme chosen in the portal bar (one cookie, D92) does not change
//     them, they have no theme switch, and they never delete or rewrite that cookie
// Contrast in both themes is test/theme-test.sh (it covers the new tiles).
// Needs Playwright with its Chromium from an existing install (nothing is added to landing):
//   LANDING_TEST_NODE_MODULES=/path/to/node_modules node test/portal-shell-test.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const modules = process.env.LANDING_TEST_NODE_MODULES;
if (!modules) {
  console.log("SKIP portal-shell-test: set LANDING_TEST_NODE_MODULES to a node_modules folder that has playwright");
  process.exit(2);
}
const { chromium } = createRequire(join(modules, "noop.js"))("playwright");

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail !== undefined ? ` -- ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}

const PORTAL = "http://portal.landing.test";
const PUBLIC = "http://landing.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const APPS = readFileSync(join(root, "test/fixtures/apps.json"), "utf8");
// Mode and More metadata (INTEGRATION §9c): one tile per mode, one marked more, and the Handbook.
const MODE_APPS = JSON.stringify([
  { id: "tasks", name: "Task App", description: "Both modes.", host: "tasks", groups: [] },
  { id: "pit", name: "Pit Checklist", description: "Competition only.", host: "pit", groups: [], modes: ["competition"] },
  { id: "parts", name: "Parts", description: "Build only.", host: "parts", groups: [], modes: ["build"] },
  { id: "skills", name: "Skills", description: "Marked more.", host: "skills", groups: [], more: true },
  { id: "handbook", name: "Team Handbook", description: "Always under More.", path: "/resources.html", groups: [], ext: true },
]);

async function newContext(browser, { groups = "mentor", apps = APPS, width = 1280 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const seen = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.href);
    const portal = url.host === "portal.landing.test";
    if (!portal && url.host !== "landing.test") return route.abort();
    if (portal && url.pathname === "/me.json") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ email: "pat@example.com", name: "Pat Example", username: "pat@example.com", groups, uid: "u-1" }) });
    }
    if (portal && url.pathname === "/apps.json") return route.fulfill({ contentType: "application/json", body: apps });
    let file = url.pathname;
    if (!portal && file.startsWith("/site/")) file = file.slice(5);  // the editor's preview prefix (editor.<domain>/site/*)
    if (portal && file === "/") file = "/portal/index.html";
    else if (portal && (file === "/install" || file === "/install/")) file = "/portal/install.html";
    else if (file === "/") file = "/index.html";
    const path = normalize(join(root, decodeURIComponent(file)));
    if (!path.startsWith(root) || path.includes("/.git/")) return route.fulfill({ status: 404, body: "" });
    try {
      return route.fulfill({ contentType: TYPES[extname(path)] || "application/octet-stream", body: readFileSync(path) });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  });
  return { context, seen };
}

async function openPortal(context, path = "/") {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PORTAL + path);
  await page.waitForSelector("#shell-bar .shbar-appsbtn");
  if (path === "/") await page.waitForFunction(() => document.querySelector("#app-grid .app-card, #more-list li") || !document.getElementById("no-group").hidden);
  return { page, errors };
}
// Site-wide cookies, as the shell kit and Account write them (INTEGRATION §9b).
const site = (name, value) => ({ name, value, domain: ".landing.test", path: "/" });
const names = (page, sel) => page.$$eval(sel, (els) => els.map((e) => (e.querySelector("h3, b") || e).childNodes[0].textContent.trim()));

const browser = await chromium.launch();
try {
  // ---------- tiles per group ----------
  const GROUPS = [
    ["admin", "Task App,Admin,Team resources", "Everyone Link,GitHub,Team Drive"],
    ["mentor", "Task App,Team resources,Scouting", "Everyone Link,Alumni News,GitHub,Team Drive"],
    ["student", "Task App,Team resources,Scouting", "Everyone Link,GitHub,Team Drive"],
    ["parent", "Task App,Team resources", "Everyone Link"],
    ["alumni", "Team resources", "Everyone Link,Alumni News"],
    ["mentor|parent", "Task App,Team resources,Scouting", "Everyone Link,Alumni News,GitHub,Team Drive"],
    ["", "", ""],
    ["authentik Admins", "", ""],
  ];
  for (const [groups, wantMain, wantMore] of GROUPS) {
    const label = groups || "(no group)";
    const { context } = await newContext(browser, { groups });
    const { page, errors } = await openPortal(context);
    const main = (await names(page, "#app-grid .app-card")).join(",");
    const more = (await names(page, "#more-list li")).join(",");
    const notice = await page.isVisible("#no-group");
    check(`${label}: home tiles [${wantMain}] then More [${wantMore}]`, main === wantMain && more === wantMore, { main, more });
    check(`${label}: "waiting for an admin" notice ${wantMain || wantMore ? "hidden" : "shown"}`, notice === !(wantMain || wantMore));
    check(`${label}: More section ${wantMore ? "shown" : "hidden"} on the home page`, (await page.isVisible("#more-apps")) === !!wantMore);
    await page.click("#shell-bar .shbar-appsbtn");
    const menuMain = (await names(page, "#shell-bar .shbar-apps ul.shbar-grid > li")).join(",");
    // the Apps menu has no coming-soon order rule of its own; compare as sets
    const set = (s) => s.split(",").filter(Boolean).sort().join(",");
    check(`${label}: the Apps menu lists the same tiles (main and More)`, set(menuMain) === set([wantMain, wantMore].filter(Boolean).join(",")), { menuMain });
    // Kit 0.2.3: core tiles in the first list, the home page's More tiles behind the menu's More button (closed on
    // open). With no core tile, the "more" tiles are the first list and there is no More row.
    const menuCore = (await names(page, "#shell-bar .shbar-apps ul.shbar-grid:not(.shbar-more > ul) > li")).join(",");
    const menuMore = (await names(page, "#shell-bar .shbar-apps .shbar-more > ul.shbar-grid > li")).join(",");
    const wantCore = wantMain || wantMore, wantRest = wantMain ? wantMore : "";
    check(`${label}: Apps menu core tiles [${wantCore}], More [${wantRest}]`, set(menuCore) === set(wantCore) && set(menuMore) === set(wantRest), { menuCore, menuMore });
    const moreRow = await page.isVisible("#shell-bar .shbar-apps .shbar-morebtn");
    check(`${label}: the Apps menu's More row ${wantRest ? "shown, closed" : "not shown"}`, wantRest
      ? moreRow && (await page.getAttribute("#shell-bar .shbar-morebtn", "aria-expanded")) === "false" && !(await page.isVisible("#shell-bar .shbar-more > ul.shbar-grid"))
      : !moreRow);
    if (!wantMain && !wantMore) check(`${label}: the Apps menu explains there are no apps yet`, /an admin still has to add you/.test(await page.textContent("#shell-bar .shbar-apps")));
    check(`${label}: no script errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ---------- More, launcher and links (mentor) ----------
  {
    const { context } = await newContext(browser, { groups: "mentor" });
    const { page } = await openPortal(context);
    await page.focus("#shell-bar .shbar-appsbtn");
    await page.keyboard.press("Enter");
    check("Enter on the launcher opens the Apps menu", await page.isVisible("#shell-bar .shbar-apps") && (await page.getAttribute("#shell-bar .shbar-appsbtn", "aria-expanded")) === "true");
    // Kit 0.3.0: core apps first, then a More button (closed on a first visit, then remembered as left) that reveals the rest.
    const moreBtn = "#shell-bar .shbar-morebtn", moreUl = "#shell-bar .shbar-more > ul.shbar-grid";
    const moreState = async () => ({ expanded: await page.getAttribute(moreBtn, "aria-expanded"), shown: await page.isVisible(moreUl) });
    check("Apps: one More row whose button controls the More list", (await page.$$("#shell-bar .shbar-more")).length === 1 && (await page.getAttribute(moreBtn, "aria-controls")) === (await page.$eval(moreUl, (u) => u.id)));
    let ms = await moreState();
    check("Apps: More is closed when the menu opens", ms.expanded === "false" && !ms.shown, ms);
    await page.focus(moreBtn);
    await page.keyboard.press("Enter");
    ms = await moreState();
    check("Enter on More opens its list", ms.expanded === "true" && ms.shown && (await names(page, `${moreUl} > li`)).join() === "Everyone Link,Alumni News,GitHub,Team Drive", ms);
    await page.keyboard.press(" ");
    ms = await moreState();
    check("Space on More closes it again", ms.expanded === "false" && !ms.shown, ms);
    await page.click(moreBtn);
    ms = await moreState();
    check("a click on More opens it", ms.expanded === "true" && ms.shown, ms);
    const taskTile = page.locator("#shell-bar .shbar-apps a.shbar-item").filter({ hasText: "Task App" });
    const taskDesc = await taskTile.getAttribute("aria-describedby");
    check("Apps tiles show the name only; the description is the tile's data-tip and hidden text", (await taskTile.getAttribute("title")) === null && (await taskTile.getAttribute("data-tip")) === "Fake tile for tests." && !!taskDesc && (await page.$eval(`[id="${taskDesc}"]`, (e) => e.classList.contains("shbar-sr") && e.textContent.trim())) === "Fake tile for tests." && (await page.$$eval("#shell-bar .shbar-apps .shbar-item small", (els) => els.map((e) => e.textContent.trim()))).join() === "Coming soon");
    await page.keyboard.press("Escape");
    check("Escape closes the Apps menu and returns focus to the launcher", !(await page.isVisible("#shell-bar .shbar-apps")) && await page.$eval("#shell-bar .shbar-appsbtn", (b) => b === document.activeElement));
    await page.keyboard.press("Enter");
    ms = await moreState();
    check("reopening the Apps menu keeps More open as it was left", (await page.isVisible("#shell-bar .shbar-apps")) && ms.expanded === "true" && ms.shown, ms);
    await page.keyboard.press("Escape");
    await page.evaluate(() => scrollTo(0, 600));
    const barTop = await page.$eval("#shell-bar header, #shell-bar .shbar", (b) => Math.round(b.getBoundingClientRect().top)).catch(() => null);
    check("the app bar stays at the top when the page scrolls (sticky)", barTop === 0, `top=${barTop}`);
    await page.evaluate(() => scrollTo(0, 0));
    const left = await page.$eval("#shell-bar .shbar-appsbtn", (b) => b.getBoundingClientRect().left);
    check("the nine-dot launcher is at the far left of the bar", left < 24, `left=${left}`);

    const links = await page.$$eval("#app-grid a, #more-list a, #shell-bar .shbar-apps a", (as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    const bad = links.filter((l) => l.target !== "_blank" || !l.rel.split(/\s+/).includes("noopener"));
    check(`every app link opens a new tab with rel=noopener (${links.length} links)`, links.length >= 10 && bad.length === 0, bad);
    const hrefs = await page.$$eval("#app-grid a", (as) => as.map((a) => a.getAttribute("href")));
    check("host tiles and path tiles are built from the site domain", hrefs.includes("http://tasks.landing.test/") && hrefs.includes("http://landing.test/resources.html"), hrefs);
    check("coming-soon tiles are not links", (await page.$$eval("#app-grid .coming-soon", (els) => els.map((e) => e.tagName + e.getAttribute("aria-disabled")))).join() === "DIVtrue");

    await page.click("#shell-bar .shbar-acct");
    const menu = page.locator("#shell-bar .shbar-account");
    const rows = await menu.locator(':scope > [role="group"], :scope > a').evaluateAll(els => els.map(e => e.getAttribute("aria-label") || e.textContent.trim()));
    check("account menu rows are in order", JSON.stringify(rows) === JSON.stringify(["Theme", "Notification settings", "All account settings", "Sign out"]), rows);
    const choices = await menu.locator('[aria-label="Theme"] button').allTextContents();
    check("theme choices are in order", JSON.stringify(choices.map(x => x.trim())) === JSON.stringify(["Match my device", "Light", "Dark"]), choices);
    check("sign-out goes to the portal outpost", (await menu.locator("a[data-signout]").getAttribute("href")) === `${PORTAL}/outpost.goauthentik.io/sign_out`);
    await page.keyboard.press("Escape");
    check("the request-access cards are shown", await page.isVisible("#access") && (await page.$$("#access-body a[href^='mailto:']")).length >= 1);
    check("the account button shows initials", (await page.textContent("#shell-bar .shbar-acct")).includes("PE"));

    await page.press("#q", "Escape").catch(() => {});
    await page.fill("#q", "alumni");
    check("the bar names the team", (await page.textContent("#shell-bar .shbar-appname")).trim() === "Gears & Buccaneers");
    check("the greeting is the first name", (await page.textContent("#greeting")).replace(/\s+/g, " ").trim() === "Hi Pat.");
    check("search filters across both sections", (await names(page, "#app-grid .app-card:not([hidden]), #more-list li:not([hidden])")).join() === "Alumni News");
    await page.fill("#q", "");
    let cleared = [];
    await page.exposeFunction("recordCacheDeletion", (name) => { cleared.push(name); });
    await page.evaluate(() => Object.defineProperty(window, "caches", { configurable: true, value: { keys: async () => ["2972-offline", "other"], delete: async (name) => { await window.recordCacheDeletion(name); return true; } } }));
    await page.click("#shell-bar .shbar-acct");
    await page.locator("#shell-bar .shbar-account a[data-signout]").click();
    await page.waitForURL(/outpost\.goauthentik\.io\/sign_out/);
    check("sign-out clears stored 2972 offline files before navigation", JSON.stringify(cleared) === JSON.stringify(["2972-offline"]), cleared);
    await context.close();
  }

  // ---------- mode ----------
  {
    const { context } = await newContext(browser, { groups: "student", apps: MODE_APPS });
    let { page } = await openPortal(context);
    check("build mode (no cookie): main tiles and More", (await names(page, "#app-grid .app-card")).join() === "Task App,Parts" && (await names(page, "#more-list li")).join() === "Skills,Team Handbook");
    const extTile = page.locator("#more-list a").filter({ hasText: "Team Handbook" });
    check("a same-site path with ext: true renders under More with the link-out arrow and opens in a new tab", (await extTile.count()) === 1 && ((await extTile.locator("span.ext").textContent()) || "").includes("↗") && (await extTile.getAttribute("target")) === "_blank");
    check("build mode: the bar does not show the competition chip", !(await page.isVisible("#shell-bar .shbar-chip")));
    await context.addCookies([site("mode", "competition")]);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("competition cookie, tab comes back: the grid follows without a reload", (await names(page, "#app-grid .app-card")).join() === "Task App,Pit Checklist");
    check("...and the bar shows Competition mode", await page.isVisible("#shell-bar .shbar-chip") && (await page.textContent("#shell-bar .shbar-chip")).includes("Competition mode"));
    await page.close();
    ({ page } = await openPortal(context));
    check("competition cookie on load", (await names(page, "#app-grid .app-card")).join() === "Task App,Pit Checklist" && (await names(page, "#more-list li")).join() === "Skills,Team Handbook");
    await context.close();
  }

  // ---------- a catalog whose every visible app is under More ----------
  {
    const onlyMore = JSON.stringify([
      { id: "skills", name: "Skills", description: "Marked more.", host: "skills", groups: [], more: true },
      { id: "handbook", name: "Team Handbook", description: "Always under More.", path: "/resources.html", groups: [] },
    ]);
    const { context } = await newContext(browser, { groups: "student", apps: onlyMore });
    const { page } = await openPortal(context);
    check("only More: the main section is hidden and More lists every app", !(await page.isVisible("#main-apps")) && (await names(page, "#more-list li")).join() === "Skills,Team Handbook");
    check("only More: the search field stays visible", await page.isVisible("#q") && await page.isVisible("#search-wrap") && await page.isVisible("#apps-head"));
    await page.keyboard.press("/");
    check("only More: / focuses the search field", await page.evaluate(() => document.activeElement === document.getElementById("q")));
    await page.fill("#q", "hand");
    check("only More: search still filters the More list", (await names(page, "#more-list li:not([hidden])")).join() === "Team Handbook");
    await page.keyboard.press("Escape");
    check("only More: Escape clears the search and leaves the field", (await page.inputValue("#q")) === "" && (await names(page, "#more-list li:not([hidden])")).join() === "Skills,Team Handbook" && await page.evaluate(() => document.activeElement !== document.getElementById("q")));
    await context.close();
  }

  // ---------- theme (the cases from the Sol review of 0b0f687) ----------
  {
    const { context } = await newContext(browser, { groups: "mentor" });
    await context.addCookies([site("theme", "dark")]);
    await context.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("theme", "light"); sessionStorage.setItem("seeded", "1"); } } catch (e) {} });
    let { page } = await openPortal(context);
    const state = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, label: document.querySelector("#shell-bar [aria-label=Theme] button[aria-pressed=true]")?.textContent.trim(),
      bg: getComputedStyle(document.body).backgroundColor, cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null }));
    let s = await state();
    check("cookie dark + old key light: page and bar both dark", s.theme === "dark" && s.label === "Dark" && s.bg === "rgb(7, 9, 15)", s);
    await page.click("#shell-bar .shbar-acct");
    await page.click('#shell-bar [aria-label="Theme"] .shbar-choice >> text=Light');
    s = await state();
    const cookies = await context.cookies(PORTAL);
    const c = cookies.find((x) => x.name === "theme");
    check("choosing Light in the bar sets the page, a site-wide theme cookie and the old key", s.theme === "light" && s.cookie === "light" && c && c.domain === ".landing.test" && (await page.evaluate(() => localStorage.getItem("theme"))) === "light", { s, c });
    await context.clearCookies();
    await page.close();
    ({ page } = await openPortal(context));
    s = await state();
    check("no cookie + old key light: light, and the head script moves it into the cookie", s.theme === "light" && s.cookie === "light", s);
    await context.close();
  }

  // ---------- 320px: no horizontal scroll ----------
  for (const theme of ["light", "dark"]) {
    const { context } = await newContext(browser, { groups: "mentor", width: 320 });
    await context.addCookies([site("theme", theme)]);
    const over = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    let { page } = await openPortal(context);
    check(`320px ${theme}: portal home has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    check(`320px ${theme}: the greeting is the first name`, (await page.textContent("#greeting")).replace(/\s+/g, " ").trim() === "Hi Pat.");
    const dateBox = await page.$eval(".homedate", (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.right)]; });
    check(`320px ${theme}: the date stays on screen`, dateBox[0] > 0 && dateBox[1] <= 320, dateBox);
    const cols = await page.$$eval("#app-grid .app-card", (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
    check(`320px ${theme}: tiles sit two to a row`, cols === 2, `${cols} columns`);
    await page.click("#shell-bar .shbar-appsbtn");
    check(`320px ${theme}: Apps menu open has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    await page.keyboard.press("Escape");
    await page.click("#shell-bar .shbar-acct");
    check(`320px ${theme}: theme menu open has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    await page.close();
    ({ page } = await openPortal(context, "/install"));
    await page.waitForSelector("#site-footer footer, #site-footer *");
    check(`320px ${theme}: /install runs the layout (footer filled in)`, ((await page.textContent("#site-footer")) || "").includes("Gears & Buccaneers"));
    check(`320px ${theme}: /install has the app bar and no horizontal scroll`, (await page.isVisible("#shell-bar .shbar-appsbtn")) && (await over(page)) <= 0, `${await over(page)}px`);
    page = await context.newPage();
    await page.goto(PUBLIC + "/");
    await page.waitForSelector(".site-header");
    check(`320px ${theme}: public home has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    const toggle = await page.$eval(".nav-toggle", (b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.right)]; });
    check(`320px ${theme}: the menu button is at least 44px and sits on screen`, toggle[0] >= 44 && toggle[1] >= 44 && toggle[2] <= 320, toggle);
    check(`320px ${theme}: the public home stays dark (Midnight & brass), whatever the saved theme`, (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(16, 24, 39)");
    // Home shows the full team name on a phone (approved home page, D154), clear of the Menu button; other pages still hide it.
    const name = await page.$eval(".brand-text > span", (e) => Math.round(e.getBoundingClientRect().right)).catch(() => null);
    check(`320px ${theme}: public home shows the team number and the full team name, clear of the Menu button`, (await page.isVisible(".brand-text strong")) && (await page.isVisible(".brand-text > span")) && name !== null && name <= toggle[2] - toggle[0], { name, toggle });
    await page.goto(PUBLIC + "/about.html");
    await page.waitForSelector(".site-header");
    // Release 8.1.5 (C8): other pages read "2972 Team" on one line instead of the number alone.
    check(`320px ${theme}: other public pages: the header reads "2972 Team" and not the full team name`, (await page.isVisible(".brand-text strong")) && (await page.isVisible(".brand-short .brand-team")) && !(await page.isVisible(".brand-text > span")) && ((await page.textContent(".brand-text")) || "").replace(/\s+/g, " ").trim() === "2972 Team");
    await context.close();
  }

  // ---------- public hosts: no app bar ----------
  {
    const { context, seen } = await newContext(browser);
    await context.addCookies([{ name: "2972_in", value: "1", url: PUBLIC }]);
    for (const path of ["/", "/about.html", "/resources.html", "/contact.html"]) {
      const page = await context.newPage();
      await page.goto(PUBLIC + path);
      await page.waitForSelector(".site-header .nav-login");
      await page.waitForTimeout(300);
      const bar = await page.$$("#shell-bar, .shbar-mount, .shbar-appsbtn");
      check(`public ${path}: no app bar and no signed-in controls`, bar.length === 0 && (await page.$$("[data-signout], #sign-out")).length === 0);
      check(`public ${path}: the public header keeps its nav and the 2972_in "Portal" label`, (await page.textContent(".site-header .nav-login")).trim() === "Portal" && (await page.$$(".site-header .site-nav .nav-link")).length >= 3);
      await page.close();
    }
    // One theme cookie for the portal and the apps (D92). Public pages are dark only: a choice made in the portal bar
    // does not change them, and they leave the cookie and the old key exactly as they found them.
    const portal = (await openPortal(context)).page;
    await portal.click("#shell-bar .shbar-acct");
    await portal.click('#shell-bar [aria-label="Theme"] .shbar-choice >> text=Light');
    const themeState = (page) => page.evaluate(() => ({ attr: document.documentElement.dataset.theme || null, cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null, key: localStorage.getItem("theme"),
      bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme }));
    check("Light chosen in the portal bar: the portal itself is light", (await themeState(portal)).attr === "light" && (await themeState(portal)).cookie === "light");
    const pub = await context.newPage();
    await pub.goto(PUBLIC + "/about.html");
    await pub.evaluate(() => localStorage.setItem("theme", "light"));   // the old key lives per origin: seed this one
    for (const path of ["/about.html", "/robots.html", "/privacy.html"]) {
      await pub.goto(PUBLIC + path);
      await pub.waitForSelector(".site-header .nav-login");
      await pub.waitForTimeout(200);
      const st = await themeState(pub);
      check(`Light saved (cookie and old key): public ${path} is still dark, sets no data-theme, and leaves the cookie as "light"`, st.bg === "rgb(16, 24, 39)" && st.scheme === "dark" && st.attr === null && st.cookie === "light" && st.key === "light", st);
      check(`public ${path}: no theme switch`, (await pub.$$(".theme-switch")).length === 0);
    }
    await portal.click("#shell-bar .shbar-acct");
    await portal.click('#shell-bar [aria-label="Theme"] .shbar-choice >> text=Match my device');
    await pub.goto(PUBLIC + "/about.html");
    await pub.waitForSelector(".site-header .nav-login");
    await pub.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await pub.waitForTimeout(150);
    check('"Match my device" chosen in the portal bar (cookie cleared): public stays dark and does not recreate the cookie', (await themeState(pub)).bg === "rgb(16, 24, 39)" && (await themeState(pub)).cookie === null);
    await portal.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("the portal keeps its own theme handling after public pages were visited", (await themeState(portal)).attr === null);
    await pub.close(); await portal.close();
    // the editor's preview serves these pages under /site/: the wordmark probe follows the script, not the root
    {
      const before = seen.length;
      const page = await context.newPage();
      await page.goto(PUBLIC + "/site/about.html");
      await page.waitForSelector("#site-footer .school-mark-wrap");
      await page.waitForTimeout(300);
      const probes = seen.slice(before).filter((u) => u.includes("dawson-school-logo.png"));
      check("under the editor's /site/ prefix the wordmark probe follows the script (/site/brand/...), not the root", probes.length > 0 && probes.every((u) => u === PUBLIC + "/site/brand/dawson-school-logo.png"), probes);
      check("...and the wordmark stays visible", await page.isVisible("#site-footer .school-mark-wrap"));
      await page.close();
    }
    const fetched = seen.filter((u) => u.startsWith(PUBLIC + "/") && (/\/shell\/static\//.test(u) || /\/(me|apps)\.json$/.test(u) || /portal-shell\.js$/.test(u)));
    check("public pages never load the app bar script or identity", fetched.length === 0, fetched);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
