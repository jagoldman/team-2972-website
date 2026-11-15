// Types for guide-state.js (2972 shell kit). Source of truth: infra/shell/guide-state.d.ts.
import type { Site } from "./core";

export type GuideRole = "admin" | "mentor" | "student" | "parent";
/** A stop open for the hand-off: its id, whether its "Done." card is to show, and when it was set (ms). */
export interface GuideOpen {
  id: string;
  done: boolean;
  at: number;
}
/** What the guide cookie holds: never a name or an id of a person. */
export interface GuideState {
  role: GuideRole | null;
  done: string[];
  hidden: boolean;
  ended: boolean;
  open: GuideOpen | null;
}
export const GUIDE_ROLE_ORDER: readonly GuideRole[];
/** The first of admin, mentor, student, parent in the groups (an array or a "|" list); null for none. */
export function guideRole(groups: readonly string[] | string | null | undefined): GuideRole | null;
export const GUIDE_COOKIE: "guide";
export const GUIDE_VERSION: 1;
export const OPEN_MAX_AGE: number;
export const DONE_MAX_AGE: number;
export const MAX_DONE: number;
export function emptyGuide(): GuideState;
export function isStopId(id: unknown): id is string;
/** The cookie's value → the state; junk, another version or a hostile value read as emptyGuide(). */
export function parseGuide(value: unknown, now?: number): GuideState;
/** `role`: the person's role now; progress written for another role reads as emptyGuide(). */
export function readGuide(cookieString: string | null | undefined, now?: number, role?: GuideRole | null): GuideState;
export function guideValue(state: Partial<GuideState> | null | undefined, now?: number): string;
export function guideCookie(state: Partial<GuideState> | null | undefined, site: Site, now?: number): string;
/** document.cookie string that removes the cookie (Sign out). */
export function guideClearCookie(site: Site): string;
/** Not a stop: the open value "Start the tour again" writes; the portal's Home opens the person's first stop for it. */
export const GUIDE_START: "start";
/** Cookie string for "Start the tour again" (role, nothing done, GUIDE_START open); null for a person with no guide. */
export function guideRestartCookie(groups: readonly string[] | string | null | undefined, site: Site, now?: number): string | null;
/**
 * Account's "Start the tour again" (browser): writes guideRestartCookie and returns the portal's Home address to go to
 * (`location.assign(...)`); null, writing nothing, for a person with no guide.
 */
export function restartGuide(groups: readonly string[] | string | null | undefined, site: Site, doc?: Document, now?: number): string | null;
export function writeGuide<T extends Partial<GuideState>>(state: T, site: Site, doc?: Document, now?: number): T;
/** The id of a stop open for the hand-off, or null; `groups` given: null for a person with no guide or another role. */
export function guideOpenId(cookieString: string | null | undefined, now?: number, groups?: readonly string[] | string | null): string | null;
/** Home wants the card: not hidden, not ended, and (with `groups`) a person who has a guide. */
export function guideCardWanted(state: GuideState | null | undefined, groups?: readonly string[] | string | null): boolean;
/** Is a stop showing on this page (set by guide.js)? */
export function guideActive(): boolean;
export function setGuideActive(on: boolean): void;
