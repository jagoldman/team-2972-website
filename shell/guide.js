// 2972 shell kit: the guide (D140, GUIDE_DESIGN.md). Source of truth: infra/shell/guide.js. Plain DOM, no
// dependencies. Types: guide.d.ts. Looks: .shell-guide* and .shell-g* in ui.css.
//
// LOADED ONLY WHEN NEEDED, with import(): by a bar (or ShellEnhance) when the `guide` cookie holds an open stop for a
// person who has a guide, and by the page that mounts the Home card or the Account replay card. A page showing
// neither never requests this file.
//
// A stop (guide-stops.js) rings one live control on its page and puts a small card beside it: "1 of 4", a verb-first
// title, one sentence, Got it, Skip and Close (×). Nothing is blocked: the control and the page stay usable.
//   - Using the control finishes the stop: a click on it (finish "click"), or the page saying the job was really done
//     (finish "event": window.dispatchEvent(new CustomEvent("shell:guide-done", { detail: { id } }))). "Got it" also
//     finishes it. The card then says "Done." and names the next stop, with Next.
//   - An "event" stop whose control leads to another page of the same app (the door code leads to the sign-in page)
//     waits there, with no card, when that page is one of the stop's `continues` paths.
//   - Skip goes to the next stop and leaves this one for later. Close, Escape (with the focus in the card), a tap
//     elsewhere and a move to a page that is not the stop's close the stop and keep what is done; a stop that opened
//     the Apps menu closes it too.
//   - The cookie is written in the same task as the click. A click that finishes a stop and makes the browser load
//     another page (not a #hash, not a link the app handles itself) also leaves a "Done." card for that page.
//   - A stop on another page (another app, another host): Show me, Next and Skip are real links; their click writes
//     the stop's id into the cookie, the card says where it is going ("Opening Tasks."), and the page that loads
//     opens the stop (resumeGuide, called by its bar). The open stop is taken out of the cookie as soon as it is
//     shown, and a stop is opened only when it is one the person would have been offered (role, tiles, mode).
//   - The control missing (nothing waiting, no open snack day): the card says what the person would do when there is
//     something, with no ring, and Got it finishes it. It rings the control if it appears while the card is open.
// Placement: beside the control and never over it, always inside the window, cut below the sticky bars. On a phone
// (640 px and below) the card is docked at the bottom, the page gets the dock's height as extra bottom padding and the
// control is scrolled clear of it; where it still cannot be clear, the card goes above the control. With a modal
// dialog open that does not hold the control, the card sits beside the dialog (above or below it), never over it.
// Focus: the card is a labelled dialog that does not trap the page (aria-modal="false"); it takes the focus when it
// opens and after Got it; Tab from its last button goes to the control. Escape closes the stop only while the focus is
// in its card, never in the "Done." phase, and never stops the page's own handlers. The layer is a manual popover,
// shown again when it changes and whenever a modal dialog opens, and put inside the newest open modal dialog, so the
// card stays above it and usable (tip.js's rules; without the Popover API, a fixed layer moved the same way).
// No timers: a stop is drawn in the same task as the tap; positions follow scroll and resize in one animation frame.
// Nothing is watched while no stop is open.

import { MODE_COOKIE, parseMode, portalHref, readCookie } from "./core.js";
import { GUIDE_START, guideRestartCookie, readGuide, setGuideActive, writeGuide } from "./guide-state.js";
import { GUIDE_CLOSING, guideRole, guideStops } from "./guide-stops.js";
import { hideTip } from "./tip.js";

/** The window events: a page finishes a stop; the progress changed (the cards redraw); a stop opens or closes the Apps menu. */
export const GUIDE_DONE_EVENT = "shell:guide-done";
export const GUIDE_CHANGE_EVENT = "shell:guide";
export const OPEN_APPS_EVENT = "shell:open-apps";
export const CLOSE_APPS_EVENT = "shell:close-apps";
/** A stop opens (and closes) a row of the portal home's groups (static mountHomeGroups) for this time only. */
export const OPEN_HOME_GROUP_EVENT = "shell:open-home-group";
export const CLOSE_HOME_GROUP_EVENT = "shell:close-home-group";
/** The phone width: at or below it the stop card is docked at the bottom. */
export const PHONE_MAX = 640;

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
const BARS = ".shbar, .shell-tabs";
const APP_NAMES = { portal: "Home", tasks: "Tasks", calendar: "Calendar", parts: "Parts & Inventory", skills: "Skills", admin: "Admin" };

/**
 * Where the stop card goes (pure). `r` is the control's box (the ring's; null: no control), `w`/`h` the card's size,
 * `vw`/`vh` the window, `top` the lower edge of the sticky bars.
 *   Wider than a phone: beside the control (below, above, right, left, in that order), inside the window by 12 px at
 *   the sides and 8 px at the top and bottom, never over it; else docked at the bottom, or at the top below the bars
 *   when the bottom would cover the control. No control: centred.
 *   A phone (vw <= 640): docked at the bottom when that is clear of the control; else above the control, full width;
 *   else at the top under the bars; else (a control taller than the screen) docked at the bottom.
 * Returns { left, top } | { dock: true } | { wide: true, top } | { centre: true }.
 */
export function placeStop(r, w, h, vw, vh, { top = 0, gap = 14 } = {}) {
  const minTop = top + 8;
  const dockTop = vh - h - 8;
  const fallback = () => {
    if (!r || r.bottom <= dockTop - 8) return { dock: true };
    if (r.top - gap - h >= minTop) return { wide: true, top: Math.round(r.top - gap - h) };
    if (minTop + h + 8 <= r.top) return { wide: true, top: Math.round(minTop) };
    return { dock: true };
  };
  if (vw <= PHONE_MAX) return fallback();
  if (!r) return { centre: true };
  const maxTop = vh - h - 8;
  const clampL = (x) => Math.max(12, Math.min(vw - w - 12, x));
  const clampT = (y) => Math.max(minTop, Math.min(maxTop, y));
  const cands = [
    { left: clampL(r.left), top: r.bottom + gap },
    { left: clampL(r.left), top: r.top - h - gap },
    { left: r.right + gap, top: clampT(r.top) },
    { left: r.left - w - gap, top: clampT(r.top) },
  ];
  const fits = (c) => c.left >= 12 - 0.5 && c.left + w <= vw - 12 + 0.5 && c.top >= minTop - 0.5 && c.top <= maxTop + 0.5;
  const clear = (c) => c.left >= r.right || c.left + w <= r.left || c.top >= r.bottom || c.top + h <= r.top;
  const c = cands.find((x) => fits(x) && clear(x));
  return c ? { left: Math.round(c.left), top: Math.round(c.top) } : fallback();
}

// ---------- context: who, where, which tiles ----------
let ctx = { appIds: [], site: null, user: null, groups: null, tiles: null, mode: null };

function setContext(more = {}) {
  const next = { ...ctx };
  if (more.appId !== undefined) next.appIds = (Array.isArray(more.appId) ? more.appId : [more.appId]).filter((x) => typeof x === "string" && x);
  if (more.site && more.site.domain) next.site = { scheme: more.site.scheme === "https" ? "https" : "http", domain: String(more.site.domain) };
  if (more.siteDomain) next.site = { scheme: more.siteScheme === "https" ? "https" : "http", domain: String(more.siteDomain) };
  if (more.user !== undefined) next.user = more.user || null;
  if (Array.isArray(more.groups)) next.groups = more.groups;
  else if (more.user && Array.isArray(more.user.groups)) next.groups = more.user.groups;
  if (Array.isArray(more.tiles)) next.tiles = more.tiles;
  if (more.mode) next.mode = parseMode(more.mode);
  ctx = next;
  onceGlobal();
}

// The site from the page's address when no one passed it: the host without its first label (calendar.x.org → x.org).
function site() {
  if (ctx.site) return ctx.site;
  const scheme = location.protocol === "https:" ? "https" : "http";
  const host = location.host;
  const labels = host.split(".");
  const domain = labels.length > 2 || (labels.length === 2 && /^localhost(:\d+)?$/.test(labels[1])) ? labels.slice(1).join(".") : host;
  return { scheme, domain };
}
const mode = () => ctx.mode || parseMode(readCookie(document.cookie, MODE_COOKIE));
// The person's role when this page knows their groups; null when it does not (the cookie's role is used then).
const personRole = () => (Array.isArray(ctx.groups) ? guideRole(ctx.groups) : null);
const groupsKnown = () => Array.isArray(ctx.groups);
// Progress written for another role (another person on a shared browser) reads as nothing done.
const state = () => readGuide(document.cookie, Date.now(), personRole());
function role() {
  return groupsKnown() ? personRole() : state().role;
}
/** The stops for this person now (this mode), and for every mode (the ending counts all of them). */
const stopsNow = () => guideStops(role(), { tiles: ctx.tiles, mode: mode() });
const stopsAll = () => guideStops(role(), { tiles: ctx.tiles });
// Only a stop this person would have been offered: in their role's list, their tiles and this mode.
const stopById = (id) => stopsNow().find((s) => s.id === id) || null;

function save(change) {
  const s = { ...state(), role: role(), ...change };
  writeGuide(s, site());
  window.dispatchEvent(new CustomEvent(GUIDE_CHANGE_EVENT, { detail: { done: s.done.slice(), open: s.open ? s.open.id : null } }));
  return s;
}
function markDone(id, openDone) {
  const s = state();
  const done = s.done.includes(id) ? s.done : [...s.done, id];
  return save({ done, open: openDone ? { id, done: true, at: Date.now() } : null });
}
// Forgets the open stop; the cards always hear about it (a closed stop can let Home draw the ending).
function clearOpen() {
  if (state().open) save({ open: null });
  else window.dispatchEvent(new CustomEvent(GUIDE_CHANGE_EVENT, { detail: { done: state().done.slice(), open: null } }));
}

// ---------- where a stop lives ----------
function appName(app) {
  const t = Array.isArray(ctx.tiles) ? ctx.tiles.find((x) => x.id === app) : null;
  return (t && t.name) || APP_NAMES[app] || "the next page";
}
/** The address of a stop's page. */
export function stopHref(s, c = null) {
  if (c) setContext(c);
  const st = site();
  if (s.app === "portal") return new URL(s.path, portalHref(st)).href;
  const t = Array.isArray(ctx.tiles) ? ctx.tiles.find((x) => x.id === s.app && x.href) : null;
  return new URL(s.path, t ? t.href : `${st.scheme}://${s.app}.${st.domain}/`).href;
}
const trim = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
// Is this page `path` of the stop's app? Same path, and every query value in `path` matches.
function atPath(s, path) {
  if (!ctx.appIds.includes(s.app)) return false;
  const want = new URL(path, "http://x");
  if (trim(location.pathname) !== trim(want.pathname)) return false;
  const have = new URLSearchParams(location.search);
  for (const [k, v] of want.searchParams) if (have.get(k) !== v) return false;
  return true;
}
/** Is this page the portal's Home? */
const onHome = () => atPath({ app: "portal" }, "/");
/** Is this page the stop's page? */
const onPage = (s) => atPath(s, s.path);
/** Is this page one where the stop's job goes on (its `continues` paths)? */
const onContinuation = (s) => (s.continues || []).some((p) => atPath(s, p));

// ---------- the open stop ----------
let cur = null; // { s, phase: "show" | "wait" | "done" | "going", fresh, focusCard, opened }
let layer = null;
let ringEl = null;
let card = null;
let cardKey = "";
let live = null; // a status line outside the card: "Done. Next: …" is said when a stop finishes by itself
let mo = null;
let frame = 0;
let off = [];
let seq = 0;
let pendingAway = null; // a click-finished stop's link, until we know whether the browser will follow it
let padded = null; // the body's own bottom padding while the dock adds to it
let leaving = false; // openGuideStop sent this page to another one

function visible(el) {
  return !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest("[hidden], [inert]");
}
function target() {
  if (!cur || cur.phase !== "show") return null;
  // The first match that is drawn (a closed menu may hold another copy of the same control).
  return [...document.querySelectorAll(cur.s.target)].find(visible) || null;
}
function focusIn(el) {
  if (!el) return null;
  return el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE);
}
const isOpen = (el) => {
  try {
    return el.matches(":popover-open");
  } catch {
    return false;
  }
};
const hasPopover = (el) => typeof el.showPopover === "function" && typeof el.hidePopover === "function";
// The open modal dialogs, newest last (document order is the best a page can tell).
function modals() {
  return [...document.querySelectorAll("dialog[open]")].filter((d) => {
    try {
      return d.matches(":modal");
    } catch {
      return true;
    }
  });
}
// Above everything: inside the newest open modal dialog (so its buttons stay usable: a modal dialog makes the rest of
// the page inert), and shown again as a popover so it is the newest thing in the top layer.
function lift() {
  if (!layer) return;
  const dlg = modals().pop() || null;
  const host = dlg || document.body;
  if (layer.parentNode !== host) {
    if (hasPopover(layer) && isOpen(layer)) layer.hidePopover();
    host.appendChild(layer);
  }
  if (hasPopover(layer)) {
    try {
      if (isOpen(layer)) layer.hidePopover();
      layer.showPopover();
    } catch {
      // not in the document: drawn as a fixed layer
    }
  }
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}
const X_ICON = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, String(v));
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M6 6l12 12M18 6L6 18");
  svg.append(p);
  return svg;
};
const modified = (e) => !!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button > 0);

/**
 * A control that goes to stop `s`: a button when it is on this page, else a real link whose click writes the stop's
 * id into the cookie (before the browser follows the link) and says where it is going. `before` runs first (the
 * replay card resets the progress with it).
 */
function goControl(s, label, cls, before) {
  if (onPage(s)) {
    return el("button", { type: "button", class: cls, "data-guide-go": s.id, onclick: () => {
      if (before) before();
      openGuideStop(s.id);
    } }, label);
  }
  return el("a", { class: cls, href: stopHref(s), "data-guide-go": s.id, onclick: (e) => {
    if (before) before();
    save({ open: { id: s.id, done: false, at: Date.now() } });
    // A new tab (a modifier key, the middle button): this page stays as it is.
    if (modified(e)) return;
    going(s);
  } }, label);
}
// "Opening Tasks." while the next page loads (moving between apps takes seconds today, W4). The card is changed in
// place, never rebuilt: the link being followed must stay in the page for the browser to follow it.
function going(s) {
  const words = `Opening ${appName(s.app)}.`;
  window.dispatchEvent(new CustomEvent(GUIDE_CHANGE_EVENT, { detail: { going: s.id, words } }));
  if (!cur || !card) return;
  cur = { ...cur, s, phase: "going", going: words };
  const h = card.querySelector("h2");
  const p = card.querySelector(".shell-gstop-text");
  const acts = card.querySelector(".shell-gacts");
  const n = card.querySelector(".shell-gstop-count");
  if (h) h.textContent = s.title;
  if (p) p.textContent = words;
  if (acts) acts.hidden = true;
  if (n) n.textContent = "";
  if (live) live.textContent = words;
  card.classList.remove("is-missing");
  ringEl.hidden = true;
  layer.classList.remove("is-dim");
  cardKey = keyNow();
}

function count(s) {
  const list = stopsNow();
  const i = list.findIndex((x) => x.id === s.id);
  return i < 0 ? "" : `${i + 1} of ${list.length}`;
}
function nextAfter(s) {
  const list = stopsNow();
  const done = state().done;
  const i = list.findIndex((x) => x.id === s.id);
  const rest = [...list.slice(i + 1), ...list.slice(0, Math.max(0, i))];
  return rest.find((x) => !done.includes(x.id) && x.id !== s.id) || null;
}
// What the card shows, in one string: the card is rebuilt only when this changes (so a re-render of the bar that
// changes nothing leaves the focus where it is).
function keyNow() {
  const s = cur.s;
  const missing = cur.phase === "show" && !target();
  const nx = cur.phase === "going" ? null : nextAfter(s);
  return `${s.id}|${cur.phase}|${missing}|${cur.going || ""}|${count(s)}|${nx ? `${nx.id}@${stopHref(nx)}` : ""}|${ctx.appIds.includes("portal")}`;
}

function buildCard() {
  const s = cur.s;
  const id = `shell-gstop-${seq}`;
  const missing = cur.phase === "show" && !target();
  const head = el("div", { class: "shell-gstop-head" },
    el("p", { class: "shell-gstop-count", text: cur.phase === "going" ? "" : count(s) }),
    el("button", { type: "button", class: "shell-gx", "aria-label": "Close", "data-guide-act": "close", onclick: () => closeGuideStop({ focus: true }) }, X_ICON()));
  let title;
  let text;
  let acts = [];
  if (cur.phase === "going") {
    title = s.title;
    text = cur.going;
  } else if (cur.phase === "done") {
    const nx = nextAfter(s);
    title = "Done.";
    text = nx ? `Next: ${nx.name}.` : "That was the last one.";
    if (nx) acts = [goControl(nx, "Next", "shell-gbtn")];
    else {
      acts = [ctx.appIds.includes("portal")
        ? el("button", { type: "button", class: "shell-gbtn", onclick: () => closeGuideStop({ focus: true }) }, "Finish")
        : el("a", { class: "shell-gbtn", href: portalHref(site()), onclick: () => clearOpen() }, "Finish")];
    }
  } else {
    title = s.title;
    text = missing ? s.missing : s.text;
    const nx = nextAfter(s);
    acts = [el("button", { type: "button", class: "shell-gbtn", "data-guide-act": "got", onclick: () => gotIt() }, "Got it")];
    if (nx) acts.push(goControl(nx, "Skip", "shell-gbtn shell-gbtn--quiet"));
  }
  card.replaceChildren(
    head,
    el("h2", { id: `${id}-h`, text: title }),
    el("p", { id: `${id}-t`, class: "shell-gstop-text", text }),
    acts.length ? el("div", { class: "shell-gacts" }, acts) : null,
  );
  card.setAttribute("aria-labelledby", `${id}-h`);
  card.setAttribute("aria-describedby", `${id}-t`);
  card.classList.toggle("is-missing", missing);
}

function ensureLayer() {
  if (layer) return;
  seq += 1;
  layer = el("div", { class: "shell-glayer", "data-guide-layer": "" });
  if (hasPopover(layer)) layer.setAttribute("popover", "manual");
  ringEl = el("div", { class: "shell-gring", "aria-hidden": "true", hidden: true });
  card = el("div", { class: "shell-gstop", role: "dialog", "aria-modal": "false", tabindex: "-1" });
  live = el("p", { class: "shell-gsr", role: "status" });
  layer.append(ringEl, card, live);
  document.body.appendChild(layer);
}

// The lower edge of the sticky bars above the control (the ring is cut there and the card stays below it).
function barsBottom(t) {
  let b = 0;
  for (const bar of document.querySelectorAll(BARS)) {
    if (t && bar.contains(t)) continue;
    const r = bar.getBoundingClientRect();
    if (r.height && r.top <= 1) b = Math.max(b, r.bottom);
  }
  return b;
}
const vw = () => document.documentElement.clientWidth || window.innerWidth;
const phone = () => vw() <= PHONE_MAX;

// While the card is docked on a phone, the page gets the dock's height as extra bottom padding, so the last control on
// the page can still be scrolled clear of it; removed when the stop closes or stops docking.
function pad(on) {
  const b = document.body;
  if (!b) return;
  if (on) {
    if (padded === null) padded = { inline: b.style.paddingBottom, px: parseFloat(getComputedStyle(b).paddingBottom) || 0 };
    b.style.paddingBottom = `${padded.px + card.offsetHeight + 16}px`;
  } else if (padded !== null) {
    b.style.paddingBottom = padded.inline;
    padded = null;
  }
}

// The control into view: below the bars, and above the card when it is docked at the bottom (measured with the layer
// shown, so the card has its real height).
function inView(t) {
  const r = t.getBoundingClientRect();
  const top = barsBottom(t) + 12;
  const bottom = window.innerHeight - (phone() ? card.offsetHeight + 24 : 16);
  if (r.top >= top && r.bottom <= bottom) return;
  const dy = r.top < top || r.height > bottom - top ? r.top - top : r.bottom - bottom;
  window.scrollBy({ top: dy, left: 0, behavior: "instant" });
}

function place() {
  if (!cur || !layer) return;
  const t = target();
  const dlg = modals().pop();
  let rr = null;
  // A control behind an open modal dialog (inert under its backdrop) gets no ring: the dialog is what is in use.
  if (t && !(dlg && !dlg.contains(t))) {
    const r = t.getBoundingClientRect();
    const p = 4;
    const top = Math.max(r.top - p, barsBottom(t));
    const bottom = r.bottom + p;
    if (bottom - top > 8) {
      rr = { left: r.left - p, top, right: r.right + p, bottom, width: r.width + 2 * p, height: bottom - top };
      Object.assign(ringEl.style, { left: `${rr.left}px`, top: `${rr.top}px`, width: `${rr.width}px`, height: `${rr.height}px` });
    }
  }
  ringEl.hidden = !rr;
  // 0.5.0: a control in the black bar (a tab in the bar's slot from 1024 px) gets a white ring, which shows on black.
  const onBar = !!(rr && t.closest(".shbar") && !(t.closest(".shbar-tabs") && vw() < 1024));
  ringEl.classList.toggle("is-onbar", onBar);
  layer.classList.toggle("is-dim", !!rr);
  // The "Done." card stays beside the control it was about (no ring).
  let anchor = t;
  if (!anchor && cur.phase !== "show") {
    const c = document.querySelector(cur.s.target);
    anchor = visible(c) ? c : null;
  }
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const vh = window.innerHeight;
  let p;
  if (dlg && !(anchor && dlg.contains(anchor))) {
    // A modal dialog that does not hold the control: beside the dialog (above it, else below it), never over it.
    const d = dlg.getBoundingClientRect();
    const width = phone() ? vw() - 16 : w;
    const left = Math.round((vw() - width) / 2);
    if (d.top - 12 - h >= 8) p = { left, top: Math.round(d.top - 12 - h), free: true };
    else if (d.bottom + 12 + h <= vh - 8) p = { left, top: Math.round(d.bottom + 12), free: true };
    else p = { dock: true };
  } else {
    p = placeStop(anchor ? rr || anchor.getBoundingClientRect() : null, w, h, vw(), vh, { top: barsBottom(anchor) });
  }
  card.classList.toggle("is-docked", !!p.dock);
  card.classList.toggle("is-centred", !!p.centre);
  card.classList.toggle("is-wide", !!p.wide || (!!p.free && phone()));
  card.style.left = p.left === undefined || p.wide ? "" : `${p.left}px`;
  card.style.top = p.top === undefined ? "" : `${p.top}px`;
  pad(!!p.dock && phone());
}

function draw() {
  if (!cur) return;
  if (cur.phase === "wait") return; // no card while the job goes on elsewhere
  ensureLayer();
  const key = keyNow();
  const changed = key !== cardKey;
  if (changed || cur.fresh) {
    buildCard();
    cardKey = key;
    lift(); // shown before it is measured
  }
  const t = target();
  if (cur.fresh && t) {
    if (phone()) pad(true);
    inView(t);
  }
  place();
  if (cur.fresh || cur.focusCard) card.focus({ preventScroll: true });
  cur.fresh = false;
  cur.focusCard = false;
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    refresh();
  });
}
// Something on the page changed (the control came or went, a dialog opened, the route moved).
function refresh() {
  if (!cur) return;
  if ((cur.phase === "show" && !onPage(cur.s)) || (cur.phase === "wait" && !onContinuation(cur.s) && !onPage(cur.s))) {
    closeGuideStop({ focus: false });
    return;
  }
  if (cur.phase === "wait") return;
  // A modal dialog opened that the layer is not in: lift the layer above it, so the card stays usable.
  const top = modals().pop();
  if (top && !top.contains(layer)) lift();
  if (keyNow() !== cardKey && cur.phase !== "going") {
    draw();
    return;
  }
  place();
}

function listen(target0, type, fn, capture = false) {
  target0.addEventListener(type, fn, capture);
  off.push(() => target0.removeEventListener(type, fn, capture));
}
// A link the browser will follow to another page: a real address, this tab, not only a #hash on this page.
function leaves(link, e) {
  if (!link || modified(e) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return false;
  try {
    const u = new URL(link.href, location.href);
    if (!/^https?:$/.test(u.protocol)) return false;
    return u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search;
  } catch {
    return false;
  }
}
function watch() {
  if (off.length) return;
  // A tap inside the ringed control uses it; a tap anywhere else (not the card, not an open dialog or popover the
  // control opened, not the stop's zone) closes the stop and keeps progress. Capture, so this runs before the page's
  // own handler and before any navigation the tap starts.
  listen(document, "click", (e) => {
    if (!cur || !layer || cur.phase === "wait") return;
    const n = e.target;
    if (!(n instanceof Node) || layer.contains(n)) return;
    const t = target();
    if (t && t.contains(n)) {
      if (cur.s.finish === "click") {
        const link = n instanceof Element ? n.closest("a[href]") : null;
        pendingAway = leaves(link, e) ? cur.s.id : null;
        finish();
      } else if (cur.s.continues.length) {
        // The job may go on on another page of this app (the door code's sign-in page): keep the stop for it.
        save({ open: { id: cur.s.id, done: false, at: Date.now() } });
      }
      return;
    }
    if (n instanceof Element && inZone(n)) return;
    closeGuideStop({ focus: false });
  }, true);
  // After every handler of that click (the window is last): a link the app did not handle itself (no
  // preventDefault: a Next.js Link handles its own) makes the browser load another page, so the "Done." card goes
  // with it. Still before the browser follows the link.
  listen(window, "click", (e) => {
    const id = pendingAway;
    pendingAway = null;
    if (id && !e.defaultPrevented) markDone(id, true);
  });
  listen(document, "keydown", (e) => {
    if (!cur || !layer) return;
    if (e.key === "Escape") {
      // Only with the focus in the stop's card, never in the "Done." phase; the page's own handlers still run.
      if (cur.phase !== "show" || !card.contains(document.activeElement)) return;
      e.preventDefault(); // a dialog under the card stays open
      closeGuideStop({ focus: true });
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && card.contains(document.activeElement)) {
      const all = [...card.querySelectorAll(FOCUSABLE)];
      const f = focusIn(target());
      if (f && document.activeElement === all[all.length - 1]) {
        e.preventDefault();
        f.focus();
      }
    }
  }, true);
  // Only an "event" stop finishes by the page's word (door, days, snack: Calendar says so when the job really
  // succeeded); a click stop never does, whatever a page dispatches.
  listen(window, GUIDE_DONE_EVENT, (e) => {
    const id = e && e.detail && e.detail.id;
    if (cur && (cur.phase === "show" || cur.phase === "wait") && cur.s.finish === "event" && id === cur.s.id) {
      if (cur.phase === "wait") cur = { ...cur, fresh: true };
      finish();
    }
  });
  listen(window, "scroll", schedule, true);
  listen(window, "resize", schedule);
  listen(window, "popstate", schedule);
  // A modal dialog holding the layer closes: the layer goes back to the page.
  listen(document, "close", (e) => {
    if (layer && e.target instanceof Element && e.target.contains(layer)) {
      document.body.appendChild(layer);
      lift();
      schedule();
    }
  }, true);
  mo = new MutationObserver((records) => {
    if (records.every((r) => layer && layer.contains(r.target))) return;
    schedule();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "data-guide", "inert"] });
  off.push(() => {
    if (mo) mo.disconnect();
    mo = null;
  });
}
function unwatch() {
  for (const f of off.splice(0)) f();
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  pendingAway = null;
}
// Where a tap does not close the stop: an open dialog or popover (the control opened it), the stop's own zone
// (data-guide-zone="<id>"), and the Apps menu when the stop opened it.
function inZone(n) {
  if (n.closest("dialog[open], [role='dialog'], [role='alertdialog']")) return true;
  const pop = n.closest("[popover]");
  if (pop && isOpen(pop)) return true;
  const z = n.closest("[data-guide-zone]");
  if (z && z.getAttribute("data-guide-zone").split(/\s+/).includes(cur.s.id)) return true;
  if (cur.opened && cur.opened.place === "bar" && n.closest(".shbar-apps, .shbar-appsbtn")) return true;
  if (cur.opened && cur.opened.place === "home" && n.closest(`[data-grp="${cur.opened.group}"]`)) return true;
  return false;
}

function finish() {
  if (!cur) return;
  markDone(cur.s.id, false);
  cur = { ...cur, phase: "done" };
  draw();
  const nx = nextAfter(cur.s);
  if (live) live.textContent = nx ? `Done. Next: ${nx.name}.` : "Done. That was the last one.";
}
function gotIt() {
  if (!cur) return;
  markDone(cur.s.id, false);
  cur = { ...cur, phase: "done", focusCard: true };
  draw();
}

function start(s, phase) {
  hideTip();
  if (cur) closeGuideStop({ focus: false, keepCookie: true });
  const menu = phase === "show" && s.needs && s.needs.menu;
  // The control in a row of the page's own groups (the portal home's Admin apps, as the demo rings it) wins over the
  // bar's copy in its Apps menu; the bar's is the fallback when the page has no such row (or no rows at all).
  const inPage = menu ? [...document.querySelectorAll(s.target)].find((el) => !el.closest(".shbar") && el.closest(`[data-grp="${menu}"]`)) : null;
  const opened = menu ? { group: menu, place: inPage ? "home" : "bar" } : null;
  cur = { s, phase, fresh: true, opened };
  setGuideActive(true);
  if (phase !== "wait") ensureLayer();
  watch();
  if (opened) {
    // The home's rows or the bar open the group (the bar its Apps menu too) when they hear this, without saving it;
    // a React bar draws it in its next render, so the card is drawn in the next frame, with the control there.
    window.dispatchEvent(new CustomEvent(opened.place === "home" ? OPEN_HOME_GROUP_EVENT : OPEN_APPS_EVENT, { detail: { group: menu } }));
    requestAnimationFrame(() => cur && cur.s === s && draw());
    return;
  }
  draw();
}

/**
 * Opens stop `id` for this person (only one they would be offered): here when this is its page, else by going to its
 * page (the hand-off). `c` adds to the context (see resumeGuide). Returns true when the stop opened here.
 */
export function openGuideStop(id, c) {
  if (c) setContext(c);
  const s = stopById(id);
  if (!s) return false;
  if (!onPage(s)) {
    save({ open: { id: s.id, done: false, at: Date.now() } });
    going(s);
    leaving = true;
    location.assign(stopHref(s));
    return false;
  }
  clearOpen();
  start(s, "show");
  return true;
}

/**
 * Called by the bars (and ShellEnhance) on every page whose cookie holds an open stop, and again when they learn more
 * (the tiles arrived). c: { appId (one id or a list), site | siteScheme+siteDomain, user, groups, tiles, mode }.
 * Opens the stop when this is its page (its "Done." card when it was finished by the click that loaded this page; a
 * silent wait on one of its `continues` pages). The open stop is taken out of the cookie at once, whatever happens:
 * a stop the person would not be offered (another role, a tile they lack, another mode) or one for another page is
 * forgotten. Safe to call more than once.
 */
export function resumeGuide(c) {
  if (c) setContext(c);
  // This page is already going to a stop's page (a second caller, the bar and Home's card, must not undo it).
  if (leaving) return;
  if (cur) {
    // A caller that knows more now (the bar knows the groups and tiles; ShellEnhance did not): a stop this person would
    // not be offered closes.
    if (cur.phase !== "going" && !stopById(cur.s.id)) closeGuideStop({ focus: false });
    else draw();
    return;
  }
  const st = state();
  if (!st.open) {
    // Progress written for another role: replaced on the next write; an open stop in it is forgotten now.
    const raw = readGuide(document.cookie);
    if (raw.open && personRole() && raw.role && raw.role !== personRole()) save({ open: null });
    return;
  }
  // "Start the tour again" (Account): Home opens the first stop (here, or by going to its page); elsewhere forgotten.
  if (st.open.id === GUIDE_START) {
    const first = onHome() ? stopsNow()[0] : null;
    if (first) openGuideStop(first.id);
    else clearOpen();
    return;
  }
  const s = stopById(st.open.id);
  clearOpen();
  if (!s) return;
  if (st.open.done) start(s, "done");
  else if (onPage(s)) start(s, "show");
  else if (s.finish === "event" && onContinuation(s)) start(s, "wait");
}

/** Closes the open stop (progress is kept). focus: put the focus back on the control, else the Home card, else the page. */
export function closeGuideStop({ focus = false, keepCookie = false } = {}) {
  if (!cur) return;
  const was = cur;
  const t = target();
  cur = null;
  setGuideActive(false);
  unwatch();
  if (layer) {
    if (hasPopover(layer) && isOpen(layer)) layer.hidePopover();
    layer.remove();
  }
  pad(false);
  layer = null;
  live = null;
  cardKey = "";
  // The Apps menu (or the home's row) this stop opened closes with it.
  if (was.opened) window.dispatchEvent(new CustomEvent(was.opened.place === "home" ? CLOSE_HOME_GROUP_EVENT : CLOSE_APPS_EVENT, { detail: { group: was.opened.group } }));
  if (!keepCookie) clearOpen();
  if (!focus) return;
  let f = was.phase === "show" && visible(t) ? focusIn(t) : null;
  if (!f) f = document.querySelector("[data-guide-card] [data-guide-go]") || document.querySelector("main h1, h1, main");
  if (f) {
    if (!f.matches(FOCUSABLE)) f.tabIndex = -1;
    f.focus();
  }
}

/** The open stop's id and phase, or null (for tests and the cards). */
export function guideStatus() {
  return cur ? { id: cur.s.id, phase: cur.phase } : null;
}

// Coming back with the browser's Back button (a page from the back-forward cache): a card that was "Opening …" is
// gone (the page it opened was left), and the cards redraw from the cookie.
let globalDone = false;
function onceGlobal() {
  if (globalDone || typeof window === "undefined") return;
  globalDone = true;
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    leaving = false; // back on this page: it is not going anywhere now
    if (cur && cur.phase === "going") closeGuideStop({ focus: false });
    else if (cur) draw();
    else if (state().open) save({ open: null }); // came back before the next page opened it: forget it
    window.dispatchEvent(new CustomEvent(GUIDE_CHANGE_EVENT, { detail: { shown: true } }));
  });
}

// ---------- the Home card ----------
/**
 * Draws the "Get started" card into `el` (the portal's Home): the next stop with Show me, "2 of 4", a thin line,
 * See all and Hide; after the last stop, the ending once. o: { user, tiles, mode, site | siteScheme+siteDomain,
 * appId (default "portal"), groups }. Returns { update(o), destroy() }. Draws nothing while hidden or ended.
 */
export function mountGuideCard(root, o = {}) {
  setContext({ appId: "portal", ...o });
  // Coming back to Home with Back: an open stop the person did not reach is forgotten.
  const onShow = (e) => {
    if (e.persisted && !cur && state().open) save({ open: null });
  };
  window.addEventListener("pageshow", onShow);
  let all = false;
  let ending = false;
  let gone = false;
  const card0 = el("section", { class: "shell-guidecard", "data-guide-card": "", "aria-labelledby": `shell-guide-h${++seq}` });
  const hid = card0.getAttribute("aria-labelledby");
  root.replaceChildren(card0);

  function first() {
    return (o.user && (o.user.name || "").trim().split(/\s+/)[0]) || "";
  }
  function draw0(focusSel) {
    const st = state();
    const list = stopsNow();
    const every = stopsAll();
    if (!ending && !gone && guideReady(st, every) && !cur) {
      ending = true;
      save({ ended: true });
    }
    if (ending) {
      const covered = every.map((s) => s.covered);
      const line = covered.length > 1 ? `${covered.slice(0, -1).join(", ")} and ${covered[covered.length - 1]}` : covered[0];
      const name = first();
      card0.hidden = false;
      card0.className = "shell-guidecard shell-guideend";
      card0.replaceChildren(
        el("h2", { id: hid, text: name ? `You're set, ${name}.` : "You're set." }),
        el("p", { class: "shell-guide-did", text: `You covered ${line}.` }),
        el("p", { class: "shell-guide-quiet", text: GUIDE_CLOSING }),
        el("div", {}, el("button", { type: "button", class: "shell-gbtn", "data-guide-act": "end", onclick: () => {
          ending = false;
          gone = true;
          draw0();
          const h = document.querySelector("main h1, h1");
          if (h) {
            h.tabIndex = -1;
            h.focus();
          }
        } }, "Done")),
      );
      return;
    }
    const nx = list.find((s) => !st.done.includes(s.id));
    if (gone || st.hidden || st.ended || !nx) {
      card0.hidden = true;
      card0.replaceChildren();
      return;
    }
    card0.hidden = false;
    card0.className = "shell-guidecard";
    const n = list.filter((s) => st.done.includes(s.id)).length;
    const listId = `${hid}-all`;
    const head = el("div", { class: "shell-ghead" },
      el("h2", { id: hid, text: "Get started" }),
      el("span", { class: "shell-gcount", text: `${n + 1} of ${list.length}` }),
      el("span", { class: "shell-ggrow" }),
      el("button", { type: "button", class: "shell-gbtn shell-gbtn--quiet shell-gbtn--sm", "aria-expanded": String(all), "aria-controls": all ? listId : null, "data-guide-act": "all", onclick: () => {
        all = !all;
        draw0('[data-guide-act="all"]');
      } }, all ? "Show less" : "See all"),
      el("button", { type: "button", class: "shell-gbtn shell-gbtn--quiet shell-gbtn--sm", "data-guide-act": "hide", onclick: () => {
        save({ hidden: true });
        card0.hidden = false;
        card0.className = "shell-guidecard shell-guidegone";
        card0.replaceChildren(el("p", { tabindex: "-1", role: "status", text: "The guide is hidden; your Account page can start it again." }));
        gone = true;
        card0.firstChild.focus();
      } }, "Hide"));
    const bar = el("div", { class: "shell-gprogress", "aria-hidden": "true" }, el("i", { style: `width:${Math.round((100 * n) / list.length)}%` }));
    let body;
    if (all) {
      body = el("ol", { class: "shell-glist", id: listId }, list.map((s, i) => {
        const d = st.done.includes(s.id);
        const go = goControl(s, [
          el("span", { class: "shell-gtick", "aria-hidden": "true" }, d ? "✓" : String(i + 1)),
          el("span", { class: "shell-ggrow" }, el("b", { text: s.name }), d ? el("span", { class: "shell-gsr", text: " (done)" }) : null),
          el("span", { class: "shell-gchev", "aria-hidden": "true", text: "›" }),
        ], "shell-gitem");
        return el("li", { class: d ? "is-done" : null }, go);
      }));
    } else {
      body = el("div", { class: "shell-gnext" },
        el("div", { class: "shell-ggrow" }, el("b", { text: nx.name }), el("span", { class: "shell-gline", "data-guide-line": "", "aria-live": "polite", text: nx.line })),
        goControl(nx, "Show me", "shell-gbtn"));
    }
    card0.replaceChildren(head, bar, body);
    if (focusSel) {
      const f = card0.querySelector(focusSel);
      if (f) f.focus();
    }
  }
  // Redraw when what the card shows changed (never in the middle of a click on its own Show me link).
  const keyOf = () => {
    const st = state();
    return `${st.done.join(".")}|${st.hidden}|${st.ended}|${cur ? cur.s.id : ""}`;
  };
  let lastKey = keyOf();
  const onChange = (e) => {
    if (e.detail && e.detail.going) {
      const line = card0.querySelector("[data-guide-line]");
      if (line) line.textContent = e.detail.words;
      return;
    }
    const k = keyOf();
    // Back from the next page (pageshow): always redraw, so "Opening …" is gone.
    if (k === lastKey && !(e.detail && e.detail.shown)) return;
    lastKey = k;
    if (!ending) draw0();
  };
  window.addEventListener(GUIDE_CHANGE_EVENT, onChange);
  draw0();
  return {
    update(more = {}) {
      Object.assign(o, more);
      setContext(more);
      if (!ending) draw0();
    },
    destroy() {
      window.removeEventListener(GUIDE_CHANGE_EVENT, onChange);
      window.removeEventListener("pageshow", onShow);
      root.replaceChildren();
    },
  };
}

/** Every stop (in every mode) is done, and the ending was not shown yet. */
function guideReady(st, every) {
  return !st.hidden && !st.ended && every.length > 0 && every.every((s) => st.done.includes(s.id));
}

// ---------- the Account replay card ----------
/**
 * Draws the replay card into `el` (Account): "Guided tour", one sentence and the button "Start the tour again", which
 * clears the ticks, asks Home to open the first stop and goes to the portal's Home (guide-state.js restartGuide; the
 * demo's A.guidereplay). o: as mountGuideCard, with appId "account" by default. Returns { update(o), destroy() }.
 * Draws nothing for a person with no guide (alumni, display).
 */
export function mountGuideReplay(root, o = {}) {
  setContext({ appId: "account", ...o });
  const box = el("section", { class: "shell-guidecard shell-guidereplay", "data-guide-replay": "", "aria-labelledby": `shell-guide-r${++seq}` });
  root.replaceChildren(box);
  function draw1() {
    const s = stopsNow()[0];
    if (!s) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    // The demo's card: one sentence and a button (A.guidereplay): the progress is cleared and Home opens the first stop.
    const restart = () => {
      const c = guideRestartCookie(ctx.groups || [role()], site());
      if (c) document.cookie = c;
      window.dispatchEvent(new CustomEvent(GUIDE_CHANGE_EVENT, { detail: { done: [], open: GUIDE_START } }));
      location.assign(portalHref(site()));
    };
    box.replaceChildren(
      el("h2", { id: box.getAttribute("aria-labelledby"), text: "Guided tour" }),
      el("p", { text: "A few short steps on Home that show where to start." }),
      el("div", {}, el("button", { type: "button", class: "shell-gbtn", "data-guide-go": s.id, "data-guide-act": "restart", onclick: restart }, "Start the tour again")),
    );
  }
  draw1();
  return {
    update(more = {}) {
      setContext(more);
      draw1();
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
