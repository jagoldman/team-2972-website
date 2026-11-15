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
//     home for a display login; the kit's bell through /_shell/inbox; rows that belong to one mode (C12).
//   - the review's fix round (C13, C14): the full next-task card, a held-back task's plain Done, the empty states, the
//     event day, the app column, Done's answers (403, 404, 5xx, no answer in 10 s), one POST for two presses, one
//     lasting status line, hostile words, the shop screen's notice and an extra Authentik group, the amber chip's
//     contrast, the install banner's start, the cookie re-read. PORTAL_TEST_SHOTS=<dir> saves viewport screenshots.
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
// event: what /event.json answers (default 404). taskDone "hang": the POST never answers. me: a status for /me.json.
// eventStatus: what /event-status.json answers (C15; default 404). inboxRead: the status POST /_shell/inbox/read answers
// (default 204); its requests are in `reads`.
async function newContext(browser, { groups = "mentor", apps = APPS, width = 1280, height = 900, today = 404, taskDone = 204, inbox = 404, event = 404, me = 200, eventStatus = 404, inboxRead = 204 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const seen = [];
  const posts = [];
  const reads = [];
  const answers = { today, gets: 0 };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.href);
    const portal = url.host === "portal.landing.test";
    if (!portal && url.host !== "landing.test") return route.abort();
    if (portal && url.pathname === "/me.json" && me !== 200) return route.fulfill({ status: me, body: "" });
    if (portal && url.pathname === "/me.json") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ email: "pat@example.com", name: "Pat Example", username: "pat@example.com", groups, uid: "u-1" }) });
    }
    if (portal && url.pathname === "/apps.json") return route.fulfill({ contentType: "application/json", body: apps });
    if (portal && url.pathname === "/event.json") {
      return typeof event === "number" ? route.fulfill({ status: event, body: "" }) : route.fulfill({ contentType: "application/json", body: JSON.stringify(event) });
    }
    if (portal && url.pathname === "/event-status.json") {
      return typeof eventStatus === "number" ? route.fulfill({ status: eventStatus, body: "" }) : route.fulfill({ contentType: "application/json", body: JSON.stringify(eventStatus) });
    }
    if (portal && url.pathname === "/_shell/inbox/read") {
      const rq = route.request();
      reads.push({ method: rq.method(), body: rq.postData(), type: rq.headers()["content-type"], origin: rq.headers().origin, site: rq.headers()["sec-fetch-site"] });
      return route.fulfill({ status: inboxRead, body: "" });
    }
    if (portal && url.pathname === "/today.json") {
      answers.gets++;
      const t = typeof answers.today === "function" ? answers.today() : answers.today;
      return typeof t === "number" ? route.fulfill({ status: t, body: "" }) : route.fulfill({ contentType: "application/json", body: typeof t === "string" ? t : JSON.stringify(t) });
    }
    if (portal && url.pathname === "/today/task-done") {
      posts.push({ method: route.request().method(), body: route.request().postData(), type: route.request().headers()["content-type"] });
      if (taskDone === "hang") return new Promise(() => {}); // no answer, ever: the page's own time limit must end it
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
  return { context, seen, posts, answers, reads };
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
      activity: [{ app: "Parts", title: "Your part request was ordered", detail: "Hex shaft, 1/2 in.", href: `${PARTS}/requests/7`, at: ago(5) },
        { app: "Skills", title: "A mentor signed off Drill press", href: "http://skills.landing.test/", at: ago(180) }] },
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
    const ids = [...document.querySelectorAll("#home-card-list > section, #home-activity > section")].map((s) => s.id);
    const order = ["[data-guide-card]", "#home-cards", "#apps-head", "#home-groups", "#home-activity", "#access"].map((sel) => document.querySelector(sel));
    const inOrder = order.every((n, i) => i === 0 || (order[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
    const rows = (id) => [...document.querySelectorAll(`#${id} .rt`)].map((e) => e.textContent);
    return { ids, inOrder, today: rows("home-today"), waiting: rows("home-waiting"),
      counts: [...document.querySelectorAll("#home-waiting .tcount")].map((e) => e.textContent),
      ctas: [...document.querySelectorAll(".todayrow > a.btn")].map((a) => [a.firstChild.textContent, a.getAttribute("href"), a.target]),
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
        const gold = await page.$eval("#home-next .heroacts", (b) => [...b.children].map((e) => [e.firstChild.textContent.trim() || e.textContent.trim(), e.classList.contains("btn-outline") ? "plain" : e.classList.contains("btn-ghost") ? "ghost" : "gold"]));
        check("student: Done is the one gold button, Open is the demo's ghost button", JSON.stringify(gold) === JSON.stringify([["Done", "gold"], ["Open", "ghost"]]), gold);
        check("student: Recent activity has the notices", h.activity.join("|") === "Your part request was ordered|A mentor signed off Drill press", h);
        check("student: Recent activity names the app first, as the demo (C13)", (await page.$$eval("#home-activity .actlink", (as) => as.map((a) => a.firstElementChild.className + ":" + a.firstElementChild.textContent))).join() === "actapp:Parts,actapp:Skills");
        check("student: no Waiting on you card", !h.waiting.length);
      }
      if (role === "mentor") {
        check("mentor: Waiting on you rows with counts, and the guide's data-guide=\"wait\"", h.waiting.length === 3 && h.counts.join() === "2,3,1" && h.waitGuide === "wait", h);
        check("mentor: the counts are the demo's amber chip", await page.$$eval("#home-waiting .tcount", (els) => els.length === 3 && els.every((e) => e.classList.contains("warn"))));
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
  // Done's answers (item 5): 403 and 404 offer "Open task"; a 5xx puts Done back; no answer in 10 s says so and asks
  // for /today.json again (and never offers "Open task"). The Done messages live in one lasting status line.
  for (const st of [403, 404]) {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student, taskDone: st });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => document.querySelector("#home-next .heroacts")?.firstElementChild?.tagName === "A");
    const acts = await page.$$eval("#home-next .heroacts > *", (els) => els.map((e) => [e.tagName, e.firstChild.textContent.trim(), e.getAttribute("href"), e.classList.contains("btn-outline") || e.classList.contains("btn-ghost")]));
    check(`task-done ${st}: the card offers "Open task" (gold) instead of Done`, acts.length === 1 && acts[0][0] === "A" && acts[0][1] === "Open task" && acts[0][2] === `${TASKS}/my?task=t-41` && !acts[0][3], acts);
    check(`task-done ${st}: says so in the status line, and focus is on Open task`, /can't be marked done/.test(await page.textContent("#home-cards [role=status]")) && await page.evaluate(() => document.activeElement?.textContent.startsWith("Open task")));
    if (st === 403) await shot(page, "home-student-done-refused-1280");
    await context.close();
  }
  {
    const { context, posts } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student, taskDone: 503 });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => /try again/.test(document.getElementById("home-done-status").textContent));
    const s = await page.$eval("#home-next .heroacts button", (b) => ({ text: b.textContent.trim(), disabled: b.disabled, focused: b === document.activeElement }));
    check("task-done 503: Done is back, focused, with a short message; no Open task", s.text === "Done" && !s.disabled && s.focused && !(await page.$("#home-next a[href$='t-41']:not(.btn-ghost)")), s);
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => /try again/.test(document.getElementById("home-done-status").textContent) && !document.querySelector("#home-next .heroacts button").disabled);
    check("task-done 503: Done can be pressed again", posts.length === 2, posts.length);
    await context.close();
  }
  {
    const { context, posts, answers } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student, taskDone: "hang" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.goto(PORTAL + "/");
    await page.waitForSelector("#home-next");
    const status0 = await page.evaluate(() => { const s = document.querySelectorAll("#home-cards [role=status]"); s[0].dataset.mark = "kept"; return s.length; });
    const gets0 = answers.gets;
    // two quick presses send one POST (item 6)
    await page.$eval("#home-next .heroacts button", (b) => { b.click(); b.click(); });
    await page.waitForFunction(() => /Marking it done/.test(document.getElementById("home-done-status").textContent));
    // no refresh while the POST is on its way, even when the tab comes back after a long time (item 7)
    await page.clock.setSystemTime(Date.now() + 5 * 60000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(200);
    const getsWhilePending = answers.gets;
    await page.clock.runFor(10500);
    await page.waitForFunction(() => /couldn't tell if that worked/.test(document.getElementById("home-done-status").textContent));
    await page.waitForTimeout(300);
    check("two quick presses of Done send one POST", posts.length === 1, posts.length);
    check("no /today.json request while the POST is on its way", getsWhilePending === gets0, { gets0, getsWhilePending });
    check("no answer in 10 s: \"We couldn't tell if that worked.\" and /today.json is asked again", answers.gets === gets0 + 1, { gets0, now: answers.gets });
    check("...and the card never offers Open task then", !(await page.$$eval("#home-next .heroacts a", (as) => as.some((a) => a.firstChild.textContent.trim() === "Open task"))));
    const status1 = await page.evaluate(() => ({ n: document.querySelectorAll("#home-cards [role=status]").length, kept: document.querySelector("#home-cards [role=status]").dataset.mark === "kept" }));
    check("one status line in #home-cards, the same one after the cards were drawn again", status0 === 1 && status1.n === 1 && status1.kept, { status0, status1 });
    check("timeout: no script error", errors.length === 0, errors);
    await context.close();
  }

  // C13 and C14: the next-task card in full, a held-back task, the empty states, the event day.
  const FULL = { ...TODAY.student, next: { taskId: "t-41", title: "Wire the intake sensor", due: "2026-11-18", project: "Intake", subteam: "Electrical", milestone: "Robot drives",
    steps: { done: 2, total: 5 }, href: `${TASKS}/my?task=t-41`, stuckHref: `${TASKS}/my?task=t-41&do=stuck`, partHref: `${TASKS}/my?task=t-41&do=part` } };
  const card = (page) => page.evaluate(() => {
    const c = document.getElementById("home-next");
    return { cls: c.className, h2: c.querySelector("h2").textContent, line: c.querySelector(".next-line")?.textContent || "", steps: c.querySelector(".next-steps")?.textContent || "",
      bar: c.querySelector(".next-bar i")?.style.width || "", waiting: c.querySelector(".next-waiting")?.textContent || "", hold: c.querySelector(".next-hold")?.textContent || "",
      blocked: c.querySelector(".next-blocked")?.textContent || "", empty: c.querySelector("p.mute")?.textContent || "",
      acts: [...c.querySelectorAll(".heroacts > *")].map((e) => [e.firstChild.nodeType === 3 ? e.firstChild.textContent.trim() : e.textContent.replace(" (opens in a new tab)", "").trim(),
        e.classList.contains("btn-outline") ? "plain" : e.classList.contains("btn-ghost") ? "ghost" : "gold", e.getAttribute("href")]) };
  });
  for (const width of [1280, 390]) {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: FULL, width });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next .next-steps");
    const c = await card(page);
    check(`${width}px: the full next-task card: project › subteam, milestone, due date, steps`, c.line === "Intake › Electrical · for “Robot drives” · due Wed, Nov 18" && c.steps === "2 of 5 steps" && c.bar === "40%", c);
    check(`${width}px: Done (gold), I'm stuck, Request a part, Open (ghost), with their links`, JSON.stringify(c.acts) === JSON.stringify([["Done", "gold", null], ["I'm stuck", "plain", `${TASKS}/my?task=t-41&do=stuck`],
      ["Request a part", "plain", `${TASKS}/my?task=t-41&do=part`], ["Open", "ghost", `${TASKS}/my?task=t-41`]]), c.acts);
    check(`${width}px: the full card has no sideways scroll`, (await over(page)) <= 0);
    if (width === 390) {
      const w = await page.$eval("#home-next .heroacts", (b) => [...b.children].map((e) => Math.round(e.getBoundingClientRect().width / b.getBoundingClientRect().width * 100)));
      check("390px: as the demo's phone card, gold Done and the ghost Open take the whole row, the other two share one", w[0] === 100 && w[3] === 100 && w[1] < 55 && w[2] < 55, w);
    }
    await page.$eval("#home-next", (e) => e.scrollIntoView({ block: "center" }));
    await shot(page, `next-full-${width}`);
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...TODAY.student, next: { taskId: "t-41", title: "Mount the camera", project: "Vision", href: `${TASKS}/my?task=t-41` } } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    const c = await card(page);
    check("no stuckHref or partHref: only Done and Open (C13)", c.acts.map((a) => a[0]).join() === "Done,Open", c.acts);
    await context.close();
  }
  for (const [label, extra, word] of [["waiting on another task", { waitingOn: ["Cut the plate", "Order the sensor"] }, "waiting"], ["on hold", { onHold: true }, "hold"], ["blocked", { blocked: true }, "blocked"]]) {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...FULL, next: { ...FULL.next, ...extra } } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    const c = await card(page);
    const said = { waiting: c.waiting === "Waiting on Cut the plate, Order the sensor.", hold: c.hold === "This task is on hold.", blocked: c.blocked === "Blocked" }[word];
    check(`a task ${label}: Done is a plain button and the card says so in words`, c.acts[0][0] === "Done" && c.acts[0][1] === "plain" && said, c);
    if (word === "waiting") { await page.$eval("#home-next", (e) => e.scrollIntoView({ block: "center" })); await shot(page, "next-waiting-plain-done-1280"); }
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: { ...TODAY.mentor, waiting: [] } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-waiting");
    check("an activity row without an app has no empty first column", !(await page.$("#home-activity .actapp")));
    check("staff with nothing waiting: the card says \"Nothing is waiting on you.\" (C13)", (await page.textContent("#home-waiting p")) === "Nothing is waiting on you." && (await page.getAttribute("#home-waiting", "data-guide")) === "wait");
    await shot(page, "empty-waiting-1280");
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...TODAY.student, next: null } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    const c = await card(page);
    check("a student with no next task: \"Nothing assigned to you\" (C13)", c.h2 === "Nothing assigned to you" && c.empty === "Take something nobody has yet." && c.acts.length === 0, c);
    await shot(page, "empty-next-1280");
    await context.close();
  }
  for (const today of [404, { ...TODAY.mentor, waiting: [] }]) {
    // a student who is not staff never gets an empty Waiting card; no answer at all draws no empty card for anyone
    const { context } = await newContext(browser, { groups: today === 404 ? "mentor|student" : "student", apps: GROUPED_APPS, today });
    const { page } = await openPortal(context);
    await settle(page);
    const ids = await page.$$eval("#home-card-list > section", (els) => els.map((e) => e.id));
    check(`empty states only with an answer, and Waiting only for staff (${today === 404 ? "no answer" : "student"})`, today === 404 ? ids.length === 0 : !ids.includes("home-waiting") && ids.includes("home-next"), ids);
    await context.close();
  }
  for (const width of [1280, 390]) {
    const shift = { id: "compete:shift-now:e1:2026-11-14:18", section: "today", title: "Pit crew until 11:00", detail: "Then Scouting at 11:00.", href: "http://compete.landing.test/schedule" };
    const today = { ...FULL, today: [...FULL.today, shift] };
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today, width, event: { name: "Colorado Regional", happeningNow: true } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await settle(page);
    const s = await page.evaluate(() => ({ rows: [...document.querySelectorAll("#home-today .todayrow")].map((r) => r.dataset.id), compact: document.getElementById("home-next").classList.contains("evcompact"),
      h2: parseFloat(getComputedStyle(document.querySelector("#home-next h2")).fontSize) }));
    check(`${width}px event day: Competition's shift row first and the compact next-task card (C14)`, s.rows[0] === shift.id && s.rows.length === 2 && s.compact && s.h2 <= 18, s);
    await shot(page, `home-event-day-${width}`);
    await context.close();
  }
  {
    const shift = { id: "compete:shift-now:x", section: "today", title: "Pit crew until 11:00", href: "http://compete.landing.test/schedule" };
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...FULL, today: [...FULL.today, shift] }, event: { name: "Colorado Regional", happeningNow: false } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await settle(page);
    const s = await page.evaluate(() => ({ first: document.querySelector("#home-today .todayrow").dataset.id, compact: document.getElementById("home-next").classList.contains("evcompact") }));
    check("not an event day (happeningNow false): the order is the answer's and the card is the full one", s.first !== shift.id && !s.compact, s);
    await context.close();
  }

  // The amber chip and the status words keep 4.5:1 in both themes.
  for (const theme of ["light", "dark"]) {
    const { context } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: TODAY.mentor });
    await context.addCookies([site("theme", theme)]);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-waiting .tcount");
    const ratio = await page.$eval("#home-waiting .tcount.warn", (e) => {
      const rgba = (c) => (c.match(/[\d.]+/g) || []).map(Number);
      const over = (top, under) => { const a = top[3] === undefined ? 1 : top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)); };
      let bg = rgba(getComputedStyle(e).backgroundColor), n = e.parentElement, under = null;
      while (n && !under) { const c = rgba(getComputedStyle(n).backgroundColor); if (c.length && (c[3] === undefined || c[3] > 0.99)) under = c; n = n.parentElement; }
      const back = over(bg, under || [255, 255, 255]);
      const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const fg = over(rgba(getComputedStyle(e).color), back);
      const [a, b] = [lum(fg), lum(back)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    check(`${theme}: the amber count chip has at least 4.5:1 contrast`, ratio >= 4.5, ratio.toFixed(2));
    await context.close();
  }

  // Hostile text everywhere the answer has words (item 6): it is shown as text; no element is made from it.
  {
    const evil = "<img src=x onerror=\"window.__xss=1\">";
    const today = { v: 1,
      today: [{ id: "a", section: "today", title: evil, detail: evil, href: `${CAL}/`, cta: { label: evil, href: `${CAL}/x` } }],
      waiting: [{ id: "b", section: "waiting", title: evil, detail: evil, href: `${PARTS}/`, count: 1 }],
      next: { taskId: evil, title: evil, project: evil, subteam: evil, milestone: evil, waitingOn: [evil], href: `${TASKS}/my`, stuckHref: `${TASKS}/my?do=stuck` },
      activity: [{ app: evil, title: evil, detail: evil, href: `${PARTS}/`, at: ago(2) }] };
    const { context } = await newContext(browser, { groups: "mentor|student", apps: GROUPED_APPS, today });
    const { page, errors } = await openPortal(context);
    await page.waitForSelector("#home-activity section");
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ imgs: document.querySelectorAll("main img").length, xss: window.__xss === 1,
      shown: document.querySelector("#home-today .rt").textContent, app: document.querySelector("#home-activity .actapp").textContent }));
    check("hostile words: no img element is created, nothing runs, the words show as text", s.imgs === 0 && !s.xss && s.shown.startsWith("<img") && s.app.startsWith("<img") && errors.length === 0, { s, errors });
    await context.close();
  }

  // The shop screen's notice (C14) and an extra Authentik group (item 4).
  const SHOP_APPS = JSON.stringify([...JSON.parse(GROUPED_APPS), { id: "parts", name: "Parts & Inventory", description: "Parts.", host: "parts", groups: ["admin", "mentor", "student"] }]);
  for (const [query, want] of [["?blocked=parts", "Parts & Inventory isn't available on a display. Pick one of these instead."], ["?blocked=nope", null], ["?blocked=%3Cimg%20src%3Dx%3E", null], ["?blocked=Parts", null]]) {
    for (const width of query === "?blocked=parts" ? [1280, 390] : [1280]) {
      const { context, seen } = await newContext(browser, { groups: "display|authentik Admins", apps: SHOP_APPS, width });
      const page = await context.newPage();
      await page.goto(PORTAL + "/" + query);
      await page.waitForSelector("#display-home");
      await settle(page);
      const note = await page.$eval("#display-home", (d) => d.querySelector(".dnote")?.textContent || null);
      check(`shop screen ${query} (${width}px): ${want ? "the notice names the app from the list" : "no notice"}`, note === want, note);
      if (query === "?blocked=parts" && width === 1280) {
        check("display with an extra Authentik group gets the screen picker (item 4)", (await page.$$("#display-home .dcard")).length === 3 && !(await page.$("#shell-bar *")));
        check("a shop-screen login asks for no /today.json or /event.json", !seen.some((u) => /\/(today|event)\.json/.test(u)), seen.filter((u) => /json/.test(u)));
      }
      if (query === "?blocked=parts") await shot(page, `display-blocked-${width}`);
      await context.close();
    }
  }

  // The install banner starts as early as in release 8.1: before /me.json answers, so even when it fails (item 7).
  {
    const { context } = await newContext(browser, { groups: "student", me: 500 });
    const page = await context.newPage();
    await page.goto(PORTAL + "/");
    await page.waitForSelector("#portal-error:not([hidden])");
    await page.waitForSelector(".install-banner", { timeout: 4000 }).catch(() => null);
    check("the install banner still comes when /me.json fails (it starts first, as in 8.1)", !!(await page.$(".install-banner")));
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "display" });
    const page = await context.newPage();
    await page.goto(PORTAL + "/");
    await page.waitForSelector("#display-home");
    await page.waitForTimeout(1600);
    check("the shop screen shows no install banner", !(await page.isVisible(".install-banner")));
    await context.close();
  }

  // A row opened in another tab meanwhile stays open (item 7). Kit 0.4.0's mountHomeGroups re-reads the cookie when
  // the tab comes back (the other tab was in front meanwhile), not on every press.
  {
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS });
    const { page } = await openPortal(context);
    await page.click('[data-grp="tools"] .grphead');
    await context.addCookies([site("shellgroups", "more")]); // another tab closed Tools and opened More
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("the tab comes back: Home's rows follow the cookie (Tools closed, More open)", JSON.stringify(await page.$$eval("#home-groups .grp", (els) => els.map((e) => e.querySelector(".grphead").getAttribute("aria-expanded")))) === JSON.stringify(["false", "false", "true"]));
    await page.click('[data-grp="adminapps"] .grphead');
    const c = (await context.cookies(PORTAL)).find((x) => x.name === "shellgroups");
    check("opening Admin apps keeps what the cookie says now (adminapps.more), not this page's old list", c && c.value === "adminapps.more", c);
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
    const s = await page.evaluate(() => ({ cards: document.querySelectorAll("#home-card-list > *, #home-activity > *").length, tiles: document.querySelectorAll("#app-grid .app-card").length, access: !document.getElementById("access").hidden }));
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
    await page.waitForTimeout(400); // the chevrons finish turning
    const turned = await page.$$eval("#home-groups .grp", (els) => els.map((e) => [e.dataset.grp, getComputedStyle(e.querySelector(".grpchev")).transform !== "none"]));
    check(`${width}px: an open row's chevron is turned, a closed one's is not`, JSON.stringify(turned) === JSON.stringify([["tools", true], ["adminapps", true], ["more", false]]), turned);
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

  // The bell (C3, kit 0.4.0): a button that opens the notices panel, through the portal's own /_shell/inbox; "Mark all
  // read" posts {"all":true} to /_shell/inbox/read as same-origin JSON and counts only a 204. No inbox there, no bell.
  const INBOX = { v: 1, available: true, unread: 2, items: [
    { id: "n1", app: "Parts", text: "Your part request was ordered", href: "http://parts.landing.test/requests/7", at: ago(5), read: false },
    { id: "n2", app: "Skills", text: "A mentor signed off Drill press", href: "http://skills.landing.test/", at: ago(90), read: false },
    { id: "n3", app: "Calendar", text: "Practice moved to 4:00", href: "http://calendar.landing.test/", at: ago(60 * 30), read: true }] };
  for (const width of [1280, 390]) {
    const { context, reads } = await newContext(browser, { groups: "mentor", inbox: INBOX, width });
    const { page, errors } = await openPortal(context);
    await page.waitForSelector("#shell-bar .shbar-bell:not([hidden])");
    const bell = await page.$eval("#shell-bar .shbar-bell", (b) => ({ tag: b.tagName, count: b.querySelector(".shbar-count").textContent, expanded: b.getAttribute("aria-expanded"),
      w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
    check(`${width}px: the bell is a button with the unread count, not a link`, bell.tag === "BUTTON" && bell.count === "2" && bell.expanded === "false" && !(await page.$('#shell-bar a[href$="#inbox"].shbar-bell')), bell);
    if (width === 390) {
      const acct = await page.$eval("#shell-bar .shbar-acct", (b) => [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]);
      check("390px: the bar's bell and account button are 44 px", bell.w >= 44 && bell.h >= 44 && acct[0] >= 44 && acct[1] >= 44, { bell, acct });
    }
    await page.focus("#shell-bar .shbar-bell");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#shell-bar .shbar-bellpanel:not([hidden])");
    const panel = await page.$eval("#shell-bar .shbar-bellpanel", (p) => ({ text: p.textContent, rows: p.querySelectorAll(".shbar-notices li").length,
      links: [...p.querySelectorAll(".shbar-panel-foot a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]), x: !!p.querySelector(".shbar-x") }));
    check(`${width}px: the panel lists the notices with Mark all read, Notification settings and All notices`, panel.rows === 3 && /Mark all read/.test(panel.text) && panel.x
      && JSON.stringify(panel.links) === JSON.stringify([["Notification settings", "http://account.landing.test/#notifications"], ["All notices", "http://account.landing.test/#inbox"]]), panel);
    await shot(page, `bell-open-${width}`);
    await page.click("#shell-bar .shbar-readall");
    await page.waitForFunction(() => !document.querySelector("#shell-bar .shbar-bell .shbar-count") || document.querySelector("#shell-bar .shbar-bell .shbar-count").hidden);
    check(`${width}px: Mark all read posts {"all":true} as same-origin JSON to /_shell/inbox/read, and the 204 clears the count`, reads.length === 1 && reads[0].method === "POST" && reads[0].body === '{"all":true}'
      && /application\/json/.test(reads[0].type) && reads[0].origin === PORTAL && reads[0].site === "same-origin", reads);
    await page.keyboard.press("Escape");
    check(`${width}px: Escape closes the bell's panel`, !(await page.isVisible("#shell-bar .shbar-bellpanel")));
    check(`${width}px: the bell has no script error`, errors.length === 0, errors);
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "mentor", inbox: INBOX, inboxRead: 500 });
    const { page } = await openPortal(context);
    await page.waitForSelector("#shell-bar .shbar-bell:not([hidden])");
    await page.click("#shell-bar .shbar-bell");
    await page.click("#shell-bar .shbar-readall");
    await page.waitForFunction(() => /Couldn't mark them read/.test(document.querySelector("#shell-bar .shbar-bellpanel").textContent));
    check("Mark all read answered 500: the panel says so and the count stays", (await page.textContent("#shell-bar .shbar-bell .shbar-count")) === "2");
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "mentor" });
    const { page } = await openPortal(context);
    await settle(page);
    check("no inbox on the portal host: no bell", !(await page.isVisible("#shell-bar .shbar-bell")));
    await context.close();
  }

  // The bar's Apps menu (kit 0.4.0, C1, C10): Tools, Admin apps, More in that order; Admin and Website editor under
  // Admin apps, not More; each menu has its ×; a press on the page while a menu is open hits the scrim.
  for (const width of [1280, 390]) {
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS, width });
    const { page, errors } = await openPortal(context);
    await page.click("#shell-bar .shbar-appsbtn");
    const rows = await page.$$eval("#shell-bar .shbar-apps .shbar-group:not([hidden]) > .shbar-groupbtn", (bs) => bs.map((b) => b.firstElementChild.textContent));
    check(`${width}px: the Apps menu's rows read Tools, Admin apps, More`, rows.join() === "Tools,Admin apps,More", rows);
    await page.click("#shell-bar .shbar-adminappsbtn");
    const admin = (await names(page, "#shell-bar .shbar-adminapps ul.shbar-grid > li")).join();
    await page.click("#shell-bar .shbar-morebtn");
    const more = (await names(page, "#shell-bar .shbar-more ul.shbar-grid > li")).join();
    check(`${width}px: Admin and Website editor are under Admin apps, not More`, admin === "Admin,Website editor" && more === "GitHub,Team Handbook", { admin, more });
    await shot(page, `apps-menu-groups-${width}`);
    // the × follows the switch: after Competition, Tab reaches it
    await page.focus("#shell-bar .shbar-mode button:last-child");
    await page.keyboard.press("Tab");
    check(`${width}px: the Apps menu's × follows the Build / Competition switch`, await page.evaluate(() => document.activeElement?.matches(".shbar-apps .shbar-x")));
    await page.keyboard.press("Enter");
    check(`${width}px: the × closes the Apps menu`, !(await page.isVisible("#shell-bar .shbar-apps")));
    // the scrim: a press on the page closes the menu and does not reach the control beneath
    const box = await page.$eval('[data-grp="more"] .grphead', (b) => { b.scrollIntoView({ block: "end" }); const r = b.getBoundingClientRect(); return { x: r.right - 12, y: r.top + r.height / 2 }; });
    await page.click("#shell-bar .shbar-appsbtn");
    check(`${width}px: the scrim is drawn while the menu is open`, await page.isVisible("#shell-bar .shbar-scrim"));
    await page.mouse.click(box.x, box.y);
    check(`${width}px: a press on the page closes the menu, and the row beneath stays closed`, !(await page.isVisible("#shell-bar .shbar-apps")) && (await page.getAttribute('[data-grp="more"] .grphead', "aria-expanded")) === "false");
    // the account menu's first Tab stop is its ×
    await page.focus("#shell-bar .shbar-acct");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    check(`${width}px: the account menu's first Tab stop is its ×`, await page.evaluate(() => document.activeElement?.matches(".shbar-account .shbar-x")));
    await page.keyboard.press("Escape");
    check(`${width}px: the Apps menu checks raise no script error`, errors.length === 0, errors);
    await context.close();
  }

  // The event-day banner (C5, C15): under the bar, pushing the page down; it never covers the home's own heading.
  {
    const d = new Date();
    const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2);
    const event = { name: "Colorado Regional", start: ymd(d), end: ymd(end), happeningNow: true, tbaUrl: "https://www.thebluealliance.com/event/2026code" };
    for (const width of [1280, 390]) {
      const { context } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, width, event, eventStatus: { v: 1, pit: "42", rank: 9, teams: 48 } });
      const { page, errors } = await openPortal(context);
      await page.waitForSelector("#shell-bar .shbar-banner:not([hidden])");
      await page.waitForFunction(() => /Rank 9 of 48/.test(document.querySelector("#shell-bar .shbar-banner").textContent));
      const b = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const bar = r("#shell-bar .shbar"), ban = r("#shell-bar .shbar-banner"), head = r(".homehead");
        return { text: document.querySelector("#shell-bar .shbar-banner").textContent, barBottom: Math.round(bar.bottom), banTop: Math.round(ban.top), banBottom: Math.round(ban.bottom), headTop: Math.round(head.top),
          switch: !!document.querySelector("#shell-bar .shbar-bannerbtn:not([hidden])") };
      });
      check(`${width}px: the banner names the event, day, pit and rank, with Switch to Competition`, /Colorado Regional/.test(b.text) && /Day 1 of 3/.test(b.text) && /Pit 42/.test(b.text) && b.switch, b);
      check(`${width}px: the banner sits under the bar and pushes the home down (nothing covered)`, Math.abs(b.banTop - b.barBottom) <= 1 && b.headTop >= b.banBottom, b);
      check(`${width}px: the banner has no sideways scroll and no script error`, (await over(page)) <= 0 && errors.length === 0, errors);
      await shot(page, `banner-${width}`);
      await page.evaluate(() => scrollTo(0, 400));
      const top = await page.$eval("#shell-bar .shbar", (e) => Math.round(e.getBoundingClientRect().top));
      check(`${width}px: scrolled, the bar still sticks at the top over the page`, top === 0, top);
      await context.close();
    }
  }

  // The guide (kit 0.4.0, C2): the "Get started" card on Home, and the two stops that live on Home.
  const guideAt = (role, open) => site("guide", `1:${role}:::${open}@${Math.floor(Date.now() / 1000).toString(36)}`);
  const guideCookie = async (context) => ((await context.cookies(PORTAL)).find((c) => c.name === "guide") || {}).value || "";
  const ringAround = (page, sel) => page.evaluate((sel) => {
    const ring = document.querySelector(".shell-gring");
    const t = document.querySelector(sel);
    if (!ring || ring.hidden || !t) return { ring: !!ring && !ring.hidden, target: !!t };
    const a = ring.getBoundingClientRect(), b = t.getBoundingClientRect();
    return { ok: a.left <= b.left + 1 && a.top <= b.top + 1 && a.right >= b.right - 1 && a.bottom >= b.bottom - 1, ring: [a.left, a.top, a.right, a.bottom].map(Math.round), target: [b.left, b.top, b.right, b.bottom].map(Math.round) };
  }, sel);
  for (const width of [1280, 390]) {
    const { context, seen } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: TODAY.mentor, width });
    const { page, errors } = await openPortal(context);
    await page.waitForSelector("[data-guide-card] .shell-guidecard");
    const g = await page.$eval("[data-guide-card] .shell-guidecard", (c) => c.textContent);
    check(`${width}px: a mentor's Home shows the guide's Get started card with its first stop`, /Get started/.test(g) && /Say which days you are coming/.test(g), g);
    check(`${width}px: the Get started card loads the engine (guide.js) and raises no error`, seen.some((u) => u.endsWith("/shell/guide.js")) && errors.length === 0, errors);
    await shot(page, `guide-card-${width}`);
    await context.close();
  }
  for (const width of [1280, 390]) {
    // The admin's "Let new people in": Home's Admin link in the Admin apps row is ringed (the row opened for this stop,
    // not saved), not the bar's copy; pressing it finishes the stop.
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS, today: TODAY.admin, width });
    await context.addCookies([guideAt("a", "admin")]);
    const { page, errors } = await openPortal(context);
    await page.waitForSelector(".shell-gstop h2");
    await page.waitForFunction(() => { const r = document.querySelector(".shell-gring"); return r && !r.hidden; });
    const ring = await ringAround(page, '#admin-list a[data-guide="tile-admin"]');
    const s = await page.evaluate(() => ({ title: document.querySelector(".shell-gstop h2").textContent, row: document.querySelector('[data-grp="adminapps"] .grphead').getAttribute("aria-expanded"),
      menu: !document.querySelector("#shell-bar .shbar-apps").hidden }));
    check(`admin stop ${width}px: "Let new people in" rings Home's Admin link in the Admin apps row`, s.title === "Let new people in" && s.row === "true" && !s.menu && ring.ok, { s, ring });
    check(`admin stop ${width}px: the row was opened for the stop only (shellgroups not written)`, !(await context.cookies(PORTAL)).some((c) => c.name === "shellgroups"));
    await shot(page, `guide-admin-stop-${width}`);
    const popup = context.waitForEvent("page").catch(() => null);
    await page.click('#admin-list a[data-guide="tile-admin"]');
    await page.waitForFunction(() => document.querySelector(".shell-gstop h2")?.textContent === "Done.");
    const cookie = await guideCookie(context);
    check(`admin stop ${width}px: pressing Admin finishes the stop ("Done." and admin done in the guide cookie)`, /^1:a:admin(\.|:)/.test(cookie), cookie);
    const p2 = await popup; if (p2) await p2.close();
    check(`admin stop ${width}px: no script error`, errors.length === 0, errors);
    await context.close();
  }
  for (const width of [1280, 390]) {
    // The "wait" stop: the Waiting on you card (drawn from /today.json, after the engine is up) is ringed; a press on
    // one of its rows finishes it.
    const { context } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: TODAY.mentor, width });
    await context.addCookies([guideAt("m", "wait")]);
    const { page, errors } = await openPortal(context);
    await page.waitForSelector("#home-waiting");
    await page.waitForFunction(() => { const r = document.querySelector(".shell-gring"); return r && !r.hidden && document.querySelector(".shell-gstop h2"); });
    const ring = await ringAround(page, '#home-waiting[data-guide="wait"]');
    const title = await page.textContent(".shell-gstop h2");
    check(`wait stop ${width}px: "See what is waiting on you" rings the Waiting on you card`, title === "See what is waiting on you" && ring.ok, { title, ring });
    await shot(page, `guide-wait-stop-${width}`);
    const popup = context.waitForEvent("page").catch(() => null);
    await page.click("#home-waiting .todayrow a.rowlink");
    await page.waitForFunction(() => document.querySelector(".shell-gstop h2")?.textContent === "Done.");
    const cookie = await guideCookie(context);
    check(`wait stop ${width}px: pressing a row finishes the stop ("Done." and wait done in the guide cookie)`, /^1:m:(?:[a-z.]*\.)?wait(\.|:)/.test(cookie), cookie);
    const p2 = await popup; if (p2) await p2.close();
    check(`wait stop ${width}px: no script error`, errors.length === 0, errors);
    await context.close();
  }
  {
    // "Start the tour again" (Account writes the start marker): an admin's first stop lives on Home and opens here.
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS });
    await context.addCookies([guideAt("a", "start")]);
    const { page } = await openPortal(context);
    await page.waitForSelector(".shell-gstop h2");
    check("Start the tour again: Home opens the admin's first stop", (await page.textContent(".shell-gstop h2")) === "Let new people in");
    await context.close();
  }
  {
    // A finished guide never loads the engine on Home; nor does the shop screen.
    const { context, seen } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS });
    await context.addCookies([site("guide", "1:m:days.wait.ok.sign:e:")]);
    const { page } = await openPortal(context);
    await settle(page);
    check("an ended guide: no card and guide.js never requested", !(await page.$(".shell-guidecard")) && !seen.some((u) => u.endsWith("/shell/guide.js")));
    await context.close();
    const shop = await newContext(browser, { groups: "display" });
    const sp = await shop.context.newPage();
    await sp.goto(PORTAL + "/");
    await sp.waitForSelector("#display-home");
    await settle(sp);
    check("the shop screen: no bar, no guide card, guide.js never requested", !(await sp.$("#shell-bar *")) && !(await sp.$(".shell-guidecard")) && !shop.seen.some((u) => u.endsWith("/shell/guide.js")));
    await shop.context.close();
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
