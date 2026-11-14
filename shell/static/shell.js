// 2972 shell kit: the app bar without React or a build step, for landing (a static Caddy site).
// Source of truth: infra/shell/static/shell.js. Same markup and classes as react/AppBar.tsx; change both together.
//
//   <link rel="stylesheet" href="/shell/tokens.css"><link rel="stylesheet" href="/shell/app-bar.css">
//   <script>/* themeInitScript output, inline in <head> */</script>
//   <div id="shell-bar"></div>
//   <script type="module">
//     import { mountAppBar } from "/shell/static/shell.js";
//     mountAppBar(document.getElementById("shell-bar"), { appName: "Gears & Buccaneers", appId: "portal",
//       siteScheme: "https", siteDomain: "2972robotics.com", source: "landing" });
//   </script>
//
// source "landing": tiles from the portal host's /apps.json and groups from /me.json (both behind the proxy
// secret, INTEGRATION §2), filtered here with the same core.js rules. source "shell" (default): /_shell/apps.

import {
  accountHref,
  hasAccountMenu,
  inboxHref,
  signOutHref,
  MODE_COOKIE,
  THEME_CHOICES,
  THEME_COOKIE,
  applyTheme,
  filterByMode,
  iconPath,
  initials,
  parseGroups,
  parseMode,
  portalHref,
  readCookie,
  resolveTheme,
  resolveTiles,
  setModeCookie,
  setTheme,
  splitMore,
} from "../core.js";

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

const themeIcon = (c) => (c === "light" ? "sun" : c === "dark" ? "moon" : "system");
const sr = (text) => h("span", { class: "shbar-sr", text });

// A tile shows its icon and name only; the description is the browser's hover text (title), so nothing is cut off.
function tileEl(t, appId) {
  const title = t.description || null;
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
  if (!t.href) return h("li", null, h("span", { class: "shbar-item is-soon", "aria-disabled": "true", title }, body));
  return h(
    "li",
    null,
    h(
      "a",
      {
        class: "shbar-item",
        href: t.href,
        title,
        "aria-current": t.id === appId ? "page" : null,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      body,
    ),
  );
}

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/**
 * Renders the bar into `root` (replacing its content) and returns { update(opts), destroy() }.
 * opts: appName, appId, siteScheme, siteDomain, user {name,email,groups}, accountMenu (default true for identified non-display users), accountHref, source ("shell" | "landing"),
 * appsUrl, meUrl, tiles (already resolved; skips fetching), skipToId, onThemeChange, showBell, inboxUrl.
 * showBell (default off) fetches the inbox and, when it is available, shows the same same-tab bell as the React bar.
 *
 * The bar is built once and then patched in place (never rebuilt), so focus and in-flight clicks survive
 * every state change.
 */
export function mountAppBar(root, opts) {
  const id = `shbar${++seq}`;
  const site = { scheme: opts.siteScheme, domain: opts.siteDomain };
  const portal = portalHref(site);
  const account = opts.accountHref ?? accountHref(site);
  const state = {
    panel: null,
    moreOpen: false,
    mode: parseMode(readCookie(document.cookie, MODE_COOKIE)),
    theme: resolveTheme(document, window, opts.themeFallback),
    tiles: opts.tiles || null,
    failed: false,
    user: opts.user || null,
    inbox: { available: false, unread: 0 },
  };

  // ---- build once ----
  const appsBtn = h(
    "button",
    { type: "button", class: "shbar-appsbtn", "aria-expanded": "false", "aria-controls": `${id}-apps` },
    icon("apps", 20),
    sr("Apps"),
  );
  const modeChoices = [["build", "Build"], ["competition", "Competition"]].map(([choice, label]) => {
    const button = h("button", { type: "button", "aria-pressed": "false", text: label });
    button.addEventListener("click", () => {
      state.mode = setModeCookie(choice, site);
      renderTiles();
      render();
      button.focus();
    });
    return [choice, button];
  });
  // The panel's body is built once and patched (hidden toggles, list contents), so focus on More survives.
  const retry = h("button", { type: "button", class: "shbar-linkbtn", text: "Try again" });
  retry.addEventListener("click", () => load());
  const loadingNote = h("p", { class: "shbar-note", role: "status", text: "Loading apps…", hidden: true });
  const failedNote = h("p", { class: "shbar-note", role: "status", hidden: true }, "Couldn't load the apps. ", retry);
  const emptyNote = h("p", { class: "shbar-note", text: "No apps here yet. If you just joined, an admin still has to add you to a group.", hidden: true });
  const mainList = h("ul", { class: "shbar-grid", hidden: true });
  const moreCount = h("span", { class: "shbar-morecount", "aria-hidden": "true" });
  const moreSr = sr("");
  const moreBtn = h("button", { type: "button", class: "shbar-morebtn", "aria-expanded": "false", "aria-controls": `${id}-more` },
    h("span", { text: "More" }), moreCount, moreSr, icon("chevron", 16));
  const moreList = h("ul", { id: `${id}-more`, class: "shbar-grid", hidden: true });
  const moreBox = h("div", { class: "shbar-more", hidden: true }, moreBtn, moreList);
  moreBtn.addEventListener("click", () => {
    state.moreOpen = !state.moreOpen;
    renderMore();
  });
  const appsBody = h("div", { style: "display:contents" }, loadingNote, failedNote, emptyNote, mainList, moreBox);
  const appsPanel = h(
    "nav",
    { id: `${id}-apps`, class: "shbar-panel shbar-apps", "aria-label": "All apps", hidden: true },
    h("div", { class: "shbar-panel-head" },
      h("div", { class: "shbar-mode", role: "group", "aria-label": "App mode" }, modeChoices.map(([, button]) => button))),
    appsBody,
  );
  const choices = THEME_CHOICES.map(([c, label]) => {
    const b = h("button", { type: "button", class: "shbar-choice", "aria-pressed": "false" }, icon(themeIcon(c), 18), label);
    b.addEventListener("click", () => {
      setTheme(c, site);
      state.theme = c;
      if (opts.onThemeChange) opts.onThemeChange(c);
      setPanel(null, true);
    });
    return [c, b];
  });
  const chip = h("a", { class: "shbar-chip", href: account, target: "_blank", rel: "noopener noreferrer", title: "Competition mode is on. Change it in Apps or Account.", hidden: true }, h("span", { "aria-hidden": "true" }, h("span", { class: "shbar-chip-short", text: "Comp" }), h("span", { class: "shbar-chip-long", text: "Competition mode" })), sr("Competition mode is on. Change it in Apps or Account (opens in a new tab)."));
  const bellSr = sr("Notifications");
  const bellCount = h("span", { class: "shbar-count", "aria-hidden": "true", hidden: true });
  const bell = h("a", { class: "shbar-icon", href: inboxHref(site), hidden: true }, icon("bell"), bellSr, bellCount);
  const appName = h("span", { class: "shbar-appname" });
  const acctInitials = h("span", { "aria-hidden": "true" });
  const acctLabel = h("span", { class: "shbar-sr" });
  const acct = h("button", { type: "button", class: "shbar-icon shbar-acct", "aria-expanded": "false", "aria-controls": `${id}-account` }, acctInitials, acctLabel);
  const identityName = h("b");
  const identityGroups = h("small");
  const accountLink = h("a", { class: "shbar-choice", href: account, text: "All account settings" });
  const notificationLink = h("a", { class: "shbar-choice", href: `${account.split("#")[0]}#notifications`, text: "Notification settings" });
  const accountPanel = h("div", { id: `${id}-account`, class: "shbar-panel shbar-account", role: "group", "aria-label": "Account", hidden: true },
    h("div", { class: "shbar-identity" }, identityName, identityGroups),
    h("div", { role: "group", "aria-label": "Theme" }, h("p", { class: "shbar-eyebrow", text: "Theme" }), choices.map(([, b]) => b)),
    notificationLink, accountLink, h("a", { class: "shbar-choice", href: signOutHref(site), "data-signout": "", text: "Sign out" }));

  const blurOut = (e) => {
    // Only when focus lands on something else (Tab); a null target is a mouse click, handled by pointerdown.
    if (state.panel && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setPanel(null, false);
  };
  const appsBox = h("div", { class: "shbar-disclosure" }, appsBtn, appsPanel);
  const accountBox = h("div", { class: "shbar-disclosure shbar-end" });
  let accountMounted = false;
  appsBox.addEventListener("focusout", blurOut);
  accountBox.addEventListener("focusout", blurOut);
  appsBtn.addEventListener("click", () => setPanel(state.panel === "apps" ? null : "apps", false));
  acct.addEventListener("click", () => setPanel(state.panel === "account" ? null : "account", false));

  const header = h(
    "header",
    { class: "shbar" },
    opts.skipToId ? h("a", { class: "shbar-skip", href: `#${opts.skipToId}`, text: "Skip to content" }) : null,
    appsBox,
    h("a", { class: "shbar-brand", "aria-label": "Portal home", href: portal }, h("span", { class: "shbar-badge", "aria-hidden": "true", text: "2972" }), sr("Portal home")),
    appName,
    h("span", { class: "shbar-grow" }),
    chip,
    bell,
    accountBox,
  );
  root.textContent = "";
  // The mount wrapper must not become the sticky header's containing block, or the bar scrolls away.
  root.classList.add("shbar-mount");
  root.append(header);

  // ---- patch ----
  function renderTiles() {
    const shown = state.tiles ? filterByMode(state.tiles, state.mode) : [];
    // Core apps first; the "more" tiles sit behind the More row. With no core app, the "more" tiles are the list.
    const { main, rest } = splitMore(shown);
    loadingNote.hidden = !(state.tiles === null && !state.failed);
    failedNote.hidden = !state.failed;
    emptyNote.hidden = !(state.tiles !== null && !state.failed && shown.length === 0);
    mainList.replaceChildren(...main.map((t) => tileEl(t, opts.appId)));
    mainList.hidden = main.length === 0;
    moreList.replaceChildren(...rest.map((t) => tileEl(t, opts.appId)));
    moreBox.hidden = rest.length === 0;
    moreCount.textContent = String(rest.length);
    moreSr.textContent = `, ${rest.length} ${rest.length === 1 ? "app" : "apps"}`;
    renderMore();
  }
  function renderMore() {
    moreBtn.setAttribute("aria-expanded", String(state.moreOpen));
    moreList.hidden = !state.moreOpen;
  }
  function render() {
    const who = (state.user && (state.user.name || state.user.email)) || "";
    appsBtn.setAttribute("aria-expanded", String(state.panel === "apps"));
    appsPanel.hidden = state.panel !== "apps";
    const showAccount = hasAccountMenu(state.user, opts.accountMenu);
    if (!showAccount && state.panel === "account") state.panel = null;
    if (showAccount !== accountMounted) {
      accountBox.replaceChildren(...(showAccount ? [acct, accountPanel] : []));
      accountMounted = showAccount;
    }
    accountBox.hidden = !showAccount;
    acct.hidden = !showAccount;
    acct.setAttribute("aria-expanded", String(state.panel === "account"));
    accountPanel.hidden = !showAccount || state.panel !== "account";
    identityName.textContent = who;
    identityGroups.textContent = state.user?.groups?.join(" · ") || "";
    identityGroups.hidden = !identityGroups.textContent;
    const accountUrl = opts.accountHref ?? accountHref(site);
    accountLink.setAttribute("href", accountUrl);
    notificationLink.setAttribute("href", `${accountUrl.split("#")[0]}#notifications`);
    const unread = state.inbox.unread;
    bell.setAttribute("href", opts.accountHref ? `${String(opts.accountHref).split("#")[0]}#inbox` : inboxHref(site));
    bell.removeAttribute("target");
    bell.removeAttribute("rel");
    bellSr.textContent = `Notifications${unread ? `, ${unread} unread` : ""}`;
    bellCount.textContent = unread > 99 ? "99+" : unread ? String(unread) : "";
    if (unread) bellCount.removeAttribute("hidden");
    else bellCount.setAttribute("hidden", "");
    if (opts.showBell && state.inbox.available) bell.removeAttribute("hidden");
    else bell.setAttribute("hidden", "");
    for (const [choice, button] of modeChoices) button.setAttribute("aria-pressed", String(state.mode === choice));
    for (const [c, b] of choices) b.setAttribute("aria-pressed", String(state.theme === c));
    chip.hidden = state.mode !== "competition";
    appName.textContent = opts.appName || "";
    acctInitials.textContent = initials(state.user && state.user.name, state.user && state.user.email);
    acctLabel.textContent = `Account${who ? `: ${who}` : ""}`;
    acct.title = who ? `Account: ${who}` : "Account";
  }

  async function load() {
    state.failed = false;
    state.tiles = opts.tiles || null;
    renderTiles();
    try {
      if (opts.source === "landing") {
        const [apps, me] = await Promise.all([getJson(opts.appsUrl || "/apps.json"), getJson(opts.meUrl || "/me.json")]);
        const groups = Array.isArray(me.groups) ? me.groups : typeof me.groups === "string" ? me.groups.split("|").map((g) => g.trim()).filter(Boolean) : [];
        if (!state.user) state.user = { name: me.name, email: me.email, groups };
        state.tiles = resolveTiles(apps, parseGroups(groups.join("|")), site);
      } else {
        const d = await getJson(opts.appsUrl || "/_shell/apps");
        state.tiles = Array.isArray(d.tiles) ? d.tiles : [];
      }
    } catch {
      state.failed = true;
    }
    renderTiles();
    render();
  }

  function setPanel(p, focusBack) {
    const was = state.panel;
    state.panel = p;
    // More is closed every time the menu opens.
    if (p === "apps" && was !== "apps") {
      state.moreOpen = false;
      renderMore();
    }
    render();
    if (focusBack && was) (was === "account" ? acct : appsBtn).focus();
  }

  const onKey = (e) => {
    if (e.key === "Escape" && state.panel) {
      e.preventDefault();
      setPanel(null, true);
    }
  };
  const onDown = (e) => {
    if (state.panel && !header.contains(e.target)) setPanel(null, false);
  };
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    const mode = parseMode(readCookie(document.cookie, MODE_COOKIE));
    state.theme = resolveTheme(document, window, opts.themeFallback);
    applyTheme(state.theme);
    if (mode !== state.mode) {
      state.mode = mode;
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

  let inboxKey = "";
  async function loadInbox() {
    if (!opts.showBell) {
      state.inbox = { available: false, unread: 0 };
      inboxKey = "";
      render();
      return;
    }
    const url = opts.inboxUrl || "/_shell/inbox";
    if (inboxKey === url) return;
    inboxKey = url;
    try {
      const d = await getJson(url);
      if (inboxKey !== url) return;
      state.inbox = { available: !!d.available, unread: Number(d.unread) || 0 };
    } catch {
      if (inboxKey === url) state.inbox = { available: false, unread: 0 };
    }
    render();
  }

  render();
  renderTiles();
  if (!state.tiles) load();
  if (opts.showBell) loadInbox();

  return {
    update(more) {
      const refetch = ("showBell" in more && !!more.showBell !== !!opts.showBell) || ("inboxUrl" in more && more.inboxUrl !== opts.inboxUrl);
      Object.assign(opts, more);
      if (more.tiles) state.tiles = more.tiles;
      if ("user" in more) state.user = more.user;
      if (refetch) inboxKey = "";
      renderTiles();
      render();
      if (refetch) loadInbox();
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      root.textContent = "";
    },
  };
}
