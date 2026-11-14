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
}

export type MenuGroup = "tools" | "more";

/** Body of GET /_shell/apps. `tools` is empty while apps.json has no tool entry. */
export interface ShellAppsResponse {
  v: 1;
  portal: string;
  tiles: ShellTile[];
  tools: ShellTool[];
}

/** Body of GET /_shell/inbox. */
export interface ShellInboxResponse {
  v: 1;
  available: boolean;
  unread: number;
  items: { id: string; app: string; text: string; href: string | null; at: string; read: boolean }[];
}

export const SITE_GROUPS: readonly SiteGroup[];
export const MODES: readonly Mode[];
export const THEME_COOKIE: "theme";
export const MODE_COOKIE: "mode";
export const GROUPS_COOKIE: "shellgroups";
export const MENU_GROUPS: readonly MenuGroup[];
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
export function hasAccountMenu(user?: ShellUser | null, enabled?: boolean): boolean;
export function resolveTiles(appsJson: unknown, groups: readonly string[], site: Site): ShellTile[];
/** The Tools rows: entries with `tool: true`, filtered and resolved like tiles. resolveTiles leaves them out. */
export function resolveTools(appsJson: unknown, groups: readonly string[], site: Site): ShellTool[];
export function filterByMode<T extends { modes?: readonly Mode[] }>(tiles: readonly T[] | null | undefined, mode: string | null | undefined): T[];
/** Apps menu lists: core tiles (`main`) and the "more" tiles behind the More row (`rest`). No core tile: the "more" tiles are `main`. */
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
export function initials(name?: string | null, email?: string | null): string;
export function applyTheme(choice: ThemeChoice, doc?: Document, win?: Window): "light" | "dark";
/** Writes the theme cookie and applies it. In a browser, also dispatches `shell:change` with `{ mode, theme }`. */
export function setTheme(choice: ThemeChoice, site: Site, doc?: Document, win?: Window): "light" | "dark";
export function themeInitScript(site: Site): string;
export function iconPath(name: string): string;
