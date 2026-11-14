// Types for tip.js (2972 shell kit). Source of truth: infra/shell/tip.d.ts.
import type { TipIds } from "./tip-text";

/** The id of the one shared role="tooltip" element. */
export const TIP_ID: "shell-tip";
/** The elements the tip describes: "[data-tip], .shell-tab[data-tab], .shell-status". */
export const TIP_SELECTOR: string;
/** An element's description: its own data-tip, else a kit tab's or status word's words for `ids`; "" for none. */
export function tipText(el: Element | null | undefined, ids: TipIds): string;
/** Where the tip goes for an element box, the tip's size and the window size (pure). */
export function placeTip(
  r: { top: number; bottom: number; left: number; width: number },
  w: number,
  h: number,
  vw: number,
  vh: number,
): { top: number; left: number };
/**
 * Installs the tip for app id(s) `ids` (one apps.json id, or a list for an app that is several). Reference-counted:
 * returns a function that undoes this call. No-op outside a browser. `env` is for tests.
 */
export function installTip(ids?: TipIds, env?: { document?: Document; window?: Window }): () => void;
/** Hides the tip now. */
export function hideTip(): void;
