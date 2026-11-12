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
  icon?: string;
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

/** Body of GET /_shell/apps. */
export interface ShellAppsResponse {
  v: 1;
  portal: string;
  tiles: ShellTile[];
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
export function signOutHref(site: Site): string;
export function hasAccountMenu(user?: ShellUser | null, enabled?: boolean): boolean;
export function resolveTiles(appsJson: unknown, groups: readonly string[], site: Site): ShellTile[];
export function filterByMode(tiles: readonly ShellTile[], mode: string | null | undefined): ShellTile[];
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
export function initials(name?: string | null, email?: string | null): string;
export function applyTheme(choice: ThemeChoice, doc?: Document, win?: Window): "light" | "dark";
/** Writes the theme cookie and applies it. In a browser, also dispatches `shell:change` with `{ mode, theme }`. */
export function setTheme(choice: ThemeChoice, site: Site, doc?: Document, win?: Window): "light" | "dark";
export function themeInitScript(site: Site): string;
export function iconPath(name: string): string;
