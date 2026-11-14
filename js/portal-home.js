// The portal home's cards above the tiles (release 8.1.5, CONTRACT C4, C12, C13, C14) and the shop screen's home
// (C9, C14), drawn as the demo's Home (portal-demo js/core.js views.portal, todayRow, waitingRows, practiceRows,
// displayHome; js/tasks.js nextUp).
// Data: same-origin GET /today.json (Caddy sends it to Account's /api/today with the identity headers):
//   {v:1, today:[row], waiting:[row], next:{taskId, title, due, project, href, …}|null, activity:[{app?, title, detail?, href, at}]}
//   row = {id, section, title, detail, href, count?, cta?:{label, href}, modes?}
// A part with no data is not drawn; a failed or missing /today.json leaves the home as it was in release 8.1.
// Every text goes in with textContent, never as HTML; every link must be on this site (parseToday drops the rest).
// No imports, so node can test the pure parts (test/portal-home-test.mjs).

const SVG_NS = "http://www.w3.org/2000/svg";
/** The five site groups (CONVENTIONS §3), as the kit's SITE_GROUPS. */
const SITE_GROUPS = ["admin", "mentor", "student", "parent", "alumni"];
const MODES = ["build", "competition"];
/** How long the home waits for /today.json, /event.json or a Done (ms). */
export const WAIT_MS = 10000;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// d comes from the kit's fixed icon set (iconPath) or the small set below, never from data.
export function svgIcon(d, size) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  if (size) { svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size)); }
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}
const CHECK = "M5 12l5 5 9-10";
const PARTS = "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"; // the kit's parts icon

// ---------- pure: checking /today.json ----------

/** A link on this site, as an absolute URL, or null. `origin` is the page's own origin (the portal). */
export function safeHref(href, site, origin) {
  if (typeof href !== "string" || !href.trim()) return null;
  let u;
  try { u = new URL(href, origin); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const domain = String(site && site.domain || "").toLowerCase();
  const host = u.host.toLowerCase();
  if (!domain || !(host === domain || host.endsWith(`.${domain}`))) return null;
  if (/^\/\//.test(href.trim())) return null; // protocol-relative: say what you mean
  return u.href;
}

function text(v, max = 200) {
  if (typeof v !== "string") return "";
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The rows for the person's current mode (the kit's `mode` cookie, C12). */
export function rowsForMode(rows, mode) {
  const m = mode === "competition" ? "competition" : "build";
  return (rows || []).filter((r) => !r.modes || r.modes.includes(m));
}

/** On an event day, Competition's shift rows go first (the demo's "my shift first", C14); the order is kept otherwise. */
export function shiftFirst(rows, eventDay) {
  if (!eventDay) return rows;
  const shift = (r) => /^compete:/.test(r.id);
  return [...rows.filter(shift), ...rows.filter((r) => !shift(r))];
}

function row(r, site, origin) {
  if (!r || typeof r !== "object") return null;
  const title = text(r.title);
  const href = safeHref(r.href, site, origin);
  if (!title || !href) return null;
  // C12: a row may belong to one mode; no (or no known) `modes` means both.
  const modes = Array.isArray(r.modes) ? MODES.filter((m) => r.modes.includes(m)) : [];
  const out = { id: text(r.id, 200), title, detail: text(r.detail), href, modes: modes.length ? modes : MODES.slice() };
  if (Number.isInteger(r.count) && r.count > 0) out.count = r.count;
  if (r.cta && typeof r.cta === "object") {
    const label = text(r.cta.label, 40), ctaHref = safeHref(r.cta.href, site, origin);
    if (label && ctaHref) out.cta = { label, href: ctaHref };
  }
  return out;
}

function nextTask(n, site, origin) {
  if (!n || typeof n !== "object") return null;
  const taskId = typeof n.taskId === "string" || Number.isInteger(n.taskId) ? text(String(n.taskId), 80) : "";
  const title = text(n.title), href = safeHref(n.href, site, origin);
  if (!taskId || !title || !href) return null;
  const out = { taskId, title, href, project: text(n.project, 120), due: typeof n.due === "string" ? n.due : "" };
  // C13: the two extra doors, each only with its own link.
  const stuck = safeHref(n.stuckHref, site, origin), part = safeHref(n.partHref, site, origin);
  if (stuck) out.stuckHref = stuck;
  if (part) out.partHref = part;
  // C14: the rest of the demo's card, all optional.
  const subteam = text(n.subteam, 80), milestone = text(n.milestone, 120);
  if (subteam) out.subteam = subteam;
  if (milestone) out.milestone = milestone;
  const s = n.steps;
  if (s && Number.isInteger(s.total) && Number.isInteger(s.done) && s.total > 0 && s.total <= 999 && s.done >= 0 && s.done <= s.total) out.steps = { done: s.done, total: s.total };
  const waiting = (Array.isArray(n.waitingOn) ? n.waitingOn : []).map((w) => text(w, 120)).filter(Boolean).slice(0, 3);
  if (waiting.length) out.waitingOn = waiting;
  if (n.onHold === true) out.onHold = true;
  if (n.blocked === true) out.blocked = true;
  return out;
}

/** /today.json's answer → { today, waiting, next, activity }, every part checked; null when the answer is not v1. */
export function parseToday(json, site, origin) {
  if (!json || typeof json !== "object" || json.v !== 1) return null;
  const rows = (list) => (Array.isArray(list) ? list : []).map((r) => row(r, site, origin)).filter(Boolean);
  const activity = (Array.isArray(json.activity) ? json.activity : []).map((a) => {
    if (!a || typeof a !== "object") return null;
    const title = text(a.title), href = safeHref(a.href, site, origin);
    if (!title || !href) return null;
    const at = typeof a.at === "string" && !Number.isNaN(Date.parse(a.at)) ? a.at : "";
    return { app: text(a.app, 40), title, detail: text(a.detail), href, at };
  }).filter(Boolean).slice(0, 5);
  return { today: rows(json.today), waiting: rows(json.waiting), next: nextTask(json.next, site, origin), activity };
}

/** Is the next task held back? Then Done is a plain button, not the gold one (C14, the demo). */
export function taskHeld(next) {
  return !!(next && (next.blocked || next.onHold || (next.waitingOn && next.waitingOn.length)));
}

/** "due Tue, Nov 18" for a date-only or full date; "" when there is none. */
export function dueText(due, locale) {
  if (typeof due !== "string" || !due) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  return `due ${d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}`;
}

/** The card's muted line, as the demo's: "project › subteam · for “milestone” · due date". */
export function nextLine(next, locale) {
  const where = [next.project, next.subteam].filter(Boolean).join(" › ");
  return [where, next.milestone ? `for “${next.milestone}”` : "", dueText(next.due, locale)].filter(Boolean).join(" · ");
}

/** When a notice came: "just now", "5 min ago", "3 h ago", "Yesterday", or the date. */
export function whenText(at, now = Date.now(), locale) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return "";
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = new Date(t), today = new Date(now);
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()) return "Yesterday";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** Only a parent (no admin, mentor or student group) gets no Recent activity (the demo; C4). */
export function isParentOnly(groups) {
  return Array.isArray(groups) && groups.includes("parent") && !groups.some((g) => g === "admin" || g === "mentor" || g === "student");
}

/**
 * Raw X-Authentik-Groups (pipe-separated or a list) → the shop screen? When the person has `display` and no site
 * group; any other, non-site group (an Authentik one) does not change that.
 */
export function isDisplayOnly(raw) {
  const list = (Array.isArray(raw) ? raw : String(raw || "").split("|")).map((g) => String(g).trim()).filter(Boolean);
  return list.includes("display") && !list.some((g) => SITE_GROUPS.includes(g));
}

/** The shop screen's three choices (C9; demo displayHome). Paths are the apps' real screens (C13: the Projector's). */
export const DISPLAY_SCREENS = Object.freeze([
  Object.freeze({ id: "kiosk", name: "Door QR", line: "Sign in and out at the shop door", host: "calendar", path: "/here/kiosk" }),
  Object.freeze({ id: "monitor", name: "Pit monitor", line: "Next match, batteries, issues, pit duty", host: "compete", path: "/pit/monitor" }),
  Object.freeze({ id: "projector", name: "Projector", line: "The practice screen, the meeting lists or the build plan on the shop TV", host: "tasks", path: "/projector" }),
]);
export function displayHref(screen, site) {
  return `${site.scheme}://${screen.host}.${site.domain}${screen.path}`;
}

/**
 * ?blocked=<app id> → the name of that app from apps.json, or "" (C14). The id must be an entry's id; the name shown
 * always comes from the list, never from the address.
 */
export function blockedAppName(search, apps) {
  let id = "";
  try { id = new URLSearchParams(search || "").get("blocked") || ""; } catch { return ""; }
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return "";
  const entry = (Array.isArray(apps) ? apps : []).find((a) => a && a.id === id);
  return entry ? text(entry.name, 60) : "";
}

// ---------- the network ----------

async function getJson(path, { timeout = WAIT_MS, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl(path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: ctl.signal });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /today.json, checked. Resolves to null on any failure: the home then stays as release 8.1 had it. */
export async function fetchToday(site, origin = location.origin, opts) {
  const json = await getJson("/today.json", opts);
  return json === undefined ? null : parseToday(json, site, origin);
}

/** GET /event.json (Calendar's current event): true when an event is on today (C14). */
export async function fetchEventDay(opts) {
  const json = await getJson("/event.json", opts);
  return !!(json && typeof json === "object" && json.happeningNow === true);
}

/**
 * POST /today/task-done {taskId}. "ok" when Tasks marked it done; "refused" when it may not be done from here (403,
 * 404 or another 4xx); "timeout" when no answer came in time (it may have worked); "failed" on a network error or 5xx.
 */
export async function postTaskDone(taskId, { timeout = WAIT_MS, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl("/today/task-done", {
      method: "POST", credentials: "same-origin", cache: "no-store", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ taskId }),
    });
    if (res.ok) return "ok";
    return res.status >= 400 && res.status < 500 ? "refused" : "failed";
  } catch {
    return ctl.signal.aborted ? "timeout" : "failed";
  } finally {
    clearTimeout(timer);
  }
}

// ---------- drawing ----------

// A link to another app opens a new tab, as the tiles do, so the portal stays open; a link on this host stays here.
function linkTo(a, href) {
  a.href = href;
  let other = true;
  try { other = new URL(href).host !== location.host; } catch { /* keep the new tab */ }
  if (other) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.append(el("span", "vh", " (opens in a new tab)"));
  }
  return a;
}

function card(id, title, extra = {}) {
  const sec = el("section", `hcard${extra.className ? ` ${extra.className}` : ""}`);
  sec.id = id;
  const h = el("h2", "", title);
  h.id = `${id}-h`;
  sec.setAttribute("aria-labelledby", h.id);
  if (extra.guide) sec.dataset.guide = extra.guide;
  sec.append(h);
  return sec;
}

// One row: title, one muted line, a count, a chevron; an inline button (Sign in, Sign up) when the app gives one.
function todayRow(r, warn) {
  const li = el("li", "li todayrow");
  li.dataset.id = r.id;
  const a = el("a", "rowlink");
  const words = el("span", "rtext");
  words.append(el("span", "rt", r.title));
  if (r.detail) words.append(el("span", "rl", r.detail));
  a.append(words);
  if (r.count) a.append(el("span", warn ? "tcount warn" : "tcount", String(r.count)));
  if (!r.cta) a.append(el("span", "chev", "›"));
  li.append(linkTo(a, r.href));
  if (r.cta) li.append(linkTo(el("a", "btn btn-outline btn-row-cta", r.cta.label), r.cta.href));
  a.querySelector(".chev")?.setAttribute("aria-hidden", "true");
  return li;
}

function rowList(rows, warn) {
  const ul = el("ul", "list");
  ul.append(...rows.map((r) => todayRow(r, warn)));
  return ul;
}

/**
 * The Waiting on you card. data-guide="wait" is the guide's stop. With no rows it is drawn only when `empty` is set
 * (staff, once /today.json answered: the demo's "Nothing is waiting on you.", C13). Counts are the demo's amber chip.
 */
export function waitingCard(rows, { empty = false } = {}) {
  if (!rows.length && !empty) return null;
  const sec = card("home-waiting", "Waiting on you", { guide: "wait" });
  sec.append(rows.length ? rowList(rows, true) : el("p", "mute home-empty", "Nothing is waiting on you."));
  return sec;
}

export function todayCard(rows) {
  if (!rows.length) return null;
  const sec = card("home-today", "Today");
  sec.append(rowList(rows, false));
  return sec;
}

function pill(cls, words) {
  return el("span", `pill-dot ${cls}`, words);
}

/**
 * The student's next task, as the demo's Next up card (C4, C13, C14). Done is gold unless the task is held back
 * (blocked, on hold or waiting on another task). With no task and `empty` set: "Nothing assigned to you".
 * o: { empty, compact (event day), say(message) (the lasting status line), onBusy(bool), onDone() → Promise<boolean>
 *      (true when the home was drawn again), post (tests) }.
 * Done: "ok" redraws the home; "refused" offers "Open task" (gold) instead; "timeout" says so and asks for
 * /today.json again; "failed" puts Done back with a short message.
 */
export function nextCard(next, o = {}) {
  const { empty = false, compact = false, say = () => {}, onBusy = () => {}, onDone = async () => true, post = postTaskDone } = o;
  const cls = `hero nextup${compact ? " evcompact" : ""}`;
  if (!next) {
    if (!empty) return null;
    const none = card("home-next", "Nothing assigned to you", { className: cls });
    none.append(el("p", "mute", "Take something nobody has yet."));
    return none;
  }
  const sec = card("home-next", "", { className: cls });
  const h = sec.querySelector("h2");
  h.textContent = next.title;
  sec.insertBefore(el("p", "next-eyebrow", "Your next task"), h);
  const line = nextLine(next);
  if (line) sec.append(el("p", "mute next-line", line));
  if (next.onHold) sec.append(el("p", "small mute next-hold", "This task is on hold."));
  if (next.blocked) {
    const b = el("p", "small next-blocked");
    b.append(pill("bad", "Blocked"));
    sec.append(b);
  }
  if (next.steps) {
    const r = el("div", "next-steps");
    const bar = el("div", "next-bar");
    bar.setAttribute("aria-hidden", "true");
    const fill = el("i");
    fill.style.width = `${Math.round((100 * next.steps.done) / next.steps.total)}%`;
    bar.append(fill);
    r.append(bar, el("span", "small mute", `${next.steps.done} of ${next.steps.total} steps`));
    sec.append(r);
  }
  if (next.waitingOn) {
    const w = el("p", "small next-waiting");
    w.append(pill("bad", "Waiting on"), document.createTextNode(` ${next.waitingOn.join(", ")}.`));
    sec.append(w);
  }
  const acts = el("div", "heroacts");
  const done = el("button", taskHeld(next) ? "btn btn-outline" : "btn");
  done.type = "button";
  done.dataset.tip = "Mark this task done and bring up your next one.";
  done.append(svgIcon(CHECK, 16), document.createTextNode("Done"));
  acts.append(done);
  if (next.stuckHref) acts.append(linkTo(el("a", "btn btn-outline", "I'm stuck"), next.stuckHref));
  if (next.partHref) {
    const part = el("a", "btn btn-outline");
    part.append(svgIcon(PARTS, 16), document.createTextNode("Request a part"));
    acts.append(linkTo(part, next.partHref));
  }
  const open = linkTo(el("a", "btn btn-ghost", "Open"), next.href);
  open.dataset.tip = "The task in the Task App, with its steps.";
  acts.append(open);
  let busy = false;
  const again = () => { busy = false; done.disabled = false; };
  done.addEventListener("click", async () => {
    if (busy) return; // a second press while the first is on its way sends nothing
    busy = true;
    done.disabled = true;
    onBusy(true);
    say("Marking it done…");
    const result = await post(next.taskId);
    onBusy(false);
    if (result === "ok" || result === "timeout") {
      say(result === "ok" ? "Done." : "We couldn't tell if that worked.");
      if (!(await onDone())) again();
      return;
    }
    if (result === "failed") {
      say("That didn't go through. Press Done to try again.");
      again();
      done.focus();
      return;
    }
    // "refused": this task can't be marked done from the portal; the card shows "Open task" instead (C4).
    const openTask = linkTo(el("a", "btn", "Open task"), next.href);
    openTask.dataset.tip = "Finish the task in the Task App.";
    done.replaceWith(openTask);
    open.remove();
    say("This task can't be marked done from here. Open it in the Task App.");
    openTask.focus();
  });
  sec.append(acts);
  return sec;
}

/** Recent activity: five rows, the app's name muted in front, plain text, with when it happened. Not for parents. */
export function activityCard(items, now = Date.now()) {
  if (!items.length) return null;
  const sec = card("home-activity", "Recent activity");
  const ul = el("ul", "list");
  for (const a of items) {
    const li = el("li", "li actli");
    const link = el("a", "actlink");
    if (a.app) link.append(el("span", "actapp", a.app));
    const body = el("span", "grow");
    body.append(el("b", "", a.title));
    if (a.detail) body.append(document.createTextNode(` ${a.detail}`));
    link.append(body);
    const when = whenText(a.at, now);
    if (when) {
      const w = el("time", "who", when);
      w.dateTime = a.at;
      link.append(w);
    }
    li.append(linkTo(link, a.href));
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

/**
 * The shop screen's home (C9): "Pick what this screen shows" and three large links, nothing else. `blocked` is the
 * name of an app that refused the screen (C14, from blockedAppName): the demo's notice above the choices.
 */
export function displayHome(site, blocked = "") {
  const box = el("div", "dsp");
  box.id = "display-home";
  if (blocked) box.append(el("p", "dnote", `${blocked} isn't available on a display. Pick one of these instead.`));
  const h = el("h1", "", "Pick what this screen shows");
  const grid = el("ul", "dsp-grid");
  for (const s of DISPLAY_SCREENS) {
    const li = el("li");
    const a = el("a", "dcard");
    a.href = displayHref(s, site);
    a.dataset.screen = s.id;
    a.append(el("b", "", s.name), el("span", "dmute", s.line));
    li.append(a);
    grid.append(li);
  }
  box.append(h, grid);
  return box;
}
