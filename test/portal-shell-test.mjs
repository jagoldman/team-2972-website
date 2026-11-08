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
//     a theme chosen in the portal bar carries to the public site and back (one cookie, D92)
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
  { id: "handbook", name: "Team Handbook", description: "Always under More.", path: "/resources.html", groups: [] },
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
  if (path === "/") await page.waitForFunction(() => document.querySelector("#app-grid .app-card, #more-grid .app-card") || !document.getElementById("no-group").hidden);
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
    const more = (await names(page, "#more-grid .app-card")).join(",");
    const notice = await page.isVisible("#no-group");
    check(`${label}: home tiles [${wantMain}] then More [${wantMore}]`, main === wantMain && more === wantMore, { main, more });
    check(`${label}: "waiting for an admin" notice ${wantMain || wantMore ? "hidden" : "shown"}`, notice === !(wantMain || wantMore));
    check(`${label}: More section ${wantMore ? "shown" : "hidden"} on the home page`, (await page.isVisible("#more-apps")) === !!wantMore);
    await page.click("#shell-bar .shbar-appsbtn");
    const menuMain = (await names(page, "#shell-bar .shbar-apps ul.shbar-grid:not(.shbar-more > ul) > li")).join(",");
    const menuMore = (await names(page, "#shell-bar .shbar-more li")).join(",");
    // the Apps menu has no coming-soon order rule of its own; compare as sets
    const set = (s) => s.split(",").filter(Boolean).sort().join(",");
    check(`${label}: the Apps menu lists the same tiles (main and More)`, set(menuMain) === set(wantMain) && set(menuMore) === set(wantMore), { menuMain, menuMore });
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
    check("More in the Apps menu is collapsed by default", (await page.$eval("#shell-bar .shbar-more", (d) => d.open)) === false && !(await page.isVisible("#shell-bar .shbar-more li")));
    await page.focus("#shell-bar .shbar-more summary");
    await page.keyboard.press("Enter");
    check("Enter on More opens it", await page.$eval("#shell-bar .shbar-more", (d) => d.open) && await page.isVisible("#shell-bar .shbar-more li"));
    await page.keyboard.press("Space");
    check("Space on More closes it again", (await page.$eval("#shell-bar .shbar-more", (d) => d.open)) === false);
    await page.keyboard.press("Escape");
    check("Escape closes the Apps menu and returns focus to the launcher", !(await page.isVisible("#shell-bar .shbar-apps")) && await page.$eval("#shell-bar .shbar-appsbtn", (b) => b === document.activeElement));
    const left = await page.$eval("#shell-bar .shbar-appsbtn", (b) => b.getBoundingClientRect().left);
    check("the nine-dot launcher is at the far left of the bar", left < 24, `left=${left}`);

    const links = await page.$$eval("#app-grid a, #more-grid a, #shell-bar .shbar-apps a, #shell-bar a.shbar-brand", (as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    const bad = links.filter((l) => l.target !== "_blank" || !l.rel.split(/\s+/).includes("noopener"));
    check(`every app link and the logo open a new tab with rel=noopener (${links.length} links)`, links.length >= 10 && bad.length === 0, bad);
    const hrefs = await page.$$eval("#app-grid a", (as) => as.map((a) => a.getAttribute("href")));
    check("host tiles and path tiles are built from the site domain", hrefs.includes("http://tasks.landing.test/") && hrefs.includes("http://landing.test/resources.html"), hrefs);
    check("coming-soon tiles are not links", (await page.$$eval("#app-grid .coming-soon", (els) => els.map((e) => e.tagName + e.getAttribute("aria-disabled")))).join() === "DIVtrue");

    check("sign-out goes to the outpost sign_out on the portal host (INTEGRATION §1)", (await page.getAttribute("#sign-out", "href")) === `${PORTAL}/outpost.goauthentik.io/sign_out`);
    check("the request-access cards are shown", await page.isVisible("#access") && (await page.$$("#access-body a[href^='mailto:']")).length >= 1);
    check("the account button falls back to the portal and shows initials", (await page.textContent("#shell-bar")).includes("PE"));

    await page.press("#q", "Escape").catch(() => {});
    await page.fill("#q", "alumni");
    check("search filters across both sections", (await names(page, "#app-grid .app-card:not([hidden]), #more-grid .app-card:not([hidden])")).join() === "Alumni News");
    await page.fill("#q", "");
    await context.close();
  }

  // ---------- mode ----------
  {
    const { context } = await newContext(browser, { groups: "student", apps: MODE_APPS });
    let { page } = await openPortal(context);
    check("build mode (no cookie): main tiles and More", (await names(page, "#app-grid .app-card")).join() === "Task App,Parts" && (await names(page, "#more-grid .app-card")).join() === "Skills,Team Handbook");
    await context.addCookies([site("mode", "competition")]);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("competition cookie, tab comes back: the grid follows without a reload", (await names(page, "#app-grid .app-card")).join() === "Task App,Pit Checklist");
    check("...and the eyebrow says Competition mode", (await page.textContent("#mode")) === "Competition mode");
    await page.close();
    ({ page } = await openPortal(context));
    check("competition cookie on load", (await names(page, "#app-grid .app-card")).join() === "Task App,Pit Checklist" && (await names(page, "#more-grid .app-card")).join() === "Skills,Team Handbook");
    await context.close();
  }

  // ---------- theme (the cases from the Sol review of 0b0f687) ----------
  {
    const { context } = await newContext(browser, { groups: "mentor" });
    await context.addCookies([site("theme", "dark")]);
    await context.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("theme", "light"); sessionStorage.setItem("seeded", "1"); } } catch (e) {} });
    let { page } = await openPortal(context);
    const state = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, label: document.querySelector("#shell-bar [aria-controls$='-theme'] .shbar-sr")?.textContent,
      bg: getComputedStyle(document.body).backgroundColor, cookie: (document.cookie.match(/(?:^|;\s*)theme=([^;]*)/) || [])[1] || null }));
    let s = await state();
    check("cookie dark + old key light: page and bar both dark", s.theme === "dark" && s.label === "Theme: Dark" && s.bg === "rgb(7, 9, 15)", s);
    await page.click("#shell-bar .shbar-icon[aria-controls$='-theme']");
    await page.click("#shell-bar .shbar-theme .shbar-choice >> text=Light");
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
    const cols = await page.$$eval("#app-grid .app-card", (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
    check(`320px ${theme}: tiles sit two to a row`, cols === 2, `${cols} columns`);
    await page.click("#shell-bar .shbar-appsbtn");
    await page.click("#shell-bar .shbar-more summary");
    check(`320px ${theme}: Apps menu with More open has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    await page.keyboard.press("Escape");
    await page.click("#shell-bar .shbar-icon[aria-controls$='-theme']");
    check(`320px ${theme}: theme menu open has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
    await page.close();
    ({ page } = await openPortal(context, "/install"));
    check(`320px ${theme}: /install has the app bar and no horizontal scroll`, (await page.isVisible("#shell-bar .shbar-appsbtn")) && (await over(page)) <= 0, `${await over(page)}px`);
    page = await context.newPage();
    await page.goto(PUBLIC + "/");
    await page.waitForSelector(".site-header");
    check(`320px ${theme}: public home has no horizontal scroll`, (await over(page)) <= 0, `${await over(page)}px`);
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
    // one theme choice for the whole site (D92): Dark in the portal bar shows on the public site, and back
    const portal = (await openPortal(context)).page;
    await portal.click("#shell-bar [aria-controls$='-theme']");
    await portal.click("#shell-bar .shbar-theme .shbar-choice >> text=Dark");
    const pub = await context.newPage();
    await pub.goto(PUBLIC + "/about.html");
    await pub.waitForSelector(".site-header .theme-switch");
    check("Dark chosen in the portal bar: the public site opens dark, its switch shows Dark", (await pub.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await pub.getAttribute('.theme-switch button[data-theme="dark"]', "aria-pressed")) === "true");
    await pub.click('.theme-switch button[data-theme="light"]');
    await portal.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check("Light chosen on the public site: the portal follows when its tab comes back", (await portal.evaluate(() => document.documentElement.dataset.theme)) === "light");
    await pub.close(); await portal.close();
    const fetched = seen.filter((u) => u.startsWith(PUBLIC + "/") && (/\/shell\/static\//.test(u) || /\/(me|apps)\.json$/.test(u) || /portal-shell\.js$/.test(u)));
    check("public pages never load the app bar script or identity", fetched.length === 0, fetched);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
