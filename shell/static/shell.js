// 2972 shell kit: the app bar without React or a build step, for landing (a static Caddy site).
// Source of truth: infra/shell/static/shell.js. Same markup and classes as react/AppBar.tsx; change both together.
//
//   <link rel="stylesheet" href="/shell/tokens.css"><link rel="stylesheet" href="/shell/app-bar.css">
//   <script>/* themeInitScript output, inline in <head> */</script>
//   <div id="shell-bar"></div>
//   <script type="module">
//     import { mountAppBar } from "/shell/static/shell.js";
//     mountAppBar(document.getElementById("shell-bar"), { appName: "Portal", appId: "portal",
//       siteScheme: "https", siteDomain: "2972robotics.com", source: "landing" });
//   </script>
//
// source "landing": tiles from the portal host's /apps.json and groups from /me.json (both behind the proxy
// secret, INTEGRATION §2), filtered here with the same core.js rules. source "shell" (default): /_shell/apps.

import {
  MODE_COOKIE,
  THEME_CHOICES,
  THEME_COOKIE,
  applyTheme,
  filterByMode,
  iconPath,
  initials,
  parseGroups,
  parseMode,
  parseTheme,
  portalHref,
  readCookie,
  resolveTheme,
  resolveTiles,
  setModeCookie,
  setTheme,
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

function tileEl(t, appId) {
  const body = [
    h("span", { class: "shbar-item-ic" }, icon(t.icon)),
    h(
      "span",
      { class: "shbar-item-text" },
      h("b", null, t.name, t.external ? h("span", { "aria-hidden": "true", text: " ↗" }) : null),
      t.href ? sr(" (opens in a new tab)") : null,
      h("small", { text: t.comingSoon ? "Coming soon" : t.description }),
    ),
  ];
  if (!t.href) return h("li", null, h("span", { class: "shbar-item is-soon", "aria-disabled": "true" }, body));
  return h(
    "li",
    null,
    h(
      "a",
      {
        class: "shbar-item",
        href: t.href,
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
 * opts: appName, appId, siteScheme, siteDomain, user {name,email}, accountHref, source ("shell" | "landing"),
 * appsUrl, meUrl, tiles (already resolved; skips fetching), skipToId, onThemeChange.
 *
 * The bar is built once and then patched in place (never rebuilt), so focus and in-flight clicks survive
 * every state change.
 */
export function mountAppBar(root, opts) {
  const id = `shbar${++seq}`;
  const site = { scheme: opts.siteScheme, domain: opts.siteDomain };
  const portal = portalHref(site);
  const account = opts.accountHref || portal;
  const state = {
    panel: null,
    mode: parseMode(readCookie(document.cookie, MODE_COOKIE)),
    theme: resolveTheme(document, window, opts.themeFallback),
    tiles: opts.tiles || null,
    failed: false,
    user: opts.user || null,
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
  const appsBody = h("div", { style: "display:contents" });
  const appsPanel = h(
    "nav",
    { id: `${id}-apps`, class: "shbar-panel shbar-apps", "aria-label": "All apps", hidden: true },
    h("div", { class: "shbar-panel-head" },
      h("div", { class: "shbar-mode", role: "group", "aria-label": "App mode" }, modeChoices.map(([, button]) => button)),
      h("a", { class: "shbar-linkbtn", href: account, target: "_blank", rel: "noopener noreferrer" }, "Account settings", sr(" (opens in a new tab)")),
      h("a", { class: "shbar-btn", href: portal, target: "_blank", rel: "noopener noreferrer" }, "Portal home", sr(" (opens in a new tab)"))),
    appsBody,
  );
  const themeIconBox = h("span", { style: "display:contents" });
  const themeLabel = h("span", { class: "shbar-sr" });
  const themeBtn = h("button", { type: "button", class: "shbar-icon", "aria-expanded": "false", "aria-controls": `${id}-theme` }, themeIconBox, themeLabel);
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
  const themePanel = h(
    "div",
    { id: `${id}-theme`, class: "shbar-panel shbar-theme", role: "group", "aria-label": "Theme", hidden: true },
    h("p", { class: "shbar-eyebrow", text: "Theme, shared by every 2972 app" }),
    choices.map(([, b]) => b),
  );
  const chip = h("a", { class: "shbar-chip", href: account, target: "_blank", rel: "noopener noreferrer", title: "Competition mode is on. Change it in Apps or Account.", hidden: true }, h("span", { "aria-hidden": "true" }, h("span", { class: "shbar-chip-short", text: "Comp" }), h("span", { class: "shbar-chip-long", text: "Competition mode" })), sr("Competition mode is on. Change it in Apps or Account (opens in a new tab)."));
  const appName = h("span", { class: "shbar-appname" });
  const acctInitials = h("span", { "aria-hidden": "true" });
  const acctLabel = h("span", { class: "shbar-sr" });
  const acct = h("a", { class: "shbar-icon shbar-acct", href: account, target: "_blank", rel: "noopener noreferrer" }, acctInitials, acctLabel);

  const blurOut = (e) => {
    // Only when focus lands on something else (Tab); a null target is a mouse click, handled by pointerdown.
    if (state.panel && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setPanel(null, false);
  };
  const appsBox = h("div", { class: "shbar-disclosure" }, appsBtn, appsPanel);
  const themeBox = h("div", { class: "shbar-disclosure shbar-end" }, themeBtn, themePanel);
  appsBox.addEventListener("focusout", blurOut);
  themeBox.addEventListener("focusout", blurOut);
  appsBtn.addEventListener("click", () => setPanel(state.panel === "apps" ? null : "apps", false));
  themeBtn.addEventListener("click", () => setPanel(state.panel === "theme" ? null : "theme", false));

  const header = h(
    "header",
    { class: "shbar" },
    opts.skipToId ? h("a", { class: "shbar-skip", href: `#${opts.skipToId}`, text: "Skip to content" }) : null,
    appsBox,
    h("a", { class: "shbar-brand", href: portal, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "shbar-badge", "aria-hidden": "true", text: "2972" }), sr("Team 2972 portal (opens in a new tab)")),
    appName,
    h("span", { class: "shbar-grow" }),
    chip,
    themeBox,
    acct,
  );
  root.textContent = "";
  // The mount wrapper must not become the sticky header's containing block, or the bar scrolls away.
  root.classList.add("shbar-mount");
  root.append(header);

  // ---- patch ----
  function renderTiles() {
    const moreOpen = appsBody.querySelector("details")?.open ?? false;
    const shown = state.tiles ? filterByMode(state.tiles, state.mode) : [];
    const isMore = (tile) => tile.more || tile.external || tile.id === "handbook";
    const main = shown.filter((tile) => !isMore(tile));
    const more = shown.filter(isMore);
    const retry = h("button", { type: "button", class: "shbar-linkbtn", text: "Try again" });
    retry.addEventListener("click", load);
    appsBody.replaceChildren(
      ...[
        state.tiles === null && !state.failed ? h("p", { class: "shbar-note", role: "status", text: "Loading apps…" }) : null,
        state.failed ? h("p", { class: "shbar-note", role: "status" }, "Couldn't load the apps. ", retry) : null,
        state.tiles !== null && !state.failed && shown.length === 0 ? h("p", { class: "shbar-note", text: "No apps here yet. If you just joined, an admin still has to add you to a group." }) : null,
        main.length ? h("ul", { class: "shbar-grid" }, main.map((t) => tileEl(t, opts.appId))) : null,
        more.length ? h("details", { class: "shbar-more", open: moreOpen },
          h("summary", { id: `${id}-more`, text: "More" }),
          h("ul", { class: "shbar-grid", "aria-labelledby": `${id}-more` }, more.map((tile) => tileEl(tile, opts.appId))),
        ) : null,
      ].filter(Boolean),
    );
  }
  function render() {
    const who = (state.user && (state.user.name || state.user.email)) || "";
    appsBtn.setAttribute("aria-expanded", String(state.panel === "apps"));
    appsPanel.hidden = state.panel !== "apps";
    themeBtn.setAttribute("aria-expanded", String(state.panel === "theme"));
    themePanel.hidden = state.panel !== "theme";
    for (const [choice, button] of modeChoices) button.setAttribute("aria-pressed", String(state.mode === choice));
    themeIconBox.replaceChildren(icon(themeIcon(state.theme)));
    themeLabel.textContent = `Theme: ${(THEME_CHOICES.find(([c]) => c === state.theme) || [])[1] || "Match my device"}`;
    for (const [c, b] of choices) b.setAttribute("aria-pressed", String(state.theme === c));
    chip.hidden = state.mode !== "competition";
    appName.textContent = opts.appName || "";
    acctInitials.textContent = initials(state.user && state.user.name, state.user && state.user.email);
    acctLabel.textContent = `Account${who ? `: ${who}` : ""} (opens in a new tab)`;
    acct.title = who ? `Account: ${who}` : "Account";
  }

  async function load() {
    state.failed = false;
    state.tiles = opts.tiles || null;
    renderTiles();
    try {
      if (opts.source === "landing") {
        const [apps, me] = await Promise.all([getJson(opts.appsUrl || "/apps.json"), getJson(opts.meUrl || "/me.json")]);
        if (!state.user) state.user = { name: me.name, email: me.email };
        state.tiles = resolveTiles(apps, parseGroups(me.groups), site);
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
    render();
    if (focusBack && was) (was === "theme" ? themeBtn : appsBtn).focus();
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

  render();
  renderTiles();
  if (!state.tiles) load();

  return {
    update(more) {
      Object.assign(opts, more);
      if (more.tiles) state.tiles = more.tiles;
      if (more.user) state.user = more.user;
      renderTiles();
      render();
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
