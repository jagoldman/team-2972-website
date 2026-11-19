// Types for act.js (2972 shell kit 0.5.0, D187-2). Source of truth: infra/shell/act.d.ts.

/** How one save ended. */
export type ActResult = "ok" | "failed" | "conflict" | "offline";
/** A save: spread `init` into fetch ({ signal, keepalive: true }); return the Response (or true for success). */
export type ActSave = (init: { signal?: AbortSignal; keepalive: true }) => Promise<{ status: number } | boolean>;

export const ACT_TIMEOUT_MS: number;
/** The one sentence a failure shows: "Couldn't save, so <words> is back as it was." and the like. */
export function actSentence(result: Exclude<ActResult, "ok">, words?: string): string;
/** One save with the time limit: "ok" only on a 2xx; "conflict" on a 409; "offline" without trying. */
export function saveOnce(save: ActSave, opts?: { timeoutMs?: number }): Promise<ActResult>;
/** The window event "shell:save-failed" ({ detail: { key, sentence } }). */
export function reportSaveFailed(key: unknown, sentence: string): void;
/**
 * Applies at once, saves behind; on failure puts back the last state the server confirmed and calls onFail with one
 * sentence. Presses with the same key run one after another and the newest wins ("joined" for one that never ran).
 */
export function act(opts: {
  key?: unknown;
  apply: () => void;
  revert: () => void;
  save: ActSave;
  words?: string;
  onFail?: (sentence: string) => void;
  onConflict?: () => void;
  timeoutMs?: number;
}): Promise<ActResult | "joined">;
