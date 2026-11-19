// The portal home's data (release 8.1.5, CONTRACT C4, C12, C13, C14; release 8.3, H1, C1, E1) and the shop screen's
// home (C9, C14). The signed-in Home is drawn by js/portal-ground.js from what parseToday gives it.
// Data: same-origin GET /today.json (Caddy sends it to Account's /api/today with the identity headers):
//   {v:1, today:[row], waiting:[row], others?:[row], next:{taskId, title, due, project, href, practicesLeft?,
//    nextStep?:{id, title}, …}|null,
//    activity:[{app?, title, detail?, href, at}], season?, milestones?, week?, coming?, event?}
//   row = {id, section, title, detail, href, count?, cta?:{label, href, primary?}, modes?, group?, mark?, lines?, acts?}
//   (Account fills `detail` with the first of `lines` for older portals; this one draws `lines` when they are sent.)
// Writes: POST /today/task-done {taskId} (C4) and POST /today/act {app, action, key, reason?} (H2).
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

/** At most this many rows are read from each of today, waiting and others (Account sends 8 per app). */
export const MAX_ROWS = 60;
function text(v, max = 200) {
  if (typeof v !== "string") return "";
  const t = v.slice(0, max * 4 + 16).replace(/\s+/g, " ").trim();
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

// Release 8.3 (CONTRACT H1): the act a row may carry, checked here as Account checks it. Unknown apps and keys that
// are not plain ids are dropped (the act, not the row).
export const ACT_APPS = Object.freeze(["parts", "skills", "calendar", "tasks"]);
// Up to 250 characters, as Account's (today-home.ts ACT_KEY): Skills' key is "<uid>:<skillId>", and an Authentik uid
// alone is 64 characters.
const ACT_KEY = /^[A-Za-z0-9_:.-]{1,250}$/;
const ACT_ACTION = /^[a-z][a-z_.-]{0,39}$/;
const TONES = ["ok", "warn", "bad"];
/** The actions each app owns on the act path (CONTRACT H2, S3, P3, C3, T3), as Account's ACTIONS. */
export const ACT_ACTIONS = Object.freeze({ parts: ["approve", "deny", "unapprove"], skills: ["signoff"], calendar: ["snack", "volunteer"], tasks: ["step-done"] });
function act(a, rowApp) {
  if (!a || typeof a !== "object") return null;
  const label = text(a.label, 40);
  if (!label || !ACT_APPS.includes(a.app) || typeof a.action !== "string" || !ACT_ACTION.test(a.action)) return null;
  // The app, its action and the row belong together (review item 4): a Parts row with "signoff" keeps no button.
  if (!ACT_ACTIONS[a.app].includes(a.action) || (rowApp && rowApp !== a.app)) return null;
  if (typeof a.key !== "string" || !ACT_KEY.test(a.key)) return null;
  const out = { label, app: a.app, action: a.action, key: a.key };
  if (a.primary === true) out.primary = true;
  // Deny always asks for a reason; nothing else does.
  if (a.app === "parts" && a.action === "deny") out.reason = true;
  return out;
}

function row(r, site, origin) {
  if (!r || typeof r !== "object") return null;
  const title = text(r.title);
  const href = safeHref(r.href, site, origin);
  if (!title || !href) return null;
  // C12: a row may belong to one mode; no (or no known) `modes` means both.
  const modes = Array.isArray(r.modes) ? MODES.filter((m) => r.modes.includes(m)) : [];
  const out = { id: text(r.id, 200), title, detail: text(r.detail), href, modes: modes.length ? modes : MODES.slice() };
  if (r.section === "others") out.section = "others";
  if (Number.isInteger(r.count) && r.count > 0) out.count = r.count;
  if (r.cta && typeof r.cta === "object") {
    const label = text(r.cta.label, 40), ctaHref = safeHref(r.cta.href, site, origin);
    if (label && ctaHref) out.cta = { label, href: ctaHref };
    // C17: the app may make its link the page's one filled button (Calendar's Sign in).
    if (out.cta && r.cta.primary === true) out.cta.primary = true;
  }
  // H1, all optional: a group label, a state (a dot and a word), up to two more lines, up to two acts.
  const group = text(r.group, 60);
  if (group) out.group = group;
  if (r.mark && typeof r.mark === "object" && TONES.includes(r.mark.tone)) {
    const word = text(r.mark.word, 30);
    if (word) out.mark = { word, tone: r.mark.tone };
  }
  const lines = (Array.isArray(r.lines) ? r.lines.slice(0, 4) : []).map((l) => text(l)).filter(Boolean).slice(0, 2);
  if (lines.length) out.lines = lines;
  const own = /^([a-z]+):/.exec(out.id);
  const acts = (Array.isArray(r.acts) ? r.acts : []).slice(0, 2).map((a) => act(a, own ? own[1] : "")).filter(Boolean);
  if (acts.length) out.acts = acts;
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
  const waiting = (Array.isArray(n.waitingOn) ? n.waitingOn.slice(0, 6) : []).map((w) => text(w, 120)).filter(Boolean).slice(0, 3);
  if (waiting.length) out.waitingOn = waiting;
  if (n.onHold === true) out.onHold = true;
  if (n.blocked === true) out.blocked = true;
  // 8.3 (CONTRACT T1): the first open step ({id, title}), which "Mark step done" ticks through the act path with the key
  // "<taskId>:<itemId>" (T3); a step whose key would not be a plain id is left out (Account checks the same). And the
  // practices left before the task is due, counted by Tasks.
  if (n.nextStep && typeof n.nextStep === "object") {
    const id = typeof n.nextStep.id === "string" || Number.isInteger(n.nextStep.id) ? String(n.nextStep.id) : "";
    const title = text(n.nextStep.title, 160);
    if (id && title && ACT_KEY.test(`${taskId}:${id}`)) out.nextStep = { id, title };
  }
  if (Number.isInteger(n.practicesLeft) && n.practicesLeft >= 0 && n.practicesLeft <= 10000) out.practicesLeft = n.practicesLeft;
  return out;
}

// ---------- pure: release 8.3's optional parts (CONTRACT H1, C1, E1) ----------

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** "2026-11-10" when it is a real day, else "". */
export function isoDay(v) {
  if (typeof v !== "string") return "";
  const m = ISO_DAY.exec(v);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? v : "";
}
/** Today's date on this device, as "YYYY-MM-DD". */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
function dayOf(s) { const m = ISO_DAY.exec(s); return new Date(+m[1], +m[2] - 1, +m[3]); }
/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from, to) { return Math.round((dayOf(to) - dayOf(from)) / 86400000); }
/** "Thu, Nov 12". */
export function fmtDay(s, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return isoDay(s) ? dayOf(s).toLocaleDateString("en-US", opts) : "";
}
/** "15:30" → "3:30 pm", "18:00" → "6 pm"; anything else → "". */
export function clock(t) {
  const m = typeof t === "string" ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t) : null;
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}${m[2] === "00" ? "" : `:${m[2]}`} ${h < 12 ? "am" : "pm"}`;
}
/** "3:30 pm–6 pm", "3:30 pm", or "". */
export function timeSpan(start, end) {
  const a = clock(start), b = clock(end);
  return a && b ? `${a}–${b}` : a;
}
export function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

// A link the data gives as an app path ("/pit?tab=check") belongs to that app's host; a full link is checked as is.
function appHref(href, site, host) {
  if (!site || !site.domain) return null;
  return safeHref(href, site, `${site.scheme || "https"}://${host}.${site.domain}`);
}

const SEASON_KINDS = ["practice", "build", "comp"];
function season(sn) {
  if (!sn || typeof sn !== "object" || !sn.target || typeof sn.target !== "object") return null;
  const t = sn.target;
  const date = isoDay(t.date), kind = t.kind === "kickoff" || t.kind === "comp" ? t.kind : "";
  const name = text(t.name, 80);
  if (!date || !kind || (kind === "comp" && !name)) return null;
  if (!Array.isArray(sn.days)) return null;
  const seen = new Set();
  const days = sn.days.slice(0, 200).map((d) => (d && typeof d === "object" && isoDay(d.date) && SEASON_KINDS.includes(d.kind) && d.date < date ? { date: d.date, kind: d.kind } : null))
    .filter((d) => d && !seen.has(d.date) && seen.add(d.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { target: { name: kind === "kickoff" ? "kickoff" : name, title: kind === "kickoff" ? "Kickoff" : name, date, kind }, days };
}

// The Task App's own rule (safeColor): a plain # and 3, 4, 6 or 8 hex digits; anything else is no colour.
const COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function milestones(list, site) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map((m) => {
    if (!m || typeof m !== "object") return null;
    const name = text(m.name, 120), date = isoDay(m.date), href = appHref(m.href, site, "tasks");
    if (!name || !date || !href) return null;
    const out = { name, date, project: text(m.project, 120), href };
    if (typeof m.color === "string" && COLOR.test(m.color)) out.color = m.color;
    return out;
  }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
}

const WEEK_KINDS = ["practice", "build", "comp", "outreach", "meeting", "volunteer"];
function weekItem(i) {
  if (!i || typeof i !== "object" || !WEEK_KINDS.includes(i.kind)) return null;
  const name = text(i.name, 120);
  if (!name && i.kind !== "practice" && i.kind !== "build") return null;
  return { kind: i.kind, name, time: timeSpan(i.startTime, i.endTime), location: text(i.location, 120) };
}
function week(list, site) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = list.slice(0, 7).map((d) => {
    if (!d || typeof d !== "object" || !isoDay(d.date) || seen.has(d.date)) return null;
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 6).map(weekItem).filter(Boolean);
    const href = appHref(d.href, site, "calendar");
    if (!items.length || !href) return null;
    seen.add(d.date);
    const day = { date: d.date, href, items };
    if (Number.isInteger(d.mentorsComing) && d.mentorsComing >= 0 && d.mentorsComing < 1000) day.mentorsComing = d.mentorsComing;
    const sn = d.snacks;
    if (sn && typeof sn === "object" && Number.isInteger(sn.open) && sn.open >= 0 && sn.open < 100) {
      const names = (Array.isArray(sn.names) ? sn.names.slice(0, 12) : []).map((n) => text(n, 60)).filter(Boolean).slice(0, 6);
      const modes = Array.isArray(sn.modes) ? MODES.filter((m) => sn.modes.includes(m)) : [];
      day.snacks = { names, open: sn.open, modes: modes.length ? modes : MODES.slice() };
    }
    return day;
  }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

function coming(list, site) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 4).map((e) => {
    if (!e || typeof e !== "object") return null;
    const date = isoDay(e.date), name = text(e.name, 120), href = appHref(e.href, site, "calendar");
    if (!date || !name || !href) return null;
    return { date, name, time: timeSpan(e.startTime, e.endTime), location: text(e.location, 120), href };
  }).filter(Boolean);
}

const TEAM = (n) => Number.isInteger(n) && n > 0 && n < 100000;
function eventPart(ev, site) {
  if (!ev || typeof ev !== "object" || !ev.line || typeof ev.line !== "object") return null;
  const l = ev.line;
  const line = { now: text(l.now, 120), robot: text(l.robot, 120), match: null };
  if (l.match && typeof l.match === "object" && text(l.match.text, 120)) {
    line.match = { label: l.match.label === "Our match now" ? "Our match now" : "Next match", text: text(l.match.text, 120) };
  }
  const pit = (Array.isArray(ev.pit) ? ev.pit : []).slice(0, 2).map((p) => {
    if (!p || typeof p !== "object") return null;
    const title = text(p.title), href = appHref(p.href, site, "compete");
    if (!title || !href) return null;
    const out = { id: `compete:${text(p.id, 160)}`, title, detail: text(p.detail), href, modes: MODES.slice() };
    // Competition sends up to three open issues; Account passes three on (E1).
    const lines = (Array.isArray(p.lines) ? p.lines.slice(0, 6) : []).map((x) => text(x)).filter(Boolean).slice(0, 3);
    if (lines.length) out.lines = lines;
    if (p.cta && typeof p.cta === "object") {
      const label = text(p.cta.label, 40), ctaHref = appHref(p.cta.href, site, "compete");
      if (label && ctaHref) out.cta = { label, href: ctaHref };
    }
    return out;
  }).filter(Boolean);
  const next = (Array.isArray(ev.next) ? ev.next : []).slice(0, 3).map((m) => {
    if (!m || typeof m !== "object" || !Number.isInteger(m.match) || m.match < 1 || m.match > 999) return null;
    if (m.alliance !== "Red" && m.alliance !== "Blue") return null;
    const teams = (v) => (Array.isArray(v) ? v.slice(0, 6).filter(TEAM).slice(0, 3) : []);
    const at = typeof m.at === "string" && !Number.isNaN(Date.parse(m.at)) ? m.at : "";
    return { match: m.match, at, alliance: m.alliance, with: teams(m.with), against: teams(m.against) };
  }).filter(Boolean);
  if (!line.now && !line.robot && !line.match && !pit.length && !next.length) return null;
  return { name: text(ev.name, 120), line, pit, next };
}

/** The meeting days from `today` up to and with `date` (the demo's "N practices left"); null when it can't be told. */
export function practicesLeft(sn, date, today) {
  if (!sn || !isoDay(date) || date < today || date >= sn.target.date) return null;
  return sn.days.filter((d) => d.date >= today && d.date <= date).length;
}
export function practicesText(sn, date, today) {
  const n = practicesLeft(sn, date, today);
  return n == null ? "" : n === 0 ? "no practice before then" : `${plural(n, "practice", "practices")} left`;
}

/**
 * /today.json's answer → { today, waiting, others, next, activity, season, milestones, week, coming, event }, every
 * part checked; null when the answer is not v1. Each 8.3 part is null (or []) when it is missing or malformed.
 */
export function parseToday(json, site, origin) {
  if (!json || typeof json !== "object" || json.v !== 1) return null;
  // Every list is cut before it is read (review item 4), so a huge answer cannot hang the page.
  const rows = (list) => (Array.isArray(list) ? list.slice(0, MAX_ROWS) : []).map((r) => row(r, site, origin)).filter(Boolean);
  const activity = (Array.isArray(json.activity) ? json.activity.slice(0, 10) : []).map((a) => {
    if (!a || typeof a !== "object") return null;
    const title = text(a.title), href = safeHref(a.href, site, origin);
    if (!title || !href) return null;
    const at = typeof a.at === "string" && !Number.isNaN(Date.parse(a.at)) ? a.at : "";
    return { app: text(a.app, 40), title, detail: text(a.detail), href, at };
  }).filter(Boolean).slice(0, 5);
  // A row's `section` decides: "others" rows (Waiting on others, H1) may come in their own list or in another one.
  const all = [rows(json.today), rows(json.waiting), rows(json.others)];
  const mine = (list) => list.filter((r) => r.section !== "others");
  return {
    today: mine(all[0]), waiting: mine(all[1]), others: all.flat().filter((r) => r.section === "others"), next: nextTask(json.next, site, origin), activity,
    season: season(json.season), milestones: milestones(json.milestones, site), week: week(json.week, site),
    coming: coming(json.coming, site), event: eventPart(json.event, site), present: present(json),
  };
}

/**
 * Which apps' parts are in this answer (review item 2): only then can a re-read tell whether a write of that app's
 * went through. Account leaves out an app that did not answer, and sends no field that says so.
 */
function present(json) {
  const ids = [json.today, json.waiting, json.others].flatMap((l) => (Array.isArray(l) ? l.slice(0, MAX_ROWS) : []))
    .map((r) => (r && typeof r.id === "string" ? r.id : ""));
  const from = (app) => ids.some((id) => id.startsWith(`${app}:`));
  return {
    parts: from("parts"),
    skills: from("skills"),
    calendar: from("calendar") || Array.isArray(json.week) || !!(json.season && typeof json.season === "object"),
    tasks: from("tasks") || !!(json.next && typeof json.next === "object") || Array.isArray(json.milestones),
  };
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
 * The apps that can refuse a shop-screen login, by host label (CONTRACT C16): each refusal page sends its own host label
 * as ?blocked=. The names are the apps' names in infra's config/apps.json where the host has one entry (tasks,
 * calendar, parts, skills, admin, editor); compete and tools have several entries and Account none, so their names are
 * the apps' own.
 */
export const BLOCKED_APPS = Object.freeze({
  tasks: "Tasks", calendar: "Calendar", parts: "Parts & Inventory", skills: "Skills", compete: "Competition",
  account: "Account", admin: "Admin", editor: "Website editor", tools: "Tools",
});
/**
 * ?blocked=<host label> → the name the shop screen's notice shows, or "" (C14, C16). Only a label in BLOCKED_APPS
 * counts; the name always comes from that table, never from the address.
 */
export function blockedAppName(search) {
  let label = "";
  try { label = new URLSearchParams(search || "").get("blocked") || ""; } catch { return ""; }
  return Object.hasOwn(BLOCKED_APPS, label) ? BLOCKED_APPS[label] : "";
}

// ---------- the network ----------

/** At most this much of an answer is read (bytes); a longer one counts as no answer. */
export const MAX_BYTES = 262144;
function header(res, name) {
  return res && res.headers && typeof res.headers.get === "function" ? res.headers.get(name) || "" : "";
}
function isJson(res) {
  return /^application\/(?:[\w.+-]*\+)?json\b/i.test(header(res, "content-type"));
}
/**
 * A sign-in page or a redirect in place of an answer (review item 1): the requests ask not to follow redirects, so a
 * redirect comes back as one ("opaqueredirect", or a 3xx); a 200 that is a page and not JSON is the sign-in page.
 */
export function isSignedOut(res) {
  if (!res) return false;
  if (res.type === "opaqueredirect" || res.redirected === true || (res.status >= 300 && res.status < 400)) return true;
  return res.status === 200 && /text\/html/i.test(header(res, "content-type"));
}
/** The body as text, at most `max` bytes; null when it is longer (or cannot be read). */
export async function readCapped(res, max = MAX_BYTES) {
  const len = Number(header(res, "content-length"));
  if (Number.isFinite(len) && len > max) return null;
  try {
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const chunks = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        n += value.byteLength;
        if (n > max) { reader.cancel().catch(() => {}); return null; }
        chunks.push(value);
      }
      const all = new Uint8Array(n);
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.byteLength; }
      return new TextDecoder().decode(all);
    }
    const t = await res.text();
    return t.length > max ? null : t;
  } catch {
    return null;
  }
}
async function jsonCapped(res, max) {
  const t = await readCapped(res, max);
  if (t == null) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

async function getJson(path, { timeout = WAIT_MS, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl(path, { credentials: "same-origin", cache: "no-store", redirect: "manual", headers: { Accept: "application/json" }, signal: ctl.signal });
    if (res.status !== 200 || isSignedOut(res) || !isJson(res)) return undefined;
    return await jsonCapped(res, MAX_BYTES);
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

/** GET /event.json (Calendar's current event): the answer (for the kit's banner rules), or null. */
export async function fetchEvent(opts) {
  const json = await getJson("/event.json", opts);
  return json && typeof json === "object" ? json : null;
}
/** True when /event.json says an event is on today (C14). */
export async function fetchEventDay(opts) {
  const json = await fetchEvent(opts);
  return !!(json && json.happeningNow === true);
}

/**
 * POST /today/task-done {taskId} (C4). Resolves to { result }: "ok" (204 only); "refused" (403, 404: it may not be
 * done from here); "signedout" (a redirect or a sign-in page); "uncertain" (any other answer, a network failure or no
 * answer in time: it may have been saved).
 */
export async function postTaskDone(taskId, { timeout = WAIT_MS, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl("/today/task-done", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "manual", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ taskId }),
    });
    if (isSignedOut(res)) return { result: "signedout" };
    if (res.status === 204) return { result: "ok" };
    if (res.status === 403 || res.status === 404) return { result: "refused" };
    return { result: "uncertain" };
  } catch {
    return { result: "uncertain" };
  } finally {
    clearTimeout(timer);
  }
}

/** Parts' id of the approval an Undo must name (CONTRACT P4): at most 64 of A-Z a-z 0-9 _ -. */
const APPROVAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * POST /today/act {app, action, key, reason?, approval?} (CONTRACT H2, P4). Resolves to { result, undoUntil?,
 * approval?, message? }:
 * "ok" (204; or 200 with a JSON body, which is Approve's: `undoUntil` and `approval` only when it carried both, still
 * in time, and only then is Undo offered); "changed" (409: someone else already did it; Account may add a plain
 * `message`, which is passed on); "refused" (403); "gone" (404); "reason" (422: a reason is needed); "signedout" (a
 * redirect or a sign-in page); "uncertain" (any 5xx, any other code, a 200 that is not JSON, a network failure or no
 * answer in time: it may have been saved, so the page must look again before it says anything more).
 */
export async function postAct(body, { timeout = WAIT_MS, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl("/today/act", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "manual", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
    });
    if (isSignedOut(res)) return { result: "signedout" };
    if (res.status === 204) return { result: "ok" };
    if (res.status === 200) {
      if (!isJson(res)) return { result: "uncertain" };
      const j = await jsonCapped(res, 4096);
      if (!j || typeof j !== "object") return { result: "uncertain" };
      if (typeof j.undoUntil === "string" && Date.parse(j.undoUntil) > Date.now() && typeof j.approval === "string" && APPROVAL_ID.test(j.approval)) {
        return { result: "ok", undoUntil: j.undoUntil, approval: j.approval };
      }
      return { result: "ok" };
    }
    const map = { 409: "changed", 403: "refused", 404: "gone", 422: "reason" };
    const result = map[res.status] || "uncertain";
    if (result === "changed") {
      const j = isJson(res) ? await jsonCapped(res, 4096) : undefined;
      const message = j && typeof j.message === "string" ? text(j.message, 200) : "";
      if (message) return { result, message };
    }
    return { result };
  } catch {
    return { result: "uncertain" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- drawing ----------

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
