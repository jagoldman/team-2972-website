// Types for guide-stops.js (2972 shell kit). Source of truth: infra/shell/guide-stops.d.ts.
import type { Mode, ShellTile } from "./core";
import type { GuideRole } from "./guide-state";

export interface GuideStop {
  id: string;
  roles: readonly GuideRole[];
  /** An apps.json id, or "portal" for Home. */
  app: string;
  /** The page in that app, e.g. "/here?tab=today". */
  path: string;
  /** The control it rings: '[data-guide="…"]'. */
  target: string;
  finish: "click" | "event";
  needs: { mode?: Mode; tile?: string; menu?: "tools" | "adminapps" | "more" };
  /** Other paths of the same app where an "event" stop's job goes on (it waits there with no card). */
  continues: readonly string[];
  name: string;
  line: string;
  covered: string;
  title: string;
  text: string;
  missing: string;
}
export const GUIDE_ROLE_ORDER: readonly GuideRole[];
export const GUIDE_CLOSING: string;
export const GUIDE_STOPS: readonly GuideStop[];
export const ROLE_WORDS: Readonly<Partial<Record<GuideRole, Readonly<Record<string, Partial<GuideStop>>>>>>;
export const GUIDE_ROLES: Readonly<Record<GuideRole, readonly string[]>>;
export const STOP_IDS: readonly string[];
/** The first of admin, mentor, student, parent in the groups (an array or a "|" list); null for none. */
export function guideRole(groups: readonly string[] | string | null | undefined): GuideRole | null;
export function guideStop(id: string, role?: GuideRole | null): GuideStop | null;
export function guideStops(role: GuideRole | null | undefined, opts?: { tiles?: readonly ShellTile[] | null; mode?: Mode }): GuideStop[];
