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
// act: what POST /today/act answers (8.3, H2): a status, { status, body }, "hang", or a function of the request body
// returning one of those, or "abort" (a network failure); its requests are in `actPosts`.
async function newContext(browser, { groups = "mentor", apps = APPS, width = 1280, height = 900, today = 404, taskDone = 204, inbox = 404, event = 404, me = 200, eventStatus = 404, inboxRead = 204, act = 204 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const seen = [];
  const posts = [];
  const reads = [];
  const actPosts = [];
  const answers = { today, gets: 0, act };
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
      // Sec-Fetch-Site is added below Playwright's interception, so it is seldom seen here; Origin is.
      const hs = await rq.allHeaders();
      reads.push({ method: rq.method(), url: rq.url(), body: rq.postData(), type: hs["content-type"], origin: hs.origin, site: hs["sec-fetch-site"] });
      return route.fulfill({ status: inboxRead, body: "" });
    }
    if (portal && url.pathname === "/today.json") {
      answers.gets++;
      const t = typeof answers.today === "function" ? answers.today() : answers.today;
      return typeof t === "number" ? route.fulfill({ status: t, body: "" }) : route.fulfill({ contentType: "application/json", body: typeof t === "string" ? t : JSON.stringify(t) });
    }
    if (portal && url.pathname === "/today/act") {
      const rq = route.request();
      const body = rq.postData();
      actPosts.push({ method: rq.method(), body, type: rq.headers()["content-type"] });
      let a = answers.act;
      if (typeof a === "function") a = a(JSON.parse(body || "{}"));
      if (a === "hang") return new Promise(() => {});
      if (a === "abort") return route.abort("connectionreset");
      if (typeof a === "number") return route.fulfill({ status: a, body: "" });
      return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body) });
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
  return { context, seen, posts, answers, reads, actPosts };
}

async function openPortal(context, path = "/") {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PORTAL + path);
  await page.waitForSelector("#shell-bar .shbar-appsbtn");
  if (path === "/") await page.waitForFunction(() => document.querySelector("#app-grid .approw, #more-list li") || !document.getElementById("no-group").hidden);
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
    const main = (await names(page, "#app-grid .approw")).join(",");
    const more = (await names(page, "#more-list li")).join(",");
    const notice = await page.isVisible("#no-group");
    check(`${label}: home tiles [${wantMain}] then More [${wantMore}]`, main === wantMain && more === wantMore, { main, more });
    check(`${label}: "waiting for an admin" notice ${wantMain || wantMore ? "hidden" : "shown"}`, notice === !(wantMain || wantMore));
    check(`${label}: More section ${wantMore ? "shown" : "hidden"} on the home page`, (await page.isVisible("#more-apps")) === !!wantMore);
    await page.click("#shell-bar .shbar-appsbtn");
    // Kit 0.5.0 (ADOPT_050 §6): the Apps menu's first tile is Home (the portal itself); the rest are the apps.
    const menuAll = await names(page, "#shell-bar .shbar-apps ul.shbar-grid > li");
    check(`${label}: the Apps menu starts with Home`, menuAll[0] === "Home", menuAll);
    const menuMain = menuAll.slice(1).join(",");
    // the Apps menu has no coming-soon order rule of its own; compare as sets
    const set = (s) => s.split(",").filter(Boolean).sort().join(",");
    check(`${label}: the Apps menu lists the same tiles (main and More)`, set(menuMain) === set([wantMain, wantMore].filter(Boolean).join(",")), { menuMain });
    // Kit 0.2.3: core tiles in the first list, the home page's More tiles behind the menu's More button (closed on
    // open). With no core tile, the "more" tiles are the first list and there is no More row.
    const menuCore = (await names(page, "#shell-bar .shbar-apps ul.shbar-grid:not(.shbar-more > ul) > li")).filter((n, i) => !(i === 0 && n === "Home")).join(",");
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

    // Kit 0.5.0: Home (this page) and Tools (one link to the Tools page) open in the same tab; every app opens a new one.
    const links = await page.$$eval("#app-grid a, #more-list a, #shell-bar .shbar-apps a", (as) => as.filter((a) => a.href !== "http://portal.landing.test/" && !a.classList.contains("shbar-toolslink")).map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    const bad = links.filter((l) => l.target !== "_blank" || !l.rel.split(/\s+/).includes("noopener"));
    check(`every app link opens a new tab with rel=noopener (${links.length} links)`, links.length >= 10 && bad.length === 0, bad);
    const hrefs = await page.$$eval("#app-grid a", (as) => as.map((a) => a.getAttribute("href")));
    check("host tiles and path tiles are built from the site domain", hrefs.includes("http://tasks.landing.test/") && hrefs.includes("http://landing.test/resources.html"), hrefs);
    check("coming-soon tiles are not links", (await page.$$eval("#app-grid .coming-soon", (els) => els.map((e) => e.tagName + e.getAttribute("aria-disabled")))).join() === "DIVtrue");

    await page.click("#shell-bar .shbar-acct");
    const menu = page.locator("#shell-bar .shbar-account");
    const rows = await menu.locator(':scope > [role="group"], :scope > a').evaluateAll(els => els.map(e => e.getAttribute("aria-label") || e.textContent.trim()));
    // Kit 0.5.0 (ADOPT_050 §6): the group is "Appearance", in the order Light, Dark, Match my device.
    check("account menu rows are in order", JSON.stringify(rows) === JSON.stringify(["Appearance", "Notification settings", "All account settings", "Sign out"]), rows);
    const choices = await menu.locator('[aria-label="Appearance"] button').allTextContents();
    check("appearance choices are in order", JSON.stringify(choices.map(x => x.trim())) === JSON.stringify(["Light", "Dark", "Match my device"]), choices);
    check("sign-out goes to the portal outpost", (await menu.locator("a[data-signout]").getAttribute("href")) === `${PORTAL}/outpost.goauthentik.io/sign_out`);
    await page.keyboard.press("Escape");
    check("the request-access cards are shown", await page.isVisible("#access") && (await page.$$("#access-body a[href^='mailto:']")).length >= 1);
    check("the account button shows initials", (await page.textContent("#shell-bar .shbar-acct")).includes("PE"));

    await page.press("#q", "Escape").catch(() => {});
    await page.fill("#q", "alumni");
    check("the bar says Home on the portal (kit 0.5.0, as the demo's)", (await page.textContent("#shell-bar .shbar-appname")).trim() === "Home");
    check("the greeting is the first name", (await page.textContent("#greeting")).replace(/\s+/g, " ").trim() === "Hi Pat.");
    check("search filters across both sections", (await names(page, "#app-grid .approw:not([hidden]), #more-list li:not([hidden])")).join() === "Alumni News");
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
    check("build mode (no cookie): main tiles and More", (await names(page, "#app-grid .approw")).join() === "Task App,Parts" && (await names(page, "#more-list li")).join() === "Skills,Team Handbook");
    const extTile = page.locator("#more-list a").filter({ hasText: "Team Handbook" });
    check("a same-site path with ext: true renders under More with the link-out arrow and opens in a new tab", (await extTile.count()) === 1 && ((await extTile.locator("span.ext").textContent()) || "").includes("↗") && (await extTile.getAttribute("target")) === "_blank");
    check("build mode: the bar does not show the competition chip", !(await page.isVisible("#shell-bar .shbar-chip")));
    await context.addCookies([site("mode", "competition")]);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("competition cookie, tab comes back: the grid follows without a reload", (await names(page, "#app-grid .approw")).join() === "Task App,Pit Checklist");
    check("...and the bar shows Competition mode", await page.isVisible("#shell-bar .shbar-chip") && (await page.textContent("#shell-bar .shbar-chip")).includes("Competition mode"));
    await page.close();
    ({ page } = await openPortal(context));
    check("competition cookie on load", (await names(page, "#app-grid .approw")).join() === "Task App,Pit Checklist" && (await names(page, "#more-list li")).join() === "Skills,Team Handbook");
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
    // Kit 0.4.0 (splitGroups, as the bar's Apps menu): with no core app, the "more" apps are Home's own tiles, no More row.
    check("only More: those apps are Home's tiles and there is no More row", (await page.isVisible("#app-grid")) && (await names(page, "#app-grid .approw")).join() === "Skills,Team Handbook" && !(await page.$("#more-apps")));
    check("only More: the search field stays visible", await page.isVisible("#q") && await page.isVisible("#search-wrap") && await page.isVisible("#apps-head"));
    await page.keyboard.press("/");
    check("only More: / focuses the search field", await page.evaluate(() => document.activeElement === document.getElementById("q")));
    await page.fill("#q", "hand");
    check("only More: search filters those tiles", (await names(page, "#app-grid .approw:not([hidden])")).join() === "Team Handbook");
    await page.keyboard.press("Escape");
    check("only More: Escape clears the search and leaves the field", (await page.inputValue("#q")) === "" && (await names(page, "#app-grid .approw:not([hidden])")).join() === "Skills,Team Handbook" && await page.evaluate(() => document.activeElement !== document.getElementById("q")));
    await context.close();
  }

  // ---------- theme (the cases from the Sol review of 0b0f687) ----------
  {
    const { context } = await newContext(browser, { groups: "mentor" });
    await context.addCookies([site("theme", "dark")]);
    await context.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("theme", "light"); sessionStorage.setItem("seeded", "1"); } } catch (e) {} });
    let { page } = await openPortal(context);
    const state = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, label: document.querySelector("#shell-bar [aria-label=Appearance] button[aria-pressed=true]")?.textContent.trim(),
      bg: getComputedStyle(document.body).backgroundColor, cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null }));
    let s = await state();
    check("cookie dark + old key light: page and bar both dark", s.theme === "dark" && s.label === "Dark" && s.bg === "rgb(0, 0, 0)", s);
    await page.click("#shell-bar .shbar-acct");
    await page.click('#shell-bar [aria-label="Appearance"] .shbar-choice >> text=Light');
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
    const cols = await page.$$eval("#app-grid .approw", (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
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
    await page.waitForSelector(".hdr");
    check(`320px ${theme}: public home has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    const toggle = await page.$eval(".menu-btn", (b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.right)]; });
    check(`320px ${theme}: the menu button is at least 44px and sits on screen`, toggle[0] >= 44 && toggle[1] >= 44 && toggle[2] <= 320, toggle);
    check(`320px ${theme}: the public home stays white (design 8.2, light only), whatever the saved theme`, (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(255, 255, 255)");
    // Release 8.3 (design 8.2): on a phone Home shows the number, clear of the Menu button; the full name shows from 900px.
    const num = await page.$eval(".brand-n", (e) => Math.round(e.getBoundingClientRect().right)).catch(() => null);
    check(`320px ${theme}: public home shows the team number, clear of the Menu button (the full name is for wider screens)`, (await page.isVisible(".brand-n")) && !(await page.isVisible(".brand-t")) && num !== null && num <= toggle[2] - toggle[0], { num, toggle });
    await page.goto(PUBLIC + "/about.html");
    await page.waitForSelector(".hdr");
    // Release 8.1.5 (C8): other pages read "2972 Team" on one line instead of the number alone.
    check(`320px ${theme}: other public pages: the header reads "2972 Team" and not the full team name`, (await page.isVisible(".brand-one")) && !(await page.$(".brand-t")) && ((await page.textContent(".brand-one")) || "").replace(/\s+/g, " ").trim() === "2972 Team");
    await context.close();
  }

  // ---------- the Home: release 8.1.5's data (C4, C12, C13, C14) drawn as release 8.3's Ground up (D182) ----------
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const CAL = "http://calendar.landing.test", PARTS = "http://parts.landing.test", TASKS = "http://tasks.landing.test";
  // The 8.1.5 shape (no 8.3 part): an older Account must still give a Home that looks right.
  const TODAY = {
    student: { v: 1,
      today: [{ id: "calendar:practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", detail: "You are not signed in", href: `${CAL}/here?tab=today`, cta: { label: "Sign in", href: `${CAL}/here/scan` } }],
      waiting: [],
      next: { taskId: "t-41", title: "Wire the intake sensor", due: "2026-11-18", project: "Intake", href: `${TASKS}/my?task=t-41` },
      activity: [{ app: "Parts", title: "Your part request was ordered", detail: "Hex shaft, 1/2 in.", href: `${PARTS}/requests/7`, at: ago(5) },
        { app: "Skills", title: "A mentor signed off Drill press", href: "http://skills.landing.test/", at: ago(180) }] },
    mentor: { v: 1,
      today: [{ id: "calendar:practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", detail: "12 people are signed in", href: `${CAL}/here?tab=today` }],
      waiting: [{ id: "parts:parts-needsok", section: "waiting", title: "2 part requests need an OK", detail: "", href: `${PARTS}/?tab=toorder`, count: 2 },
        { id: "skills:skills-signoff", section: "waiting", title: "3 sign-off requests", detail: "Lathe, Mill, Band saw", href: "http://skills.landing.test/?tab=signoff", count: 3 },
        { id: "calendar:my-days", section: "waiting", title: "Tell us if you're coming this week", detail: "", href: `${CAL}/here?tab=mentors`, count: 1 }],
      next: null,
      activity: [{ title: "Sam Example asked for a sign-off", detail: "Lathe", href: "http://skills.landing.test/?tab=signoff", at: ago(20) }] },
    parent: { v: 1,
      today: [{ id: "calendar:practice", section: "today", title: "Next practice: Tue, Nov 17", detail: "3:30 to 6:00 pm", href: `${CAL}/?tab=agenda` },
        { id: "calendar:event", section: "today", title: "Next event: Fall open house", detail: "Sat, Nov 21", href: `${CAL}/?tab=agenda` },
        { id: "calendar:snacks:2026-11-19", section: "today", title: "Thu, Nov 19 needs snacks", detail: "2 families needed", href: `${CAL}/snacks`, cta: { label: "Sign up", href: `${CAL}/snacks?day=2026-11-19` } }],
      waiting: [], next: null,
      activity: [{ title: "Parents never see this", href: `${CAL}/`, at: ago(3) }] },
    admin: { v: 1,
      today: [{ id: "calendar:practice", section: "today", title: "Practice today, 3:30 to 6:00 pm", detail: "12 people are signed in", href: `${CAL}/here?tab=today` }],
      waiting: [{ id: "admin:requests", section: "waiting", title: "2 account requests", detail: "", href: "http://admin.landing.test/requests", count: 2 },
        { id: "calendar:mentors-silent", section: "waiting", title: "2 mentors haven't answered for this week", detail: "Mentor A, Mentor B", href: `${CAL}/here?tab=mentors`, count: 2 },
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
  const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }); };
  const over = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const settle = async (page) => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(150); };
  // What the Home drew: the top part, the sections of each column, the rows, the filled buttons, every link.
  const homeState = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length && !e.closest("[hidden]");
    const ids = (sel) => [...document.querySelectorAll(sel)].filter((s) => s.id && vis(s)).map((s) => s.id);
    const text = (e) => (e ? e.textContent.replace(" (opens in a new tab)", "").replace(/\s+/g, " ").trim() : null);
    const rows = (id) => [...document.querySelectorAll(`#${id} .nowrow`)].filter(vis).map((r) => ({ id: r.dataset.id, title: text(r.querySelector(".rt")),
      lines: [...r.querySelectorAll(".rl")].map(text), btns: [...r.querySelectorAll(".nowbtn")].map((b) => [text(b), b.tagName, b.classList.contains("shell-btn--primary") ? "filled" : "plain", b.getAttribute("href")]),
      mark: text(r.querySelector(".rmark")), first: r.classList.contains("nowfirst"), chev: !!r.querySelector(".chev") }));
    // Kit 0.5.0: the filled button is .shell-btn--primary; the old .btn (gold, now blue) counts too unless it is plain.
    const filled = [...document.querySelectorAll("#main .shell-btn--primary, #main .btn:not(.btn-outline):not(.btn-ghost)")].filter((b) => vis(b) && !b.closest("[data-guide-card]")).map(text);
    return {
      top: document.querySelector("#home-top > *")?.className || null, topText: (document.querySelector("#home-top > *")?.innerText || "").replace(/\s+/g, " ").trim(),
      main: ids("#home-main > *:not([data-guide-card])"), side: ids("#home-side-lead > *, #home-side > section, #home-side > .guideslot > section"),
      groups: [...document.querySelectorAll("#home-now .nowgroup")].map(text),
      now: rows("home-now"), others: rows("home-others"), help: rows("home-help"),
      week: [...document.querySelectorAll("#home-week .wkrow")].map((a) => [text(a.querySelector(".wkd b")), text(a.querySelector(".grow > b")), [...a.querySelectorAll(".wkfacts > *")].map(text)]),
      coming: [...document.querySelectorAll("#home-coming .wkrow .grow > b")].map(text),
      next: text(document.querySelector("#home-next .nexttitle")), nextDue: text(document.querySelector("#home-next .nextdue")), nextStep: text(document.querySelector("#home-next .nextstep")),
      nextActs: [...document.querySelectorAll("#home-next .heroacts > *")].map((e) => [text(e), e.classList.contains("shell-btn--primary") ? "filled" : "plain"]),
      activity: [...document.querySelectorAll("#home-activity .actlink b")].map(text),
      filled, waitGuide: document.querySelector("#home-now")?.dataset.guide || null, guideHidden: document.querySelector("[data-guide-card]").hidden,
      undef: /undefined|null|NaN/.test(document.getElementById("main").innerText),
      emptyHeads: [...document.querySelectorAll("#main h2, #main h3")].filter((h) => vis(h) && !h.closest("[data-guide-card]") && !h.nextElementSibling).map(text),
      links: [...document.querySelectorAll("#home-top a, #home-main a, #home-side-lead a")].filter((a) => !a.closest("#apps, [data-guide-card]")).map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
    };
  });
  const F = await import(new URL("./fixtures/today-83.mjs", import.meta.url));
  const T0 = new Date();
  const today83 = { student: F.studentToday(T0), mentor: F.mentorToday(T0), admin: F.mentorToday(T0), parent: F.parentToday(T0) };
  const season = today83.student.season.days.filter((d) => d.date >= F.dayFrom(T0, 0)).length;
  const WANT = {
    student: { main: ["home-now", "home-next", "home-others", "home-activity"], side: ["home-week", "apps"], top: "season", filled: ["Sign in"] },
    mentor: { main: ["home-now", "home-activity"], side: ["home-week", "apps"], top: "season", filled: ["Approve"] },
    admin: { main: ["home-now", "home-activity"], side: ["home-week", "apps"], top: "season", filled: ["Approve"] },
    parent: { main: ["home-week", "home-coming"], side: ["home-help", "apps"], top: "season simple", filled: ["Sign up"] },
  };
  for (const role of ["student", "mentor", "admin", "parent"]) {
    for (const width of [1280, 390]) {
      for (const theme of width === 1280 ? ["light", "dark"] : ["light"]) {
        const { context } = await newContext(browser, { groups: role === "admin" ? "admin|mentor" : role, apps: GROUPED_APPS, today: today83[role], width });
        await context.addCookies([site("theme", theme)]);
        const { page, errors } = await openPortal(context);
        await settle(page);
        const h = await homeState(page);
        const w = WANT[role];
        const tag = `8.3 ${role} ${width}px ${theme}`;
        // From 900 px two columns; below, one column that holds every section in reading order (review item 7).
        const phoneMain = { student: ["home-now", "home-next", "home-others", "home-week", "apps", "home-activity"], mentor: ["home-now", "home-week", "apps", "home-activity"],
          admin: ["home-now", "home-week", "apps", "home-activity"], parent: ["home-week", "home-help", "home-coming", "apps"] }[role];
        check(width === 390 ? `${tag}: the top line, then one column: ${phoneMain.join(", ")}` : `${tag}: the top line, then main ${w.main.join(", ")} and side ${w.side.join(", ")}`,
          h.top === w.top && (width === 390 ? JSON.stringify(h.main) === JSON.stringify(phoneMain) && h.side.length === 0 : JSON.stringify(h.main) === JSON.stringify(w.main) && JSON.stringify(h.side.slice(0, 2)) === JSON.stringify(w.side)), h);
        check(`${tag}: one filled button on the page (${w.filled[0]})`, JSON.stringify(h.filled) === JSON.stringify(w.filled), h.filled);
        check(`${tag}: no sideways scroll, no script error, no "undefined", no empty heading`, (await over(page)) <= 0 && errors.length === 0 && !h.undef && h.emptyHeads.length === 0, { over: await over(page), errors, undef: h.undef, empty: h.emptyHeads });
        const bad = h.links.filter((l) => !/\.landing\.test$/.test(new URL(l.href).host) || (new URL(l.href).host !== "portal.landing.test" && (l.target !== "_blank" || !l.rel.includes("noopener"))));
        check(`${tag}: every link goes into an app on this site, in a new tab`, h.links.length > 0 && bad.length === 0, bad);
        if (width === 390) {
          const small = await page.$$eval("#home-top a, #home-main a, #home-main button, #home-side a, #home-side button", (els) => els.filter((e) => e.getClientRects().length && !e.closest("[hidden]") && !e.closest(".grpbody") && !e.closest("[data-guide-card]"))
            .map((e) => [e.textContent.trim().slice(0, 24), Math.round(e.getBoundingClientRect().height)]).filter(([, hh]) => hh < 44));
          check(`${tag}: every control is at least 44px tall`, small.length === 0, small);
          // On a phone one column, in the order a person needs it.
          const order = await page.evaluate(() => [...document.querySelectorAll("#home-main > *:not([data-guide-card]), #home-side-lead > *, #apps")].filter((e) => e.getClientRects().length).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((e) => e.id));
          const wantOrder = role === "parent" ? ["home-week", "home-help", "home-coming", "apps"] : role === "student" ? ["home-now", "home-next", "home-others", "home-week", "apps", "home-activity"] : ["home-now", "home-week", "apps", "home-activity"];
          check(`${tag}: one column in the order ${wantOrder.join(", ")}`, JSON.stringify(order) === JSON.stringify(wantOrder), order);
          // Review item 7: the document order is the order on screen (no CSS reordering), so the keyboard follows it.
          const domOrder = await page.evaluate(() => [...document.querySelectorAll("#home-main > *:not([data-guide-card]), #home-side-lead > *, #apps")].filter((e) => e.getClientRects().length).map((e) => e.id));
          check(`${tag}: the document order is the order on screen`, JSON.stringify(domOrder) === JSON.stringify(order), { domOrder, order });
        }
        if (role === "student" && theme === "light") {
          check(`${tag}: the season line counts ${season} practices to kickoff with three milestones`, h.topText.startsWith(`${season} practices to kickoff`) && (await page.$$("#home-top .snms")).length === 3 && (width === 390 || (await page.$$("#home-top .pm")).length === season), h.topText);
          const p = h.now[0];
          check(`${tag}: Now leads with "Practice today", its time, "Not signed in" and the Sign in link (filled), in a block`, p.id === "calendar:practice" && p.title === "Practice today" && p.lines.join("|") === "3:30 pm–6 pm|Not signed in" && p.first
            && JSON.stringify(p.btns) === JSON.stringify([["Sign in", "A", "filled", "http://calendar.landing.test/here/scan"]]), p);
          const left = today83.student.next.practicesLeft;
          check(`${tag}: the next task: the title is the link, "Due …, ${left} practices left" from Tasks, the next step, Mark step done, its buttons plain while Sign in is waiting`, h.next === "Cut polycarb side plates›" && new RegExp(`^Due \\w{3}, \\w{3} \\d+, ${left} practices? left$`).test(h.nextDue) && h.nextStep === "Next step: Cut on the router"
            && JSON.stringify(h.nextActs) === JSON.stringify([["Mark step done", "plain"], ["I'm stuck", "plain"], ["Request a part", "plain"]]), h);
          check(`${tag}: Waiting on others: the part with its state as a dot and a word on its own line, then whose move; the sign-off with who it waits on`, h.others.length === 2 && h.others[0].title === "Bearing 1/2\" hex, flanged" && h.others[0].mark === "Ordered"
            && h.others[0].lines.join() === `Arrives about ${F.niceFrom(T0, 1)}` && h.others[1].lines.join() === `Waiting on a mentor since ${F.niceFrom(T0, -1)}` && h.others[1].mark === null
            && (await page.$eval("#home-others .shell-status", (m) => m.classList.contains("shell-status--ok") && getComputedStyle(m, "::before").content !== "none")), h.others);
          check(`${tag}: Recent activity shows three`, h.activity.length === 3, h.activity);
          check(`${tag}: This week: Today first, mentors coming, snacks, and what is due`, h.week[0][0] === "Today" && h.week[0][2].includes("2 mentors coming") && h.week[0][2].includes("Snacks: Test family and Sample family") && h.week.some((d) => d[2].some((f) => /^Due: /.test(f))) && h.week.some((d) => d[2].includes("No mentors yet")), h.week);
        }
        if (role === "mentor" && theme === "light") {
          check(`${tag}: Now in groups: Needs your OK, Sign-off requests, Stuck, then the doors as "Parts and practice" (the demo's words)`, h.groups.join("|") === "Needs your OK|Sign-off requests|Stuck|Parts and practice" && h.waitGuide === "wait", h.groups);
          const ok = h.now[0];
          check(`${tag}: a request with its mark, two lines, Approve (filled: blocking) and Deny`, ok.title === "Motor, brushless Blocking" && ok.lines.length === 2 && JSON.stringify(ok.btns.map((b) => [b[0], b[2]])) === JSON.stringify([["Approve", "filled"], ["Deny", "plain"]]), ok);
          check(`${tag}: each sign-off has Sign off; the stuck task and the doors have a chevron; the practice row comes last`, h.now.filter((r) => r.btns.some((b) => b[0] === "Sign off")).length === 2 && h.now.filter((r) => r.chev).length === 3 && h.now.at(-1).id === "calendar:practice", h.now);
          // Stuck (CONTRACT T): drawn as the demo's mentor Home draws a stuck task: the title, "Blocked" as a dot and a
          // word on a line of its own, who and the project, what it waits on; a chevron, no button.
          const stuck = h.now.find((r) => r.id === "tasks:stuck-t-9");
          check(`${tag}: a stuck task: title, Blocked (a dot and a word) on its own line, who and project, Waits on; a chevron, no button`, stuck && stuck.title === "Intake roller shafts" && stuck.mark === "Blocked"
            && stuck.lines.join("|") === "Casey Fake, Intake|Waits on “Mount the motor” and the part Hex shaft, 8 in" && stuck.chev && stuck.btns.length === 0
            && (await page.$eval('#home-now [data-id="tasks:stuck-t-9"]', (r) => { const m = r.querySelector(".rmark"), t = r.querySelector(".rt"), l = r.querySelector(".rl");
              return m.classList.contains("shell-status--bad") && m.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1 && l.getBoundingClientRect().top >= m.getBoundingClientRect().bottom - 1; })), stuck);
          check(`${tag}: Account's lines replace its detail: no line is drawn twice`, h.now.every((r) => new Set(r.lines).size === r.lines.length), h.now.map((r) => r.lines));
          check(`${tag}: no next-task card, no Waiting on others`, h.next === null && h.others.length === 0);
        }
        if (role === "parent" && theme === "light") {
          check(`${tag}: the parent's line leads with today's practice and the place, then the days and practices to kickoff`, /^Practice today, 3:30 pm–6 pm, Team shop 60 days, \d+ practices to kickoff/.test(h.topText), h.topText);
          check(`${tag}: This week names the place, no mentor counts; Coming up lists the events`, h.week.every((d) => d[2][0] === "Team shop" && !d[2].some((f) => /mentor/.test(f))) && h.coming.length === 3, { week: h.week, coming: h.coming });
          check(`${tag}: Can you help?: the snack day (Sign up, filled) and the volunteer event (Sign up, plain); no activity`, h.help.length === 2 && JSON.stringify(h.help.map((r) => r.btns.map((b) => [b[0], b[2]]))) === JSON.stringify([[["Sign up", "filled"]], [["Sign up", "plain"]]]) && h.activity.length === 0, h.help);
        }
        await shot(page, `home83-${role}-${width}-${theme}`, true);
        await context.close();
      }
    }
  }

  // The 8.1.5 answer (no 8.3 part) still gives a Home that looks right: Now from the rows, no season line, no week.
  for (const role of ["student", "mentor", "parent", "admin"]) {
    const { context } = await newContext(browser, { groups: role, apps: GROUPED_APPS, today: TODAY[role] });
    const { page, errors } = await openPortal(context);
    await settle(page);
    const h = await homeState(page);
    check(`8.1.5 answer, ${role}: no season line, no This week, no "undefined", no empty heading, no error`, h.top === null && !h.main.includes("home-week") && !h.side.includes("home-week") && !h.undef && h.emptyHeads.length === 0 && errors.length === 0, { h, errors });
    if (role === "student") check("8.1.5 answer, student: Now has the practice with Sign in; the next task without a practice count; Mark task done is plain beside Sign in",
      h.now[0].btns[0][0] === "Sign in" && h.filled.join() === "Sign in" && /^Due Wed, Nov 18$/.test(h.nextDue) && h.nextActs[0][1] === "plain", h);
    if (role === "mentor") check("8.1.5 answer, mentor: the count rows are rows with chevrons, no count chips; the practice row last", h.now.map((r) => r.id).join() === "parts:parts-needsok,skills:skills-signoff,calendar:my-days,calendar:practice" && !(await page.$("#home-now .tcount")) && h.now.every((r) => r.chev), h.now);
    if (role === "parent") check("8.1.5 answer, parent: the next practice and event as rows, the snack day under Can you help? with its Sign up link", h.now.map((r) => r.id).join() === "calendar:practice,calendar:event" && h.help.length === 1 && h.help[0].btns[0][1] === "A" && h.activity.length === 0, h);
    if (role === "admin") check("8.1.5 answer, admin: the off-site row is dropped", h.now.map((r) => r.title).join("|") === "2 account requests|2 mentors haven't answered for this week|Practice today", h.now);
    await context.close();
  }
  // Each 8.3 part on its own: a page with only one of them still looks right.
  for (const part of ["season", "week", "milestones", "coming", "others"]) {
    const full = F.studentToday(T0);
    const today = { v: 1, today: full.today, waiting: [], next: full.next, activity: [], [part]: full[part] || F.parentToday(T0)[part] };
    const { context } = await newContext(browser, { groups: part === "coming" ? "parent" : "student", apps: GROUPED_APPS, today });
    const { page, errors } = await openPortal(context);
    await settle(page);
    const h = await homeState(page);
    check(`only "${part}": no "undefined", no empty heading, no error`, !h.undef && h.emptyHeads.length === 0 && errors.length === 0, { h, errors });
    await context.close();
  }

  // ---------- the buttons on the rows act at once (D187, CONTRACT H2) ----------
  {
    // Approve: the row goes at once, one POST for two presses, then /today.json is asked again.
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor, act: "hang" });
    const { page, errors } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="parts:request:12"]');
    await page.$eval('#home-now [data-id="parts:request:12"] .nowbtn', (b) => { b.click(); b.click(); });
    await page.waitForTimeout(200);
    const gone = await page.$eval('#home-now [data-id="parts:request:12"]', (r) => r.hidden);
    check("Approve: the row goes at once, before the answer", gone);
    check("Approve: two presses send one POST of {app, action, key} as JSON to /today/act", actPosts.length === 1 && actPosts[0].method === "POST" && actPosts[0].body === JSON.stringify({ app: "parts", action: "approve", key: "12" }) && /application\/json/.test(actPosts[0].type), actPosts);
    // Review item 1: while the answer is on its way the words are a pending state, never the result.
    check("Approve: the status line says \"Approving…\" at once, never \"Approved.\" before the answer", (await page.textContent("#home-done-status")) === "Approving…");
    check("Approve: focus moves on down the list", await page.evaluate(() => !!document.activeElement.closest("#home-now")));
    check("Approve: no script error", errors.length === 0, errors);
    await context.close();
  }
  // An uncertain answer (a 5xx, an unknown code, a network failure): the row comes back with "That may not have gone
  // through. Checking.", /today.json is read once, and then the row still there says "That didn't go through. Try again."
  for (const [status, words, refresh] of [[204, null, true], [409, "Someone else already signed this off.", true], [403, "You can't do this from Home. Open it to see why.", true],
    [404, "This isn't there any more.", true], [503, "That didn't go through. Try again.", true], [500, "That didn't go through. Try again.", true], [400, "That didn't go through. Try again.", true],
    ["abort", "That didn't go through. Try again.", true]]) {
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor, act: status });
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="skills:signoff:u-3:omio"]');
    const gets0 = answers.gets;
    await page.click('#home-now [data-id="skills:signoff:u-3:omio"] .nowbtn');
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => { const r = document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"]'); return { there: !!r && !r.hidden, msg: r?.querySelector(".nowmsg")?.textContent || null, status: document.getElementById("home-done-status").textContent }; });
    check(`Sign off answered ${status}: ${words ? `the row comes back and says "${words}"` : "the row stays gone"}${refresh ? ", /today.json is asked again" : ""}`,
      actPosts[0]?.body === JSON.stringify({ app: "skills", action: "signoff", key: "u-3:omio" }) && (words ? s.there && s.msg === words && s.status === words : s.status === "Signed off.") && (answers.gets > gets0) === refresh, { s, gets: answers.gets - gets0 });
    if (status === 409) await shot(page, "act-409-1280");
    await context.close();
  }
  {
    // Uncertain, and it was saved: the first sentence says so at once; the one look at /today.json finds the row gone.
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, act: "hang" });
    let release;
    answers.today = () => (actPosts.length ? { ...today83.mentor, waiting: today83.mentor.waiting.filter((r) => r.id !== "skills:signoff:u-3:omio") } : today83.mentor);
    await context.route("**/today/act", async (route) => { actPosts.push({ body: route.request().postData() }); await new Promise((r) => { release = r; }); return route.fulfill({ status: 502, body: "" }); });
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="skills:signoff:u-3:omio"]');
    await page.click('#home-now [data-id="skills:signoff:u-3:omio"] .nowbtn');
    await page.waitForTimeout(100);
    // Hold /today.json's answer back for a moment to see the first sentence on the row.
    let hold;
    await context.route("**/today.json", async (route) => { await new Promise((r) => { hold = r; }); return route.fulfill({ contentType: "application/json", body: JSON.stringify(answers.today()) }); });
    release();
    await page.waitForFunction(() => document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"] .nowmsg'));
    const first = await page.evaluate(() => ({ row: document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"]').hidden, msg: document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"] .nowmsg').textContent, status: document.getElementById("home-done-status").textContent }));
    check("Sign off answered 502: the row comes back with \"That may not have gone through. Checking.\"", !first.row && first.msg === "That may not have gone through. Checking." && first.status === first.msg, first);
    while (!hold) await page.waitForTimeout(20);
    hold();
    await page.waitForFunction(() => !document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"]'));
    check("...and when the one look at /today.json finds it gone (it was saved), the row goes and the status says \"Signed off.\"", (await page.textContent("#home-done-status")) === "Signed off.");
    await context.close();
  }
  {
    // Deny asks why in a small dialog with Parts' own words; Keep it sends nothing; Deny sends the reason. After the
    // act Account answers without the row, as it will.
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS });
    answers.today = () => (actPosts.length ? { ...today83.mentor, waiting: today83.mentor.waiting.filter((r) => r.id !== "parts:request:12") } : today83.mentor);
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="parts:request:12"]');
    await page.click('#home-now [data-id="parts:request:12"] .nowdeny');
    await page.waitForSelector("dialog.gdialog[open]");
    const d = await page.evaluate(() => ({ h: document.querySelector("dialog h2").textContent, why: document.querySelector("dialog textarea").value, focus: document.activeElement.id }));
    check("Deny opens a dialog: \"Deny this request?\" with Parts' default reason, the reason box focused", d.h === "Deny this request?" && d.why === "Let's use the ones in stock first." && d.focus === "deny-why", d);
    await shot(page, "act-deny-dialog-1280");
    await page.click("dialog .gbtns .shell-btn:not(.shell-btn--danger)");
    check("Keep it: nothing is sent and the row stays", actPosts.length === 0 && await page.isVisible('#home-now [data-id="parts:request:12"]'));
    await page.click('#home-now [data-id="parts:request:12"] .nowdeny');
    await page.fill("dialog textarea", "  ");
    await page.click("dialog .gbtns .shell-btn--danger");
    check("an empty reason is refused in the dialog", actPosts.length === 0 && (await page.textContent("dialog .gerr")) === "Say why, so they know.");
    await page.fill("dialog textarea", "We have two in the cabinet.");
    await page.click("dialog .gbtns .shell-btn--danger");
    await page.waitForTimeout(300);
    check("Deny sends the reason; the row goes", actPosts.length === 1 && actPosts[0].body === JSON.stringify({ app: "parts", action: "deny", key: "12", reason: "We have two in the cabinet." }) && !(await page.isVisible('#home-now [data-id="parts:request:12"]')), actPosts);
    await context.close();
  }
  {
    // P4: Undo is offered only when Parts answered {undoUntil, approval}; it sends "unapprove" with that approval.
    const until = new Date(Date.now() + 120000).toISOString();
    const { context, actPosts } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor, act: (b) => (b.action === "approve" ? { status: 200, body: { undoUntil: until, approval: 1234 } } : 204) });
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="parts:request:12"]');
    await page.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await page.waitForSelector("#home-undo .undobtn");
    await shot(page, "act-undo-1280");
    await page.click("#home-undo .undobtn");
    await page.waitForFunction(() => /Put back/.test(document.getElementById("home-done-status").textContent));
    // P4: Parts' approval is a JSON number; it goes back as the same number, never a string.
    check("Approve answered {undoUntil, approval: 1234}: Undo is offered and sends {app, action: \"unapprove\", key, approval: 1234} (a number)", actPosts.length === 2 && actPosts[1].body === JSON.stringify({ app: "parts", action: "unapprove", key: "12", approval: 1234 }) && JSON.parse(actPosts[1].body).approval === 1234, actPosts);
    await context.close();
    // Undo refused with 409: the request changed since; it stays approved (the row stays gone) and the page says so.
    const c409 = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, act: (b) => (b.action === "approve" ? { status: 200, body: { undoUntil: until, approval: 1234 } } : { status: 409, body: { error: "changed" } }) });
    c409.answers.today = () => (c409.actPosts.length ? { ...today83.mentor, waiting: today83.mentor.waiting.filter((r) => r.id !== "parts:request:12") } : today83.mentor);
    const p409 = (await openPortal(c409.context)).page;
    await p409.waitForSelector('#home-now [data-id="parts:request:12"]');
    await p409.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await p409.waitForSelector("#home-undo .undobtn");
    await p409.click("#home-undo .undobtn");
    await p409.waitForFunction(() => /stays approved/.test(document.getElementById("home-done-status").textContent));
    check("Undo answered 409: \"The request changed since you approved it, so it stays approved.\" and the request stays off Now", (await p409.textContent("#home-done-status")) === "The request changed since you approved it, so it stays approved."
      && !(await p409.isVisible('#home-now [data-id="parts:request:12"]')));
    await c409.context.close();
    // Undo answered 409 with Account's words for an expired window, and 403 (someone else made the approval).
    for (const [label, answer, words] of [["409 expired", { status: 409, body: { error: "changed", message: "The time to undo this has passed." } }, "The time to undo this has passed."],
      ["403", { status: 403, body: { error: "not_allowed" } }, "Someone else made this approval, so the request stays approved."]]) {
      const c = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor, act: (b) => (b.action === "approve" ? { status: 200, body: { undoUntil: until, approval: 1234 } } : answer) });
      const pc = (await openPortal(c.context)).page;
      await pc.waitForSelector('#home-now [data-id="parts:request:12"]');
      await pc.click('#home-now [data-id="parts:request:12"] .nowbtn');
      await pc.waitForSelector("#home-undo .undobtn");
      await pc.click("#home-undo .undobtn");
      const said = await pc.waitForFunction((w) => document.getElementById("home-done-status").textContent === w, words, { timeout: 5000 }).then(() => true, () => false);
      check(`Undo answered ${label}: "${words}", and the request stays off Now`, said && !(await pc.isVisible('#home-now [data-id="parts:request:12"]')), await pc.textContent("#home-done-status"));
      await c.context.close();
    }
    // An answer with the time but no approval (an older Parts): no Undo.
    const half = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor, act: { status: 200, body: { undoUntil: until } } });
    const ph = (await openPortal(half.context)).page;
    await ph.waitForSelector('#home-now [data-id="parts:request:12"]');
    await ph.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await ph.waitForTimeout(300);
    check("Approve answered {undoUntil} without approval: no Undo", !(await ph.$("#home-undo .undobtn")));
    await half.context.close();
    const plain = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor });
    const p2 = (await openPortal(plain.context)).page;
    await p2.waitForSelector('#home-now [data-id="parts:request:12"]');
    await p2.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await p2.waitForTimeout(300);
    check("Approve answered 204: no Undo", !(await p2.$("#home-undo .undobtn")));
    await plain.context.close();
  }
  // ---------- the independent review's fixes (items 1, 2, 3, 7, 8, 9) ----------
  const holdAct = async (context, actPosts, answerOf) => {
    // /today/act answers only when released; answerOf(body) gives the answer to fulfil with.
    const gates = [];
    await context.route("**/today/act", async (route) => {
      const body = route.request().postData();
      actPosts.push({ body });
      await new Promise((r) => gates.push(r));
      const a = answerOf(JSON.parse(body));
      return a === "abort" ? route.abort("connectionreset") : route.fulfill(a);
    });
    return { release: () => { while (gates.length) gates.shift()(); }, waiting: () => gates.length };
  };
  const status = (page) => page.textContent("#home-done-status");
  {
    // Item 1: a redirect or a sign-in page in place of the answer: signed out. The row comes back, no re-read.
    for (const [label, answer] of [["a redirect to sign-in", { status: 302, headers: { location: "/outpost.goauthentik.io/start" }, body: "" }],
      ["a 200 sign-in page", { status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Sign in</title>" }]]) {
      const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor });
      await context.route("**/today/act", (route) => { actPosts.push({ body: route.request().postData() }); return route.fulfill(answer); });
      const { page } = await openPortal(context);
      await page.waitForSelector('#home-now [data-id="skills:signoff:u-3:omio"]');
      const gets0 = answers.gets;
      await page.click('#home-now [data-id="skills:signoff:u-3:omio"] .nowbtn');
      await page.waitForFunction(() => /signed out/.test(document.getElementById("home-done-status").textContent));
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => { const x = document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"]'); return { there: !!x && !x.hidden, msg: x?.querySelector(".nowmsg")?.textContent }; });
      check(`Sign off answered with ${label}: the row is back, "You are signed out. Reload the page to sign in.", never "Signed off."; no re-read`,
        r.there && r.msg === "You are signed out. Reload the page to sign in." && (await status(page)) === r.msg && answers.gets === gets0, { r, gets: answers.gets - gets0 });
      await context.close();
    }
    const { context, posts } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student });
    await context.route("**/today/task-done", (route) => { posts.push(1); return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Sign in</title>" }); });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next .heroacts button");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => /signed out/.test(document.getElementById("home-done-status").textContent));
    const c = await page.evaluate(() => ({ title: document.querySelector("#home-next .nexttitle")?.textContent || "", body: !document.querySelector("#home-next .nextbody").hidden, btn: document.querySelector("#home-next .heroacts button")?.textContent.trim() }));
    check("Mark task done answered with a sign-in page: the card is back as it was and says you are signed out", c.body && c.btn === "Mark task done" && c.title.startsWith("Wire"), c);
    await context.close();
  }
  {
    // Item 2: after an uncertain answer, "done" only when the re-read proves it. Parts missing from the re-read (an app
    // down): not confirmed, the row back. The same key is locked while it is checked.
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS });
    const noParts = { ...today83.mentor, waiting: today83.mentor.waiting.filter((r) => !r.id.startsWith("parts:")) };
    let holdRead = null;
    answers.today = () => (actPosts.length ? noParts : today83.mentor);
    const gate = await holdAct(context, actPosts, () => ({ status: 503, body: "" }));
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="parts:request:12"]');
    await context.route("**/today.json", async (route) => { await new Promise((r) => { holdRead = r; }); return route.fulfill({ contentType: "application/json", body: JSON.stringify(answers.today()) }); });
    await page.click('#home-now [data-id="parts:request:12"] .nowbtn');
    while (!gate.waiting()) await page.waitForTimeout(20);
    gate.release();
    await page.waitForFunction(() => /Checking/.test(document.getElementById("home-done-status").textContent));
    while (!holdRead) await page.waitForTimeout(20);
    // During the check the row is back but its buttons do nothing: a press sends nothing.
    await page.$eval('#home-now [data-id="parts:request:12"] .nowbtn', (b) => b.click());
    await page.waitForTimeout(150);
    const lockedPosts = actPosts.length;
    holdRead();
    await page.waitForFunction(() => /couldn't confirm/.test(document.getElementById("home-done-status").textContent));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => { const x = document.querySelector('#home-now [data-id="parts:request:12"]'); return { there: !!x && !x.hidden, msg: x?.querySelector(".nowmsg")?.textContent || null }; });
    check("Approve answered 503, and Parts is missing from the re-read: not confirmed (\"We couldn't confirm that went through. Check in Parts.\"), never \"Approved.\"",
      (await status(page)) === "We couldn't confirm that went through. Check in Parts." && lockedPosts === 1, { status: await status(page), lockedPosts, r });
    await context.close();
  }
  {
    // Item 2: two uncertain writes that overlap share one re-read, and both are settled by it.
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor });
    const gate = await holdAct(context, actPosts, () => ({ status: 503, body: "" }));
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="skills:signoff:u-4:leads"]');
    const gets0 = answers.gets;
    await page.click('#home-now [data-id="skills:signoff:u-3:omio"] .nowbtn');
    await page.click('#home-now [data-id="skills:signoff:u-4:leads"] .nowbtn');
    while (gate.waiting() < 2) await page.waitForTimeout(20);
    gate.release();
    await page.waitForFunction(() => /didn't go through/.test(document.getElementById("home-done-status").textContent));
    await page.waitForTimeout(400);
    const msgs = await page.$$eval("#home-now .nowmsg", (ms) => ms.map((m) => m.textContent));
    check("two uncertain Sign offs at once: one shared re-read settles both (no \"Checking\" left)", answers.gets - gets0 <= 2 && msgs.length === 2 && msgs.every((m) => m === "That didn't go through. Try again."), { reads: answers.gets - gets0, msgs });
    await context.close();
  }
  {
    // Item 2: a row hidden by the mode is still in the answer: a snack day in Competition-only rows is not "signed up".
    const { context, actPosts, answers } = await newContext(browser, { groups: "parent", apps: GROUPED_APPS, act: 503 });
    const snack = today83.parent.today[0];
    answers.today = () => (actPosts.length ? { ...today83.parent, today: [{ ...snack, modes: ["competition"] }, ...today83.parent.today.slice(1)] } : today83.parent);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-help .nowbtn");
    await page.click("#home-help .nowbtn");
    await page.waitForFunction(() => !/Checking|Signing/.test(document.getElementById("home-done-status").textContent));
    check("Sign up answered 503, and the snack row is still in the answer (hidden by the mode): not taken as signed up", (await status(page)) === "That didn't go through. Try again.", await status(page));
    await context.close();
  }
  {
    // Item 2: a step is compared by its id, never its words: the same words with another id is the next step (done).
    const after = { ...today83.student, next: { ...today83.student.next, steps: { done: 2, total: 3 }, nextStep: { id: "s3", title: "Cut on the router" } } };
    const { context, actPosts, answers } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, act: 503 });
    answers.today = () => (actPosts.length ? after : today83.student);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next .nextstep");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => !/Checking|Marking/.test(document.getElementById("home-done-status").textContent));
    check("Mark step done answered 503; the re-read's next step has the same words but another id: \"Step done.\"", (await status(page)) === "Step done.", await status(page));
    await context.close();
  }
  {
    // Item 3: Undo is its own control (44 px, outside the live region); another write's words leave it; it is used once;
    // pressed after its time it sends nothing; an offer with under five seconds left is not shown.
    const until = () => new Date(Date.now() + 60000).toISOString();
    const { context, actPosts } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor,
      act: (b) => (b.action === "approve" ? { status: 200, body: { undoUntil: until(), approval: 77 } } : 204) });
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(PORTAL + "/");
    await page.waitForSelector('#home-now [data-id="parts:request:12"]');
    await page.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await page.waitForSelector("#home-undo .undobtn");
    const u = await page.evaluate(() => ({ h: Math.round(document.querySelector("#home-undo .undobtn").getBoundingClientRect().height), inLive: !!document.querySelector("#home-done-status .undobtn, [role=status] .undobtn") }));
    await page.click('#home-now [data-id="skills:signoff:u-3:omio"] .nowbtn');
    await page.waitForFunction(() => document.getElementById("home-done-status").textContent === "Signed off.");
    check("Undo: 44 px, outside the live region, and still offered after another write's words", u.h >= 44 && !u.inLive && await page.isVisible("#home-undo .undobtn"), u);
    await page.clock.runFor(61000);
    check("Undo goes when its time runs out", !(await page.isVisible("#home-undo .undobtn")));
    await context.close();
    // Pressed after its time (the timer has not run yet): too late, nothing sent; and used once.
    const c2 = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor,
      act: (b) => (b.action === "approve" ? { status: 200, body: { undoUntil: new Date(Date.now() + 8000).toISOString(), approval: 77 } } : 204) });
    const p2 = (await openPortal(c2.context)).page;
    await p2.waitForSelector('#home-now [data-id="parts:request:12"]');
    await p2.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await p2.waitForSelector("#home-undo .undobtn");
    await p2.evaluate(() => { const real = Date.now; Date.now = () => real() + 9000; });
    await p2.click("#home-undo .undobtn");
    await p2.waitForTimeout(200);
    check("Undo pressed after its time: \"It's too late to undo that…\", nothing sent, the offer gone", /too late/.test(await status(p2)) && c2.actPosts.length === 1 && !(await p2.$("#home-undo .undobtn")), { posts: c2.actPosts.length, status: await status(p2) });
    await c2.context.close();
    const c3 = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor,
      act: (b) => (b.action === "approve" ? { status: 200, body: { undoUntil: new Date(Date.now() + 3000).toISOString(), approval: 77 } } : 204) });
    const p3 = (await openPortal(c3.context)).page;
    await p3.waitForSelector('#home-now [data-id="parts:request:12"]');
    await p3.click('#home-now [data-id="parts:request:12"] .nowbtn');
    await p3.waitForFunction(() => document.getElementById("home-done-status").textContent === "Approved.");
    check("an Undo with under five seconds left is not offered", !(await p3.$("#home-undo .undobtn")));
    await c3.context.close();
  }
  {
    // Item 7: the live region is there from the start (shown, empty) and apart from Undo; focus stays put across the
    // redraw after a write: on the next row's button.
    const { context, actPosts, answers } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS });
    answers.today = () => (actPosts.length ? { ...today83.mentor, waiting: today83.mentor.waiting.filter((r) => r.id !== "skills:signoff:u-3:omio") } : today83.mentor);
    const { page } = await openPortal(context);
    await page.waitForSelector('#home-now [data-id="skills:signoff:u-3:omio"]');
    const live = await page.evaluate(() => { const s = document.getElementById("home-done-status"); return { role: s.getAttribute("role"), display: getComputedStyle(s).display, empty: s.textContent === "", undoInside: !!s.querySelector("#home-undo") }; });
    check("the live region exists from the start (role=status, not display:none, empty), and Undo is not inside it", live.role === "status" && live.display !== "none" && live.empty && !live.undoInside, live);
    await page.focus('#home-now [data-id="skills:signoff:u-3:omio"] .nowbtn');
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector('#home-now [data-id="skills:signoff:u-3:omio"]'));
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => document.activeElement?.closest("[data-id]")?.dataset.id || document.activeElement?.tagName);
    check("after Sign off and the redraw, the focus is on the next row (Motor power leads)", f === "skills:signoff:u-4:leads", f);
    await context.close();
  }
  {
    // Item 8: one filled button across the screen. An event on today (dated /event.json) in Build mode: the kit's banner
    // fills "Switch to Competition", so Home fills none, not even the shift's button.
    const ev = { name: "Test Regional", start: F.dayFrom(T0, 0), end: F.dayFrom(T0, 1), happeningNow: true };
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: F.eventToday(T0), event: ev });
    const { page } = await openPortal(context);
    await page.waitForSelector("#shell-bar .shbar-banner:not([hidden]) .shbar-bannerbtn");
    await settle(page);
    const h = await homeState(page);
    const bar = await page.$$eval("#site-header .shbar-bannerbtn, #site-header .shell-btn--primary", (bs) => bs.filter((b) => b.getClientRects().length && !b.closest("[hidden]")).map((b) => b.textContent.trim()));
    check("an event on today in Build mode: the banner's Switch to Competition is the one filled button; Home fills none (not the shift's)", h.filled.length === 0 && bar.join() === "Switch to Competition", { home: h.filled, bar });
    const when = await page.textContent("#home-shift .shiftwhen").catch(() => "");
    check("my shift starts with the day and the time now, as the demo's shift card", /^\w{3}, \w{3} \d+, now \d+:\d{2} [ap]m$/.test(when), when);
    await shot(page, "review8-banner-1280");
    await context.close();
  }
  {
    // Item 9: a parent's Home on an event day is the demo's: the season line, Can you help? and Coming up; no This week, no guide.
    const { context } = await newContext(browser, { groups: "parent", apps: GROUPED_APPS, today: today83.parent, event: { name: "Test Regional", start: F.dayFrom(T0, 0), end: F.dayFrom(T0, 0), happeningNow: true } });
    await context.addCookies([site("guide", "")]);
    const { page, errors } = await openPortal(context);
    await settle(page);
    const h = await homeState(page);
    const sideOrder = await page.$$eval("#home-side > *, #home-side-lead > *", (els) => els.filter((e) => e.getClientRects().length && e.id).map((e) => e.id));
    check("a parent on an event day: Apps lead the side column, then Can you help? (the demo's)", sideOrder.indexOf("apps") > -1 && sideOrder.indexOf("apps") < sideOrder.indexOf("home-help"), sideOrder);
    check("a parent on an event day: season line, Can you help?, Coming up; no This week and no guide", h.top === "season simple" && !h.main.includes("home-week") && h.side.includes("home-help") && h.main.includes("home-coming") && h.guideHidden && errors.length === 0, h);
    await context.close();
  }

  // ---------- Mark step done (CONTRACT T1, T3): the act path, at once, put back on failure ----------
  for (const width of [1280, 390]) {
    // Success: the step counts at once, one POST {tasks, step-done, "<taskId>:<itemId>"}, then the Home is drawn again
    // with Tasks' next step; the focus is on the next task's button.
    const after = { ...today83.student, next: { ...today83.student.next, steps: { done: 2, total: 2 }, nextStep: null } };
    const { context, actPosts, answers, posts } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, width, act: "hang" });
    answers.today = () => (actPosts.length ? after : today83.student);
    const { page, errors } = await openPortal(context);
    await page.waitForSelector("#home-next .nextstep");
    await page.$eval("#home-next .heroacts button", (b) => { b.click(); b.click(); });
    await page.waitForTimeout(150);
    const mid = await page.evaluate(() => ({ steps: document.querySelector("#home-next .nextsteps").textContent, bar: document.querySelector("#home-next .nextbar i").style.width,
      step: !!document.querySelector("#home-next .nextstep:not([hidden])"), status: document.getElementById("home-done-status").textContent, disabled: document.querySelector("#home-next .heroacts button").getAttribute("aria-disabled") === "true" }));
    check(`${width}px Mark step done: at once the step counts (2 of 2, the bar full), the next-step line goes, "Marking the step done…" (pending, review item 1); before any answer`, mid.steps === "2 of 2 steps done" && mid.bar === "100%" && !mid.step && mid.status === "Marking the step done…" && mid.disabled, mid);
    check(`${width}px Mark step done: two presses send one POST of {app: "tasks", action: "step-done", key: "<taskId>:<itemId>"} to /today/act; nothing to /today/task-done`,
      actPosts.length === 1 && actPosts[0].body === JSON.stringify({ app: "tasks", action: "step-done", key: "t-7:s2" }) && posts.length === 0, actPosts);
    answers.act = 204;
    await context.close();
    const ok = await newContext(browser, { groups: "student", apps: GROUPED_APPS, width, act: 204 });
    ok.answers.today = () => (ok.actPosts.length ? after : today83.student);
    const p2 = (await openPortal(ok.context)).page;
    await p2.waitForSelector("#home-next .nextstep");
    await p2.click("#home-next .heroacts button");
    await p2.waitForFunction(() => document.querySelector("#home-next .heroacts button")?.textContent.trim() === "Mark task done");
    const done = await p2.evaluate(() => ({ steps: document.querySelector("#home-next .nextsteps").textContent, focus: document.activeElement === document.querySelector("#home-next .heroacts button") }));
    check(`${width}px Mark step done answered 204: /today.json is asked again; with no step left the button is "Mark task done", focused`, done.steps === "2 of 2 steps done" && done.focus && errors.length === 0, done);
    await ok.context.close();
  }
  for (const [status, words] of [[503, "That didn't go through. Try again."], ["abort", "That didn't go through. Try again."], [{ status: 409, body: { error: "changed", message: "Someone else already ticked this step." } }, "Someone else already ticked this step."],
    [403, "You can't do this from Home. Open the task to see why."]]) {
    const { context, actPosts } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: today83.student, act: status });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next .nextstep");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction((w) => document.getElementById("home-done-status").textContent === w, words);
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ steps: document.querySelector("#home-next .nextsteps").textContent, step: document.querySelector("#home-next .nextstep")?.textContent || "",
      btn: document.querySelector("#home-next .heroacts button").textContent.trim(), disabled: document.querySelector("#home-next .heroacts button").disabled, focus: document.activeElement?.closest("#home-next") !== null }));
    const code = typeof status === "object" ? status.status : status;
    check(`Mark step done answered ${code}: the card is back as it was (1 of 2, the next step, the button) and says "${words}"`, actPosts.length === 1 && s.steps === "1 of 2 steps done" && s.step === "Next step: Cut on the router" && s.btn === "Mark step done" && !s.disabled && s.focus, s);
    await context.close();
  }

  // ---------- Account's own answer (test/fixtures/today-account-83.json, made by Account r83's gatherToday) ----------
  {
    const A = JSON.parse(readFileSync(new URL("./fixtures/today-account-83.json", import.meta.url), "utf8"));
    for (const [who, groups] of [["mentor", "mentor"], ["student", "student"], ["parent", "parent"], ["studentEvent", "student"], ["adminOnly", "admin"]]) {
      const { context } = await newContext(browser, { groups, apps: GROUPED_APPS, today: A[who], event: who === "studentEvent" ? { name: "Test Regional", happeningNow: true } : 404 });
      const { page, errors } = await openPortal(context);
      await settle(page);
      const h = await homeState(page);
      const rows = [...h.now, ...h.others, ...h.help];
      check(`Account's answer, ${who}: drawn with no error, no "undefined", no empty heading, no line twice, one filled button at most`, errors.length === 0 && !h.undef && h.emptyHeads.length === 0 && rows.length > 0
        && rows.every((r) => new Set(r.lines).size === r.lines.length) && h.filled.length <= 1, { errors, undef: h.undef, empty: h.emptyHeads, filled: h.filled, rows: rows.map((r) => [r.id, r.lines]) });
      if (who === "mentor") check("Account's answer, mentor: its groups and rows in its order; the late request's urgent line", h.groups.join("|") === "Needs your OK|Sign-off requests|Stuck|Parts and practice"
        && h.now.map((r) => r.id).join() === [...A.mentor.waiting, ...A.mentor.today].map((r) => r.id).join() && await page.$eval('#home-now [data-id="parts:request:12"] .rl', (l) => l.classList.contains("nowdue") && l.textContent.endsWith("2 days late")), h.now.map((r) => r.id));
      if (who === "student") check("Account's answer, student: Sign in is the one filled button (Calendar sends no primary yet: known by its words); Mark step done; Waiting on others", h.filled.join() === "Sign in" && h.nextActs[0][0] === "Mark step done"
        && h.nextDue === `Due Mon, Nov 23, ${A.student.next.practicesLeft} practices left` && h.others.map((r) => r.id).join() === A.student.others.map((r) => r.id).join(), h);
      // Account filters by the person's current groups (CONTRACT A1c): an admin who is not a mentor gets the count rows
      // and no Needs your OK, sign-off or Stuck rows (D166); the page is whole without them.
      if (who === "adminOnly") check("Account's answer, admin only: the count rows as doors, no groups, no buttons on Now, This week and the season line", h.groups.length === 0
        && h.now.map((r) => r.id).sort().join() === [...A.adminOnly.today, ...A.adminOnly.waiting].map((r) => r.id).sort().join() && h.now.every((r) => r.btns.length === 0) && h.top === "season" && h.side.includes("home-week"), h);
      if (who === "parent") check("Account's answer, parent: Can you help? with both Sign up buttons (the snack day's filled), Coming up", JSON.stringify(h.help.map((r) => r.btns.map((b) => [b[0], b[2]]))) === JSON.stringify([[["Sign up", "filled"]], [["Sign up", "plain"]]]) && h.coming.length >= 1, h.help);
      await context.close();
    }
  }

  // ---------- kit 0.5.0's font: Archivo from the portal itself, nothing from Google, no Bricolage or Inter ----------
  {
    const { context, seen } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: today83.student });
    const { page } = await openPortal(context);
    await settle(page);
    const f = await page.evaluate(async () => { await document.fonts.ready; return { ok: document.fonts.check("700 16px Archivo"), body: getComputedStyle(document.body).fontFamily, h1: getComputedStyle(document.querySelector("#greeting")).fontStretch, size: getComputedStyle(document.body).fontSize }; });
    check("Archivo: document.fonts.check('700 16px Archivo') is true; the body's family is the kit's; headings are wide; 14px with a mouse", f.ok && /Archivo/.test(f.body) && f.h1 === "112%" && f.size === "14px", f);
    check("the portal asks for the kit's font file and no other: nothing from Google, no Bricolage, no Inter", seen.some((u) => u.endsWith("/shell/fonts/archivo-latin-var.woff2")) && !seen.some((u) => /fonts\.(googleapis|gstatic)\.com|bricolage|inter-latin/.test(u)), seen.filter((u) => /font|woff/.test(u)));
    await context.close();
  }

  for (const width of [1280, 390]) {
    // A parent's Sign up: the snack day, by keyboard.
    const { context, actPosts, answers } = await newContext(browser, { groups: "parent", apps: GROUPED_APPS, width });
    answers.today = () => (actPosts.length ? { ...today83.parent, today: today83.parent.today.slice(1) } : today83.parent);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-help .nowbtn");
    await page.focus("#home-help .nowbtn");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    check(`${width}px: Sign up (keyboard) sends {calendar, snack, <date>} and the row goes`, actPosts.length === 1 && actPosts[0].body === JSON.stringify({ app: "calendar", action: "snack", key: F.dayFrom(T0, 2) }) && (await page.$$eval("#home-help .nowrow:not([hidden])", (r) => r.length)) === 1, actPosts);
    await context.close();
  }

  // ---------- an event day (CONTRACT E1): the line, my shift, In the pit, Next for us; nothing else ----------
  for (const width of [1280, 390]) {
    for (const [who, groups, today] of [["student with a shift", "student", F.eventToday(T0)], ["mentor", "mentor", F.eventToday(T0, { shift: false })]]) {
      const { context } = await newContext(browser, { groups, apps: GROUPED_APPS, today, width, event: { name: "Test Regional", happeningNow: true } });
      const { page, errors } = await openPortal(context);
      await settle(page);
      const h = await homeState(page);
      const ev = await page.evaluate(() => ({ line: [...document.querySelectorAll(".shell-evline .shell-evpart")].map((a) => [a.querySelector(".shell-evk").textContent, a.getAttribute("href")]),
        shift: [...document.querySelectorAll(".shiftcard .nowrow")].map((r) => r.dataset.id), matches: [...document.querySelectorAll("#home-matches .wkrow")].map((a) => a.innerText.replace(/\s+/g, " ").trim()) }));
      const shift = who.startsWith("student");
      check(`event ${who} ${width}px: ${shift ? "my shift first with its button filled, then the line without \"You now\"" : "the line on top with You now"}`,
        shift ? ev.shift.length === 1 && h.filled.join() === "Open my scouting match" && ev.line.map((l) => l[0]).join() === "Our match now,Robot" : h.top === "shell-evline evline" && ev.line.map((l) => l[0]).join() === "You now,Our match now,Robot", { ev, h });
      check(`event ${who} ${width}px: the line's parts are doors to Competition`, ev.line.every(([, href]) => href.startsWith("http://compete.landing.test/")), ev.line);
      check(`event ${who} ${width}px: In the pit (two rows, Open the Pit plain) and Next for us (alliance in words); no This week, next task, activity or Get started`,
        h.now.length === 2 && h.now[0].btns[0][0] === "Open the Pit" && h.now[0].btns[0][2] === "plain" && h.now[0].btns[0][3] === "http://compete.landing.test/pit?tab=check" && ev.matches.length === 2 && /Blue alliance With 1001 and 1002 Against 1003, 1004, 1005/.test(ev.matches[0])
        && !h.main.includes("home-week") && !h.side.includes("home-week") && h.next === null && !h.main.includes("home-activity") && h.guideHidden, { h, ev });
      check(`event ${who} ${width}px: no sideways scroll, no error`, (await over(page)) <= 0 && errors.length === 0, errors);
      await shot(page, `home83-event-${shift ? "student" : "mentor"}-${width}`, true);
      await context.close();
    }
  }
  for (const width of [1280, 390]) {
    // No `event` part, but /event.json says an event is on (an older Competition): the shift row first and the compact card (C14).
    const shift = { id: "compete:shift-now:e1:2026-11-14:18", section: "today", title: "Pit crew until 11:00", detail: "Then Scouting at 11:00.", href: "http://compete.landing.test/schedule" };
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...TODAY.student, today: [...TODAY.student.today, shift] }, width, event: { name: "Colorado Regional", happeningNow: true } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await settle(page);
    const s = await page.evaluate(() => ({ rows: [...document.querySelectorAll("#home-now .nowrow")].map((r) => r.dataset.id), compact: document.getElementById("home-next").classList.contains("evcompact"),
      size: parseFloat(getComputedStyle(document.querySelector("#home-next .nexttitle")).fontSize) }));
    check(`${width}px event day without the event part: the shift row first and the compact next-task card (C14)`, s.rows[0] === shift.id && s.rows.length === 2 && s.compact && s.size <= 18, s);
    await context.close();
  }

  // Done (C4): posts the task, then the Home is drawn again with the next one; an error offers "Open task" instead.
  {
    let n = 0;
    const second = { ...TODAY.student, next: { taskId: "t-42", title: "Mount the camera", due: "", project: "Vision", href: `${TASKS}/my?task=t-42` } };
    const { context, posts, answers } = await newContext(browser, { groups: "student", apps: GROUPED_APPS });
    answers.today = () => (n++ === 0 ? TODAY.student : second);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.focus("#home-next .heroacts button");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#home-next .nexttitle")?.firstChild.textContent === "Mount the camera");
    check("Mark task done posts {taskId} as JSON to /today/task-done", posts.length === 1 && posts[0].method === "POST" && posts[0].body === JSON.stringify({ taskId: "t-41" }) && /application\/json/.test(posts[0].type), posts);
    check("after Mark task done the next task takes its place and has the focus", await page.evaluate(() => document.activeElement === document.querySelector("#home-next .heroacts button")));
    await context.close();
  }
  // Done's answers: 403 and 404 offer "Open task"; a 5xx puts the button back; no answer in 10 s says so and asks for
  // /today.json again (and never offers "Open task"). The messages live in one lasting status line.
  for (const st of [403, 404]) {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student, taskDone: st });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => document.querySelector("#home-next .heroacts")?.firstElementChild?.tagName === "A");
    const acts = await page.$$eval("#home-next .heroacts > *", (els) => els.map((e) => [e.tagName, e.firstChild.textContent.trim(), e.getAttribute("href")]));
    check(`task-done ${st}: the card offers "Open task" in place of Mark task done`, acts.length === 1 && acts[0][0] === "A" && acts[0][1] === "Open task" && acts[0][2] === `${TASKS}/my?task=t-41`, acts);
    check(`task-done ${st}: says so in the status line, and focus is on Open task`, /can't be marked done/.test(await page.textContent("#home-status [role=status]")) && await page.evaluate(() => document.activeElement?.textContent.startsWith("Open task")));
    await context.close();
  }
  {
    const { context, posts } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: TODAY.student, taskDone: 503 });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => /Try again/.test(document.getElementById("home-done-status").textContent));
    const s = await page.$eval("#home-next .heroacts button", (b) => ({ text: b.textContent.trim(), disabled: b.disabled, focused: b === document.activeElement }));
    check("task-done 503: the button is back, focused, with a short message; no Open task", s.text === "Mark task done" && !s.disabled && s.focused && !(await page.$("#home-next .heroacts a[href$='t-41']")), s);
    await page.click("#home-next .heroacts button");
    await page.waitForFunction(() => /Try again/.test(document.getElementById("home-done-status").textContent) && !document.querySelector("#home-next .heroacts button").disabled);
    check("task-done 503: it can be pressed again", posts.length === 2, posts.length);
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
    const status0 = await page.evaluate(() => { const s = document.querySelectorAll("#main [role=status]"); s[0].dataset.mark = "kept"; return s.length; });
    const gets0 = answers.gets;
    await page.$eval("#home-next .heroacts button", (b) => { b.click(); b.click(); });
    await page.waitForFunction(() => /Marking it done/.test(document.getElementById("home-done-status").textContent));
    await page.clock.setSystemTime(Date.now() + 5 * 60000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(200);
    const getsWhilePending = answers.gets;
    await page.clock.runFor(10500);
    await page.waitForFunction(() => /didn't go through/.test(document.getElementById("home-done-status").textContent));
    await page.waitForTimeout(300);
    check("two quick presses of Mark task done send one POST", posts.length === 1, posts.length);
    check("no /today.json request while the POST is on its way", getsWhilePending === gets0, { gets0, getsWhilePending });
    check("no answer in 10 s: /today.json is read once; it still has the task, so \"That didn't go through. Try again.\"", answers.gets === gets0 + 1, { gets0, now: answers.gets });
    check("...and the card never offers Open task then", !(await page.$$eval("#home-next .heroacts a", (as) => as.some((a) => a.firstChild.textContent.trim() === "Open task"))));
    const status1 = await page.evaluate(() => ({ n: document.querySelectorAll("#main [role=status]").length, kept: document.querySelector("#main [role=status]").dataset.mark === "kept" }));
    check("one status line, the same one after the Home was drawn again", status0 === 1 && status1.n === 1 && status1.kept, { status0, status1 });
    check("timeout: no script error", errors.length === 0, errors);
    await context.close();
  }

  // C13 and C14: the next-task card in full, a held-back task, the empty states.
  const FULL = { ...TODAY.student, today: [], next: { taskId: "t-41", title: "Wire the intake sensor", due: "2026-11-18", project: "Intake", subteam: "Electrical", milestone: "Robot drives",
    steps: { done: 2, total: 5 }, href: `${TASKS}/my?task=t-41`, stuckHref: `${TASKS}/my?task=t-41&do=stuck`, partHref: `${TASKS}/my?task=t-41&do=part` } };
  const card = (page) => page.evaluate(() => {
    const c = document.getElementById("home-next");
    const t = (e) => (e ? e.textContent.replace(" (opens in a new tab)", "").trim() : "");
    return { h2: t(c.querySelector("h2")), title: t(c.querySelector(".nexttitle")), where: t(c.querySelector(".nextwhere")), steps: t(c.querySelector(".nextsteps")),
      bar: c.querySelector(".nextbar i")?.style.width || "", waiting: t(c.querySelector(".nextwaiting")), hold: t(c.querySelector(".nexthold")), blocked: t(c.querySelector(".nextblocked")),
      empty: t(c.querySelector("p.mute")),
      acts: [...c.querySelectorAll(".heroacts > *")].map((e) => [t(e), e.classList.contains("shell-btn--primary") ? "filled" : "plain", e.getAttribute("href")]) };
  });
  for (const width of [1280, 390]) {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: FULL, width });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next .nextsteps");
    const c = await card(page);
    check(`${width}px: the full next-task card: the title as the link, project › subteam, milestone, steps`, c.h2 === "Your next task" && c.title === "Wire the intake sensor›" && c.where === "Intake › Electrical, for “Robot drives”" && c.steps === "2 of 5 steps done" && c.bar === "40%", c);
    check(`${width}px: Mark task done (filled: no Sign in on the page), I'm stuck, Request a part, with their links; no Open button`, JSON.stringify(c.acts) === JSON.stringify([["Mark task done", "filled", null], ["I'm stuck", "plain", `${TASKS}/my?task=t-41&do=stuck`],
      ["Request a part", "plain", `${TASKS}/my?task=t-41&do=part`]]), c.acts);
    check(`${width}px: the full card has no sideways scroll`, (await over(page)) <= 0);
    await context.close();
  }
  for (const [label, extra, word] of [["waiting on another task", { waitingOn: ["Cut the plate", "Order the sensor"] }, "waiting"], ["on hold", { onHold: true }, "hold"], ["blocked", { blocked: true }, "blocked"]]) {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...FULL, next: { ...FULL.next, ...extra } } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    const c = await card(page);
    const said = { waiting: c.waiting === "Waiting on Cut the plate, Order the sensor.", hold: c.hold === "This task is on hold.", blocked: c.blocked === "Blocked" }[word];
    check(`a task ${label}: Mark task done is a plain button and the card says so in words`, c.acts[0][0] === "Mark task done" && c.acts[0][1] === "plain" && said, c);
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: { ...TODAY.mentor, today: [], waiting: [] } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-now");
    check("an activity row without an app has no empty app line", !(await page.$("#home-activity .actapp")));
    check("staff with nothing waiting: Now says \"Nothing needs you right now.\" and keeps the guide's mark", (await page.textContent("#home-now p")) === "Nothing needs you right now." && (await page.getAttribute("#home-now", "data-guide")) === "wait");
    await context.close();
  }
  {
    const { context } = await newContext(browser, { groups: "student", apps: GROUPED_APPS, today: { ...TODAY.student, next: null } });
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-next");
    const c = await card(page);
    check("a student with no next task: \"Nothing assigned to you\" (C13)", c.h2 === "Nothing assigned to you" && c.empty === "Take something nobody has yet." && c.acts.length === 0, c);
    await context.close();
  }

  // The status words (a dot and a word) and the season line keep 4.5:1 in both themes.
  for (const theme of ["light", "dark"]) {
    const { context } = await newContext(browser, { groups: "mentor", apps: GROUPED_APPS, today: today83.mentor });
    await context.addCookies([site("theme", theme)]);
    const { page } = await openPortal(context);
    await page.waitForSelector("#home-week .shell-status--warn");
    const ratios = await page.evaluate(() => {
      const rgba = (c) => (c.match(/[\d.]+/g) || []).map(Number);
      const over = (top, under) => { const a = top[3] === undefined ? 1 : top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)); };
      const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (e) => {
        let n = e, under = null;
        while (n && !under) { const c = rgba(getComputedStyle(n).backgroundColor); if (c.length && (c[3] === undefined || c[3] > 0.99)) under = c; n = n.parentElement; }
        const back = under || [255, 255, 255];
        const fg = over(rgba(getComputedStyle(e).color), back);
        const [a, b] = [lum(fg), lum(back)].sort((x, y) => y - x);
        return +((a + 0.05) / (b + 0.05)).toFixed(2);
      };
      return Object.fromEntries([".shell-status--warn", ".shell-status--bad", ".snmute", ".snms > span", ".snhead b", ".nowrow .rl", ".wkd span", ".nowdeny"].map((s) => [s, ratio(document.querySelector(s))]));
    });
    check(`${theme}: the status words, the season line and the muted lines have at least 4.5:1 contrast`, Object.values(ratios).every((r) => r >= 4.5), ratios);
    await context.close();
  }

  // Hostile text everywhere the answer has words: it is shown as text; no element is made from it.
  {
    const evil = "<img src=x onerror=\"window.__xss=1\">";
    const today = { v: 1,
      today: [{ id: "a", section: "today", title: evil, detail: evil, href: `${CAL}/`, cta: { label: evil, href: `${CAL}/x` } }],
      waiting: [{ id: "b", section: "waiting", title: evil, detail: evil, href: `${PARTS}/`, count: 1, group: evil, mark: { word: evil, tone: "bad" }, lines: [evil], acts: [{ label: evil, app: "parts", action: "approve", key: "1" }] }],
      next: { taskId: evil, title: evil, project: evil, subteam: evil, milestone: evil, waitingOn: [evil], href: `${TASKS}/my`, stuckHref: `${TASKS}/my?do=stuck`, nextStep: { id: "s", title: evil } },
      activity: [{ app: evil, title: evil, detail: evil, href: `${PARTS}/`, at: ago(2) }],
      season: { target: { name: evil, date: F.dayFrom(T0, 30), kind: "comp" }, days: [] },
      milestones: [{ name: evil, date: F.dayFrom(T0, 3), project: evil, href: `${TASKS}/p` }],
      week: [{ date: F.dayFrom(T0, 1), href: `${CAL}/`, items: [{ kind: "meeting", name: evil }], snacks: { names: [evil], open: 0 } }] };
    const { context } = await newContext(browser, { groups: "mentor|student", apps: GROUPED_APPS, today });
    const { page, errors } = await openPortal(context);
    await page.waitForSelector("#home-activity");
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ imgs: document.querySelectorAll("main img").length, xss: window.__xss === 1,
      shown: document.querySelector("#home-now .rt").textContent, app: document.querySelector("#home-activity .actapp").textContent, top: document.querySelector("#home-top").textContent }));
    check("hostile words: no img element is created, nothing runs, the words show as text", s.imgs === 0 && !s.xss && s.shown.startsWith("<img") && s.app.startsWith("<img") && s.top.includes("<img") && errors.length === 0, { s, errors });
    await context.close();
  }

  // The shop screen's notice (C14) and an extra Authentik group (item 4).
  // C16: ?blocked= is the refusing app's host label, named from the portal's fixed table. The catalog here holds none of
  // these apps (a shop screen's own list never holds the app that refused it), so the name cannot come from it.
  const SHOP_APPS = JSON.stringify([{ id: "handbook", name: "Team Handbook", description: "Team rules.", path: "/resources.html", groups: [] }]);
  const notice = (name) => `${name} isn't available on a display. Pick one of these instead.`;
  const BLOCKED = [["tasks", "Tasks"], ["calendar", "Calendar"], ["parts", "Parts & Inventory"], ["skills", "Skills"], ["compete", "Competition"],
    ["account", "Account"], ["admin", "Admin"], ["editor", "Website editor"], ["tools", "Tools"]].map(([l, n]) => [`?blocked=${l}`, notice(n)]);
  for (const [query, want] of [...BLOCKED, ["?blocked=nope", null], ["?blocked=schedule", null], ["?blocked=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", null], ["?blocked=Parts", null]]) {
    for (const width of query === "?blocked=parts" ? [1280, 390] : [1280]) {
      const { context, seen } = await newContext(browser, { groups: "display|authentik Admins", apps: SHOP_APPS, width });
      const page = await context.newPage();
      await page.goto(PORTAL + "/" + query);
      await page.waitForSelector("#display-home");
      await settle(page);
      const note = await page.$eval("#display-home", (d) => d.querySelector(".dnote")?.textContent || null);
      check(`shop screen ${query} (${width}px): ${want ? "the notice names the app from the host-label table (C16)" : "no notice"}`, note === want, note);
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
    await page.waitForSelector("#home-now");
    const rows = () => page.$$eval("#home-now .nowrow", (els) => els.map((e) => e.dataset.id).join());
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
    const s = await page.evaluate(() => ({ cards: document.querySelectorAll("#home-top > *, #home-main > *, #home-side-lead > *").length, tiles: document.querySelectorAll("#app-grid .approw").length, access: !document.getElementById("access").hidden }));
    check(`/today.json ${label}: nothing from it is drawn, and the apps and Get access are as before`, s.cards === 0 && s.tiles === 3 && s.access && errors.length === 0, { s, errors });
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
    check(`${role}: the tiles are the core apps only`, (await names(page, "#app-grid .approw")).join() === "Task App,Calendar");
    if (role === "admin") {
      // 8.3 (Ground up): the kit's mountHomeGroups calls the third row "Team links" (kit 0.5.0).
      check("admin: the rows read Tools, Admin apps, Team links", g.map((x) => x[4]).join() === "Tools,Admin apps,Team links", g);
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
    // Kit 0.5.0: a closed row's chevron points down, an open one's up (so it is not read as a link).
    const turned = await page.$$eval("#home-groups .grp", (els) => els.map((e) => [e.dataset.grp, Math.round(new DOMMatrix(getComputedStyle(e.querySelector(".grpchev")).transform).b) === -1 ? "up" : "down"]));
    check(`${width}px: an open row's chevron points up, a closed one's down`, JSON.stringify(turned) === JSON.stringify([["tools", "up"], ["adminapps", "up"], ["more", "down"]]), turned);
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
    check(`display ${width}px: nothing else (no bar, no footer, no other control), dark, large links`, !d.bar && d.footer === 0 && d.other === 0 && d.bg === "rgb(0, 0, 0)" && d.cardH >= 100, d);
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
      && /application\/json/.test(reads[0].type) && reads[0].origin === PORTAL && reads[0].url === `${PORTAL}/_shell/inbox/read` && (reads[0].site === undefined || reads[0].site === "same-origin"), reads);
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
    // 8.3: with the Ground up Home the page needs its /today.json to be long enough for the row to sit under the scrim.
    const { context } = await newContext(browser, { groups: "admin", apps: GROUPED_APPS, width, today: today83.admin });
    const { page, errors } = await openPortal(context);
    await page.click("#shell-bar .shbar-appsbtn");
    const rows = await page.$$eval("#shell-bar .shbar-apps .shbar-group:not([hidden]) > .shbar-groupbtn", (bs) => bs.map((b) => b.firstElementChild.textContent));
    check(`${width}px: the Apps menu's rows read Tools, Admin apps, Team links (kit 0.5.0)`, rows.join() === "Tools,Admin apps,Team links", rows);
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
  const ringAround = async (page, sel) => {
    await page.waitForFunction((sel) => {
      const ring = document.querySelector(".shell-gring"), t = document.querySelector(sel);
      if (!ring || ring.hidden || !t) return false;
      const a = ring.getBoundingClientRect(), b = t.getBoundingClientRect();
      return a.left <= b.left + 1 && a.top <= b.top + 1 && a.right >= b.right - 1 && a.bottom >= b.bottom - 1;
    }, sel, { timeout: 3000 }).catch(() => {});
    return ringOf(page, sel);
  };
  const ringOf = (page, sel) => page.evaluate((sel) => {
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
    await page.waitForSelector("#home-now");
    await page.waitForFunction(() => { const r = document.querySelector(".shell-gring"); return r && !r.hidden && document.querySelector(".shell-gstop h2"); });
    const ring = await ringAround(page, '#home-now[data-guide="wait"]');
    const title = await page.textContent(".shell-gstop h2");
    check(`wait stop ${width}px: "See what is waiting on you" rings the Now section (8.3; was the Waiting on you card)`, title === "See what is waiting on you" && ring.ok, { title, ring });
    await shot(page, `guide-wait-stop-${width}`);
    const popup = context.waitForEvent("page").catch(() => null);
    await page.click("#home-now .nowrow a.rowlink");
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
      await page.waitForSelector(".hdr .nav-login");
      await page.waitForTimeout(300);
      const bar = await page.$$("#shell-bar, .shbar-mount, .shbar-appsbtn");
      check(`public ${path}: no app bar and no signed-in controls`, bar.length === 0 && (await page.$$("[data-signout], #sign-out")).length === 0);
      check(`public ${path}: the public header keeps its nav and the 2972_in "Portal" label`, (await page.textContent(".hdr .nav-login")).trim() === "Portal" && (await page.$$(".hdr .nav .nav-a")).length >= 3);
      await page.close();
    }
    // One theme cookie for the portal and the apps (D92). Public pages are light only: a choice made in the portal bar
    // does not change them, and they leave the cookie and the old key exactly as they found them.
    const portal = (await openPortal(context)).page;
    await portal.click("#shell-bar .shbar-acct");
    await portal.click('#shell-bar [aria-label="Appearance"] .shbar-choice >> text=Light');
    const themeState = (page) => page.evaluate(() => ({ attr: document.documentElement.dataset.theme || null, cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null, key: localStorage.getItem("theme"),
      bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme }));
    check("Light chosen in the portal bar: the portal itself is light", (await themeState(portal)).attr === "light" && (await themeState(portal)).cookie === "light");
    const pub = await context.newPage();
    await pub.goto(PUBLIC + "/about.html");
    await pub.evaluate(() => localStorage.setItem("theme", "light"));   // the old key lives per origin: seed this one
    for (const path of ["/about.html", "/robots.html", "/privacy.html"]) {
      await pub.goto(PUBLIC + path);
      await pub.waitForSelector(".hdr .nav-login");
      await pub.waitForTimeout(200);
      const st = await themeState(pub);
      check(`Light saved (cookie and old key): public ${path} is white as always, sets no data-theme, and leaves the cookie as "light"`, st.bg === "rgb(255, 255, 255)" && st.scheme === "light" && st.attr === null && st.cookie === "light" && st.key === "light", st);
      check(`public ${path}: no theme switch`, (await pub.$$(".theme-switch")).length === 0);
    }
    await portal.click("#shell-bar .shbar-acct");
    await portal.click('#shell-bar [aria-label="Appearance"] .shbar-choice >> text=Match my device');
    await pub.goto(PUBLIC + "/about.html");
    await pub.waitForSelector(".hdr .nav-login");
    await pub.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await pub.waitForTimeout(150);
    check('"Match my device" chosen in the portal bar (cookie cleared): public stays white and does not recreate the cookie', (await themeState(pub)).bg === "rgb(255, 255, 255)" && (await themeState(pub)).cookie === null);
    await portal.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("the portal keeps its own theme handling after public pages were visited", (await themeState(portal)).attr === null);
    await pub.close(); await portal.close();
    // the editor's preview serves these pages under /site/: the wordmark probe follows the script, not the root
    {
      const before = seen.length;
      const page = await context.newPage();
      await page.goto(PUBLIC + "/site/about.html");
      await page.waitForSelector("#site-footer .wm-link img");
      await page.waitForTimeout(300);
      const probes = seen.slice(before).filter((u) => u.includes("dawson-school-logo.png"));
      check("under the editor's /site/ prefix the footer wordmark loads from /site/brand/..., not the root", probes.length > 0 && probes.every((u) => u === PUBLIC + "/site/brand/dawson-school-logo.png"), probes);
      check("...and the wordmark stays visible", await page.isVisible("#site-footer .wm-link img"));
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
