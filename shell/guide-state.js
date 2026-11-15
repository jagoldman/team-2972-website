// 2972 shell kit: the guide's progress for one person on one device (D140, D149). Source of truth:
// infra/shell/guide-state.js. Pure: no DOM, no timers; safe in the browser, in Node and in Next.js server code.
// Types: guide-state.d.ts. The engine (guide.js) and both bars read it; only the engine and the two cards write it.
//
// One site-wide cookie, `guide`, with the mode cookie's attributes (cookieAttributes: Path=/, 400 days, SameSite=Lax,
// Domain=.<site> and Secure on the real site), so every app on the site reads the same progress without a network
// call. Its value is five fields joined by ":":
//
//   1:s:door.task:e:part!kx0f3a
//   | |  |        | └ the open stop, for the hand-off between pages: its id, then "@" (open it) or "!" (show its
//   | |  |        |   "Done." card: the click that finished it is loading the next page), then the time it was set
//   | |  |        |   (base-36 seconds). Older than OPEN_MAX_AGE ("@") or DONE_MAX_AGE ("!"): ignored.
//   | |  |        └ flags: "h" hidden (the Home card is gone until Account brings it back), "e" ended (the ending
//   | |  |          was shown once); "" for neither
//   | |  └ the finished stop ids, "." between them, in the order they were finished
//   | └ the role the guide was started for: a admin, m mentor, s student, p parent ("" when not known)
//   └ the format's version (GUIDE_VERSION)
//
// No names, no ids of people, nothing typed by anyone: stop ids are short known words. A value that does not parse
// (another version, junk, something hostile) reads as "nothing done".

import { COOKIE_MAX_AGE, cookieAttributes, portalHref, readCookie } from "./core.js";

export const GUIDE_COOKIE = "guide";
export const GUIDE_VERSION = 1;
/** Seconds an open stop waits for its page (the hand-off); after that it is ignored, so nothing opens days later. */
export const OPEN_MAX_AGE = 600;
/** Seconds a "Done." card waits for the page its own click loads (it is only for that one page load). */
export const DONE_MAX_AGE = 60;
/** The most stop ids a value may hold (a role has at most five; the rest is room for change). */
export const MAX_DONE = 16;

/** The roles that have a guide, in the order that picks a person's role. */
export const GUIDE_ROLE_ORDER = Object.freeze(["admin", "mentor", "student", "parent"]);
const ROLE_CODES = Object.freeze({ a: "admin", m: "mentor", s: "student", p: "parent" });
const CODE_OF = Object.freeze({ admin: "a", mentor: "m", student: "s", parent: "p" });
const ID = /^[a-z][a-z0-9-]{0,15}$/;
const MAX_LENGTH = 400;

/**
 * The role whose guide a person gets: the first of admin, mentor, student, parent in their groups (an array or the
 * header's "|" list); null for none (alumni, display, nobody). Cheap: the bars ask it on every page.
 */
export function guideRole(groups) {
  const have = new Set(Array.isArray(groups) ? groups : typeof groups === "string" ? groups.split("|").map((g) => g.trim()) : []);
  return GUIDE_ROLE_ORDER.find((r) => have.has(r)) || null;
}

/** A fresh, empty state (nothing done, nothing open). */
export function emptyGuide() {
  return { role: null, done: [], hidden: false, ended: false, open: null };
}

/** A stop id the cookie may carry: a short lower-case word. */
export function isStopId(id) {
  return typeof id === "string" && ID.test(id);
}

/**
 * The cookie's value → { role, done, hidden, ended, open }. `open` is { id, done, at } or null, and is null when it
 * is older than OPEN_MAX_AGE (DONE_MAX_AGE for a "Done." card) seconds at `now` (ms since 1970; Date.now() by default) or set in the future.
 * Anything that does not parse reads as emptyGuide().
 */
export function parseGuide(value, now = Date.now()) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return emptyGuide();
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== String(GUIDE_VERSION)) return emptyGuide();
  const [, r, d, f, o] = parts;
  if (r !== "" && !ROLE_CODES[r]) return emptyGuide();
  if (!/^[he]*$/.test(f) || f.length > 2) return emptyGuide();
  const ids = d === "" ? [] : d.split(".");
  if (ids.length > MAX_DONE || !ids.every(isStopId)) return emptyGuide();
  let open = null;
  const m = /^([a-z][a-z0-9-]{0,15})([@!])([0-9a-z]{1,9})$/.exec(o);
  if (o !== "" && !m) return emptyGuide();
  if (m) {
    const at = parseInt(m[3], 36) * 1000;
    const age = (now - at) / 1000;
    const done = m[2] === "!";
    if (Number.isFinite(at) && age >= -60 && age <= (done ? DONE_MAX_AGE : OPEN_MAX_AGE)) open = { id: m[1], done, at };
  }
  return { role: r ? ROLE_CODES[r] : null, done: [...new Set(ids)], hidden: f.includes("h"), ended: f.includes("e"), open };
}

/**
 * The state in document.cookie (or a Cookie header). `role` is the person's role now, when it is known: progress
 * written for another role (another person on a shared browser) reads as "nothing done" (the next write replaces it).
 */
export function readGuide(cookieString, now = Date.now(), role = null) {
  const s = parseGuide(readCookie(cookieString, GUIDE_COOKIE), now);
  return role && s.role && s.role !== role ? emptyGuide() : s;
}

/** A state → the cookie's value (unknown words dropped, so a value written here always parses). */
export function guideValue(state, now = Date.now()) {
  const s = state || emptyGuide();
  const done = [...new Set((Array.isArray(s.done) ? s.done : []).filter(isStopId))].slice(0, MAX_DONE);
  const flags = (s.hidden ? "h" : "") + (s.ended ? "e" : "");
  let open = "";
  if (s.open && isStopId(s.open.id)) {
    const at = Number.isFinite(s.open.at) ? s.open.at : now;
    open = `${s.open.id}${s.open.done ? "!" : "@"}${Math.max(0, Math.floor(at / 1000)).toString(36)}`;
  }
  return [GUIDE_VERSION, CODE_OF[s.role] || "", done.join("."), flags, open].join(":");
}

/** document.cookie string that stores the state, with the mode cookie's attributes (site-wide, 400 days). */
export function guideCookie(state, site, now = Date.now()) {
  return `${GUIDE_COOKIE}=${guideValue(state, now)}${cookieAttributes(site, COOKIE_MAX_AGE)}`;
}

/** document.cookie string that removes the cookie (the bar's Sign out writes it before it leaves). */
export function guideClearCookie(site) {
  return `${GUIDE_COOKIE}=${cookieAttributes(site, 0)}`;
}

/**
 * Not a stop: the open value Account's "Start the tour again" writes. It asks the portal's Home to open the person's
 * first stop (there when it lives on Home, else by going to its page, "Opening Calendar."). Any other page forgets it.
 */
export const GUIDE_START = "start";

/**
 * document.cookie string for "Start the tour again": the person's role, nothing done, not hidden, not ended, and
 * GUIDE_START open (for OPEN_MAX_AGE seconds). null for a person with no guide (alumni, display, nobody).
 */
export function guideRestartCookie(groups, site, now = Date.now()) {
  const role = guideRole(groups);
  if (!role) return null;
  return guideCookie({ role, done: [], hidden: false, ended: false, open: { id: GUIDE_START, done: false, at: now } }, site, now);
}

/**
 * Account's "Start the tour again" (browser): clears the person's progress, asks Home to open the first stop, and
 * returns the portal's Home address for the page to go to (`location.assign(restartGuide(groups, site))`). Returns
 * null and writes nothing for a person with no guide.
 */
export function restartGuide(groups, site, doc = document, now = Date.now()) {
  const c = guideRestartCookie(groups, site, now);
  if (!c) return null;
  doc.cookie = c;
  return portalHref(site);
}

/** Writes the state (browser). Returns the state as it now reads back, which is the input when cookies work. */
export function writeGuide(state, site, doc = document, now = Date.now()) {
  doc.cookie = guideCookie(state, site, now);
  return state;
}

/**
 * Is a stop open for the hand-off in this cookie string, for a person with these groups? (cheap: the bars ask this on
 * every page). `groups` undefined: not known (any role). A person with no guide (alumni, display) never has one.
 */
export function guideOpenId(cookieString, now = Date.now(), groups = undefined) {
  const role = groups === undefined ? null : guideRole(groups);
  if (groups !== undefined && !role) return null;
  const s = readGuide(cookieString, now, role);
  return s.open ? s.open.id : null;
}

/**
 * Does Home want the guide's card? Not when it was hidden or has ended, and never for a person with no guide (when
 * `groups` is given), so the page does not even load the engine.
 */
export function guideCardWanted(state, groups = undefined) {
  if (groups !== undefined && !guideRole(groups)) return false;
  return !!state && !state.hidden && !state.ended;
}

// Set by guide.js while it shows a stop, so a bar that learns more later (its tiles arrived after ShellEnhance
// resumed the stop) passes it on without reading the cookie, which the engine has already cleared.
let active = false;
/** Is a stop showing on this page? (guide.js says so; false when the engine was never loaded) */
export function guideActive() {
  return active;
}
/** For guide.js only. */
export function setGuideActive(on) {
  active = !!on;
}
