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
//   - release 8.1.5 (C1, C2, C4, C9): the cards above the tiles from a fake /today.json per role (student, mentor,
//     parent, admin) at 1280 and 390, in the demo's order; Done and its error; no /today.json leaves the 8.1 home;
//     Tools, Admin apps and More as closed rows, remembered in shellgroups, and search across them; the shop screen's
//     home for a display login; the kit's bell through /_shell/inbox; rows that belong to one mode (C12). PORTAL_TEST_SHOTS=<dir> saves viewport screenshots.
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

// today: what /today.json answers (an object, or a status number; default 404 = not set up). taskDone: the status
// POST /today/task-done answers. inbox: what /_shell/inbox answers (default 404). Fakes only, @example.com.
async function newContext(browser, { groups = "mentor", apps = APPS, width = 1280, height = 900, today = 404, taskDone = 204, inbox = 404 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const seen = [];
  const posts = [];
  const answers = { today };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.href);
    const portal = url.host === "portal.landing.test";
    if (!portal && url.host !== "landing.test") return route.abort();
    if (portal && url.pathname === "/me.json") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ email: "pat@example.com", name: "Pat Example", username: "pat@example.com", groups, uid: "u-1" }) });
    }
    if (portal && url.pathname === "/apps.json") return route.fulfill({ contentType: "application/json", body: apps });
    if (portal && url.pathname === "/today.json") {
      const t = typeof answers.today === "function" ? answers.today() : answers.today;
      return typeof t === "number" ? route.fulfill({ status: t, body: "" }) : route.fulfill({ contentType: "application/json", body: typeof t === "string" ? t : JSON.stringify(t) });
    }
    if (portal && url.pathname === "/today/task-done") {
      posts.push({ method: route.request().method(), body: route.request().postData(), type: route.request().headers()["content-type"] });
      return route.fulfill({ status: taskDone, body: "" });
    }
    if (portal && url.pathname === "/_shell/inbox") {
      return typeof inbox === "number" ? route.fulfill({ status: inbox, body: "" }) : route.fulfill({ contentType: "application/json", body: JSON.stringify(inbox) });
    }
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
  return { context, seen, posts, answers };
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

  // ---------- release 8.1.5: the demo's Home above and below the tiles (C1, C2, C4, C9, the bell) ----------
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const CAL = "http://calendar.landing.test", PARTS = "http://parts.landing.test", TASKS = "http://tasks.landing.test";
  const TODAY = {
    student: { v: 1,
      today: [{ id: "cal-practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", detail: "You are not signed in", href: `${CAL}/here?tab=today`, cta: { label: "Sign in", href: `${CAL}/here/scan` } }],
      waiting: [],
      next: { taskId: "t-41", title: "Wire the intake sensor", due: "2026-11-18", project: "Intake", href: `${TASKS}/my?task=t-41` },
      activity: [{ title: "Your part request was ordered", detail: "Hex shaft, 1/2 in.", href: `${PARTS}/requests/7`, at: ago(5) },
        { title: "A mentor signed off Drill press", href: "http://skills.landing.test/", at: ago(180) }] },
    mentor: { v: 1,
      today: [{ id: "cal-practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", detail: "12 people are signed in", href: `${CAL}/here?tab=today` }],
      waiting: [{ id: "parts-ok", section: "waiting", title: "2 part requests need an OK", detail: "", href: `${PARTS}/?tab=toorder`, count: 2 },
        { id: "skills-sign", section: "waiting", title: "3 sign-off requests", detail: "Lathe, Mill, Band saw", href: "http://skills.landing.test/?tab=signoff", count: 3 },
        { id: "cal-coming", section: "waiting", title: "Tell us if you're coming this week", detail: "", href: `${CAL}/here?tab=mentors`, count: 1 }],
      next: null,
      activity: [{ title: "Sam Example asked for a sign-off", detail: "Lathe", href: "http://skills.landing.test/?tab=signoff", at: ago(20) }] },
    parent: { v: 1,
      today: [{ id: "cal-next", section: "today", title: "Next practice: Tue, Nov 17", detail: "3:30 to 6:00 pm", href: `${CAL}/?tab=agenda` },
        { id: "cal-event", section: "today", title: "Next event: Fall open house", detail: "Sat, Nov 21", href: `${CAL}/?tab=agenda` },
        { id: "cal-snacks", section: "today", title: "Thu, Nov 19 needs snacks", detail: "2 families needed", href: `${CAL}/snacks`, cta: { label: "Sign up", href: `${CAL}/snacks?day=2026-11-19` } }],
      waiting: [], next: null,
      activity: [{ title: "Parents never see this", href: `${CAL}/`, at: ago(3) }] },
    admin: { v: 1,
      today: [{ id: "cal-practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", detail: "12 people are signed in", href: `${CAL}/here?tab=today` }],
      waiting: [{ id: "admin-req", section: "waiting", title: "2 account requests", detail: "", href: "http://admin.landing.test/requests", count: 2 },
        { id: "cal-silent", section: "waiting", title: "2 mentors haven't answered for this week", detail: "Mentor A, Mentor B", href: `${CAL}/here?tab=mentors`, count: 2 },
        { id: "evil", section: "waiting", title: "An off-site row is dropped", href: "https://evil.example.com/" }],
      next: null, activity: [] },
  };
  const GROUPED_APPS = JSON.stringify([
    { id: "tasks", name: "Task App", description: "Your tasks.", host: "tasks", groups: ["admin", "mentor", "student", "parent"] },
    { id: "calendar", name: "Calendar", description: "Practices, attendance and snacks.", host: "calendar", groups: ["admin", "mentor", "student", "parent"] },
    { id: "admin", name: "Admin", description: "Approve accounts and manage groups.", host: "admin", groups: ["admin"], group: "admin" },
    { id: "editor", name: "Website editor", description: "Edit the public website, preview, then publish.", host: "editor", groups: ["admin", "mentor"], group: "admin" },
    { id: "github", name: "GitHub", description: "Robot code.", url: "https://example.com/code", groups: ["admin", "mentor", "student"] },
    { id: "handbook", name: "Team Handbook", description: "Team rules and info.", path: "/resources.html", groups: [] },
    { id: "tool-trace", name: "Drawing to vector", description: "A photo of a drawing becomes a laser or CAD file.", tip: "Make an SVG for the laser and a DXF for Onshape, at true size.", host: "tools", path: "/trace", tool: true, icon: "trace", groups: ["admin", "mentor", "student"] },
    { id: "tool-gear", name: "Gear and sprocket finder", description: "A photo and one measurement name the part.", tip: "Work out gear pitch, chain size or belt profile, then find it in Parts.", host: "tools", path: "/gear", tool: true, icon: "gear", groups: ["admin", "mentor", "student"] },
  ]);
  const SHOTS = process.env.PORTAL_TEST_SHOTS || "";
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };
  const over = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const settle = async (page) => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(150); };
  const homeState = (page) => page.evaluate(() => {
    const ids = [...document.querySelectorAll("#home-cards > section, #home-activity > section")].map((s) => s.id);
    const order = ["[data-guide-card]", "#home-cards", "#apps-head", "#home-groups", "#home-activity", "#access"].map((sel) => document.querySelector(sel));
    const inOrder = order.every((n, i) => i === 0 || (order[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
    const rows = (id) => [...document.querySelectorAll(`#${id} .rt`)].map((e) => e.textContent);
    return { ids, inOrder, today: rows("home-today"), waiting: rows("home-waiting"),
      counts: [...document.querySelectorAll("#home-waiting .tcount")].map((e) => e.textContent),
      ctas: [...document.querySelectorAll(".todayrow > a.btn")].map((a) => [a.textContent, a.getAttribute("href"), a.target]),
      guideSlot: !!document.querySelector("main [data-guide-card]"), waitGuide: document.querySelector("#home-waiting")?.dataset.guide || null,
      next: document.querySelector("#home-next h2")?.textContent || null, nextLine: document.querySelector("#home-next .mute")?.textContent || null,
      activity: [...document.querySelectorAll("#home-activity .actlink b")].map((e) => e.textContent),
      rowLinks: [...document.querySelectorAll("#home-cards a, #home-activity a")].map((a) => ({ href: a.href, target: a.target, rel: a.rel })) };
  });
  const DEMO_ORDER = { student: ["home-today", "home-next", "home-activity"], mentor: ["home-waiting", "home-today", "home-activity"],
    parent: ["home-today"], admin: ["home-waiting", "home-today"] };
  for (const role of ["student", "mentor", "parent", "admin"]) {
    for (const width of [1280, 390]) {
      const { context } = await newContext(browser, { groups: role, apps: GROUPED_APPS, today: TODAY[role], width });
      const { page, errors } = await openPortal(context);
      await settle(page);
      const h = await homeState(page);
      check(`${role} ${width}px: the cards above the tiles in the demo's order, Recent activity under them`, JSON.stringify(h.ids) === JSON.stringify(DEMO_ORDER[role]) && h.inOrder && h.guideSlot, h);
      check(`${role} ${width}px: no sideways scroll, no script error`, (await over(page)) <= 0 && errors.length === 0, { over: await over(page), errors });
      if (width === 390) {
        const small = await page.$$eval("#home-cards a, #home-cards button, #home-activity a, #home-groups button, #home-groups a", (els) => els.filter((e) => e.getClientRects().length && !e.closest("[hidden]"))
          .map((e) => [e.textContent.trim().slice(0, 24), Math.round(e.getBoundingClientRect().height)]).filter(([, hh]) => hh < 44));
        check(`${role} 390px: every control on the cards and the rows is at least 44px tall`, small.length === 0, small);
      }
      const bad = h.rowLinks.filter((l) => !/\.landing\.test$/.test(new URL(l.href).host) || l.target !== "_blank" || !l.rel.includes("noopener"));
      check(`${role} ${width}px: every row links into an app on this site, in a new tab`, h.rowLinks.length > 0 && bad.length === 0, bad);
      if (role === "student") {
        check("student: Today shows the practice and its Sign in button", h.today.join() === "Practice today, 3:30 to 6:00 pm" && h.ctas.length === 1 && h.ctas[0][0] === "Sign in" && h.ctas[0][1] === `${CAL}/here/scan`, h);
        check("student: the next-task card with its project and due date", h.next === "Wire the intake sensor" && /^Intake · due \w{3}, Nov 18$/.test(h.nextLine), h);
        const gold = await page.$eval("#home-next .heroacts", (b) => [...b.children].map((e) => [e.textContent.trim(), e.classList.contains("btn-outline") ? "plain" : "gold"]));
        check("student: Done is the one gold button, Open is plain", JSON.stringify(gold) === JSON.stringify([["Done", "gold"], ["Open (opens in a new tab)", "plain"]]), gold);
        check("student: Recent activity has the notices", h.activity.join("|") === "Your part request was ordered|A mentor signed off Drill press", h);
        check("student: no Waiting on you card", !h.waiting.length);
      }
      if (role === "mentor") {
        check("mentor: Waiting on you rows with counts, and the guide's data-guide=\"wait\"", h.waiting.length === 3 && h.counts.join() === "2,3,1" && h.waitGuide === "wait", h);
        check("mentor: no next-task card", h.next === null);
      }
      if (role === "parent") {
        check("parent: Today has the next practice, the next event and snacks with Sign up", h.today.length === 3 && h.ctas.map((c) => c[0]).join() === "Sign up", h);
        check("parent: no Recent activity, even when the answer has some", h.activity.length === 0 && !(await page.$("#home-activity section")), h);
      }
      if (role === "admin") check("admin: an off-site row is dropped", h.waiting.join("|") === "2 account requests|2 mentors haven't answered for this week", h);
      await shot(page, `home-${role}-${width}`);
      await context.close();
    }
  }

  // Done: posts the task, then the home is drawn again with the next one; an error offers "Open task" instead.
  {
    let n = 0;
    const second = { ...TODAY.student, next: { taskId: "t-42", title: "Mount the camera", due: "", project: "Vision", href: `${TASKS}/my?task=t-42` } };
    const { context, posts, answers } = await newContext(browser, { groups: "student", apps: GROUPED_APPS });
    answers.today = () => (n++ === 0 ? TODAY.student : second);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.focus("#home-next .heroacts button");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#home-next h2")?.textContent === "Mount the camera");
    check("Done posts {taskId} as JSON to /today/task-done", posts.length === 1 && posts[0].method === "POST" && posts[0].body === JSON.stringify({ taskId: "t-41" }) && /application\/json/.test(posts[0].type), posts);
    check("after Done the next task takes its place and has the focus", await page.evaluate(() => document.activeElement === document.querySelector("#home-next .heroacts button")));
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student, taskDone: 500 });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.click("#home-next .heroacts button");
    await page.waitForSelector("#home-next .heroacts a.btn");
    const acts = await page.$$eval("#home-next .heroacts > *", (els) => els.map((e) => [e.tagName, e.textContent.trim(), e.getAttribute("href"), e.classList.contains("btn-outline")]));
    check("an error from task-done: the card offers \"Open task\" (gold) instead of Done", acts.length === 1 && acts[0][0] === "A" && acts[0][1].startsWith("Open task") && acts[0][2] === `${TASKS}/my?task=t-41` && !acts[0][3], acts);
    check("...says so in words, and focus is on Open task", /can't be marked done/.test(await page.textContent("#home-next .home-status")) && await page.evaluate(() => document.activeElement?.textContent.startsWith("Open task")));
    await shot(page, "home-student-done-error-1280");
    await context.close();
  }

  // C12: a row that belongs to one mode shows only in that mode, and follows the mode cookie without a reload.
  {
    const today = { v: 1, waiting: [], next: null, activity: [], today: [
      { id: "both", section: "today", title: "Next event: Fall open house", href: `${CAL}/?tab=agenda` },
      { id: "practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", href: `${CAL}/here?tab=today`, modes: ["build"] },
      { id: "shift", section: "today", title: "Your shift: pit crew, 9:00 to 11:00", href: "http://compete.landing.test/schedule", modes: ["competition"] }] };
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-today");
    const rows = () => page.$$eval("#home-today .todayrow", (els) => els.map((e) => e.dataset.id).join());
    check("C12: Build mode (no cookie) shows the rows for both modes and for Build", (await rows()) === "both,practice", await rows());
    await context.addCookies([site("mode", "competition")]);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("C12: in Competition mode the Build row goes and the event row comes, without a reload", (await rows()) === "both,shift", await rows());
    await context.close();
  }

  // No /today.json (404, a bad answer, the wrong version): the home is exactly release 8.1's.
  for (const [label, today] of [["404", 404], ["500", 500], ["not JSON", "<html>"], ["version 2", { v: 2, today: [{ title: "x", href: "/" }] }]]) {
    const { context } = await newContext(browser, { groups: "mentor", today });
    const { page, errors } = await openPortal(context);
    await settle(page);
    const s = await page.evaluate(() => ({ cards: document.querySelectorAll("#home-cards > *, #home-activity > *").length, tiles: document.querySelectorAll("#app-grid .app-card").length, access: !document.getElementById("access").hidden }));
    check(`/today.json ${label}: no card is drawn and the tiles and Get access are as before`, s.cards === 0 && s.tiles === 3 && s.access && errors.length === 0, { s, errors });
    if (label === "404") { await shot(page, "home-no-today-1280"); }
    await context.close();
  }

  // Tools, Admin apps and More: closed rows in that order, only what the person may open, remembered.
  const ROWS = { admin: [["tools", 2], ["adminapps", 2], ["more", 2]], mentor: [["tools", 2], ["adminapps", 1], ["more", 2]], student: [["tools", 2], ["more", 2]], parent: [["more", 1]] };
  for (const [role, want] of Object.entries(ROWS)) {
    const { context } = await newContext(browser, { groups: role, apps: GROUPED_APPS });
    const { page } = await openPortal(context);
    const g = await page.$$eval("#home-groups .grp", (els) => els.map((e) => [e.dataset.grp, +e.querySelector(".tcount").textContent, e.querySelector(".grphead").getAttribute("aria-expanded"), e.querySelector(".grpbody").hidden, e.querySelector(".grpname").textContent]));
    check(`${role}: rows ${want.map((w) => w[0]).join(", ")} with their counts, all closed`, JSON.stringify(g.map((x) => [x[0], x[1]])) === JSON.stringify(want) && g.every((x) => x[2] === "false" && x[3]), g);
    check(`${role}: the tiles are the core apps only`, (await names(page, "#app-grid .app-card")).join() === "Task App,Calendar");
    if (role === "admin") {
      check("admin: the rows read Tools, Admin apps, More", g.map((x) => x[4]).join() === "Tools,Admin apps,More", g);
      check("admin: Admin apps lists Admin and Website editor, in new tabs", (await names(page, "#admin-list li")).join() === "Admin,Website editor" && (await page.$$eval("#admin-list a", (as) => as.every((a) => a.target === "_blank" && a.rel.includes("noopener")))));
      check("admin: the Admin apps row has its hover description", (await page.getAttribute('[data-grp="adminapps"] .grphead', "data-tip")) === "Apps for the people who run the team's accounts and its public website.");
    }
    if (role === "mentor") check("mentor: Admin apps lists Website editor alone", (await names(page, "#admin-list li")).join() === "Website editor");
    await context.close();
  }
  for (const width of [1280, 390]) {
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS, width, today: TODAY.admin });
    let { page } = await openPortal(context);
    await settle(page);
    await page.$eval("#home-groups", (e) => e.scrollIntoView({ block: "center" }));
    await shot(page, `groups-closed-${width}`);
    // keyboard: Enter opens Tools, Space opens Admin apps; both are remembered in the site-wide shellgroups cookie
    await page.focus('[data-grp="tools"] .grphead');
    await page.keyboard.press("Enter");
    await page.focus('[data-grp="adminapps"] .grphead');
    await page.keyboard.press(" ");
    const tools = await page.$$eval("#tools-list a", (as) => as.map((a) => [a.querySelector("b")?.textContent || a.textContent.trim(), a.getAttribute("href"), a.target, a.dataset.tip || ""]));
    check(`${width}px: Tools opens to the two tools (same tab, with tips) and All tools last`, JSON.stringify(tools) === JSON.stringify([
      ["Drawing to vector", "http://tools.landing.test/trace", "", "Make an SVG for the laser and a DXF for Onshape, at true size."],
      ["Gear and sprocket finder", "http://tools.landing.test/gear", "", "Work out gear pitch, chain size or belt profile, then find it in Parts."],
      ["All tools›", "http://tools.landing.test/", "", ""]]), tools);
    const cookie = (await context.cookies(PORTAL)).find((c) => c.name === "shellgroups");
    check(`${width}px: the open rows are remembered site-wide (shellgroups = tools.adminapps)`, cookie && cookie.value === "tools.adminapps" && cookie.domain === ".landing.test", cookie);
    await page.$eval("#home-groups", (e) => e.scrollIntoView({ block: "center" }));
    await shot(page, `groups-open-${width}`);
    check(`${width}px: rows open, no sideways scroll`, (await over(page)) <= 0);
    await page.close();
    ({ page } = await openPortal(context));
    const open = await page.$$eval("#home-groups .grp", (els) => els.map((e) => [e.dataset.grp, e.querySelector(".grphead").getAttribute("aria-expanded")]));
    check(`${width}px: reloaded, Tools and Admin apps are still open and More closed`, JSON.stringify(open) === JSON.stringify([["tools", "true"], ["adminapps", "true"], ["more", "false"]]), open);
    await page.click('[data-grp="tools"] .grphead');
    const after = (await context.cookies(PORTAL)).find((c) => c.name === "shellgroups");
    check(`${width}px: closing Tools leaves only adminapps in the cookie`, after && after.value === "adminapps", after);
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS });
    const { page } = await openPortal(context);
    await page.fill("#q", "gear");
    const s = await page.$$eval("#home-groups .grp", (els) => els.map((e) => [e.dataset.grp, e.hidden, e.querySelector(".grphead").getAttribute("aria-expanded"), [...e.querySelectorAll(".grpbody [data-q]")].filter((x) => !(x.closest("li") || x).hidden).map((x) => x.querySelector("b")?.textContent || x.textContent.trim())]));
    check("search opens the row that has a match and hides the others", JSON.stringify(s) === JSON.stringify([["tools", false, "true", ["Gear and sprocket finder"]], ["adminapps", true, "false", []], ["more", true, "false", []]]), s);
    await page.fill("#q", "editor");
    check("search finds an Admin app", (await names(page, "#admin-list li:not([hidden])")).join() === "Website editor" && !(await page.isVisible("#app-empty")));
    await page.keyboard.press("Escape");
    const back = await page.$$eval("#home-groups .grp", (els) => els.map((e) => [e.hidden, e.querySelector(".grphead").getAttribute("aria-expanded")]));
    check("clearing the search closes the rows again (search never saves a row open)", back.every(([hid, exp]) => !hid && exp === "false") && !(await context.cookies(PORTAL)).some((c) => c.name === "shellgroups"), back);
    await context.close();
  }

  // The shop screen (C9): "Pick what this screen shows" and nothing else.
  for (const width of [1280, 390]) {
    const { context } = await newContext(browser, { groups: "display", width });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(PORTAL + "/");
    await page.waitForSelector("#display-home");
    const d = await page.evaluate(() => ({
      h1: document.querySelector("h1").textContent, h1s: document.querySelectorAll("h1").length,
      links: [...document.querySelectorAll("#display-home a")].map((a) => [a.querySelector("b").textContent, a.getAttribute("href"), a.target]),
      bar: !!document.querySelector("#shell-bar *"), footer: document.getElementById("site-footer").getClientRects().length,
      other: [...document.querySelectorAll("main a, main button, main input")].filter((e) => !e.closest("#display-home")).length,
      bg: getComputedStyle(document.body).backgroundColor, cardH: Math.min(...[...document.querySelectorAll(".dcard")].map((a) => a.getBoundingClientRect().height)),
    }));
    check(`display ${width}px: "Pick what this screen shows" with Door QR, Pit monitor and Projector`, d.h1 === "Pick what this screen shows" && d.h1s === 1 && JSON.stringify(d.links) === JSON.stringify([
      ["Door QR", "http://calendar.landing.test/here/kiosk", ""], ["Pit monitor", "http://compete.landing.test/pit/monitor", ""], ["Projector", "http://tasks.landing.test/projector", ""]]), d);
    check(`display ${width}px: nothing else (no bar, no footer, no other control), dark, large links`, !d.bar && d.footer === 0 && d.other === 0 && d.bg === "rgb(7, 9, 15)" && d.cardH >= 100, d);
    check(`display ${width}px: no sideways scroll, no script error`, (await over(page)) <= 0 && errors.length === 0, errors);
    await page.keyboard.press("Tab");
    check(`display ${width}px: Tab reaches the first screen`, await page.evaluate(() => document.activeElement?.dataset.screen === "kiosk"));
    await shot(page, `display-${width}`);
    await context.close();
  }

  // The bell (C3): the kit's bell, through the portal's own /_shell/inbox; no inbox there, no bell.
  {
    let { context } = await newContext(browser, { groups: "mentor", inbox: { v: 1, available: true, unread: 3, items: [] } });
    let { page } = await openPortal(context);
    await page.waitForSelector('#shell-bar a[href$="#inbox"]:not([hidden])');
    check("the portal home has the bell, with the unread count", (await page.textContent('#shell-bar a[href$="#inbox"] .shbar-count')) === "3");
    await context.close();
    ({ context } = await newContext(browser, { groups: "mentor" }));
    ({ page } = await openPortal(context));
    await settle(page);
    check("no inbox on the portal host: no bell", !(await page.isVisible('#shell-bar a[href$="#inbox"]')));
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
