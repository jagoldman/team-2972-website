// The protected portal's shared app bar (D101), for every page on portal.SITE_DOMAIN (home and /install).
// Reads /me.json and /apps.json, lets the shell kit filter the tiles by the five site groups (CONVENTIONS §3;
// X-Authentik-Groups is pipe-separated) and resolve their links, then mounts the kit's static bar.
// The same resolved list feeds the home grid, so the Apps menu and the tiles always agree.
// Tile filtering is convenience only: Authentik's bindings are the access control.
// Load as a module after /config.js and /js/components.js (siteBase comes from there).
import { mountAppBar } from "/shell/static/shell.js";
import { parseGroups, resolveTiles, resolveTools } from "/shell/core.js";
import { isDisplayOnly } from "/js/portal-home.js";

// The bar tells this tab when it wrote the mode cookie (the kit's "shell:change"; since kit 0.5.1 the only switch in
// the bar is the event-day banner's "Switch to Competition", the menu's Build / Competition switch is on Account).
// A change made in another tab or on Account is followed when the tab comes back (Home's visibilitychange).
// The kit sends the same event when the person picks a theme (Appearance) with the mode unchanged, so `drawnMode()`
// returns the mode Home last drew, and onChange runs only when the event's mode differs from it (8.3.1 review).
// An event without a mode (an older kit) still repaints.
export function bindPortalModeChange(onChange, drawnMode = () => null, win = window) {
  const listener = (event) => {
    const mode = event && event.detail ? event.detail.mode : undefined;
    if (mode && mode === drawnMode()) return;
    onChange();
  };
  win.addEventListener("shell:change", listener);
  return () => win.removeEventListener("shell:change", listener);
}

async function getJson(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/**
 * Resolves to { me, user, groups, tiles, tools, site, display }, or rejects when /me.json or /apps.json can't be
 * read. `tiles` are the kit's resolved tiles: an apps.json entry marked `"group": "admin"` keeps `group: "admin"` (C1,
 * kit 0.4.0), and the bar and Home's rows (the kit's mountHomeGroups) draw it in the Admin apps row. `user` is what the
 * bar and the guide get ({ name, email, groups: the raw groups }). `display` is true for the shop screen (`display`
 * and no site group, C9): no bar is mounted for it; the home draws "Pick what this screen shows" and nothing else.
 */
export async function mountPortalShell({ bell = true } = {}) {
  const [me, apps] = await Promise.all([getJson("/me.json"), getJson("/apps.json")]);
  const site = siteBase();
  const rawGroups = Array.isArray(me.groups) ? me.groups : String(me.groups || "").split("|").map((g) => g.trim()).filter(Boolean);
  const groups = parseGroups(rawGroups.join("|"));
  // The Kickoff app has left the suite. Drop it here so a leftover catalog row cannot become a tile.
  const source = (Array.isArray(apps) ? apps : []).filter((x) => x && x.id !== "kickoff" && x.host !== "kickoff");
  // The shop screen: `display` and no site group (an extra Authentik group does not count). The home names an app
  // that refused the screen from ?blocked=<host label> with its own table (C16), not from this list.
  if (groups.length === 0 && isDisplayOnly(rawGroups)) return { me, groups, tiles: [], tools: [], site, display: true };
  // audience is landing's own field (search matches it); the kit drops fields it doesn't use.
  const tiles = resolveTiles(source, groups, site).map((t) => {
    const raw = source.find((x) => x && x.id === t.id) || {};
    return { ...t, audience: typeof raw.audience === "string" ? raw.audience : "" };
  });
  const tools = resolveTools(source, groups, site);
  const user = { name: me.name, email: me.email, groups: rawGroups };
  // appId "portal": the guide counts a stop on Home (the admin's Admin link, Waiting on you) as on its page; no tile
  // has that id, so no Apps-menu tile is marked current. Kit 0.5.0: the bar says "Home" on the portal, as the demo's.
  // The bell reads same-origin /_shell/inbox, which infra's Caddy sends to Account on the portal host (C3); with no
  // inbox there the kit draws no bell. The event-day banner reads /event.json and /event-status.json (C5, C15).
  mountAppBar(document.getElementById("shell-bar"), {
    appName: "Home", appId: "portal", siteScheme: site.scheme, siteDomain: site.domain,
    tiles, tools, user, skipToId: "main", showBell: bell,
  });
  return { me, user, groups, tiles, tools, site, display: false };
}
