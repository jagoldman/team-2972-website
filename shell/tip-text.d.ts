// Types for tip-text.js (2972 shell kit). Source of truth: infra/shell/tip-text.d.ts.

/** The app bar's own hover descriptions. */
export const BAR_TIPS: Readonly<{
  apps: string;
  home: string;
  tools: string;
  adminapps: string;
  more: string;
  chip: string;
  bell: string;
  account: string;
  closeapps: string;
  closebell: string;
  closeaccount: string;
  notice: string;
  noticeread: string;
}>;
/** Tab descriptions by apps.json id, then data-tab id. */
export const TAB_TIPS: Readonly<Record<string, Readonly<Record<string, string>>>>;
/** Status-word descriptions by apps.json id, then the word as printed. */
export const STATUS_TIPS: Readonly<Record<string, Readonly<Record<string, string>>>>;
/** Status words that mean the same in every app (any app may use them). */
export const SHARED_STATUS_TIPS: Readonly<Record<string, string>>;
/** Words with numbers, by app id: [pattern, description], checked after the app's glossary. */
export const STATUS_PATTERNS: Readonly<Record<string, readonly (readonly [RegExp, string])[]>>;
/** One app id, or a list for an app that is several (first hit wins). */
export type TipIds = string | readonly string[];
/** The description of a tab, or "" (no tip). */
export function tabTip(appIds: TipIds, id: string | null | undefined): string;
/** The description of a status word: the app's glossary, its patterns, then the shared words; "" when none. */
export function statusTip(appIds: TipIds, word: string | null | undefined): string;
