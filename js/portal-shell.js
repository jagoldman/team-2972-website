// The protected portal's shared app bar (D101), for every page on portal.SITE_DOMAIN (home and /install).
// Reads /me.json and /apps.json, lets the shell kit filter the tiles by the five site groups (CONVENTIONS §3;
// X-Authentik-Groups is pipe-separated) and resolve their links, then mounts the kit's static bar.
// The same resolved list feeds the home grid, so the Apps menu and the tiles always agree.
// Tile filtering is convenience only: Authentik's bindings are the access control.
// Load as a module after /config.js and /js/components.js (siteBase comes from there).
import { mountAppBar } from "/shell/static/shell.js";
import { parseGroups, resolveTiles } from "/shell/core.js";

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

// Resolves to { me, groups, tiles, site }, or rejects when /me.json or /apps.json can't be read.
export async function mountPortalShell() {
  const [me, apps] = await Promise.all([getJson("/me.json"), getJson("/apps.json")]);
  const site = siteBase();
  const groups = parseGroups(me.groups);
  // The Kickoff app has left the suite. Drop it here so a leftover catalog row cannot become a tile.
  const source = (Array.isArray(apps) ? apps : []).filter((x) => x && x.id !== "kickoff" && x.host !== "kickoff");
  // audience is landing's own field (search matches it); the kit drops fields it doesn't use.
  const tiles = resolveTiles(source, groups, site).map((t) => {
    const raw = source.find((x) => x && x.id === t.id) || {};
    return { ...t, audience: typeof raw.audience === "string" ? raw.audience : "" };
  });
  // No appId: "portal" is not an app in infra config/apps.json, so no Apps-menu tile is marked current.
  // The bar names the team, the same words the demo uses on Home.
  mountAppBar(document.getElementById("shell-bar"), {
    appName: "Gears & Buccaneers", siteScheme: site.scheme, siteDomain: site.domain,
    tiles, user: { name: me.name, email: me.email }, skipToId: "main",
  });
  return { me, groups, tiles, site };
}
