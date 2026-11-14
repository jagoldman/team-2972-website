// 2972 shell kit: one shared hover description for every app (D149). Source of truth: infra/shell/tip.js.
// Behaves as the approved demo's (portal-demo 4f767ea, js/tip.js). Plain DOM, no dependencies; safe to import on
// a server (nothing runs until installTip is called in a browser). Types: tip.d.ts. Looks: .shell-tip in ui.css.
//
// An element is described when it has data-tip="…", or is a kit tab with an id (.shell-tab[data-tab]) or a kit
// status word (.shell-status), whose words come from tip-text.js for this page's app id(s). The description:
//   - shows on mouse hover after half a second, and at once when a key press (Tab, Shift+Tab, an arrow key…) moved
//     the focus to the element (:focus-visible); never from touch or a pen, and never when a script moved the focus;
//   - hides on leave, blur, Escape (which then does nothing else, so a menu under it stays open), click, pointer down,
//     resize and scroll (a keyboard tip follows its element while the page scrolls it into view, until the scrolling
//     stops), and when its element, or its words, go away;
//   - sits above the element (below when there is no room), always inside the window, above every other layer;
//   - is one shared role="tooltip" element, announced with aria-describedby on the element while it shows;
//   - is set as text, never as markup.
// The text is worked out when the pointer or the focus arrives; nothing is written onto elements that are not being
// described, and nothing watches the page except the one element whose tip is showing.
// A description is never the only way to learn something a person needs: phones have no hover.

import { statusTip, tabTip } from "./tip-text.js";

export const TIP_ID = "shell-tip";
/** The elements the tip describes: their own data-tip, or a kit tab or status word (words from the tables). */
export const TIP_SELECTOR = "[data-tip], .shell-tab[data-tab], .shell-status";
const DELAY = 500; // ms of mouse hover before the tip shows
const KEY_MOMENT = 300; // ms: focus this soon after a navigation key counts as moved by the keyboard
const SCROLL_FIRST = 300; // ms a keyboard tip waits for the scroll that brings its element into view to start
const SCROLL_QUIET = 150; // ms without a scroll event that count as "the scrolling has stopped"
const NAV_KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

const idList = (ids) => (Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === "string" && id !== "");

/**
 * The description for element `el` (pure apart from reading `el`): its own data-tip first (an empty data-tip means
 * "no tip"), else a kit tab's or status word's words from the tables for app ids `ids` (one id or a list); "".
 */
export function tipText(el, ids) {
  if (!el || typeof el.getAttribute !== "function") return "";
  const own = el.getAttribute("data-tip");
  if (own !== null) return own.trim() ? own : "";
  const list = idList(ids);
  const has = (name) => !!(el.classList && el.classList.contains(name));
  if (has("shell-tab") && el.getAttribute("data-tab") !== null) {
    for (const id of list) {
      const t = tabTip(id, el.getAttribute("data-tab"));
      if (t) return t;
    }
    return "";
  }
  if (has("shell-status")) return statusTip(list, el.textContent);
  return "";
}

/**
 * Where the tip goes (pure). `r` is the element's box, `w`/`h` the tip's size, `vw`/`vh` the window.
 * Above with a 6 px gap; below when there is no room above; kept 4 px inside the top and bottom and 8 px inside
 * the sides; centred on the element where it can be.
 */
export function placeTip(r, w, h, vw, vh) {
  const gap = 6;
  let top = r.top - h - gap;
  if (top < 4) top = r.bottom + gap;
  if (top + h > vh - 4) top = Math.max(4, vh - h - 4);
  const left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
  return { top: Math.round(top), left: Math.round(left) };
}

let live = null; // the one installed tip for this page

/**
 * Installs the tip on this page. `ids` is the app's apps.json id, or a list of ids for an app that is several
 * (Competition: ["schedule", "pit", "scouting"]); they pick the tab and status tables. Safe to call more than once
 * (React strict mode, the app bar and ShellEnhance on one page): one tip, and the tables of every caller still
 * installed (the latest caller's first). Returns a function that undoes this call; the tip is removed when every
 * caller has undone theirs. No-op outside a browser.
 */
export function installTip(ids = [], env = {}) {
  const doc = env.document ?? (typeof document === "undefined" ? null : document);
  const win = env.window ?? (typeof window === "undefined" ? null : window);
  if (!doc || !win || !doc.body || typeof win.MutationObserver !== "function") return () => {};
  if (live && live.doc !== doc) live.remove();
  if (!live) live = start(doc, win);
  const t = live;
  const entry = { ids: idList(ids) };
  t.callers.push(entry);
  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    const i = t.callers.indexOf(entry);
    if (i >= 0) t.callers.splice(i, 1);
    if (t.callers.length === 0 && live === t) t.remove();
  };
}

/** Hides the tip now (for an app that redraws under it). No-op when nothing shows. */
export function hideTip() {
  if (live) live.hide();
}

function start(doc, win) {
  const now = () => Date.now();
  let tip = null;
  let anchor = null;
  let pending = null;
  let timer = null;
  let oldDesc = null;
  let addedDesc = false;
  let byKeyboard = false;
  let keepUntil = 0; // a keyboard tip follows scrolling until this time
  let frame = 0;
  let keyAt = -Infinity;
  let pointerAt = -Infinity;
  let watch = null;
  const self = { doc, callers: [] };
  // Every installed caller's ids, the latest caller's first.
  const ids = () => [...new Set(self.callers.slice().reverse().flatMap((c) => c.ids))];
  const text = (el) => tipText(el, ids());

  // The nearest element that is described: a status word inside a link with its own data-tip uses its own words;
  // one without words lets the link's show.
  function described(target) {
    let el = target && typeof target.closest === "function" ? target.closest(TIP_SELECTOR) : null;
    while (el) {
      if (text(el)) return el;
      const up = el.parentElement;
      el = up ? up.closest(TIP_SELECTOR) : null;
    }
    return null;
  }

  function box() {
    if (!tip || !doc.contains(tip)) {
      tip = doc.createElement("div");
      tip.id = TIP_ID;
      tip.className = "shell-tip";
      tip.setAttribute("role", "tooltip");
      doc.body.appendChild(tip);
    }
    return tip;
  }
  function place() {
    if (!anchor || !tip) return;
    const r = anchor.getBoundingClientRect();
    const p = placeTip(r, tip.offsetWidth, tip.offsetHeight, doc.documentElement.clientWidth || win.innerWidth, win.innerHeight);
    tip.style.top = `${p.top}px`;
    tip.style.left = `${p.left}px`;
  }
  // While a tip shows: its element's words (attributes and text) and whether the element is still on the page.
  // Nothing else on the page is read or watched.
  function follow() {
    if (!anchor) return;
    const words = text(anchor);
    if (!anchor.isConnected || !words) return hide();
    if (tip && tip.textContent !== words) {
      tip.textContent = words;
      place();
    }
  }
  function show(a, keyboard) {
    pending = null;
    const words = text(a);
    if (!words || !a.isConnected) return;
    hide();
    anchor = a;
    byKeyboard = keyboard;
    keepUntil = keyboard ? now() + SCROLL_FIRST : 0;
    const t = box();
    t.textContent = words; // text, never markup
    t.classList.add("on");
    place();
    // The element's own description is kept; the tip is added only when it says something new (a tile already
    // carries its description as hidden text, so a screen reader does not hear it twice).
    oldDesc = a.getAttribute("aria-describedby");
    const ids0 = (oldDesc || "").split(/\s+/).filter((id) => id && id !== TIP_ID);
    const repeats = ids0.some((id) => {
      const d = doc.getElementById(id);
      return d && d.textContent.trim() === words.trim();
    });
    addedDesc = !repeats;
    if (addedDesc) a.setAttribute("aria-describedby", [...ids0, TIP_ID].join(" "));
    watch = new win.MutationObserver(follow);
    watch.observe(a, { attributes: true, attributeFilter: ["data-tip", "data-tab", "class"], characterData: true, childList: true, subtree: true });
    watch.observe(doc.body, { childList: true, subtree: true }); // only to notice the element leaving the page
  }
  function hide() {
    win.clearTimeout(timer);
    timer = null;
    pending = null;
    if (watch) {
      watch.disconnect();
      watch = null;
    }
    if (anchor && addedDesc) {
      if (oldDesc) anchor.setAttribute("aria-describedby", oldDesc);
      else anchor.removeAttribute("aria-describedby");
    }
    anchor = null;
    oldDesc = null;
    addedDesc = false;
    byKeyboard = false;
    if (tip) tip.classList.remove("on");
  }

  const on = [];
  const listen = (target, type, fn, capture = false) => {
    target.addEventListener(type, fn, capture);
    on.push(() => target.removeEventListener(type, fn, capture));
  };
  listen(doc, "pointerover", (e) => {
    if (e.pointerType !== "mouse") return; // never from touch or a pen
    const a = described(e.target);
    if (!a || a === anchor || a === pending) return;
    hide();
    pending = a;
    timer = win.setTimeout(() => show(a, false), DELAY);
  });
  listen(doc, "pointerout", (e) => {
    const a = anchor || pending;
    if (!a || !e.target || typeof a.contains !== "function" || !a.contains(e.target)) return;
    if (e.relatedTarget && a.contains(e.relatedTarget)) return;
    hide();
  });
  listen(doc, "pointerdown", () => {
    pointerAt = now();
    hide();
  }, true);
  listen(doc, "click", () => hide(), true);
  listen(doc, "keydown", (e) => {
    if (NAV_KEYS.has(e.key)) keyAt = now();
    if (e.key === "Escape" && anchor) {
      // Only the tip closes: the menu or dialog under it stays open until the next Escape.
      hide();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  listen(doc, "focusin", (e) => {
    const a = e.target;
    if (!a || typeof a.matches !== "function") return;
    // At once, but only when a navigation key just moved the focus: not a click or tap, not a script (a dialog
    // focusing its first control), so one Escape still closes a dialog that has just opened.
    const t = now();
    if (t - keyAt > KEY_MOMENT || pointerAt >= keyAt) return;
    keyAt = -Infinity; // one key press moves the focus once: a script focusing something next does not count
    try {
      if (!a.matches(":focus-visible")) return;
    } catch {
      // an old browser without :focus-visible: the key press is enough
    }
    let el = null;
    try {
      el = a.matches(TIP_SELECTOR) && text(a) ? a : null;
    } catch {
      el = null;
    }
    if (el) show(el, true);
  });
  listen(doc, "focusout", (e) => {
    if (e.target === anchor || e.target === pending) hide();
  });
  listen(win, "scroll", () => {
    if (!anchor) return hide(); // also cancels a hover still waiting
    const t = now();
    if (byKeyboard && t <= keepUntil) {
      // Focus scrolled the element into view (smoothly, perhaps): follow it until the scrolling stops.
      keepUntil = t + SCROLL_QUIET;
      if (!frame) {
        const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : (fn) => win.setTimeout(fn, 16);
        frame = raf(() => {
          frame = 0;
          place();
        });
      }
      return;
    }
    hide();
  }, true);
  listen(win, "resize", () => hide());

  self.hide = hide;
  self.remove = () => {
    hide();
    for (const off of on.splice(0)) off();
    if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    tip = null;
    if (live === self) live = null;
  };
  return self;
}
