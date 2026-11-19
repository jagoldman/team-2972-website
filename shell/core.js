// 2972 shell kit: shared logic for the app bar (React and static builds) and the /_shell routes.
// Source of truth: infra/shell/core.js. Plain ES module, no dependencies, safe in the browser, in Node and in
// Next.js server and client code. Types: core.d.ts.

/** The only groups that count (CONVENTIONS §3). Anything else in X-Authentik-Groups is ignored. */
export const SITE_GROUPS = Object.freeze(["admin", "mentor", "student", "parent", "alumni"]);
export const MODES = Object.freeze(["build", "competition"]);
export const THEME_COOKIE = "theme";
export const MODE_COOKIE = "mode";
/** Which Apps-menu groups the person left open (D149): any of "tools", "adminapps", "more", joined with ".". */
export const GROUPS_COOKIE = "shellgroups";
/**
 * The remembered groups, in the order they are drawn (Admin apps since 0.4.0, D161, C1). Since 0.5.0 the bar's Apps
 * menu draws Tools as one link to the Tools page (no list), so only Home's rows use "tools"; the id and the cookie
 * value stay, so Home and the menu agree on the other two.
 */
export const MENU_GROUPS = Object.freeze(["tools", "adminapps", "more"]);
/** The words on each group's row (0.5.0: "more" reads "Team links"; the id and the cookie value stay "more"). */
export const GROUP_LABELS = Object.freeze({ tools: "Tools", adminapps: "Admin apps", more: "Team links" });
/** The apps.json `group` value that puts an app in the Admin apps row (C1). */
export const ADMIN_GROUP = "admin";
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
 * The shop screen (C14): a `display` login refused by an app gets one link, "Change screen", to the portal home with
 * `?blocked=<this app's id>` (the portal names the app from its own list). The refusal page is each app's own; this
 * gives it the address. `isDisplay(groups)`: the person's raw groups hold `display`.
 */
export function changeScreenHref(site, appId) {
  const id = typeof appId === "string" && /^[a-z0-9-]{1,40}$/.test(appId) ? appId : "";
  return id ? `${portalHref(site)}?blocked=${id}` : portalHref(site);
}
export function isDisplay(groups) {
  const list = Array.isArray(groups) ? groups : typeof groups === "string" ? groups.split("|").map((g) => g.trim()) : [];
  return list.includes("display");
}

/** Account doors share the trusted site configuration with portal and cookies. */
export function accountHref(site) {
  return `${site.scheme}://account.${site.domain}/`;
}
export function notificationSettingsHref(site) {
  return `${accountHref(site)}#notifications`;
}
/** The bell opens the inbox. Notification settings stay on `#notifications`. */
export function inboxHref(site) {
  return `${accountHref(site)}#inbox`;
}
export function signOutHref(site) {
  return `${portalHref(site)}outpost.goauthentik.io/sign_out`;
}
/** Raw groups retain display; parseGroups intentionally filters it out for tile access. */
export function hasAccountMenu(user, enabled = true) {
  return !!(enabled && user && (user.name || user.email) && !user.groups?.includes("display"));
}

// The account panel's role line (0.5.0, the demo's D.me().label): the person's place on the team first, then admin,
// which gives powers and never a place (D166). Unknown groups are left out.
const ROLE_WORDS = [["mentor", "Mentor"], ["student", "Student"], ["parent", "Parent"], ["alumni", "Alumni"], ["admin", "Admin"]];
/** Raw groups (array or pipe-separated) → "Mentor", "Mentor, admin", "Student"; "" when none is known. */
export function roleLabel(groups) {
  const have = new Set((Array.isArray(groups) ? groups : typeof groups === "string" ? groups.split("|") : []).map((g) => String(g).trim()));
  const words = ROLE_WORDS.filter(([g]) => have.has(g)).map(([, w], i) => (i === 0 ? w : w.toLowerCase()));
  return words.join(", ");
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
    // A tool is never a tile (resolveTools); any other `tool` value is a mistake, and the entry is left out.
    if (t.tool !== undefined && t.tool !== false) continue;
    if (!tileAllowed(t, groups)) continue;
    const href = tileHref(t, site);
    if (!href && !t.comingSoon) continue;
    out.push({
      id: t.id,
      name: t.name,
      description: typeof t.description === "string" ? t.description : "",
      href,
      external: typeof t.url === "string" || t.ext === true,
      comingSoon: !!t.comingSoon,
      more: t.group !== ADMIN_GROUP && (!!t.more || typeof t.url === "string" || t.id === "handbook"),
      icon: typeof t.icon === "string" ? t.icon : t.id,
      modes: tileModes(t),
      // An app for the people who run the site (Admin, Website editor): drawn in the Admin apps row (0.4.0, C1).
      ...(t.group === ADMIN_GROUP ? { group: ADMIN_GROUP } : {}),
    });
  }
  return out;
}

/**
 * The Admin apps row's tiles (apps.json `group: "admin"`), filtered and resolved like tiles (C1). They are also in
 * resolveTiles' answer, marked `group: "admin"`, so the guide and anything that counts tiles still sees them;
 * `/_shell/apps` sends this list as `adminApps` for a caller that wants it on its own.
 */
export function resolveAdminApps(appsJson, groups, site) {
  return resolveTiles(appsJson, groups, site).filter((t) => t.group === ADMIN_GROUP);
}

/**
 * apps.json entries with `tool: true` + the person's groups → the Apps menu's Tools rows (D149). A tool is a small
 * helper that opens in the same tab: never a tile, never a link-out. Same group, mode and address rules as tiles;
 * `description` is the row's one line (printed), `tip` its hover description ("" when absent or the same as the line,
 * since a tip never repeats what is printed).
 * Only `tool: true` makes a tool. A tool lives on this site: a `url` counts only when its host is the site domain or
 * one of its subdomains; a tool without such an address (or `comingSoon`) is left out.
 */
function onSite(href, site) {
  try {
    const host = new URL(href).hostname;
    const domain = String(site.domain || "").replace(/:\d+$/, "").toLowerCase();
    return !!domain && (host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function resolveTools(appsJson, groups, site) {
  if (!Array.isArray(appsJson)) return [];
  const out = [];
  for (const t of appsJson) {
    if (!t || t.tool !== true || typeof t.id !== "string" || typeof t.name !== "string") continue;
    if (!tileAllowed(t, groups)) continue;
    const href = tileHref(t, site);
    if (!href || !onSite(href, site)) continue;
    const description = typeof t.description === "string" ? t.description : "";
    out.push({
      id: t.id,
      name: t.name,
      description,
      tip: typeof t.tip === "string" && t.tip !== description ? t.tip : "",
      href,
      icon: typeof t.icon === "string" ? t.icon : t.id,
      modes: tileModes(t),
      // 0.5.1 (F1): one of the favourites a person starts with (no shelltoolfavs cookie).
      top: t.top === true,
      // 0.5.1: Home's row tags it "needs a photo" (apps.json `needsPhoto: true`; the demo's tool group "photo").
      needsPhoto: t.needsPhoto === true,
    });
  }
  return out;
}

export function filterByMode(tiles, mode) {
  const m = parseMode(mode);
  return (tiles || []).filter((t) => (t.modes || MODES).includes(m));
}

/**
 * The Apps menu's two lists: `main` (tiles without `more`, shown first) and `rest` (the "more" tiles, behind the
 * More row). With no core tile, the "more" tiles are the main list and there is no More row. Order is kept.
 */
export function splitMore(tiles) {
  const list = tiles || [];
  const core = list.filter((t) => !t.more);
  const more = list.filter((t) => t.more);
  return core.length ? { main: core, rest: more } : { main: more, rest: [] };
}

/**
 * The Apps menu's (and the portal home's) lists, in drawing order: `main` (the core apps), `admin` (the Admin apps
 * row), `rest` (the More row). With no core app and no admin app, the "more" tiles are the main list and there is no
 * More row (alumni). Order is kept.
 */
export function splitGroups(tiles) {
  const list = tiles || [];
  const admin = list.filter((t) => t.group === ADMIN_GROUP);
  const core = list.filter((t) => !t.more && t.group !== ADMIN_GROUP);
  const more = list.filter((t) => t.more && t.group !== ADMIN_GROUP);
  return core.length || admin.length ? { main: core, admin, rest: more } : { main: more, admin: [], rest: [] };
}

/** The Tools row's last line, "All N tools": the tools service's own page (C1, C7; M2). */
export function toolsHref(site) {
  return `${site.scheme}://tools.${site.domain}/`;
}

/**
 * GET /_shell/inbox's answer → what the bell draws (C3): { available, unread, items } with items newest first and
 * only well-formed ones: { id, app, text, href (same-site http(s) or null), at, read }. Field names are Account's
 * /api/shell-inbox ones. Anything else reads as not available.
 */
/** The most notices the bell's panel keeps (Account sends at most 30). */
export const INBOX_MAX = 30;
export function parseInbox(d, site = null) {
  if (!d || typeof d !== "object" || d.available !== true) return { available: false, unread: 0, items: [] };
  const seen = new Set();
  const items = (Array.isArray(d.items) ? d.items : [])
    .filter((n) => n && typeof n.id === "string" && n.id && typeof n.text === "string" && typeof n.at === "string" && !Number.isNaN(Date.parse(n.at)))
    // One row per id (the first one sent wins).
    .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .map((n) => ({
      id: n.id,
      app: typeof n.app === "string" ? n.app : "",
      text: n.text,
      href: safeHref(n.href, site),
      at: n.at,
      read: n.read === true,
    }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, INBOX_MAX);
  const unread = Number.isSafeInteger(d.unread) && d.unread >= 0 ? d.unread : items.filter((n) => !n.read).length;
  return { available: true, unread, items };
}

// A notice's link: only http(s), and with a site known, only this site or its subdomains (never a script URL).
function safeHref(href, site) {
  if (typeof href !== "string" || href === "") return null;
  try {
    const u = new URL(href, site ? portalHref(site) : "https://x.invalid/");
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (site && !onSite(u.href, site)) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * "Mark all read" (C15): POST /_shell/inbox/read with this body; only a 204 is success (an adapter answers 200 with
 * { available: false } when Account fails). It marks every notice of the person, not only those shown.
 */
export const INBOX_READ_ALL = Object.freeze({ all: true });
/** Is "Mark all read" offered? Whenever the server counts an unread notice, or a shown one is unread (as the demo). */
export function inboxHasUnread(inbox) {
  return !!inbox && (Number(inbox.unread) > 0 || (Array.isArray(inbox.items) && inbox.items.some((n) => n && !n.read)));
}
/** The inbox after a successful "Mark all read": nothing unread. */
export function inboxAllRead(inbox) {
  return { ...inbox, unread: 0, items: (inbox.items || []).map((n) => ({ ...n, read: true })) };
}

/**
 * 0.5.0 (H3): one notice read or unread. A click on an unread notice posts `{ ids: [id] }` (with `keepalive`, then
 * the link is followed); the row menu posts `{ ids: [id], read: false }` ("Mark as unread") or `{ ids: [id], read: true }`
 * ("Mark as read"). Account marks only the caller's own rows. Only a 204 is success.
 */
export function inboxReadOne(id, read) {
  return read === undefined ? { ids: [String(id)] } : { ids: [String(id)], read: !!read };
}

/** The most ids one read request may carry (Account's limit). */
export const INBOX_READ_MAX_IDS = 100;

/**
 * A POST /_shell/inbox/read body, checked: `{ all: true }`, or `{ ids: [1..100 non-empty strings], read?: boolean }`
 * (`read` defaults to true). Anything else, any other key included, is null (answer 400). For adapters and the kit's
 * stub route: they pass `read` through to Account (H3); an adapter that drops it would mark a notice read instead of
 * unread.
 */
export function parseInboxRead(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length === 1 && body.all === true) return { all: true };
  if (!keys.every((k) => k === "ids" || k === "read") || !Array.isArray(body.ids)) return null;
  if ("read" in body && typeof body.read !== "boolean") return null;
  const ids = body.ids;
  if (ids.length < 1 || ids.length > INBOX_READ_MAX_IDS) return null;
  if (!ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)) return null;
  return { ids: [...new Set(ids)], read: body.read !== false };
}

/** The inbox with one notice marked read or unread (the count follows; never below 0). Unknown id: unchanged. */
export function inboxMark(inbox, id, read) {
  const items = inbox.items || [];
  const n = items.find((x) => x.id === id);
  if (!n || n.read === !!read) return inbox;
  const unread = Math.max(0, (Number(inbox.unread) || 0) + (read ? -1 : 1));
  return { ...inbox, unread, items: items.map((x) => (x.id === id ? { ...x, read: !!read } : x)) };
}

/** The bell's order (0.5.0): unread notices first, then read ones, each newest first (the order parseInbox gives). */
export function inboxOrder(items) {
  const list = items || [];
  return [...list.filter((n) => !n.read), ...list.filter((n) => n.read)];
}

/** A notice's first line: the app that sent it and when, "Parts, 12 min ago" (the demo's Ground up row). */
export function noticeLine(label, at, now = Date.now()) {
  const when = noticeWhen(at, now);
  return label && when ? `${label}, ${when}` : label || when;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A notice's time as the demo writes it: "Just now", "12 min ago", "3 h ago" (today), "Sun" (this week), "Nov 6". */
export function noticeWhen(at, now = Date.now()) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(t);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) return `${Math.floor(mins / 60)} h ago`;
  if (now - t < 6 * 86400000) return DAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// "2026-03-12" or "2026-03-12T00:00:00.000Z" → days since 1970 (the date as written; no time zone shift).
function dayNumber(v) {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
}
/**
 * Calendar's public current event (`/event.json`, C5) → the event-day banner's words, or null when no event is on
 * today. today: "YYYY-MM-DD" (default: this device's date). status: Competition's `/event-status.json` answer (C15):
 * its `pit`, `rank` and `teams` are added when present; links only on https (The Blue Alliance's own site for `tbaUrl`).
 */
/**
 * Competition's `/event-status.json` (C15) → { pit, rank, teams } (each null when absent), or null for no answer.
 * Only these three facts are read.
 */
export function parseEventStatus(d) {
  if (!d || typeof d !== "object") return null;
  const pit = typeof d.pit === "string" || Number.isFinite(d.pit) ? String(d.pit).trim().slice(0, 12) || null : null;
  const rank = Number.isSafeInteger(d.rank) && d.rank > 0 ? d.rank : null;
  const teams = Number.isSafeInteger(d.teams) && d.teams > 0 ? d.teams : null;
  return pit || rank ? { pit, rank, teams } : null;
}

export function eventBanner(d, today = null, status = null) {
  if (!d || typeof d !== "object" || typeof d.name !== "string" || !d.name.trim()) return null;
  const now = new Date();
  const t = dayNumber(today || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  const a = dayNumber(d.start);
  const b = dayNumber(d.end) ?? a;
  if (a === null || t === null || t < a || t > b || d.happeningNow === false) return null;
  const facts = [`Day ${t - a + 1} of ${b - a + 1}`];
  // Pit and rank come from Competition's status (C15); an event answer that carries them is read the same way.
  const st = parseEventStatus(status) || parseEventStatus(d);
  if (st && st.pit) facts.push(`Pit ${st.pit}`);
  if (st && st.rank) facts.push(st.teams && st.teams >= st.rank ? `Rank ${st.rank} of ${st.teams}` : `Rank ${st.rank}`);
  const https = (u, host) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && (!host || x.hostname === host) ? x.href : null;
    } catch {
      return null;
    }
  };
  return {
    name: d.name.trim().slice(0, 120),
    line: facts.join(" · "),
    tbaUrl: https(d.tbaUrl, "www.thebluealliance.com"),
    livestreamUrl: https(d.livestreamUrl, null),
  };
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

/**
 * Tell this tab that the bar wrote the mode or theme cookie.
 * `mode` is "build" | "competition". `theme` is "light" | "dark" | "system".
 * No-op when there is no window (server render, Node) or it cannot dispatch.
 */
function emitShellChange(mode, theme, win = typeof window === "undefined" ? undefined : window) {
  if (!win || typeof win.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  win.dispatchEvent(new CustomEvent("shell:change", { detail: { mode, theme } }));
}

export function setModeCookie(mode, site, doc = document) {
  const choice = parseMode(mode);
  doc.cookie = modeCookie(choice, site);
  emitShellChange(choice, parseTheme(readCookie(doc.cookie, THEME_COOKIE)));
  return choice;
}

/** The open Apps-menu groups in a cookie value, known ids only, in MENU_GROUPS order. Nothing → []. */
export function parseOpenGroups(v) {
  const have = new Set(typeof v === "string" ? v.split(".") : []);
  return MENU_GROUPS.filter((g) => have.has(g));
}

/**
 * 0.5.1 (M3): the Apps menu's own Tools row (the favourites) starts open, so the cookie stores the opposite: this id
 * in `shellgroups` means "the person closed Tools in the menu". No cookie, or one written before 0.5.1 (it never holds
 * this id), reads as open. Home's own Tools row keeps the id "tools" and still starts closed (M6).
 */
export const MENU_TOOLS_SHUT = "toolsshut";
// Every id the cookie may hold, in the order it is written.
const SAVED_GROUPS = [...MENU_GROUPS, MENU_TOOLS_SHUT];
const savedIds = (v) => {
  const have = new Set(typeof v === "string" ? v.split(".") : []);
  return SAVED_GROUPS.filter((g) => have.has(g));
};

/**
 * document.cookie string that stores the open groups, with the mode cookie's attributes (site-wide, 400 days), so
 * every app on the site opens the menu the same way on this device. No open group deletes the cookie. The list may
 * also hold MENU_TOOLS_SHUT (0.5.1), which is kept.
 */
export function openGroupsCookie(open, site) {
  const list = savedIds((open || []).join("."));
  return list.length
    ? `${GROUPS_COOKIE}=${list.join(".")}${cookieAttributes(site, COOKIE_MAX_AGE)}`
    : `${GROUPS_COOKIE}=${cookieAttributes(site, 0)}`;
}

/** The groups this device left open (browser; [] on a first visit). */
export function readOpenGroups(doc = document) {
  return parseOpenGroups(readCookie(doc.cookie, GROUPS_COOKIE));
}

/** Is the Apps menu's Tools row open? (M3) True unless this device closed it: no cookie and an old cookie read open. */
export function menuToolsOpen(cookieString) {
  return !savedIds(readCookie(cookieString, GROUPS_COOKIE)).includes(MENU_TOOLS_SHUT);
}

/**
 * Opens or closes one group, stores the choice and returns the new list of open groups. `current` is the page's own
 * list (the adapters pass it), so with cookies blocked opening a second group does not close the first. The menu's
 * Tools choice (MENU_TOOLS_SHUT) already in the cookie is kept.
 */
export function setGroupOpen(id, open, site, doc = document, current = null) {
  const now = new Set(Array.isArray(current) ? parseOpenGroups(current.join(".")) : readOpenGroups(doc));
  if (open) now.add(id);
  else now.delete(id);
  const list = parseOpenGroups([...now].join("."));
  const shut = !menuToolsOpen(doc.cookie);
  doc.cookie = openGroupsCookie(shut ? [...list, MENU_TOOLS_SHUT] : list, site);
  return list;
}

/**
 * Opens or closes the Apps menu's Tools row (M3) and stores it in `shellgroups` with the other rows' choices. Returns
 * the new state (true = open). With cookies blocked the bar keeps its own state for this page.
 */
export function setMenuToolsOpen(open, site, doc = document) {
  const list = readOpenGroups(doc);
  doc.cookie = openGroupsCookie(open ? list : [...list, MENU_TOOLS_SHUT], site);
  return !!open;
}

/**
 * 0.5.1 (F2): the person's favourite tools, for every host. The Tools service writes it (setToolFavs) and every bar
 * and Home read it (readToolFavs, favouriteTools); nobody else builds or parses the value. The value is the tool ids
 * in the person's order joined with "."; TOOL_FAVS_NONE ("-") means none (M4). No cookie means the tools marked `top`
 * in apps.json. Same attributes as `shellgroups` (site-wide, 400 days, SameSite=Lax, not HttpOnly). Tool ids only,
 * nothing about a person (F5).
 */
export const TOOL_FAVS_COOKIE = "shelltoolfavs";
export const TOOL_FAVS_NONE = "-";
/** The most favourites read or written (there are seventeen tools). */
export const TOOL_FAVS_MAX = 17;
// A tool id as apps.json writes them ("tool-shooter"); the cookie holds nothing else.
const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// The longest value read: 17 ids of 40 characters and their dots. Anything longer is not read at all.
const TOOL_FAVS_LEN = TOOL_FAVS_MAX * 41;

/**
 * A `shelltoolfavs` value → the favourite ids, in order, or null for "no choice" (no cookie, or a value that cannot be
 * read at all: empty, too long, a character other than a-z, 0-9, "-" and ".", an empty id). F3: duplicates are
 * dropped; with `allowed` (ids the person may open in this mode) the others are dropped FIRST and then at most
 * TOOL_FAVS_MAX are kept, so unknown ids never crowd out a real favourite. Without `allowed` nothing is capped beyond
 * the raw length bound (the caller filters, then caps: favouriteTools). "-" is [] (none).
 */
export function parseToolFavs(v, allowed = null) {
  if (typeof v !== "string" || v === "" || v.length > TOOL_FAVS_LEN) return null;
  if (v === TOOL_FAVS_NONE) return [];
  const parts = v.split(".");
  if (!parts.every((id) => TOOL_ID.test(id))) return null;
  return pickFavs(parts, allowed);
}

// Ids in order: repeats dropped; with `allowed`, the others dropped and then at most TOOL_FAVS_MAX kept.
function pickFavs(ids, allowed) {
  const ok = allowed ? new Set(allowed) : null;
  const out = [];
  for (const id of ids) {
    if (ok && out.length >= TOOL_FAVS_MAX) break;
    if (typeof id !== "string" || out.includes(id) || (ok && !ok.has(id))) continue;
    out.push(id);
  }
  return out;
}

/**
 * The favourite ids stored on this device (browser), or null when there is no readable choice. Not filtered and not
 * capped (only bounded by the value's length): pass it to favouriteTools, which keeps the person's tools, then 17.
 */
export function readToolFavs(doc = document) {
  return parseToolFavs(readCookie(doc.cookie, TOOL_FAVS_COOKIE));
}

/**
 * document.cookie string that stores the favourites (F2). Ids are kept in order; anything that is not a tool id and
 * repeats are dropped, at most TOOL_FAVS_MAX. An empty list stores "-" (none), never deletes the cookie (no cookie
 * would mean the six defaults again).
 */
export function toolFavsCookie(ids, site) {
  const list = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (list.length >= TOOL_FAVS_MAX) break;
    if (typeof id === "string" && TOOL_ID.test(id) && !list.includes(id)) list.push(id);
  }
  return `${TOOL_FAVS_COOKIE}=${list.length ? list.join(".") : TOOL_FAVS_NONE}${cookieAttributes(site, COOKIE_MAX_AGE)}`;
}

/**
 * The writer (F4, the Tools service): stores the favourites and tells this tab's bar ("shell:toolfavs"), so a star
 * pressed on the Tools page shows in its own Apps menu at once. Returns the ids stored. Browser only.
 */
export function setToolFavs(ids, site, doc = document, win = typeof window === "undefined" ? undefined : window) {
  doc.cookie = toolFavsCookie(ids, site);
  const stored = parseToolFavs(readCookie(doc.cookie, TOOL_FAVS_COOKIE)) ?? [];
  if (win && typeof win.dispatchEvent === "function" && typeof CustomEvent === "function") {
    win.dispatchEvent(new CustomEvent("shell:toolfavs", { detail: { ids: stored } }));
  }
  return stored;
}

/**
 * The six favourites a person starts with (F1), for a tools list that carries no `top` at all: an answer from a 0.5.0
 * server or an old apps.json during a deploy. Kept apart from "the person chose none" (the cookie's "-").
 */
export const DEFAULT_TOOL_FAVS = Object.freeze(["tool-shooter", "tool-elevator", "tool-spacing", "tool-ratio", "tool-trace", "tool-gear"]);

/**
 * The favourites to draw (M2, M4, M6): `tools` are the tools this person may open in this mode (resolveTools, then
 * filterByMode), `favs` the cookie's ids (readToolFavs or parseToolFavs; null = no choice) or its raw value. A choice
 * → those tools in the person's order, ids this person may not open and repeats left out, then at most 17; [] when
 * none. No choice → the tools marked `top`, in apps.json order; when no tool in the list carries `top` (no `top`
 * information at all), DEFAULT_TOOL_FAVS, those the person may open.
 */
export function favouriteTools(tools, favs) {
  const list = Array.isArray(tools) ? tools : [];
  const allowed = list.map((t) => t.id);
  const ids = Array.isArray(favs) ? pickFavs(favs, allowed) : parseToolFavs(favs, allowed);
  if (ids === null) {
    const top = list.filter((t) => t.top === true);
    if (top.length) return top.slice(0, TOOL_FAVS_MAX);
    return DEFAULT_TOOL_FAVS.map((id) => list.find((t) => t.id === id)).filter(Boolean);
  }
  return ids.map((id) => list.find((t) => t.id === id));
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
  const applied = applyTheme(c, doc, win);
  emitShellChange(parseMode(readCookie(doc.cookie, MODE_COOKIE)), c, win);
  return applied;
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
  home: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
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
  chevron: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  trace: "M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10.3 3h3.4l.5 2.4 1.7.7 2-1.4 2.4 2.4-1.4 2 .7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.4 2-2.4 2.4-2-1.4-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2 1.4-2.4-2.4 1.4-2-.7-1.7L3 13.7v-3.4l2.4-.5.7-1.7-1.4-2 2.4-2.4 2 1.4 1.7-.7z",
  // 0.5.1: the fifteen calculators (demo-design83 1bb0acc, D.ic), same drawing.
  shooter: "M3 20c2-9 7-13 13-11M16 9l-4 .2M16 9l-1.6 3.6M20.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  elevator: "M6 3v18M18 3v18M4 21h16M9 13h6v5H9zM12 13V5M10 7l2-2 2 2",
  arm: "M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6.5 15.5L17 6M17 6l3 1M17 6l-1 3M3 21h8",
  drivetrain: "M6 6h12v12H6zM3 7v4M3 13v4M21 7v4M21 13v4M12 15V9M10 11l2-2 2 2",
  intake: "M7 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 8h10M4 19h16M15 13a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  belt: "M7 7a5 5 0 1 0 0 10A5 5 0 0 0 7 7zM18 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM7 7l11 2.5M7 17l11-2.5",
  ratio: "M8 8a5 5 0 1 0 0 10A5 5 0 0 0 8 8zM17.5 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 13h.01M17.5 7h.01",
  motor: "M4 8h11v8H4zM15 10h3v4h-3zM18 12h3M7 8V6M12 8V6M7 16v2M12 16v2",
  battery: "M3 8h16v9H3zM19 11h2v3h-2zM7 12.5h3M8.5 11v3M13 12.5h3",
  air: "M3 10h11v4H3zM14 12h7M21 9v6M6 10V6h5",
  tip: "M3 20h18M6 20l4-12 8 3-3 9M12 14h.01",
  beam: "M4 5v14M4 8h16M4 8c8 0 13 2 16 7M20 8v6M18 12l2 2 2-2",
  holes: "M12 3v8M9 11h6l-1 4h-4zM12 15v3M5 21h14M8 6h8",
  units: "M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14",
  camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  system: "M3 5h18v11H3zM8 21h8M12 16v5",
});

export function iconPath(name) {
  return ICONS[name] || ICONS.apps;
}

/**
 * Labels shared by both builds, so the React and static bars read the same to a screen reader. 0.5.0: the group is
 * "Appearance" and the order is Light, Dark, Match my device (the demo's Ground up account panel).
 */
export const THEME_CHOICES = Object.freeze([
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Match my device"],
]);

/**
 * Warm the next app (0.5.0, D187-1; the lead's answer to KIT §8.2: preconnect only, never prefetch or prerender).
 * Adds `<link rel="preconnect" href="<origin>">` once per origin per page, for an address on this site only: the scheme
 * in SITE_SCHEME and a host that is SITE_DOMAIN or one of its subdomains, not this page's own origin. Never an outside
 * address (Onshape, GitHub: no outside site learns of a hover), never `javascript:` or another scheme. A preconnect
 * sends no HTTP request and no cookie, so it never touches forward auth; it saves DNS, TCP and TLS for the new tab.
 * No `crossorigin` attribute: a page load uses the credentialed connection pool. Returns true when it added a link.
 */
export function warmOrigin(href, site, doc = typeof document === "undefined" ? null : document) {
  if (!doc || !doc.head || typeof href !== "string" || !site) return false;
  let u;
  try {
    u = new URL(href, doc.baseURI || undefined);
  } catch {
    return false;
  }
  if (u.protocol !== `${site.scheme}:` || (site.scheme !== "https" && site.scheme !== "http")) return false;
  const domain = String(site.domain || "").toLowerCase();
  const host = u.host.toLowerCase();
  if (!domain || !(host === domain || host.endsWith(`.${domain}`))) return false;
  const here = doc.location && doc.location.origin;
  if (u.origin === here) return false;
  for (const l of doc.head.querySelectorAll('link[rel="preconnect"]')) if (l.getAttribute("href") === u.origin) return false;
  const link = doc.createElement("link");
  link.rel = "preconnect";
  link.href = u.origin;
  doc.head.append(link);
  return true;
}

// One delegated listener per document, reference-counted like the hover description (tip.js): every bar and page
// that installs it shares it, and it goes when the last one is removed.
const warmInstalls = new WeakMap();
/**
 * Warms the origin of any `a[href]` on the page (the Apps menu's tiles, Home's rows, an app's own doors) when a mouse
 * rests on it for about 100 ms, on pointerdown or touchstart, and on keyboard focus. Returns its undo.
 */
export function installWarm(site, doc = typeof document === "undefined" ? null : document) {
  if (!doc || typeof doc.addEventListener !== "function") return () => {};
  let entry = warmInstalls.get(doc);
  if (!entry) {
    let timer = null;
    let over = null;
    const linkOf = (t) => (t && typeof t.closest === "function" ? t.closest("a[href]") : null);
    const warm = (a) => a && warmOrigin(a.getAttribute("href"), entry.site, doc);
    const onOver = (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const a = linkOf(e.target);
      if (a === over) return;
      clearTimeout(timer);
      over = a;
      if (a) timer = setTimeout(() => warm(a), 100);
    };
    const onOut = (e) => {
      if (over && !(e.relatedTarget && over.contains(e.relatedTarget))) {
        clearTimeout(timer);
        over = null;
      }
    };
    const onNow = (e) => warm(linkOf(e.target));
    const handlers = [["pointerover", onOver], ["pointerout", onOut], ["pointerdown", onNow], ["touchstart", onNow], ["focusin", onNow]];
    entry = { count: 0, site, handlers, stop: () => clearTimeout(timer) };
    for (const [type, fn] of handlers) doc.addEventListener(type, fn, { capture: true, passive: true });
    warmInstalls.set(doc, entry);
  }
  entry.count++;
  entry.site = site;
  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    entry.count--;
    if (entry.count > 0) return;
    entry.stop();
    for (const [type, fn] of entry.handlers) doc.removeEventListener(type, fn, { capture: true });
    warmInstalls.delete(doc);
  };
}
