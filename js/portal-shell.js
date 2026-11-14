// The protected portal's shared app bar (D101), for every page on portal.SITE_DOMAIN (home and /install).
// Reads /me.json and /apps.json, lets the shell kit filter the tiles by the five site groups (CONVENTIONS §3;
// X-Authentik-Groups is pipe-separated) and resolve their links, then mounts the kit's static bar.
// The same resolved list feeds the home grid, so the Apps menu and the tiles always agree.
// Tile filtering is convenience only: Authentik's bindings are the access control.
// Load as a module after /config.js and /js/components.js (siteBase comes from there).
import { mountAppBar } from "/shell/static/shell.js";
import { parseGroups, resolveTiles, resolveTools } from "/shell/core.js";
import { isDisplayOnly } from "/js/portal-home.js";

export function bindPortalModeChange(onChange, root = document.getElementById("shell-bar")) {
  const listener = (event) => {
    if (event.target?.closest?.(".shbar-mode button")) onChange();
  };
  root.addEventListener("click", listener);
  return () => root.removeEventListener("click", listener);
}

async function getJson(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/**
 * Resolves to { me, groups, tiles, tools, site, display, apps? }, or rejects when /me.json or /apps.json can't be read.
 * `tiles` carry `adminGroup: true` for apps.json entries marked `"group": "admin"` (C1, release 8.1.5): Home draws
 * them in the Admin apps row. `display` is true for the shop screen (`display` and no site group, C9):
 * no bar is mounted for it; the home draws "Pick what this screen shows" and nothing else.
 */
export async function mountPortalShell({ bell = true } = {}) {
  const [me, apps] = await Promise.all([getJson("/me.json"), getJson("/apps.json")]);
  const site = siteBase();
  const rawGroups = Array.isArray(me.groups) ? me.groups : String(me.groups || "").split("|").map((g) => g.trim()).filter(Boolean);
  const groups = parseGroups(rawGroups.join("|"));
  // The Kickoff app has left the suite. Drop it here so a leftover catalog row cannot become a tile.
  const source = (Array.isArray(apps) ? apps : []).filter((x) => x && x.id !== "kickoff" && x.host !== "kickoff");
  // The shop screen: `display` and no site group (an extra Authentik group does not count). `apps` lets the home
  // name an app that refused the screen (?blocked=<id>, C14) from the list itself.
  if (groups.length === 0 && isDisplayOnly(rawGroups)) return { me, groups, tiles: [], tools: [], site, display: true, apps: source };
  // audience is landing's own field (search matches it); the kit drops fields it doesn't use.
  const tiles = resolveTiles(source, groups, site).map((t) => {
    const raw = source.find((x) => x && x.id === t.id) || {};
    const adminGroup = raw.group === "admin";
    return { ...t, audience: typeof raw.audience === "string" ? raw.audience : "", adminGroup, more: adminGroup ? false : t.more };
  });
  const tools = resolveTools(source, groups, site);
  // Kit 0.3.2's bar knows Tools and More only: until the kit 0.4.0 sync, the Admin apps sit under the bar's More.
  const barTiles = tiles.map((t) => (t.adminGroup ? { ...t, more: true } : t));
  // No appId: "portal" is not an app in infra config/apps.json, so no Apps-menu tile is marked current.
  // The bar names the team, the same words the demo uses on Home. The bell reads same-origin /_shell/inbox, which
  // infra's Caddy sends to Account on the portal host (C3); with no inbox there the kit draws no bell.
  mountAppBar(document.getElementById("shell-bar"), {
    appName: "Gears & Buccaneers", siteScheme: site.scheme, siteDomain: site.domain,
    tiles: barTiles, tools, user: { name: me.name, email: me.email, groups: rawGroups }, skipToId: "main", showBell: bell,
  });
  return { me, groups, tiles, tools, site, display: false };
}
