// 2972 shell kit: act at once, save behind (0.5.0, D187-2). Source of truth: infra/shell/act.js. Plain ES module, no
// framework, no dependencies. Types: act.d.ts. The React hook on top of it is react/useAct.ts.
//
// A button the demo answers at once (Done, a tick, Sign up, Approve, Sign off, mark read) changes the screen at once
// and saves in the background. When the save fails, the screen goes back to the last state the server confirmed and
// says so in one plain sentence. Use it ONLY for actions that are cheap and undone by a second press:
//   yes: ticks, Done, mark read, snack and volunteer sign-up, pit checks, Approve and Sign off on a row.
//   no:  deleting, ordering, spending, anything slow, anything that tells people outside the app (a notice to a
//        family, an email), anything a second press cannot undo. Those keep waiting for the server.
// No check of who may do what changes: the server still decides. A button the server would refuse must not be drawn,
// or every press rolls back.
//
//   act({
//     key: `task:${id}:done`,                 // presses with the same key run one after another; the last one wins
//     apply: () => setDone(true),             // the screen, at once
//     revert: () => setDone(false),           // the screen as it was just before THIS press (an absolute state)
//     save: (init) => fetch(`/api/tasks/${id}`, { ...init, method: "PATCH", headers: {...}, body }),
//     words: "Wire the drivetrain",           // what goes back, for the sentence
//     onFail: (sentence) => toast.error(sentence),
//     onConflict: () => router.refresh(),     // a 409: someone else changed it
//   });
//
// Rules the helper keeps:
// - Only a 2xx answer is success (a 200 with { available: false } from an adapter is a 2xx: a save route must answer
//   an error status when nothing was saved). A network error, a timeout (10 s) or any other status is a failure.
// - `save` sends the whole state the screen now shows (done = true), never a change (toggle), because presses of one
//   key are joined: while one save runs, only the newest press waits, and the ones between are never sent.
// - On failure the screen goes back to the last state the server confirmed (the `revert` of the oldest press it has
//   not confirmed), not to the state before the last press. On a 409 it also calls onConflict and says
//   "Someone else changed this; here is the latest."
// - Offline (navigator.onLine === false): nothing is applied; it says so at once.
// - `save` gets `{ signal, keepalive: true }` to spread into fetch: the save survives leaving the page (the sentence
//   does not: a person who leaves before a failure never sees it), and the 10 s limit can stop it.
// - Every failure is also a window event "shell:save-failed" ({ detail: { key, sentence } }) for apps that listen.

export const ACT_TIMEOUT_MS = 10000;

/** The one sentence a failure shows. result: "failed" | "conflict" | "offline". */
export function actSentence(result, words) {
  const what = typeof words === "string" && words.trim() ? words.trim() : "it";
  if (result === "conflict") return "Someone else changed this; here is the latest.";
  if (result === "offline") return `You're offline, so ${what} was not saved.`;
  return `Couldn't save, so ${what} is back as it was.`;
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator && navigator.onLine === false;
}

/**
 * Runs one save with the time limit. Resolves "ok" (a 2xx), "conflict" (a 409) or "failed" (anything else, a network
 * error, the time limit); "offline" without trying when the browser says it is offline. `save(init)` returns a fetch
 * Response (or anything with `status`), or a boolean.
 */
export async function saveOnce(save, { timeoutMs = ACT_TIMEOUT_MS } = {}) {
  if (isOffline()) return "offline";
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (ctrl) ctrl.abort();
      resolve("failed");
    }, timeoutMs);
  });
  const run = (async () => {
    try {
      const r = await save({ signal: ctrl ? ctrl.signal : undefined, keepalive: true });
      if (r === true) return "ok";
      if (!r || typeof r !== "object" || typeof r.status !== "number") return "failed";
      if (r.status === 409) return "conflict";
      return r.status >= 200 && r.status < 300 ? "ok" : "failed";
    } catch {
      return "failed";
    }
  })();
  try {
    return await Promise.race([run, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** Tells the page a save failed (the window event "shell:save-failed"). No-op without a window. */
export function reportSaveFailed(key, sentence) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  window.dispatchEvent(new CustomEvent("shell:save-failed", { detail: { key: key == null ? null : String(key), sentence } }));
}

// Per key: the presses the server has not confirmed (oldest first), the press whose save is running, and the newest
// press waiting for it.
const lanes = new Map();

/**
 * Applies at once, saves behind. Resolves "ok", "failed", "conflict", "offline", or "joined" (a newer press of the
 * same key took over: its own promise says how it ended). See the comment at the top for the options.
 */
export function act(opts) {
  const { key = Symbol("act"), apply, revert, save, words, onFail, onConflict, timeoutMs } = opts;
  if (isOffline()) {
    const sentence = actSentence("offline", words);
    if (onFail) onFail(sentence);
    reportSaveFailed(key, sentence);
    return Promise.resolve("offline");
  }
  let lane = lanes.get(key);
  if (!lane) {
    lane = { unconfirmed: [], running: null, waiting: null };
    lanes.set(key, lane);
  }
  apply();
  let settle;
  const done = new Promise((r) => {
    settle = r;
  });
  const press = { revert, save, words, onFail, onConflict, timeoutMs, settle };
  lane.unconfirmed.push(press);
  if (lane.running) {
    // A save is running: this press waits; one that was waiting is joined into it (never sent).
    if (lane.waiting) lane.waiting.settle("joined");
    lane.waiting = press;
  } else {
    run(key, lane, press);
  }
  return done;
}

async function run(key, lane, press) {
  lane.running = press;
  const result = await saveOnce(press.save, { timeoutMs: press.timeoutMs });
  lane.running = null;
  if (result === "ok") {
    // Confirmed up to and including this press.
    lane.unconfirmed.splice(0, lane.unconfirmed.indexOf(press) + 1);
    press.settle("ok");
  }
  const next = lane.waiting;
  lane.waiting = null;
  if (next) {
    // A newer press waits: it carries the whole state, so it is sent whatever this answer was.
    if (result !== "ok") press.settle("joined");
    run(key, lane, next);
    return;
  }
  if (result !== "ok") {
    // Back to the last state the server confirmed: the state before the oldest press it has not confirmed.
    const oldest = lane.unconfirmed[0] || press;
    lane.unconfirmed = [];
    try {
      oldest.revert();
    } catch {
      // The screen could not be put back; the sentence still says what happened.
    }
    const sentence = actSentence(result, press.words);
    if (result === "conflict" && press.onConflict) press.onConflict();
    if (press.onFail) press.onFail(sentence);
    reportSaveFailed(key, sentence);
    press.settle(result);
  }
  if (!lane.running && !lane.waiting && lane.unconfirmed.length === 0) lanes.delete(key);
}
