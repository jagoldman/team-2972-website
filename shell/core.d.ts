// Types for core.js (2972 shell kit). Source of truth: infra/shell/core.d.ts.

export type SiteGroup = "admin" | "mentor" | "student" | "parent" | "alumni";
export type Mode = "build" | "competition";
export type ThemeChoice = "light" | "dark" | "system";
export interface ShellUser {
  name?: string | null;
  email?: string | null;
  groups?: readonly string[];
}
export interface Site {
  scheme: "http" | "https";
  domain: string;
}

/** One entry of infra/config/apps.json (INTEGRATION §8). */
export interface AppsJsonTile {
  id: string;
  name: string;
  description?: string;
  audience?: string;
  host?: string;
  path?: string;
  url?: string;
  comingSoon?: boolean;
  groups?: string[];
  modes?: Mode[];
  more?: boolean;
  /** Link-out mark for a same-site path. Not an address; tileHref ignores it. */
  ext?: boolean;
  icon?: string;
  /** `true` makes a tool (D149): listed under the Apps menu's Tools row, never as a tile; same tab, this site only. Any other value leaves the entry out. */
  tool?: boolean;
  /** A tool's hover description (never a repeat of its description, which is printed). */
  tip?: string;
  /** "admin" puts the app in the Apps menu's (and Home's) Admin apps row, between Tools and More (0.4.0, C1). */
  group?: "admin";
  /** 0.5.1 (F1): a tool that is one of the six favourites a person starts with. */
  top?: boolean;
  /** 0.5.1: a tool that works from a photo; Home's row tags it "needs a photo". */
  needsPhoto?: boolean;
}

/** A tile as /_shell/apps returns it: allowed for the person, with its link resolved. */
export interface ShellTile {
  id: string;
  name: string;
  description: string;
  href: string | null;
  external: boolean;
  comingSoon: boolean;
  more: boolean;
  icon: string;
  modes: Mode[];
  /** Present on an Admin apps tile (apps.json `group: "admin"`); such a tile has `more: false`. */
  group?: "admin";
}

/** A tool as /_shell/apps returns it: allowed for the person, with its same-tab link resolved. */
export interface ShellTool {
  id: string;
  name: string;
  /** The row's one line, printed under the name. */
  description: string;
  /** The hover description; "" for none. */
  tip: string;
  href: string;
  icon: string;
  modes: Mode[];
  /** 0.5.1 (F1): one of the favourites a person starts with (apps.json `top: true`). Absent from a 0.5.0 server. */
  top?: boolean;
  /** 0.5.1: Home's row tags it "needs a photo" (apps.json `needsPhoto: true`). Absent from a 0.5.0 server. */
  needsPhoto?: boolean;
}

export type MenuGroup = "tools" | "adminapps" | "more";

/** Body of GET /_shell/apps. `tools` is empty while apps.json has no tool entry. `adminApps` (0.4.0) repeats the
 *  tiles marked `group: "admin"`; older answers lack it. */
export interface ShellAppsResponse {
  v: 1;
  portal: string;
  tiles: ShellTile[];
  tools: ShellTool[];
  adminApps?: ShellTile[];
}

/** One notice in the bell (Account's /api/shell-inbox field names). */
export interface ShellInboxItem {
  id: string;
  /** The apps.json id of the app that sent it. */
  app: string;
  text: string;
  /** Where the notice leads (same tab), or null. */
  href: string | null;
  /** ISO time it was sent. */
  at: string;
  read: boolean;
}
/** Body of GET /_shell/inbox. */
export interface ShellInboxResponse {
  v: 1;
  available: boolean;
  unread: number;
  items: ShellInboxItem[];
}

/** The event-day banner's words (eventBanner). */
export interface EventBanner {
  name: string;
  /** "Day 2 of 4 · Pit 42 · Rank 9 of 48" (pit and rank only when the answer has them). */
  line: string;
  tbaUrl: string | null;
  livestreamUrl: string | null;
}

export const SITE_GROUPS: readonly SiteGroup[];
export const MODES: readonly Mode[];
export const THEME_COOKIE: "theme";
export const MODE_COOKIE: "mode";
export const GROUPS_COOKIE: "shellgroups";
export const MENU_GROUPS: readonly MenuGroup[];
/** The words on each group's row (0.5.0: more is "Team links"). */
export const GROUP_LABELS: Readonly<Record<MenuGroup, string>>;
export const ADMIN_GROUP: "admin";
export const COOKIE_MAX_AGE: number;
export const ICONS: Readonly<Record<string, string>>;
export const THEME_CHOICES: readonly (readonly [ThemeChoice, string])[];

export function parseGroups(header: string | null | undefined): SiteGroup[];
export function tileAllowed(tile: AppsJsonTile, groups: readonly string[]): boolean;
export function tileModes(tile: AppsJsonTile): Mode[];
export function tileHref(tile: AppsJsonTile, site: Site): string | null;
export function portalHref(site: Site): string;
export function accountHref(site: Site): string;
export function notificationSettingsHref(site: Site): string;
/** Same-tab inbox door: `<scheme>://account.<domain>/#inbox`. */
export function inboxHref(site: Site): string;
export function signOutHref(site: Site): string;
/** "Change screen" for a display login refused by an app (C14): the portal home with `?blocked=<appId>` (a bad id: no query). */
export function changeScreenHref(site: Site, appId: string): string;
/** The raw groups (an array or a "|" list) hold `display`. */
export function isDisplay(groups: readonly string[] | string | null | undefined): boolean;
export function hasAccountMenu(user?: ShellUser | null, enabled?: boolean): boolean;
/** The account panel's role line: "Mentor", "Mentor, admin", "Student"; "" when no known group (0.5.0). */
export function roleLabel(groups: readonly string[] | string | null | undefined): string;
export function resolveTiles(appsJson: unknown, groups: readonly string[], site: Site): ShellTile[];
/** The Tools rows: entries with `tool: true`, filtered and resolved like tiles. resolveTiles leaves them out. */
export function resolveTools(appsJson: unknown, groups: readonly string[], site: Site): ShellTool[];
/** The Admin apps row's tiles (apps.json `group: "admin"`), filtered and resolved like tiles. */
export function resolveAdminApps(appsJson: unknown, groups: readonly string[], site: Site): ShellTile[];
/** Drawing order: core apps, the Admin apps row, the More row. No core and no admin app: the "more" tiles are `main`. */
export function splitGroups(tiles: readonly ShellTile[] | null | undefined): { main: ShellTile[]; admin: ShellTile[]; rest: ShellTile[] };
/** "All tools", the last line of the Tools row: `<scheme>://tools.<domain>/`. */
export function toolsHref(site: Site): string;
/** /_shell/inbox's answer → { available, unread, items newest first (at most 30, one per id), well-formed only, links on this site only }. */
export function parseInbox(d: unknown, site?: Site | null): { available: boolean; unread: number; items: ShellInboxItem[] };
export const INBOX_MAX: number;
/** "Mark all read"'s body (C15); only a 204 is success. */
export const INBOX_READ_ALL: Readonly<{ all: true }>;
/** "Mark all read" is offered: the server's unread count is above 0, or a shown notice is unread. */
export function inboxHasUnread(inbox: { unread: number; items: readonly ShellInboxItem[] } | null | undefined): boolean;
/** The inbox after a successful "Mark all read". */
export function inboxAllRead<T extends { unread: number; items: readonly ShellInboxItem[] }>(inbox: T): T;
/** 0.5.0 (H3): the body that marks one notice read (`read` omitted: `{ ids: [id] }`) or sets it read or unread. */
export function inboxReadOne(id: string, read?: boolean): { ids: [string]; read?: boolean };
/** The most ids one read request may carry. */
export const INBOX_READ_MAX_IDS: number;
/** A POST /_shell/inbox/read body, checked; null when it must be refused (400). `read` defaults to true. */
export function parseInboxRead(body: unknown): { all: true } | { ids: string[]; read: boolean } | null;
/** The inbox with one notice marked read or unread; the count follows. */
export function inboxMark<T extends { unread: number; items: ShellInboxItem[] }>(inbox: T, id: string, read: boolean): T;
/** Unread notices first, then read ones, each newest first. */
export function inboxOrder(items: readonly ShellInboxItem[]): ShellInboxItem[];
/** "Parts, 12 min ago": the app that sent a notice and when. */
export function noticeLine(label: string, at: string, now?: number): string;
/** Competition's /event-status.json → { pit, rank, teams }, or null. */
export function parseEventStatus(d: unknown): { pit: string | null; rank: number | null; teams: number | null } | null;
/** "Just now", "12 min ago", "3 h ago", "Sun", "Nov 6". */
export function noticeWhen(at: string, now?: number): string;
/** Calendar's current event → the banner's words when an event is on today ("YYYY-MM-DD", default this device's date); else null. */
export function eventBanner(d: unknown, today?: string | null, status?: unknown): EventBanner | null;
export function filterByMode<T extends { modes?: readonly Mode[] }>(tiles: readonly T[] | null | undefined, mode: string | null | undefined): T[];
/** Older split (0.2.3), kept for callers: tiles without `more` (`main`, Admin apps included) and the "more" tiles (`rest`). The bars use splitGroups. */
export function splitMore(tiles: readonly ShellTile[] | null | undefined): { main: ShellTile[]; rest: ShellTile[] };
export function parseMode(v: string | null | undefined): Mode;
export function parseTheme(v: string | null | undefined): ThemeChoice;
export function readCookie(cookieString: string | null | undefined, name: string): string | null;
/** Stored theme by D92 precedence: cookie, old localStorage, app fallback, else "system". Browser only. */
export function resolveTheme(doc?: Document, win?: Window, fallback?: ThemeChoice | null): ThemeChoice;
export function cookieAttributes(site: Site, maxAge: number): string;
export function themeCookie(choice: ThemeChoice, site: Site): string;
export function modeCookie(mode: Mode, site: Site): string;
/** Writes the mode cookie. In a browser, also dispatches `shell:change` with `{ mode, theme }`. */
export function setModeCookie(mode: Mode, site: Site, doc?: Document): Mode;
/** Known open groups in a cookie value, in MENU_GROUPS order. */
export function parseOpenGroups(v: string | null | undefined): MenuGroup[];
/** Cookie string for the open groups (mode cookie attributes); an empty list deletes the cookie. */
export function openGroupsCookie(open: readonly string[], site: Site): string;
/** The groups this device left open; [] on a first visit. Browser only. */
export function readOpenGroups(doc?: Document): MenuGroup[];
/** Opens or closes one group (from `current`, the page's list, else the cookie), writes the cookie, returns the open groups. Browser only. */
export function setGroupOpen(id: MenuGroup, open: boolean, site: Site, doc?: Document, current?: readonly string[] | null): MenuGroup[];
/** 0.5.1 (M3): the id in `shellgroups` that means "the person closed Tools in the Apps menu". */
export const MENU_TOOLS_SHUT: "toolsshut";
/** Is the Apps menu's Tools row open? True unless this device closed it (no cookie, or a pre-0.5.1 one: open). */
export function menuToolsOpen(cookieString: string | null | undefined): boolean;
/** Opens or closes the Apps menu's Tools row and stores it; returns the new state. Browser only. */
export function setMenuToolsOpen(open: boolean, site: Site, doc?: Document): boolean;
/** 0.5.1 (F2): the favourite tools cookie, "shelltoolfavs". */
export const TOOL_FAVS_COOKIE: "shelltoolfavs";
/** The value that means "no favourites" (M4). */
export const TOOL_FAVS_NONE: "-";
export const TOOL_FAVS_MAX: 17;
/**
 * A cookie value → favourite ids in order, or null (no cookie, or unreadable: counts as no choice). With `allowed`,
 * other ids are dropped; duplicates are dropped; at most 17. "-" → [].
 */
export function parseToolFavs(v: string | null | undefined, allowed?: readonly string[] | null): string[] | null;
/** This device's favourite ids (not filtered), or null for no choice. Browser only. */
/** Not filtered or capped: favouriteTools keeps the person's tools, then 17. */
export function readToolFavs(doc?: Document): string[] | null;
/** The six a person starts with, for a tools list with no `top` at all (an older server or apps.json). */
export const DEFAULT_TOOL_FAVS: readonly string[];
/** document.cookie string storing the favourites; [] stores "-". */
export function toolFavsCookie(ids: readonly string[], site: Site): string;
/** The writer (the Tools service, F4): stores the ids, dispatches `shell:toolfavs`, returns the ids stored. Browser only. */
export function setToolFavs(ids: readonly string[], site: Site, doc?: Document, win?: Window): string[];
/**
 * The favourites to draw: `tools` = the tools this person may open in this mode; `favs` = the cookie's ids (or its raw
 * value), null = no choice → the tools marked `top` (none marked at all → DEFAULT_TOOL_FAVS).
 */
export function favouriteTools(tools: readonly ShellTool[], favs: readonly string[] | string | null | undefined): ShellTool[];
export function initials(name?: string | null, email?: string | null): string;
export function applyTheme(choice: ThemeChoice, doc?: Document, win?: Window): "light" | "dark";
/** Writes the theme cookie and applies it. In a browser, also dispatches `shell:change` with `{ mode, theme }`. */
export function setTheme(choice: ThemeChoice, site: Site, doc?: Document, win?: Window): "light" | "dark";
export function themeInitScript(site: Site): string;
export function iconPath(name: string): string;

/**
 * 0.5.0 (D187-1): `<link rel="preconnect">` once per origin, only for this site's own hosts on SITE_SCHEME (never an
 * outside address, never this page's origin). True when a link was added.
 */
export function warmOrigin(href: string, site: Site, doc?: Document | null): boolean;
/** Warms any `a[href]` door on hover (about 100 ms), press, touch and keyboard focus. Reference-counted; returns its undo. */
export function installWarm(site: Site, doc?: Document | null): () => void;
