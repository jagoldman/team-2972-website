// The portal home's cards above the tiles (release 8.1.5, CONTRACT C4) and the shop screen's home (C9), drawn as the
// demo's Home (portal-demo js/core.js views.portal, todayRow, waitingRows, practiceRows, nextUpCard, displayHome).
// Data: same-origin GET /today.json (Caddy sends it to Account's /api/today with the identity headers):
//   {v:1, today:[row], waiting:[row], next:{taskId, title, due, project, href}|null, activity:[{title, detail?, href, at}]}
//   row = {id, section, title, detail, href, count?, cta?:{label, href}}
// A part with no data is not drawn; a failed or missing /today.json leaves the home as it was in release 8.1.
// Every text goes in with textContent, never as HTML; every link must be on this site (parseToday drops the rest).
// No imports, so node can test the pure parts (test/portal-home-test.mjs).

const SVG_NS = "http://www.w3.org/2000/svg";

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

const MODES = ["build", "competition"];

/** The rows for the person's current mode (the kit's `mode` cookie, C12). */
export function rowsForMode(rows, mode) {
  const m = mode === "competition" ? "competition" : "build";
  return (rows || []).filter((r) => !r.modes || r.modes.includes(m));
}

function row(r, site, origin) {
  if (!r || typeof r !== "object") return null;
  const title = text(r.title);
  const href = safeHref(r.href, site, origin);
  if (!title || !href) return null;
  // C12: a row may belong to one mode; no (or no known) `modes` means both.
  const modes = Array.isArray(r.modes) ? MODES.filter((m) => r.modes.includes(m)) : [];
  const out = { id: text(r.id, 80), title, detail: text(r.detail), href, modes: modes.length ? modes : MODES.slice() };
  if (Number.isInteger(r.count) && r.count > 0) out.count = r.count;
  if (r.cta && typeof r.cta === "object") {
    const label = text(r.cta.label, 40), ctaHref = safeHref(r.cta.href, site, origin);
    if (label && ctaHref) out.cta = { label, href: ctaHref };
  }
  return out;
}

/** /today.json's answer → { today, waiting, next, activity }, every part checked; null when the answer is not v1. */
export function parseToday(json, site, origin) {
  if (!json || typeof json !== "object" || json.v !== 1) return null;
  const rows = (list) => (Array.isArray(list) ? list : []).map((r) => row(r, site, origin)).filter(Boolean);
  let next = null;
  const n = json.next;
  if (n && typeof n === "object") {
    const taskId = typeof n.taskId === "string" || Number.isInteger(n.taskId) ? String(n.taskId) : "";
    const title = text(n.title), href = safeHref(n.href, site, origin);
    if (taskId && title && href) next = { taskId, title, href, project: text(n.project, 120), due: typeof n.due === "string" ? n.due : "" };
  }
  const activity = (Array.isArray(json.activity) ? json.activity : []).map((a) => {
    if (!a || typeof a !== "object") return null;
    const title = text(a.title), href = safeHref(a.href, site, origin);
    if (!title || !href) return null;
    const at = typeof a.at === "string" && !Number.isNaN(Date.parse(a.at)) ? a.at : "";
    return { title, detail: text(a.detail), href, at };
  }).filter(Boolean).slice(0, 5);
  return { today: rows(json.today), waiting: rows(json.waiting), next, activity };
}

/** "Due Tue, Nov 18" for a date-only or full date; "" when there is none. */
export function dueText(due, locale) {
  if (typeof due !== "string" || !due) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  return `due ${d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}`;
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

/** Raw X-Authentik-Groups (pipe-separated or a list) → the shop screen? Only when `display` is the person's one group. */
export function isDisplayOnly(raw) {
  const list = (Array.isArray(raw) ? raw : String(raw || "").split("|")).map((g) => String(g).trim()).filter(Boolean);
  return list.length > 0 && list.every((g) => g === "display");
}

/** The shop screen's three choices (C9; demo displayHome). Paths are the apps' real screens. */
export const DISPLAY_SCREENS = Object.freeze([
  Object.freeze({ id: "kiosk", name: "Door QR", line: "Sign in and out at the shop door", host: "calendar", path: "/here/kiosk" }),
  Object.freeze({ id: "monitor", name: "Pit monitor", line: "Next match, batteries, issues, pit duty", host: "compete", path: "/pit/monitor" }),
  Object.freeze({ id: "projector", name: "Projector", line: "The practice screen, the meeting lists or the build plan on the shop TV", host: "tasks", path: "/projector" }),
]);
export function displayHref(screen, site) {
  return `${site.scheme}://${screen.host}.${site.domain}${screen.path}`;
}

// ---------- the network ----------

/** GET /today.json, checked. Resolves to null on any failure: the home then stays as release 8.1 had it. */
export async function fetchToday(site, origin = location.origin) {
  try {
    const res = await fetch("/today.json", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return parseToday(await res.json(), site, origin);
  } catch {
    return null;
  }
}

/** POST /today/task-done {taskId}: true when Tasks marked it done. */
export async function postTaskDone(taskId) {
  try {
    const res = await fetch("/today/task-done", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ taskId }),
    });
    return res.ok;
  } catch {
    return false;
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
function todayRow(r) {
  const li = el("li", "li todayrow");
  li.dataset.id = r.id;
  const a = el("a", "rowlink");
  a.append(el("span", "rt", r.title));
  if (r.detail) a.append(el("span", "rl", r.detail));
  if (r.count) a.append(el("span", "tcount", String(r.count)));
  if (!r.cta) a.append(el("span", "chev", "›"));
  li.append(linkTo(a, r.href));
  if (r.cta) li.append(linkTo(el("a", "btn btn-outline btn-row-cta", r.cta.label), r.cta.href));
  a.querySelector(".chev")?.setAttribute("aria-hidden", "true");
  return li;
}

function rowList(rows) {
  const ul = el("ul", "list");
  ul.append(...rows.map(todayRow));
  return ul;
}

/** The Waiting on you card (staff in the demo; here, whoever has waiting rows). data-guide="wait" is the guide's stop. */
export function waitingCard(rows) {
  if (!rows.length) return null;
  const sec = card("home-waiting", "Waiting on you", { guide: "wait" });
  sec.append(rowList(rows));
  return sec;
}

export function todayCard(rows) {
  if (!rows.length) return null;
  const sec = card("home-today", "Today");
  sec.append(rowList(rows));
  return sec;
}

/**
 * The student's next task, as the demo's Next up card: Done is the one gold button. Done posts to /today/task-done;
 * on success `onDone()` redraws the home; on an error the card offers "Open task" (gold) instead.
 */
export function nextCard(next, { onDone, post = postTaskDone } = {}) {
  if (!next) return null;
  const sec = card("home-next", "", { className: "hero nextup" });
  const h = sec.querySelector("h2");
  h.textContent = next.title;
  const eyebrow = el("p", "eyebrow", "Your next task");
  sec.insertBefore(eyebrow, h);
  const line = [next.project, dueText(next.due)].filter(Boolean).join(" · ");
  if (line) sec.append(el("p", "mute", line));
  const acts = el("div", "heroacts");
  const done = el("button", "btn");
  done.type = "button";
  done.dataset.tip = "Mark this task done; the next one takes its place.";
  done.append(svgIcon(CHECK, 16), document.createTextNode("Done"));
  const open = linkTo(el("a", "btn btn-outline", "Open"), next.href);
  open.dataset.tip = "The task in the Task App, with its steps.";
  const status = el("p", "small mute home-status");
  status.setAttribute("role", "status");
  done.addEventListener("click", async () => {
    done.disabled = true;
    status.textContent = "Marking it done…";
    if (await post(next.taskId)) {
      status.textContent = "Done.";
      if (onDone) onDone();
      return;
    }
    // The route answered an error: the card shows "Open task" instead (C4).
    const openTask = linkTo(el("a", "btn", "Open task"), next.href);
    openTask.dataset.tip = "Finish the task in the Task App.";
    acts.replaceChildren(openTask);
    status.textContent = "This task can't be marked done from here. Open it in the Task App.";
    openTask.focus();
  });
  acts.append(done, open);
  sec.append(acts, status);
  return sec;
}

/** Recent activity: five rows, plain text, newest first, with when it happened. Not for parents. */
export function activityCard(items, now = Date.now()) {
  if (!items.length) return null;
  const sec = card("home-activity", "Recent activity");
  const ul = el("ul", "list");
  for (const a of items) {
    const li = el("li", "li actli");
    const link = el("a", "actlink");
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

/** The shop screen's home (C9): "Pick what this screen shows" and three large links, nothing else. */
export function displayHome(site) {
  const box = el("div", "dsp");
  box.id = "display-home";
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
