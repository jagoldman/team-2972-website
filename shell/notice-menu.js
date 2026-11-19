// 2972 shell kit: the bell's row menu (0.5.0, CONTRACT H3; the demo's D.noticeMenu in js/core.js). Source of truth:
// infra/shell/notice-menu.js. Plain DOM, no framework; both bars (react/AppBar.tsx, static/shell.js) install it on
// their notices panel. Types: notice-menu.d.ts.
//
// A notice row is `.shbar-notice-link[data-id]` (a link when the notice has one, else a button) with `data-read` =
// "true" | "false". The menu opens from a right-click, a long-press (500 ms) on a touch screen, Shift+F10 or the
// ContextMenu key, at the pointer or under the row. It holds one item: "Mark as unread" on a read notice, "Mark as
// read" on an unread one. Escape and Tab close it and put the focus back on the row; a press elsewhere, a scroll or a
// resize close it. The tap that ends a long-press does not follow the link. The item calls `flip(id, read)`, which
// returns a promise of true (the server said 204) or false: on false the item says it could not be done and the
// notice stays as it was. The right-click replaces the browser's own menu on a notice (the lead's answer, KIT §8.3):
// Cmd-click and Ctrl-click still open a link in a new tab.
//
// The menu is drawn inside the panel (so the bar's "press outside closes the panel" and "tabbing out closes it" never
// see it as outside), with position: fixed.

export const NOTICE_ROW = ".shbar-notice-link[data-id]";
const LONG_PRESS_MS = 500;

/** The menu item's words. */
export function noticeMenuWords(read) {
  return read ? "Mark as unread" : "Mark as read";
}
/** What the item says when the server did not take it (an Account without `read` answers 400). */
export function noticeMenuFailed(read) {
  return read ? "Couldn't mark it unread. Try again." : "Couldn't mark it read. Try again.";
}

/**
 * Installs the row menu on `panel` (the bell's panel element). opts: { flip(id, read): Promise<boolean>, onFailed?(text) }.
 * `read` is the state the press asks for (false for "Mark as unread"). Returns { close(refocus), destroy() }.
 */
export function installNoticeMenu(panel, opts) {
  const doc = panel.ownerDocument || document;
  const win = doc.defaultView || window;
  let menu = null;
  let rowId = null;
  let busy = false;
  let pressTimer = null;
  // The click that ends a long-press (it would follow the link): swallowed once, within a moment.
  let swallowUntil = 0;

  const rowOf = (target) => (target && typeof target.closest === "function" ? target.closest(NOTICE_ROW) : null);
  const findRow = (id) => [...panel.querySelectorAll(NOTICE_ROW)].find((r) => r.getAttribute("data-id") === id) || null;
  const isRead = (row) => row.getAttribute("data-read") === "true";

  // The page-wide listeners live only while the menu is open.
  function listen(on) {
    const fn = on ? "addEventListener" : "removeEventListener";
    doc[fn]("pointerdown", onDocDown, true);
    doc[fn]("scroll", onScrollOrResize, true);
    win[fn]("resize", onScrollOrResize);
  }

  function close(refocus) {
    if (!menu) return;
    listen(false);
    const id = rowId;
    menu.remove();
    menu = null;
    rowId = null;
    busy = false;
    if (refocus) {
      const row = findRow(id);
      if (row) row.focus();
    }
  }

  function open(row, x, y) {
    close(false);
    rowId = row.getAttribute("data-id");
    const read = isRead(row);
    menu = doc.createElement("div");
    menu.className = "shbar-nmenu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Notice");
    const item = doc.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = noticeMenuWords(read);
    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      press(item, read);
    });
    menu.append(item);
    menu.addEventListener("keydown", onMenuKey);
    panel.append(menu);
    if (x == null || y == null) {
      const r = row.getBoundingClientRect();
      x = r.left + 20;
      y = r.bottom - 4;
    }
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.round(Math.max(8, Math.min(x, win.innerWidth - w - 8)))}px`;
    menu.style.top = `${Math.round(Math.max(8, Math.min(y, win.innerHeight - h - 8)))}px`;
    item.focus();
    listen(true);
  }

  async function press(item, read) {
    if (busy || !rowId) return;
    busy = true;
    const id = rowId;
    item.setAttribute("aria-disabled", "true");
    let ok = false;
    try {
      ok = (await opts.flip(id, !read)) === true;
    } catch {
      ok = false;
    }
    if (!menu || rowId !== id) return;
    busy = false;
    item.removeAttribute("aria-disabled");
    if (ok) {
      close(true);
      return;
    }
    // The notice stays as it was; the item says so (and the panel's status line, for a screen reader).
    const text = noticeMenuFailed(read);
    item.textContent = text;
    if (opts.onFailed) opts.onFailed(text);
  }

  function onMenuKey(e) {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      menu.querySelector("button").focus();
    }
  }

  const onContext = (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    e.preventDefault();
    // The keyboard's menu key fires this with no pointer position; Shift+F10 too. Already open from the key: keep it.
    const kb = !e.clientX && !e.clientY;
    if (menu && rowId === row.getAttribute("data-id") && (kb || Date.now() < swallowUntil)) return;
    open(row, kb ? null : e.clientX, kb ? null : e.clientY);
  };
  const onKey = (e) => {
    const row = rowOf(e.target);
    if (row && ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu")) {
      e.preventDefault();
      open(row);
    }
  };
  const clearPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };
  const onTouchStart = (e) => {
    const row = rowOf(e.target);
    if (!row || e.touches.length > 1) return;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    clearPress();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      swallowUntil = Date.now() + 800;
      open(row, x, y);
    }, LONG_PRESS_MS);
  };
  // Capture: runs before the bar's own click handler on the row (which marks it read and follows the link).
  const onClickCapture = (e) => {
    if (Date.now() < swallowUntil && rowOf(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      swallowUntil = 0;
    }
  };
  const onDocDown = (e) => {
    if (menu && !menu.contains(e.target)) close(false);
  };
  const onScrollOrResize = (e) => {
    if (menu && !(e && e.target && e.target.nodeType === 1 && menu.contains(e.target))) close(false);
  };

  panel.addEventListener("contextmenu", onContext);
  panel.addEventListener("keydown", onKey);
  panel.addEventListener("touchstart", onTouchStart, { passive: true });
  for (const ev of ["touchend", "touchmove", "touchcancel"]) panel.addEventListener(ev, clearPress, { passive: true });
  panel.addEventListener("click", onClickCapture, true);

  return {
    close,
    get open() {
      return !!menu;
    },
    destroy() {
      close(false);
      clearPress();
      if (typeof panel.removeEventListener !== "function") return;
      panel.removeEventListener("contextmenu", onContext);
      panel.removeEventListener("keydown", onKey);
      panel.removeEventListener("touchstart", onTouchStart);
      for (const ev of ["touchend", "touchmove", "touchcancel"]) panel.removeEventListener(ev, clearPress);
      panel.removeEventListener("click", onClickCapture, true);
    },
  };
}
