// Types for guide.js (2972 shell kit). Source of truth: infra/shell/guide.d.ts. Load it with import(), only when
// needed (a stop is open, or the page mounts the Home card or the replay card).
import type { Mode, ShellTile, ShellUser, Site } from "./core";
import type { GuideStop } from "./guide-stops";

export const GUIDE_DONE_EVENT: "shell:guide-done";
export const GUIDE_CHANGE_EVENT: "shell:guide";
export const OPEN_APPS_EVENT: "shell:open-apps";
export const CLOSE_APPS_EVENT: "shell:close-apps";
export const OPEN_HOME_GROUP_EVENT: "shell:open-home-group";
export const CLOSE_HOME_GROUP_EVENT: "shell:close-home-group";
export const PHONE_MAX: number;

/** What the engine knows about the page and the person. Every field is optional; later calls add to it. */
export interface GuideContext {
  /** This page's apps.json id ("portal" on Home, "account" on Account), or a list. */
  appId?: string | readonly string[];
  site?: Site;
  siteScheme?: "http" | "https";
  siteDomain?: string;
  user?: ShellUser | null;
  /** Raw groups; else user.groups; else the role in the cookie. */
  groups?: readonly string[];
  /** The person's resolved tiles: a stop whose app is not among them is left out. */
  tiles?: readonly ShellTile[];
  mode?: Mode;
}
export interface GuideCardHandle {
  update(more: GuideContext): void;
  destroy(): void;
}
/** Where the stop card goes for a ring box, the card's size and the window (pure). */
export function placeStop(
  r: { left: number; top: number; right: number; bottom: number } | null,
  w: number,
  h: number,
  vw: number,
  vh: number,
  opts?: { top?: number; gap?: number },
): { left: number; top: number } | { dock: true } | { wide: true; top: number } | { centre: true };
export function stopHref(s: GuideStop, c?: GuideContext | null): string;
/** Opens a stop: here when this is its page, else by going to its page. True when it opened here. */
export function openGuideStop(id: string, c?: GuideContext): boolean;
/**
 * Opens the stop the cookie holds when this is its page (the hand-off); on the portal's Home, GUIDE_START ("Start the
 * tour again") opens the person's first stop. Safe to call more than once.
 */
export function resumeGuide(c?: GuideContext): void;
export function closeGuideStop(opts?: { focus?: boolean }): void;
export function guideStatus(): { id: string; phase: "show" | "wait" | "done" | "going" } | null;
/** The portal's "Get started" card. */
export function mountGuideCard(el: Element, o?: GuideContext): GuideCardHandle;
/** Account's "Guided tour" card: "Start the tour again" (restartGuide, then the portal's Home). */
export function mountGuideReplay(el: Element, o?: GuideContext): GuideCardHandle;
