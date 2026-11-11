// 2972 shell kit: shared logic for the app bar (React and static builds) and the /_shell routes.
// Source of truth: infra/shell/core.js. Plain ES module, no dependencies, safe in the browser, in Node and in
// Next.js server and client code. Types: core.d.ts.

/** The only groups that count (CONVENTIONS §3). Anything else in X-Authentik-Groups is ignored. */
export const SITE_GROUPS = Object.freeze(["admin", "mentor", "student", "parent", "alumni"]);
export const MODES = Object.freeze(["build", "competition"]);
export const THEME_COOKIE = "theme";
export const MODE_COOKIE = "mode";
/** 400 days, the longest a browser keeps a cookie (INTEGRATION §9b). */
export const COOKIE_MAX_AGE = 34560000;

/** Pipe-separated X-Authentik-Groups → the site groups in it, in a stable order. */
export function parseGroups(header) {
  if (typeof header !== "string" || header === "") return [];
  const have = new Set(header.split("|").map((g) => g.trim()));
  return SITE_GROUPS.filter((g) => have.has(g));
}

/**
 * May a person with these site groups see this tile? (INTEGRATION §8)
 * `groups: []` means anyone with at least one site group; nobody without a site group sees any tile.
 * Convenience only: Authentik's bindings are the real access control.
 */
export function tileAllowed(tile, groups) {
  if (!tile || !Array.isArray(groups) || groups.length === 0) return false;
  const want = Array.isArray(tile.groups) ? tile.groups : [];
  if (want.length === 0) return true;
  return want.some((g) => groups.includes(g));
}

/** Modes a tile shows in. No `modes` field means both (so older apps.json entries never disappear). */
export function tileModes(tile) {
  const m = Array.isArray(tile && tile.modes) ? tile.modes.filter((x) => MODES.includes(x)) : [];
  return m.length ? m : MODES.slice();
}

function cleanPath(p) {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

/** Where a tile goes, or null for comingSoon or a malformed tile. */
export function tileHref(tile, site) {
  if (!tile || tile.comingSoon) return null;
  const base = `${site.scheme}://`;
  if (typeof tile.host === "string" && /^[a-z0-9-]+$/.test(tile.host)) {
    return `${base}${tile.host}.${site.domain}${tile.path ? cleanPath(tile.path) : "/"}`;
  }
  if (typeof tile.url === "string") return /^https:\/\//.test(tile.url) ? tile.url : null;
  if (typeof tile.path === "string") return `${base}${site.domain}${cleanPath(tile.path)}`;
  return null;
}

/** The portal home, built from the environment (never a fixed address; CONVENTIONS §1). */
export function portalHref(site) {
  return `${site.scheme}://portal.${site.domain}/`;
}

/**
 * apps.json + the person's groups → the tiles for the Apps menu, already resolved to links.
 * Tiles are kept for both modes; the bar filters by mode (filterByMode) so a mode change needs no refetch.
 */
export function resolveTiles(appsJson, groups, site) {
  if (!Array.isArray(appsJson)) return [];
  const out = [];
  for (const t of appsJson) {
    if (!t || typeof t.id !== "string" || typeof t.name !== "string") continue;
    if (!tileAllowed(t, groups)) continue;
    const href = tileHref(t, site);
    if (!href && !t.comingSoon) continue;
    out.push({
      id: t.id,
      name: t.name,
      description: typeof t.description === "string" ? t.description : "",
      href,
      external: typeof t.url === "string",
      comingSoon: !!t.comingSoon,
      more: !!t.more || typeof t.url === "string" || t.id === "handbook",
      icon: typeof t.icon === "string" ? t.icon : t.id,
      modes: tileModes(t),
    });
  }
  return out;
}

export function filterByMode(tiles, mode) {
  const m = parseMode(mode);
  return (tiles || []).filter((t) => (t.modes || MODES).includes(m));
}

export function parseMode(v) {
  return v === "competition" ? "competition" : "build";
}

/** "light" | "dark" | "system" (system = no cookie). */
export function parseTheme(v) {
  return v === "light" || v === "dark" ? v : "system";
}

/**
 * The stored theme choice, by D92 precedence: cookie, then the app's old localStorage value, then the app's own
 * fallback (taskapp's saved per-person value), else "system". Used at load and whenever a tab returns, so a
 * choice survives even when the cookie can't be written. Browser only.
 */
export function resolveTheme(doc = document, win = window, fallback = null) {
  const c = parseTheme(readCookie(doc.cookie, THEME_COOKIE));
  if (c !== "system") return c;
  try {
    const s = parseTheme(win.localStorage.getItem(THEME_COOKIE));
    if (s !== "system") return s;
  } catch {
    // storage blocked
  }
  return parseTheme(fallback);
}

/** One cookie from a Cookie header or document.cookie. */
export function readCookie(cookieString, name) {
  if (typeof cookieString !== "string") return null;
  for (const part of cookieString.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isLocal(domain) {
  return domain === "localhost" || /\.localhost$/.test(domain) || /^[0-9.]+$/.test(domain);
}

/** Shared site-wide cookie attributes (INTEGRATION §9b; the mode cookie uses the same). */
export function cookieAttributes(site, maxAge) {
  // Domain= never carries a port (dev runs on e.g. portal.localhost:13080); browsers reject one that does.
  const host = String(site.domain || "").replace(/:\d+$/, "");
  let a = `; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  if (!isLocal(host)) a += `; Domain=.${host}`;
  if (site.scheme === "https") a += "; Secure";
  return a;
}

/** document.cookie string that stores a theme choice; "system" deletes the cookie. */
export function themeCookie(choice, site) {
  const c = parseTheme(choice);
  return c === "system"
    ? `${THEME_COOKIE}=${cookieAttributes(site, 0)}`
    : `${THEME_COOKIE}=${c}${cookieAttributes(site, COOKIE_MAX_AGE)}`;
}

/** document.cookie string for the mode (written by the Account page; build is also stored explicitly). */
export function modeCookie(mode, site) {
  return `${MODE_COOKIE}=${parseMode(mode)}${cookieAttributes(site, COOKIE_MAX_AGE)}`;
}

export function setModeCookie(mode, site, doc = document) {
  const choice = parseMode(mode);
  doc.cookie = modeCookie(choice, site);
  return choice;
}

/** Two letters for the account button. "Pat Example" → "PE"; falls back to the email. */
export function initials(name, email) {
  const src = (typeof name === "string" && name.trim()) || (typeof email === "string" ? email.split("@")[0] : "");
  const words = src.replace(/^(Ms|Mr|Mrs|Dr|Mx)\.?\s+/i, "").split(/[\s._-]+/).filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || "?").slice(0, 2);
  return s.toUpperCase();
}

/**
 * Applies a theme choice to <html>: data-theme for an explicit choice, the "dark" class and color-scheme for
 * the resolved theme. Browser only.
 */
export function applyTheme(choice, doc = document, win = window) {
  const c = parseTheme(choice);
  const sysDark = !!(win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches);
  const dark = c === "dark" || (c === "system" && sysDark);
  const r = doc.documentElement;
  if (c === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", c);
  r.classList.toggle("dark", dark);
  r.classList.toggle("light", !dark);
  r.style.colorScheme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

/** Store and apply a theme choice (cookie per D92, plus the old localStorage key during the migration). */
export function setTheme(choice, site, doc = document, win = window) {
  const c = parseTheme(choice);
  doc.cookie = themeCookie(c, site);
  try {
    if (c === "system") win.localStorage.removeItem(THEME_COOKIE);
    else win.localStorage.setItem(THEME_COOKIE, c);
  } catch {
    // Storage blocked: the cookie still carries the choice.
  }
  return applyTheme(c, doc, win);
}

/**
 * The inline script for <head>, before first paint (no flash). Reads the theme cookie; if absent, migrates
 * the app's old localStorage "theme" into the cookie; then applies the theme and follows system changes
 * while no explicit choice is stored. It stands alone, so it repeats the rules above.
 */
export function themeInitScript(site) {
  const attrs = JSON.stringify(cookieAttributes(site, COOKIE_MAX_AGE));
  return (
    "(function(){var d=document,w=window,r=d.documentElement,t=null;" +
    "try{var m=d.cookie.match(/(?:^|;\\s*)theme=(light|dark)(?:;|$)/);if(m)t=m[1]}catch(e){}" +
    "if(!t){try{var s=w.localStorage.getItem('theme');if(s==='light'||s==='dark'){t=s;d.cookie='theme='+s+" +
    attrs +
    "}}catch(e){}}" +
    "var q=w.matchMedia?w.matchMedia('(prefers-color-scheme: dark)'):null;" +
    "function a(){var c=null;try{var m=d.cookie.match(/(?:^|;\\s*)theme=(light|dark)(?:;|$)/);if(m)c=m[1]}catch(e){}" +
    "if(!c){try{var l=w.localStorage.getItem('theme');if(l==='light'||l==='dark')c=l}catch(e){}}" +
    "var k=c==='dark'||(!c&&q&&q.matches);if(c)r.setAttribute('data-theme',c);else r.removeAttribute('data-theme');" +
    "r.classList.toggle('dark',k);r.classList.toggle('light',!k);r.style.colorScheme=k?'dark':'light'}" +
    "a();if(q&&q.addEventListener)q.addEventListener('change',a)})();"
  );
}

/** Small outline icons (24×24, stroke), the demo's set. Unknown names fall back to "apps". */
export const ICONS = Object.freeze({
  apps: "M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  here: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  snacks: "M5 11h14l-1.5 9h-11zM8 11V8a4 4 0 0 1 8 0v3",
  parts: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  skills: "M6 3v6M6 15v6M18 9v6M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 12h6",
  schedule: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  pit: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  scouting: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  onshape: "M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7",
  github: "M9 19c-4 1.5-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 1.8 5.8 2.1 5.8 2.1a4.2 4.2 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  drive: "M8 3h8l6 11-4 7H6l-4-7zM2 14h20M8 3l6 11",
  "team-drive": "M8 3h8l6 11-4 7H6l-4-7zM2 14h20M8 3l6 11",
  admin: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  editor: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  handbook: "M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z",
  resources: "M3 6h6l2 2h10v11H3z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  system: "M3 5h18v11H3zM8 21h8M12 16v5",
});

export function iconPath(name) {
  return ICONS[name] || ICONS.apps;
}

/** Labels shared by both builds, so the React and static bars read the same to a screen reader. */
export const THEME_CHOICES = Object.freeze([
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Match my device"],
]);
