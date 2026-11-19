// 2972 shell kit: the app bar without React or a build step, for landing (a static Caddy site).
// Source of truth: infra/shell/static/shell.js. Same markup and classes as react/AppBar.tsx; change both together.
//
//   <link rel="stylesheet" href="/shell/tokens.css"><link rel="stylesheet" href="/shell/app-bar.css"><link rel="stylesheet" href="/shell/ui.css">
//   <script>/* themeInitScript output, inline in <head> */</script>
//   <div id="shell-bar"></div>
//   <script type="module">
//     import { mountAppBar } from "/shell/static/shell.js";
//     mountAppBar(document.getElementById("shell-bar"), { appName: "Gears & Buccaneers", appId: "portal",
//       siteScheme: "https", siteDomain: "2972robotics.com", source: "landing" });
//   </script>
//
// source "landing": tiles from the portal host's /apps.json and groups from /me.json (both behind the proxy
// secret, INTEGRATION §2), filtered here with the same core.js rules (loadLandingApps). source "shell" (default):
// /_shell/apps. mountAppBar also installs the shared hover description (../tip.js) for opts.tipIds or opts.appId;
// update() follows a new id and destroy() removes it.
// The guide (0.4.0): the Apps button, each tile and the account button carry data-guide; a stop can open the Apps menu
// and a group ("shell:open-apps"); when the guide cookie holds an open stop, the bar loads ../guide.js (only then) and
// resumes it once the tiles are known.
// 0.4.0 (8.1.5): the Apps menu's three rows (Tools with "All tools", Admin apps, More; C1); the bell is a button that
// opens the notices panel (C3); each menu has a × and a scrim behind it (C10); the event-day banner under the bar
// (C5). The portal home's helpers are below the bar: loadLandingApps, mountHomeGroups, mountHomeGuide.
// 0.5.0 (8.3, Ground up): the black bar and the bumper badge; the Apps menu starts with Home, Tools is one link to the
// Tools page, More reads "Team links", no counts on the menu's rows; the account panel shows the role and "Appearance".
// 0.5.1 (8.3.1): the menu's head is "Apps" and the ×, with no Build / Competition switch (it is on Account); Tools is a
// row that opens in place (open to start with) with the person's favourite tools and "All N tools" (shelltoolfavs).

import {
  GROUP_LABELS,
  MENU_GROUPS,
  accountHref,
  eventBanner,
  favouriteTools,
  menuToolsOpen,
  parseEventStatus,
  readToolFavs,
  setMenuToolsOpen,
  hasAccountMenu,
  inboxHref,
  INBOX_READ_ALL,
  inboxAllRead,
  inboxHasUnread,
  inboxMark,
  inboxOrder,
  inboxReadOne,
  isDisplay,
  noticeLine,
  parseInbox,
  signOutHref,
  MODE_COOKIE,
  THEME_CHOICES,
  THEME_COOKIE,
  applyTheme,
  filterByMode,
  iconPath,
  initials,
  installWarm,
  parseGroups,
  parseMode,
  portalHref,
  readCookie,
  readOpenGroups,
  resolveTheme,
  resolveTiles,
  roleLabel,
  resolveTools,
  setGroupOpen,
  setModeCookie,
  setTheme,
  splitGroups,
  toolsHref,
} from "../core.js";
import { installTip } from "../tip.js";
import { installNoticeMenu } from "../notice-menu.js";
import { BAR_TIPS } from "../tip-text.js";
import { guideActive, guideCardWanted, guideClearCookie, guideOpenId, guideRole, readGuide } from "../guide-state.js";

const SVG = "http://www.w3.org/2000/svg";
let seq = 0;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

function icon(name, size = 20) {
  const s = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) s.setAttribute(k, String(v));
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", iconPath(name));
  s.append(p);
  return s;
}

// The guide's layer (../guide.js) is not "outside" the bar: a stop that opened the Apps menu keeps it open.
const inGuide = (n) => !!(n && typeof n.closest === "function" && n.closest("[data-guide-layer]"));

const sr = (text) => h("span", { class: "shbar-sr", text });

// The id of a tile's hidden description (ids from apps.json may hold any character).
const descId = (base, kind, id) => `${base}-${kind}-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;


// A tile shows its icon and name only; the description is its hover description (data-tip, ../tip.js), so nothing
// is cut off, and visually hidden text the tile names in aria-describedby, so a screen reader always has it.
function tileEl(t, appId, base) {
  const tip = t.description || null;
  const did = tip ? descId(base, "d", t.id) : null;
  const desc = tip ? h("span", { id: did, class: "shbar-sr", text: tip }) : null;
  const body = [
    h("span", { class: "shbar-item-ic" }, icon(t.icon)),
    h(
      "span",
      { class: "shbar-item-text" },
      h("b", null, t.name, t.external ? h("span", { "aria-hidden": "true", text: " ↗" }) : null),
      t.href ? sr(" (opens in a new tab)") : null,
      t.comingSoon ? h("small", { text: "Coming soon" }) : null,
    ),
  ];
  if (!t.href) return h("li", null, h("span", { class: "shbar-item is-soon", "aria-disabled": "true", "data-tip": tip, "aria-describedby": did, "data-guide": `tile-${t.id}` }, body), desc);
  return h(
    "li",
    null,
    h(
      "a",
      {
        class: "shbar-item",
        href: t.href,
        "data-tip": tip,
        "aria-describedby": did,
        "data-guide": `tile-${t.id}`,
        "aria-current": t.id === appId ? "page" : null,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      body,
    ),
    desc,
  );
}

// Home, the first tile (0.5.0): the portal, in the same tab (it is the suite's own start page, not another app).
function homeEl(href, appId, base) {
  const did = `${base}-d-home`;
  return h(
    "li",
    null,
    h("a", { class: "shbar-item shbar-home", href, "aria-current": appId === "portal" ? "page" : null, "data-tip": BAR_TIPS.home, "aria-describedby": did, "data-guide": "tile-portal" },
      h("span", { class: "shbar-item-ic" }, icon("home")), h("span", { class: "shbar-item-text" }, h("b", { text: "Home" }))),
    h("span", { id: did, class: "shbar-sr", text: BAR_TIPS.home }),
  );
}

// 0.5.1 (M2): a favourite tool in the Apps menu: a quieter, smaller icon than an app's and the name; same tab (a tool
// lives on this site). The one line is its hover description and, for a screen reader, its description.
function favEl(t, current, base) {
  const tip = t.tip || t.description || null;
  const did = tip ? descId(base, "t", t.id) : null;
  return h(
    "li",
    null,
    h("a", { class: "shbar-item shbar-toolitem", href: t.href, "data-tip": tip, "aria-describedby": did, "aria-current": current ? "page" : null },
      h("span", { class: "shbar-item-ic" }, icon(t.icon, 18)), h("span", { class: "shbar-item-text" }, h("b", { text: t.name }))),
    tip ? h("span", { id: did, class: "shbar-sr", text: tip }) : null,
  );
}

// Is this tool the page the person is on? (M5) The same host and path, a trailing slash aside.
const pathOf = (href) => {
  try {
    const u = new URL(href, location.href);
    return `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return "";
  }
};
const isHere = (href) => typeof location !== "undefined" && pathOf(href) === pathOf(location.href);

// The tip tables' ids: opts.tipIds (one id or a list), else opts.appId.
const tipIdsOf = (opts) => (Array.isArray(opts.tipIds) ? opts.tipIds : [opts.tipIds ?? opts.appId ?? ""]).filter(Boolean);

// The quiet row that opens a group (Admin apps, Team links): the word and a chevron. A real button (D141, D149).
// No count on the row (0.5.0, the demo's Ground up menu).
function groupParts(id, listId) {
  const button = h("button", { type: "button", class: `shbar-groupbtn shbar-${id}btn`, "aria-expanded": "false", "aria-controls": listId, "data-tip": BAR_TIPS[id] },
    h("span", { text: GROUP_LABELS[id] }), icon("chevron", 16));
  return { button };
}

// The menus' × (C10): an icon button named "Close", with its own hover description.
const closeButton = (tipKey, onclick) => h("button", { type: "button", class: "shbar-x", "data-tip": BAR_TIPS[tipKey], onclick }, icon("close", 18), sr("Close"));

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/**
 * Landing's loader (the portal host): /apps.json (the raw catalog) and /me.json, filtered with the core.js rules.
 * Returns { user: { name, email, groups }, groups (site groups), tiles, tools, adminApps }. The bar uses it with
 * source "landing"; the portal home uses it to draw its tiles and rows with the same data. Throws on a failed fetch.
 */
export async function loadLandingApps(opts = {}) {
  const site = { scheme: opts.siteScheme, domain: opts.siteDomain };
  const [apps, me] = await Promise.all([getJson(opts.appsUrl || "/apps.json"), getJson(opts.meUrl || "/me.json")]);
  const raw = Array.isArray(me && me.groups) ? me.groups : typeof (me && me.groups) === "string" ? me.groups.split("|").map((g) => g.trim()).filter(Boolean) : [];
  const groups = parseGroups(raw.join("|"));
  const tiles = resolveTiles(apps, groups, site);
  return {
    user: { name: me && me.name, email: me && me.email, groups: raw },
    groups,
    tiles,
    tools: resolveTools(apps, groups, site),
    adminApps: tiles.filter((t) => t.group === "admin"),
  };
}

/**
 * Renders the bar into `root` (replacing its content) and returns { update(opts), setTabs(el), destroy() }.
 * opts: appName, appId, siteScheme, siteDomain, user {name,email,groups}, accountMenu (default true for identified non-display users), accountHref, source ("shell" | "landing"),
 * appsUrl, meUrl, tiles (already resolved; skips fetching), tools (resolved Tools rows, with tiles), skipToId, onThemeChange, showBell, inboxUrl,
 * inboxReadUrl (default inboxUrl + "/read"), eventBanner (default true), eventUrl (default "/event.json"),
 * eventStatusUrl (default "/event-status.json"),
 * tipIds (the hover description's table ids: one id or a list; default appId),
 * tabs (0.5.0: the app's .shell-tabs element for the bar's tabs slot; or setTabs(el) on the returned object).
 * showBell (default off) fetches the inbox and, when it is available, draws the bell: a button that opens the
 * notices panel (C3).
 *
 * The bar is built once and then patched in place (never rebuilt), so focus and in-flight clicks survive
 * every state change.
 */
export function mountAppBar(root, opts) {
  const id = `shbar${++seq}`;
  const site = { scheme: opts.siteScheme, domain: opts.siteDomain };
  const portal = portalHref(site);
  const account = opts.accountHref ?? accountHref(site);
  // False once a group cookie did not stick (cookies blocked): the page then keeps its own open groups.
  let groupsStick = true;
  // False after destroy(): a request that settles later changes nothing.
  let alive = true;
  const state = {
    panel: null,
    // Tools, Admin apps and More stay open or closed as the person left them, on this device (shellgroups, D149).
    open: [],
    mode: parseMode(readCookie(document.cookie, MODE_COOKIE)),
    theme: resolveTheme(document, window, opts.themeFallback),
    tiles: opts.tiles || null,
    tools: opts.tools || [],
    // 0.5.1: the menu's Tools row (M3: open unless this device closed it) and the favourites' cookie (null = none set).
    toolsOpen: menuToolsOpen(document.cookie),
    favs: readToolFavs(),
    failed: false,
    user: opts.user || null,
    inbox: { available: false, unread: 0, items: [] },
    inboxNote: "",
    event: null,
  };

  // ---- build once ----
  const appsBtn = h(
    "button",
    { type: "button", class: "shbar-appsbtn", "aria-expanded": "false", "aria-controls": `${id}-apps`, "data-tip": BAR_TIPS.apps, "data-guide": "apps" },
    icon("apps", 20),
    sr("Apps"),
  );
  // The panel's body is built once and patched (hidden toggles, list contents), so focus on a group row survives.
  const retry = h("button", { type: "button", class: "shbar-linkbtn", text: "Try again" });
  retry.addEventListener("click", () => load());
  const loadingNote = h("p", { class: "shbar-note", role: "status", text: "Loading apps…", hidden: true });
  const failedNote = h("p", { class: "shbar-note", role: "status", hidden: true }, "Couldn't load the apps. ", retry);
  const emptyNote = h("p", { class: "shbar-note", text: "No apps here yet. If you just joined, an admin still has to add you to a group.", hidden: true });
  const mainList = h("ul", { class: "shbar-grid" });
  // Tools (0.5.1, M2): a row that opens in place, open to start with (M3): the person's favourite tools two to a row,
  // or a line when there are none (M4), then "All N tools", the Tools page. Drawn when the person has a tool in this mode.
  const toolsBtn = h("button", { type: "button", class: "shbar-groupbtn shbar-toolsbtn", "aria-expanded": "true", "aria-controls": `${id}-tools`, "data-tip": BAR_TIPS.tools },
    h("span", { text: GROUP_LABELS.tools }), icon("chevron", 16));
  const favList = h("ul", { class: "shbar-grid shbar-favs" });
  const favNote = h("p", { class: "shbar-note shbar-favnote", text: "Star a tool on the Tools page to keep it here.", hidden: true });
  const allToolsText = h("span");
  const allTools = h("a", { class: "shbar-toolrow shbar-alltools", href: toolsHref(site) }, allToolsText, h("span", { class: "shbar-chev", "aria-hidden": "true", text: "›" }));
  const toolsBody = h("div", { id: `${id}-tools`, class: "shbar-toolsbody" }, favList, favNote, allTools);
  const toolsBox = h("div", { class: "shbar-group shbar-tools", hidden: true }, toolsBtn, toolsBody);
  toolsBtn.addEventListener("click", () => {
    state.toolsOpen = setMenuToolsOpen(!state.toolsOpen, site);
    // Cookies blocked: the choice did not stick, so the page keeps its own state from now on.
    groupsStick = menuToolsOpen(document.cookie) === state.toolsOpen;
    renderGroups();
  });
  // The two rows that open (C1): Admin apps and Team links (two columns of tiles).
  const groups = {};
  for (const g of MENU_GROUPS.filter((x) => x !== "tools")) {
    const parts = groupParts(g, `${id}-${g}`);
    const list = h("ul", { id: `${id}-${g}`, class: "shbar-grid", hidden: true });
    const box = h("div", { class: `shbar-group shbar-${g}`, hidden: true }, parts.button, list);
    parts.button.addEventListener("click", () => {
      state.open = setGroupOpen(g, !state.open.includes(g), site, document, state.open);
      // Cookies blocked: the choice did not stick, so the page keeps its own list from now on.
      groupsStick = readOpenGroups().join(".") === state.open.join(".");
      renderGroups();
    });
    groups[g] = { ...parts, list, box };
  }
  const closeApps = closeButton("closeapps", () => setPanel(null, true));
  const appsBody = h("div", { style: "display:contents" }, loadingNote, failedNote, emptyNote, mainList, toolsBox, groups.adminapps.box, groups.more.box);
  const appsPanel = h(
    "nav",
    { id: `${id}-apps`, class: "shbar-panel shbar-apps", "aria-label": "All apps", hidden: true },
    // M1 (0.5.1): the word "Apps" and the ×; the Build / Competition switch is on the Account page only (B1).
    h("div", { class: "shbar-panel-head" }, h("p", { class: "shbar-panel-title", text: "Apps" }), closeApps),
    appsBody,
  );
  const choices = THEME_CHOICES.map(([c, label]) => {
    const b = h("button", { type: "button", class: "shbar-choice", "aria-pressed": "false" }, label);
    b.addEventListener("click", () => {
      setTheme(c, site);
      state.theme = c;
      if (opts.onThemeChange) opts.onThemeChange(c);
      setPanel(null, true);
    });
    return [c, b];
  });
  const chip = h("a", { class: "shbar-chip", href: account, target: "_blank", rel: "noopener noreferrer", "data-tip": BAR_TIPS.chip, hidden: true }, h("span", { "aria-hidden": "true" }, "Comp", h("span", { class: "shbar-chip-rest", text: "etition" })), sr("Competition mode is on. Change it on your Account page (opens in a new tab)."));

  // ---- the bell (C3): a button and the notices panel ----
  const bellSr = sr("Notifications");
  const bellCount = h("span", { class: "shbar-count", "aria-hidden": "true", hidden: true });
  const bell = h("button", { type: "button", class: "shbar-icon shbar-bell", "aria-expanded": "false", "aria-controls": `${id}-bell`, "data-tip": BAR_TIPS.bell }, icon("bell"), bellSr, bellCount);
  const readAll = h("button", { type: "button", class: "shbar-linkbtn shbar-readall", text: "Mark all read" });
  const noticeList = h("ul", { class: "shbar-notices" });
  const noticeEmpty = h("p", { class: "shbar-note", text: "Nothing yet." });
  const noticeStatus = h("p", { class: "shbar-note", role: "status" });
  const settingsLink = h("a", { class: "shbar-choice", text: "Notification settings" });
  const allLink = h("a", { class: "shbar-choice", text: "All notices" });
  const bellPanel = h("div", { id: `${id}-bell`, class: "shbar-panel shbar-bellpanel", role: "group", "aria-labelledby": `${id}-bell-h`, hidden: true },
    h("div", { class: "shbar-panel-head" }, h("p", { id: `${id}-bell-h`, class: "shbar-panel-title", text: "Notifications" }),
      h("span", { class: "shbar-headacts" }, readAll, closeButton("closebell", () => setPanel(null, true)))),
    noticeStatus, noticeList, noticeEmpty,
    h("div", { class: "shbar-panel-foot" }, settingsLink, allLink));
  readAll.addEventListener("click", () => markAllRead());
  const bellBox = h("div", { class: "shbar-disclosure" }, bell, bellPanel);

  const appName = h("span", { class: "shbar-appname" });
  const acctInitials = h("span", { "aria-hidden": "true" });
  const acctLabel = h("span", { class: "shbar-sr" });
  const acct = h("button", { type: "button", class: "shbar-icon shbar-acct", "aria-expanded": "false", "aria-controls": `${id}-account`, "data-tip": BAR_TIPS.account, "data-guide": "account" }, acctInitials, acctLabel);
  const identityName = h("b");
  const identityGroups = h("small");
  const accountLink = h("a", { class: "shbar-choice", href: account, text: "All account settings" });
  const notificationLink = h("a", { class: "shbar-choice", href: `${account.split("#")[0]}#notifications`, text: "Notification settings" });
  const accountPanel = h("div", { id: `${id}-account`, class: "shbar-panel shbar-account", role: "group", "aria-label": "Account", hidden: true },
    h("div", { class: "shbar-panel-head" }, h("div", { class: "shbar-identity" }, identityName, identityGroups), closeButton("closeaccount", () => setPanel(null, true))),
    h("div", { class: "shbar-appearance", role: "group", "aria-label": "Appearance" }, h("p", { class: "shbar-eyebrow", text: "Appearance" }), choices.map(([, b]) => b)),
    notificationLink, accountLink, h("a", { class: "shbar-choice", href: signOutHref(site), "data-signout": "", text: "Sign out",
      // The guide's progress belongs to this person: it is cleared before the browser leaves.
      onclick: () => { document.cookie = guideClearCookie(site); } }));

  const blurOut = (e) => {
    // Only when focus lands on something else (Tab); a null target is a mouse click, handled by pointerdown.
    if (state.panel && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && !inGuide(e.relatedTarget)) setPanel(null, false);
  };
  const appsBox = h("div", { class: "shbar-disclosure" }, appsBtn, appsPanel);
  const accountBox = h("div", { class: "shbar-disclosure shbar-end" });
  let accountMounted = false;
  appsBox.addEventListener("focusout", blurOut);
  accountBox.addEventListener("focusout", blurOut);
  bellBox.addEventListener("focusout", blurOut);
  appsBtn.addEventListener("click", () => setPanel(state.panel === "apps" ? null : "apps", false));
  acct.addEventListener("click", () => setPanel(state.panel === "account" ? null : "account", false));
  bell.addEventListener("click", () => setPanel(state.panel === "bell" ? null : "bell", false));

  // 0.5.0, the tabs slot: the app's .shell-tabs row (opts.tabs, or setTabs(el) later). From 1024 px it sits in the
  // black bar after the name; below that it hangs under the bar as a white row, and the spacer keeps the page clear.
  const tabsSlot = h("div", { class: "shbar-tabs", hidden: true });
  const tabSpace = h("div", { class: "shbar-tabspace", "aria-hidden": "true", hidden: true });
  function setTabs(el) {
    tabsSlot.replaceChildren(...(el ? [el] : []));
    tabsSlot.hidden = !el;
    tabSpace.hidden = !el;
  }
  const header = h(
    "header",
    { class: "shbar" },
    opts.skipToId ? h("a", { class: "shbar-skip", href: `#${opts.skipToId}`, text: "Skip to content" }) : null,
    appsBox,
    h("a", { class: "shbar-brand", "aria-label": "Portal home", href: portal }, h("span", { class: "shbar-badge", "aria-hidden": "true", text: "2972" }), sr("Portal home")),
    appName,
    tabsSlot,
    h("span", { class: "shbar-grow" }),
    chip,
    bellBox,
    accountBox,
  );
  // The scrim behind an open menu (C10): a press on it closes the menu (it is outside the bar). Not a control of its
  // own: the × and Escape are the keyboard's ways out.
  const scrim = h("div", { class: "shbar-scrim", "aria-hidden": "true", hidden: true });

  // ---- the event-day banner (C5) ----
  const bannerName = h("b");
  const bannerLine = h("span");
  const tba = h("a", { target: "_blank", rel: "noopener noreferrer" }, "The Blue Alliance", h("span", { "aria-hidden": "true", text: " ↗" }), sr(" (opens in a new tab)"));
  const stream = h("a", { target: "_blank", rel: "noopener noreferrer" }, "Livestream", h("span", { "aria-hidden": "true", text: " ↗" }), sr(" (opens in a new tab)"));
  const switchComp = h("button", { type: "button", class: "shbar-bannerbtn", text: "Switch to Competition" });
  switchComp.addEventListener("click", () => {
    state.mode = setModeCookie("competition", site);
    renderTiles();
    render();
    // The button goes away; the focus goes to the event's name, so it is not lost.
    bannerName.tabIndex = -1;
    bannerName.focus();
  });
  const banner = h("div", { class: "shbar-banner", role: "region", "aria-label": "Event today", hidden: true }, bannerName, bannerLine, tba, stream, switchComp);

  root.textContent = "";
  // The mount wrapper must not become the sticky header's containing block, or the bar scrolls away.
  root.classList.add("shbar-mount");
  root.append(header, scrim, tabSpace, banner);
  if (opts.tabs) setTabs(opts.tabs);

  // ---- patch ----
  function renderTiles() {
    const shown = state.tiles ? filterByMode(state.tiles, state.mode) : [];
    // Core apps first; then the rows Tools, Admin apps, More. With no core or admin app, the "more" tiles are the list.
    const { main, admin, rest } = splitGroups(shown);
    loadingNote.hidden = !(state.tiles === null && !state.failed);
    failedNote.hidden = !state.failed;
    emptyNote.hidden = !(state.tiles !== null && !state.failed && shown.length === 0);
    // Home first (0.5.0), then the core apps.
    mainList.replaceChildren(homeEl(portal, opts.appId, id), ...main.map((t) => tileEl(t, opts.appId, id)));
    const tools = filterByMode(state.tools, state.mode);
    toolsBox.hidden = tools.length === 0;
    const favs = favouriteTools(tools, state.favs);
    favList.replaceChildren(...favs.map((t) => favEl(t, opts.appId === "tools" && isHere(t.href), id)));
    favList.hidden = favs.length === 0;
    favNote.hidden = favs.length !== 0;
    allToolsText.textContent = `All ${tools.length} tools`;
    // On the Tools page itself, "All N tools" is the page the person is on (M5).
    if (opts.appId === "tools" && isHere(toolsHref(site))) allTools.setAttribute("aria-current", "page");
    else allTools.removeAttribute("aria-current");
    const lists = { adminapps: admin, more: rest };
    for (const g of Object.keys(groups)) {
      groups[g].list.replaceChildren(...lists[g].map((t) => tileEl(t, opts.appId, id)));
      groups[g].box.hidden = lists[g].length === 0;
    }
    renderGroups();
    renderInbox();
  }
  function renderGroups() {
    toolsBtn.setAttribute("aria-expanded", String(state.toolsOpen));
    toolsBody.hidden = !state.toolsOpen;
    for (const g of Object.keys(groups)) {
      const open = state.open.includes(g);
      groups[g].button.setAttribute("aria-expanded", String(open));
      groups[g].list.hidden = !open;
    }
  }
  // The app that sent a notice, by its tile's name (else nothing).
  function appLabel(app) {
    const t = (state.tiles || []).find((x) => x.id === app) || (state.tools || []).find((x) => x.id === app);
    return t ? t.name : app === "account" ? "Account" : "";
  }
  // 0.5.0 (H3; the demo's Ground up bell): unread first; each row is "Parts, 12 min ago", then the text, then a
  // chevron. A click on an unread notice marks it read (a keepalive POST) and follows its link; a notice without a link
  // is a button that marks it read. The row menu (notice-menu.js) marks it read or unread.
  function renderInbox() {
    const items = inboxOrder(state.inbox.items);
    const ae = document.activeElement;
    const had = ae && ae.getAttribute && bellPanel.contains(ae) ? ae.getAttribute("data-id") : null;
    const rows = new Map();
    noticeList.replaceChildren(...items.map((n) => {
      const label = appLabel(n.app);
      const body = [
        n.read ? null : h("span", { class: "shbar-notice-dot", "aria-hidden": "true" }),
        h("span", { class: "shbar-notice-text" }, n.read ? null : sr("Unread: "), h("span", { class: "shbar-notice-app", text: noticeLine(label, n.at) }), " ", n.text),
        h("span", { class: "shbar-notice-chev", "aria-hidden": "true", text: "›" }),
      ];
      const attrs = { class: "shbar-notice-link", "data-id": n.id, "data-read": String(n.read), "data-tip": n.read ? BAR_TIPS.noticeread : BAR_TIPS.notice, onclick: () => openNotice(n.id) };
      const cls = `shbar-notice${n.read ? "" : " is-unread"}`;
      const row = n.href ? h("a", { ...attrs, href: n.href }, body) : h("button", { ...attrs, type: "button" }, body);
      rows.set(n.id, row);
      return h("li", { class: cls }, row);
    }));
    // A row that was focused keeps the focus when the list is drawn again (it may have moved: unread first).
    if (had && rows.has(had)) rows.get(had).focus();
    noticeList.hidden = items.length === 0;
    noticeEmpty.hidden = items.length !== 0;
    // Offered whenever the server counts an unread notice (as the demo), also one not shown in the panel.
    readAll.hidden = !inboxHasUnread(state.inbox);
    noticeStatus.textContent = state.inboxNote;
    noticeStatus.hidden = !state.inboxNote;
  }
  function render() {
    const who = (state.user && (state.user.name || state.user.email)) || "";
    appsBtn.setAttribute("aria-expanded", String(state.panel === "apps"));
    appsPanel.hidden = state.panel !== "apps";
    const showAccount = hasAccountMenu(state.user, opts.accountMenu);
    if (!showAccount && state.panel === "account") state.panel = null;
    const showBell = !!(opts.showBell && state.inbox.available);
    if (!showBell && state.panel === "bell") state.panel = null;
    if (showAccount !== accountMounted) {
      accountBox.replaceChildren(...(showAccount ? [acct, accountPanel] : []));
      accountMounted = showAccount;
    }
    accountBox.hidden = !showAccount;
    acct.hidden = !showAccount;
    acct.setAttribute("aria-expanded", String(state.panel === "account"));
    accountPanel.hidden = !showAccount || state.panel !== "account";
    identityName.textContent = who;
    identityGroups.textContent = roleLabel(state.user && state.user.groups);
    identityGroups.hidden = !identityGroups.textContent;
    const accountUrl = opts.accountHref ?? accountHref(site);
    const accountBase = String(accountUrl).split("#")[0];
    accountLink.setAttribute("href", accountUrl);
    notificationLink.setAttribute("href", `${accountBase}#notifications`);
    settingsLink.setAttribute("href", `${accountBase}#notifications`);
    allLink.setAttribute("href", opts.accountHref ? `${accountBase}#inbox` : inboxHref(site));
    const unread = state.inbox.unread;
    bellSr.textContent = `Notifications${unread ? `, ${unread} unread` : ""}`;
    bellCount.textContent = unread > 99 ? "99+" : unread ? String(unread) : "";
    if (unread) bellCount.removeAttribute("hidden");
    else bellCount.setAttribute("hidden", "");
    bellBox.hidden = !showBell;
    bell.hidden = !showBell;
    bell.setAttribute("aria-expanded", String(state.panel === "bell"));
    bellPanel.hidden = !showBell || state.panel !== "bell";
    scrim.hidden = !state.panel;
    if (state.panel) header.setAttribute("data-open", "");
    else header.removeAttribute("data-open");
    for (const [c, b] of choices) b.setAttribute("aria-pressed", String(state.theme === c));
    chip.hidden = state.mode !== "competition";
    appName.textContent = opts.appName || "";
    acctInitials.textContent = initials(state.user && state.user.name, state.user && state.user.email);
    acctLabel.textContent = `Account${who ? `: ${who}` : ""}`;
    renderBanner();
  }
  function renderBanner() {
    const ev = state.event;
    banner.hidden = !ev;
    if (!ev) return;
    bannerName.textContent = ev.name;
    bannerLine.textContent = ev.line;
    tba.hidden = !ev.tbaUrl;
    if (ev.tbaUrl) tba.setAttribute("href", ev.tbaUrl);
    stream.hidden = !ev.livestreamUrl;
    if (ev.livestreamUrl) stream.setAttribute("href", ev.livestreamUrl);
    // Not for the shop screen: a display login does not switch modes from a banner.
    switchComp.hidden = state.mode === "competition" || isDisplay(state.user && state.user.groups);
  }

  async function load() {
    state.failed = false;
    state.tiles = opts.tiles || null;
    renderTiles();
    try {
      if (opts.source === "landing") {
        const d = await loadLandingApps({ ...opts, siteScheme: site.scheme, siteDomain: site.domain });
        if (!state.user) state.user = d.user;
        state.tiles = d.tiles;
        state.tools = d.tools;
      } else {
        const d = await getJson(opts.appsUrl || "/_shell/apps");
        state.tiles = Array.isArray(d.tiles) ? d.tiles : [];
        state.tools = Array.isArray(d.tools) ? d.tools : [];
        // An answer that lists the Admin apps only in adminApps (not in tiles) still draws them.
        if (Array.isArray(d.adminApps)) for (const t of d.adminApps) if (t && !state.tiles.some((x) => x.id === t.id)) state.tiles.push({ ...t, group: "admin", more: false });
      }
    } catch {
      state.failed = true;
    }
    if (!alive) return;
    renderTiles();
    render();
    resumeGuide();
  }

  // The guide's hand-off: a stop opened on another page rides in the guide cookie; load the engine only then.
  function resumeGuide() {
    // Never for a person with no guide (alumni, display): their groups are known here once the user is.
    const groups0 = state.user && Array.isArray(state.user.groups) ? state.user.groups : undefined;
    if (!guideOpenId(document.cookie, undefined, groups0) && !guideActive()) return;
    import("../guide.js")
      .then((m) => m.resumeGuide({ appId: opts.appId, siteScheme: opts.siteScheme, siteDomain: opts.siteDomain, user: state.user, tiles: state.tiles || undefined, mode: state.mode }))
      .catch(() => {});
  }
  // A guide stop asks for the Apps menu, and a group in it: open both for this time, without storing the group.
  const onOpenApps = (e) => {
    const g = e && e.detail && e.detail.group;
    if (g === "tools") state.toolsOpen = true;
    else if (MENU_GROUPS.includes(g) && !state.open.includes(g)) state.open = [...state.open, g];
    state.panel = "apps";
    renderGroups();
    render();
  };
  // When that stop closes, the menu closes too and the groups go back to what the person left.
  const onCloseApps = () => {
    if (state.panel === "apps") state.panel = null;
    if (groupsStick) {
      state.open = readOpenGroups();
      state.toolsOpen = menuToolsOpen(document.cookie);
    }
    renderGroups();
    render();
  };
  window.addEventListener("shell:open-apps", onOpenApps);
  window.addEventListener("shell:close-apps", onCloseApps);

  function setPanel(p, focusBack) {
    const was = state.panel;
    state.panel = p;
    if (p !== "bell") noticeMenu.close(false);
    // The groups open as this device left them (another app or tab may have changed it).
    if (p === "apps" && was !== "apps") {
      if (groupsStick) {
        state.open = readOpenGroups();
        state.toolsOpen = menuToolsOpen(document.cookie);
      }
      // The favourites may have changed on the Tools page in another tab.
      state.favs = readToolFavs();
      renderTiles();
    }
    // The notices are fetched again each time the panel opens, so the list is fresh.
    if (p === "bell" && was !== "bell") {
      state.inboxNote = "";
      loadInbox(true);
    }
    render();
    if (focusBack && was) (was === "account" ? acct : was === "bell" ? bell : appsBtn).focus();
  }

  const onKey = (e) => {
    if (e.key === "Escape" && state.panel) {
      e.preventDefault();
      setPanel(null, true);
    }
  };
  // A press outside the bar closes an open menu, but a press on the scrim waits for the scrim's own click (below), so
  // the scrim stays under the finger and the control beneath it never gets that press (C10).
  const onDown = (e) => {
    if (state.panel && e.target !== scrim && !header.contains(e.target) && !inGuide(e.target)) setPanel(null, false);
  };
  scrim.addEventListener("click", () => setPanel(null, false));
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    const mode = parseMode(readCookie(document.cookie, MODE_COOKIE));
    state.theme = resolveTheme(document, window, opts.themeFallback);
    applyTheme(state.theme);
    const favs = readToolFavs();
    if (mode !== state.mode || String(favs) !== String(state.favs)) {
      state.mode = mode;
      state.favs = favs;
      renderTiles();
    }
    render();
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onDown);
  document.addEventListener("visibilitychange", onVis);
  // Another tab of this site changed the theme: setTheme also writes localStorage, which fires "storage" here.
  const onStorage = (e) => {
    if (e.key !== THEME_COOKIE && e.key !== null) return;
    state.theme = resolveTheme(document, window, opts.themeFallback);
    applyTheme(state.theme);
    render();
  };
  window.addEventListener("storage", onStorage);
  // The page (Account) or the banner changed the mode in this tab.
  const onShellChange = (e) => {
    const m = e && e.detail && e.detail.mode;
    if (!m || parseMode(m) === state.mode) return;
    state.mode = parseMode(m);
    renderTiles();
    render();
  };
  window.addEventListener("shell:change", onShellChange);
  // The Tools page pressed a star in this tab (setToolFavs): its own menu follows at once.
  const onFavs = () => {
    state.favs = readToolFavs();
    renderTiles();
  };
  window.addEventListener("shell:toolfavs", onFavs);

  let inboxKey = "";
  async function loadInbox(force = false) {
    if (!opts.showBell) {
      state.inbox = { available: false, unread: 0, items: [] };
      inboxKey = "";
      render();
      return;
    }
    const url = opts.inboxUrl || "/_shell/inbox";
    if (inboxKey === url && !force) return;
    inboxKey = url;
    try {
      const d = await getJson(url);
      if (!alive || inboxKey !== url) return;
      const next = parseInbox(d, site);
      // A refresh that answers "not available" (Account down for a moment) keeps the bell and what it showed.
      if (next.available || !force || !state.inbox.available) state.inbox = next;
    } catch {
      // A failed refresh keeps what the bell showed; a failed first load leaves the bell out.
      if (inboxKey === url && !force) state.inbox = { available: false, unread: 0, items: [] };
    }
    if (!alive) return;
    renderInbox();
    render();
  }
  const readUrl = () => opts.inboxReadUrl || `${opts.inboxUrl || "/_shell/inbox"}/read`;
  const readPost = (body, keepalive) => fetch(readUrl(), { method: "POST", keepalive, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  // A click on a notice (H3): an unread one is marked read at once (the count drops) and the POST is sent with
  // keepalive, so it finishes after the page leaves; the link is then followed as usual (no preventDefault, so
  // Cmd-click and Ctrl-click still open a new tab). A failure is silent: the person has left, and the panel shows the
  // true state the next time it opens.
  function openNotice(id) {
    const n = state.inbox.items.find((x) => x.id === id);
    if (!n || n.read) return;
    readPost(inboxReadOne(id), true).catch(() => {});
    state.inbox = inboxMark(state.inbox, id, true);
    renderInbox();
    render();
  }
  // The row menu's "Mark as unread" / "Mark as read" (H3): only a 204 changes the notice.
  async function flipNotice(id, read) {
    let ok = false;
    try {
      ok = (await readPost(inboxReadOne(id, read), false)).status === 204;
    } catch {
      ok = false;
    }
    if (!alive) return false;
    if (ok) {
      state.inbox = inboxMark(state.inbox, id, read);
      state.inboxNote = "";
      renderInbox();
      render();
    }
    return ok;
  }
  const noticeMenu = installNoticeMenu(bellPanel, {
    flip: flipNotice,
    onFailed: (text) => {
      noticeStatus.textContent = text;
      noticeStatus.hidden = false;
    },
  });

  // "Mark all read" (C15): POST /_shell/inbox/read { all: true }; only a 204 is success (an adapter answers 200 with
  // { available: false } when Account fails, and then nothing was saved). Disabled while the request runs; it keeps
  // the focus (aria-disabled, not disabled).
  let marking = false;
  async function markAllRead() {
    if (marking || !inboxHasUnread(state.inbox)) return;
    marking = true;
    readAll.setAttribute("aria-disabled", "true");
    let ok = false;
    try {
      const r = await readPost(INBOX_READ_ALL, false);
      ok = r.status === 204;
    } catch {
      ok = false;
    }
    marking = false;
    if (!alive) return;
    readAll.removeAttribute("aria-disabled");
    if (ok) {
      state.inbox = inboxAllRead(state.inbox);
      state.inboxNote = "All marked read.";
    } else {
      state.inboxNote = "Couldn't mark them read. Try again.";
    }
    renderInbox();
    render();
    // The button is gone once nothing is unread: keep the focus in the panel.
    if (readAll.hidden && !bellPanel.contains(document.activeElement)) {
      noticeStatus.tabIndex = -1;
      noticeStatus.focus();
    }
  }

  // The event-day banner: same-origin /event.json (Calendar's public current event); quiet when there is none. Only
  // when it is drawn, /event-status.json (Competition, C15) adds the pit and the rank; no answer adds nothing, once.
  async function loadEvent() {
    if (opts.eventBanner === false) return;
    let ev = null;
    try {
      ev = await getJson(opts.eventUrl || "/event.json");
    } catch {
      ev = null;
    }
    state.event = eventBanner(ev);
    if (!alive) return;
    renderBanner();
    if (!state.event) return;
    let status = null;
    try {
      status = parseEventStatus(await getJson(opts.eventStatusUrl || "/event-status.json"));
    } catch {
      status = null;
    }
    if (!alive || !status) return;
    state.event = eventBanner(ev, null, status);
    renderBanner();
  }

  let tipKey = JSON.stringify(tipIdsOf(opts));
  let removeTip = installTip(tipIdsOf(opts));
  // Warm the next app (0.5.0, D187-1): a preconnect to this site's host under the pointer, the finger or the focus.
  const removeWarm = installWarm(site);
  render();
  renderTiles();
  if (!state.tiles) load();
  else resumeGuide();
  if (opts.showBell) loadInbox();
  loadEvent();

  return {
    /** Puts the app's tab row (its .shell-tabs element) in the bar's slot; null takes it out. */
    setTabs,
    update(more) {
      const refetch = ("showBell" in more && !!more.showBell !== !!opts.showBell) || ("inboxUrl" in more && more.inboxUrl !== opts.inboxUrl);
      Object.assign(opts, more);
      // A new app id (or tip ids) moves the tip to the new tables: install the new one before undoing the old.
      const nextKey = JSON.stringify(tipIdsOf(opts));
      if (nextKey !== tipKey) {
        const undoOld = removeTip;
        removeTip = installTip(tipIdsOf(opts));
        undoOld();
        tipKey = nextKey;
      }
      if (more.tiles) state.tiles = more.tiles;
      if (more.tools) state.tools = more.tools;
      if ("user" in more) state.user = more.user;
      if (refetch) inboxKey = "";
      renderTiles();
      render();
      if (refetch) loadInbox();
      if (more.tiles || "user" in more) resumeGuide();
    },
    destroy() {
      alive = false;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("shell:open-apps", onOpenApps);
      window.removeEventListener("shell:close-apps", onCloseApps);
      window.removeEventListener("shell:change", onShellChange);
      window.removeEventListener("shell:toolfavs", onFavs);
      noticeMenu.destroy();
      removeWarm();
      removeTip();
      root.textContent = "";
    },
  };
}

// ---------- the portal home (landing), with the kit's own markup and cookie ----------

/**
 * The portal home's three rows under the app tiles (C1; the demo's .homegroups, groupRow, toolsGroup, adminGroup):
 * Tools (0.5.1, M6: the person's favourite tools, a row each, then "All N tools"; with no favourite, the line "Star a
 * tool on the Tools page to keep it here."), Admin apps and More (links that open in a new tab). Each is one quiet row
 * (name, count, chevron), a real button with aria-expanded, closed until opened; open or closed is remembered in the
 * same `shellgroups` cookie as the bar's Apps menu (ids tools, adminapps, more). A row with nothing in it is not drawn.
 * Made to replace landing's own js/portal-groups.js whole: the same calls, markup, class names and list ids.
 *
 *   const rows = mountHomeGroups(document.getElementById("home-groups"), { site });
 *   rows.update({ tools, adminApps, more, allToolsHref }); // lists already filtered by mode, drawn as given
 *   rows.update({ tiles, tools, mode });                   // or (landing): the resolved tiles and every tool; the kit
 *                                                          // splits and filters them and draws the favourites (M6)
 *   const n = rows.filter("cad");                          // search: matching entries only; returns how many
 *
 * opts: { site } or { siteScheme, siteDomain }, and optionally the first lists (as update). filter(text) (lower-case
 * text, "" for none) hides what does not match and opens a row that has a match without saving it as open; "" puts the
 * rows back as the person left them. Each link carries data-guide="tile-<id>" (the guide's admin stop rings Home's
 * Admin) and data-q (the words search looks in). The guide opens a row for one stop with the window event
 * "shell:open-home-group" ({ detail: { group } }), never saved, and "shell:close-home-group" puts it back.
 * Returns { update(lists), filter(text), destroy() }. Styles: .homegroups (landing) or .shell-homegroups (ui.css).
 */
export function mountHomeGroups(root, opts = {}) {
  const site = opts.site && opts.site.domain ? opts.site : { scheme: opts.siteScheme, domain: opts.siteDomain };
  let open = readOpenGroups();
  let stick = true;
  let query = "";
  let guideOpen = null; // a row the guide opened for one stop
  let lists = { tools: [], allCount: 0, adminApps: [], more: [], allToolsHref: "" };
  let last = null; // the last update({ tiles, … }), drawn again when the favourites change
  for (const c of ["homegroups", "shell-homegroups"]) root.classList.add(c);

  // Each drawn row: its id, button, body and searchable entries ([the element with data-q, the element to hide, counts]).
  let rows = [];
  let items = [];
  function show(row, on) {
    row.btn.setAttribute("aria-expanded", String(on));
    row.body.hidden = !on;
  }
  const isOpen = (id) => open.includes(id) || guideOpen === id;
  const entry = (el, hideEl, counts = true) => {
    items.push([el, hideEl, counts]);
    return hideEl;
  };
  function tool(t) {
    const a = h("a", { class: "toolrow", href: t.href, "data-tip": t.tip || null, "data-q": `${t.name} ${t.description || ""} tools`.toLowerCase() },
      h("span", { class: "ic" }, icon(t.icon, 18)), h("span", null, h("b", { text: t.name }), t.description ? h("small", { text: t.description }) : null));
    return entry(a, a);
  }
  function link(t) {
    const kids = [h("span", { class: "more-ico" }, icon(t.icon, 18)), h("b", null, t.name, t.external ? h("span", { class: "ext", text: " ↗" }) : null)];
    const q = `${t.name} ${t.description || ""} ${t.audience || ""}`.toLowerCase();
    const el = t.href
      ? h("a", { href: t.href, target: "_blank", rel: "noopener noreferrer", "data-tip": t.tip || t.description || null, "data-guide": `tile-${t.id}`, "data-q": q },
        kids, h("span", { class: "vh shell-sr", text: " (opens in a new tab)" }))
      : h("span", { class: "coming-soon", "data-q": q }, kids, h("span", { class: "status-dot", text: "Coming soon" }));
    return entry(el, h("li", null, el));
  }
  function group(id, count, content) {
    const mine = items;
    items = [];
    const body = h("div", { class: "grpbody", id: `grp-home-${id}` }, content);
    const btn = h("button", { type: "button", class: "grphead", id: `grp-home-${id}-btn`, "aria-controls": `grp-home-${id}`, "data-tip": id === "adminapps" ? BAR_TIPS.adminapps : null },
      h("span", { class: "grpname", text: GROUP_LABELS[id] }), h("span", { class: "tcount", text: String(count) }), h("span", { class: "grpchev", "aria-hidden": "true" }, icon("chevron", 16)));
    const grp = h("div", { class: "grp", "data-grp": id, id: id === "more" ? "more-apps" : `${id}-group` }, btn, body);
    const row = { id, grp, btn, body, items: mine };
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-expanded") !== "true";
      show(row, on);
      if (guideOpen === id && !on) guideOpen = null;
      // While a search is on, a row opened or closed by hand is not remembered.
      if (!query) {
        open = setGroupOpen(id, on, site, document, open);
        stick = readOpenGroups().join(".") === open.join(".");
      }
    });
    show(row, isOpen(id));
    rows.push(row);
    return grp;
  }
  function allTools(href, n) {
    const a = h("a", { class: "toolrow all", href, "data-q": "all tools" }, h("span", { text: `All ${n} tools` }), h("span", { class: "chev", "aria-hidden": "true", text: "›" }));
    return entry(a, a, false);
  }
  function draw() {
    const { tools, allCount, adminApps, more, allToolsHref } = lists;
    rows = [];
    items = [];
    const out = [];
    // Each list is built before its row, so the row takes the entries just made.
    if (allCount) {
      const note = tools.length ? null : h("p", { class: "grpnote", text: "Star a tool on the Tools page to keep it here." });
      const list = h("div", { class: "toollist", id: "tools-list" }, tools.map(tool), note, allToolsHref ? allTools(allToolsHref, allCount) : null);
      out.push(group("tools", allCount, list));
    }
    if (adminApps.length) {
      const list = h("ul", { class: "morelinks", id: "admin-list" }, adminApps.map(link));
      out.push(group("adminapps", adminApps.length, list));
    }
    if (more.length) {
      const list = h("ul", { class: "morelinks", id: "more-list" }, more.map(link));
      out.push(group("more", more.length, list));
    }
    root.replaceChildren(...out);
    root.hidden = out.length === 0;
    if (query) filter(query);
  }
  function update(more = {}) {
    if (Array.isArray(more.tiles)) {
      const mode = parseMode(more.mode || readCookie(document.cookie, MODE_COOKIE));
      // The same split as the page's tiles: a person with only "more" tiles has them as Home's tiles, not in More too.
      const { admin, rest } = splitGroups(filterByMode(more.tiles, mode));
      const all = filterByMode(more.tools || [], mode);
      last = more;
      lists = {
        tools: favouriteTools(all, readToolFavs()),
        allCount: all.length,
        adminApps: admin,
        more: rest,
        allToolsHref: more.allToolsHref ?? toolsHref(site),
      };
    } else {
      last = null;
      const tools = more.tools || [];
      lists = { tools, allCount: tools.length, adminApps: more.adminApps || [], more: more.more || [], allToolsHref: more.allToolsHref || "" };
    }
    draw();
  }
  function filter(text) {
    query = text || "";
    let matches = 0;
    for (const row of rows) {
      let here = 0;
      for (const [el, hideEl, counts] of row.items) {
        hideEl.hidden = !!query && !el.getAttribute("data-q").includes(query);
        if (!hideEl.hidden && counts) here++;
      }
      matches += here;
      row.grp.hidden = !!query && here === 0;
      show(row, query ? here > 0 : isOpen(row.id));
    }
    return matches;
  }
  // The guide's admin stop opens Home's Admin apps row for this time only.
  const onOpen = (e) => {
    const g = e && e.detail && e.detail.group;
    if (!MENU_GROUPS.includes(g)) return;
    guideOpen = g;
    const row = rows.find((x) => x.id === g);
    if (row) show(row, true);
  };
  const onClose = () => {
    guideOpen = null;
    if (!query) for (const row of rows) show(row, open.includes(row.id));
  };
  // Another tab or the bar changed the rows: follow the cookie when the page comes back.
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    // The favourites may have changed on the Tools page.
    if (last) {
      const before = lists.tools.map((t) => t.id).join(".");
      const all = filterByMode(last.tools || [], parseMode(last.mode || readCookie(document.cookie, MODE_COOKIE)));
      if (favouriteTools(all, readToolFavs()).map((t) => t.id).join(".") !== before) update(last);
    }
    if (!stick) return;
    open = readOpenGroups();
    if (!query) for (const row of rows) show(row, isOpen(row.id));
  };
  window.addEventListener("shell:open-home-group", onOpen);
  window.addEventListener("shell:close-home-group", onClose);
  document.addEventListener("visibilitychange", onVis);
  if (opts.tiles || opts.tools || opts.adminApps || opts.more) update(opts);
  else draw();
  return {
    update,
    filter,
    destroy() {
      window.removeEventListener("shell:open-home-group", onOpen);
      window.removeEventListener("shell:close-home-group", onClose);
      document.removeEventListener("visibilitychange", onVis);
      root.replaceChildren();
    },
  };
}

/**
 * The guide's "Get started" card on the portal home (C2): draws into `root` (the page's `<div data-guide-card>`)
 * only while the person's guide is wanted, so a finished, hidden or absent guide never loads the engine. It also
 * resumes a stop that is open for Home (Start the tour again, the admin and wait stops), so Home needs no bar.
 * opts: { user: { name, groups }, tiles, mode, siteScheme, siteDomain, eventDay }. Returns { update(opts), destroy() }
 * at once; the engine loads in the background.
 * 0.5.0 (Ground up): the card is quiet (a section under a rule, no box, no progress bar), so it fits Home's side
 * column under the apps as well as the main column: put `root` where the page wants it. `eventDay: true` (an event is
 * on today; Home already knows from /event.json) hides it: on an event day the person's job comes first, not the tour.
 * update({ eventDay }) hides or shows it again; a stop that is open for Home still opens.
 */
export function mountHomeGuide(root, opts = {}) {
  let card = null;
  let gone = false;
  let loading = false;
  const groups = opts.user && Array.isArray(opts.user.groups) ? opts.user.groups : [];
  const wanted = () => guideCardWanted(readGuide(document.cookie, Date.now(), guideRole(groups)), groups);
  const openForHome = () => !!guideOpenId(document.cookie, undefined, groups);
  function show() {
    if (gone || loading || card) return;
    // The card is wanted (and this is not an event day), or a stop is open for Home (a person with no bar on the page
    // still gets it).
    const drawCard = !opts.eventDay && wanted();
    if (!drawCard && !openForHome()) return;
    loading = true;
    import("../guide.js")
      .then((m) => {
        loading = false;
        if (gone) return;
        if (drawCard && !opts.eventDay) card = m.mountGuideCard(root, { appId: "portal", ...opts });
        // Home may have no bar (the shop screen's home): the card resumes an open stop itself (safe twice).
        m.resumeGuide({ appId: "portal", ...opts });
      })
      .catch(() => {
        loading = false;
      });
  }
  root.hidden = !!opts.eventDay;
  show();
  return {
    update(more = {}) {
      Object.assign(opts, more);
      if ("eventDay" in more) {
        root.hidden = !!opts.eventDay;
        if (opts.eventDay && card) {
          card.destroy();
          card = null;
        } else if (!opts.eventDay) show();
      }
      if (card) card.update(more);
    },
    destroy() {
      gone = true;
      if (card) card.destroy();
      card = null;
    },
  };
}
