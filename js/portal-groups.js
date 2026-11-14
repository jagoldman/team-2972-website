// The portal home's three closed group rows under the tiles (release 8.1.5, CONTRACT C1; demo core.js groupRow,
// toolsGroup, adminGroup): Tools, Admin apps and More, in that order. Each is one quiet row (name, count, chevron), a
// real button with aria-expanded that opens a short list; a row with nothing in it is not drawn. Open or closed is
// remembered in the kit's site-wide `shellgroups` cookie under the ids tools, adminapps and more.
//
// Landing's own code until the kit's static profile has a helper for this (kit 0.4.0): the sync replaces this one
// module (mountHomeGroups) and keeps the same cookie and ids. Kit 0.3.2's parseOpenGroups knows only tools and more,
// so the cookie is read and written here.
import { COOKIE_MAX_AGE, GROUPS_COOKIE, cookieAttributes, iconPath, readCookie } from "/shell/core.js";
import { el, svgIcon } from "/js/portal-home.js";

export const HOME_GROUPS = Object.freeze(["tools", "adminapps", "more"]);
const LABELS = { tools: "Tools", adminapps: "Admin apps", more: "More" };
// The demo's hover description for the Admin apps row (Tools and More have none there).
const TIPS = { adminapps: "Apps for the people who run the team's accounts and its public website." };

/** The open groups in a cookie value, known ids only, in HOME_GROUPS order. */
export function parseHomeGroups(v) {
  const have = new Set(typeof v === "string" ? v.split(".") : []);
  return HOME_GROUPS.filter((g) => have.has(g));
}
function groupsCookie(list, site) {
  return list.length
    ? `${GROUPS_COOKIE}=${list.join(".")}${cookieAttributes(site, COOKIE_MAX_AGE)}`
    : `${GROUPS_COOKIE}=${cookieAttributes(site, 0)}`;
}

// A tool opens in the same tab (it lives on this site and is not an app); its line is printed, its tip is the hover.
function toolRow(t) {
  const a = el("a", "toolrow");
  a.href = t.href;
  a.dataset.q = `${t.name} ${t.description} tools`.toLowerCase();
  if (t.tip) a.dataset.tip = t.tip;
  const ic = el("span", "ic");
  ic.append(svgIcon(iconPath(t.icon), 18));
  const words = el("span", "");
  words.append(el("b", "", t.name));
  if (t.description) words.append(el("small", "", t.description));
  a.append(ic, words);
  return a;
}
function allToolsRow(href) {
  const a = el("a", "toolrow all");
  a.href = href;
  a.dataset.q = "all tools";
  a.append(el("span", "", "All tools"), el("span", "chev", "›"));
  a.lastChild.setAttribute("aria-hidden", "true");
  return a;
}

// An app link-out (Admin apps, More): a new tab, as every app on the portal.
export function moreLink(t) {
  const li = el("li");
  const link = el(t.href ? "a" : "span", t.href ? "" : "coming-soon");
  link.dataset.q = `${t.name} ${t.description} ${t.audience || ""}`.toLowerCase();
  if (t.href) {
    link.href = t.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (t.tip) link.dataset.tip = t.tip;
  }
  const ico = el("span", "more-ico");
  ico.append(svgIcon(iconPath(t.icon)));
  const name = el("b", "", t.name);
  if (t.external) name.append(el("span", "ext", " ↗"));
  link.append(ico, name);
  if (t.href) link.append(el("span", "vh", " (opens in a new tab)"));
  else link.append(el("span", "status-dot", "Coming soon"));
  li.append(link);
  return li;
}

/**
 * Draws the rows into `root` (the .homegroups box). update({ tools, adminApps, more, allToolsHref }) redraws them
 * (a mode change); filter(text) shows only matching entries, opening a group that has one without saving that, and
 * returns how many matched. Each list keeps a fixed id: #tools-list, #admin-list, #more-list.
 */
export function mountHomeGroups(root, { site }) {
  const fromCookie = () => new Set(parseHomeGroups(readCookie(document.cookie, GROUPS_COOKIE)));
  let open = fromCookie();
  let sticks = true; // false once a write did not stick (cookies blocked): this page's own list is then the truth
  let query = "";

  // Re-read the cookie before writing, so a row opened or closed meanwhile in another tab (or in the bar) is kept.
  function setOpen(id, on) {
    const now = sticks ? fromCookie() : open;
    if (on) now.add(id); else now.delete(id);
    open = now;
    const list = HOME_GROUPS.filter((g) => open.has(g));
    try { document.cookie = groupsCookie(list, site); } catch { /* cookies blocked */ }
    sticks = [...fromCookie()].join(".") === list.join(".");
  }
  function show(grp, on) {
    grp.querySelector(".grphead").setAttribute("aria-expanded", String(on));
    grp.querySelector(".grpbody").hidden = !on;
  }
  function group(id, count, body) {
    const grp = el("div", "grp");
    grp.dataset.grp = id;
    grp.id = id === "more" ? "more-apps" : `${id}-group`;
    const btn = el("button", "grphead");
    btn.type = "button";
    btn.id = `grp-home-${id}-btn`;
    btn.setAttribute("aria-controls", `grp-home-${id}`);
    if (TIPS[id]) btn.dataset.tip = TIPS[id];
    const chev = el("span", "grpchev");
    chev.setAttribute("aria-hidden", "true");
    chev.append(svgIcon(iconPath("chevron"), 16));
    btn.append(el("span", "grpname", LABELS[id]), el("span", "tcount", String(count)), chev);
    const box = el("div", "grpbody");
    box.id = `grp-home-${id}`;
    box.append(body);
    grp.append(btn, box);
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-expanded") !== "true";
      show(grp, on);
      if (!query) setOpen(id, on);
    });
    show(grp, open.has(id));
    return grp;
  }

  function update({ tools = [], adminApps = [], more = [], allToolsHref = "" } = {}) {
    const rows = [];
    if (tools.length) {
      const list = el("div", "toollist");
      list.id = "tools-list";
      list.append(...tools.map(toolRow));
      if (allToolsHref) list.append(allToolsRow(allToolsHref));
      rows.push(group("tools", tools.length, list));
    }
    if (adminApps.length) {
      const ul = el("ul", "morelinks");
      ul.id = "admin-list";
      ul.append(...adminApps.map(moreLink));
      rows.push(group("adminapps", adminApps.length, ul));
    }
    if (more.length) {
      const ul = el("ul", "morelinks");
      ul.id = "more-list";
      ul.append(...more.map(moreLink));
      rows.push(group("more", more.length, ul));
    }
    root.replaceChildren(...rows);
    root.hidden = rows.length === 0;
    if (query) filter(query);
  }

  function filter(text) {
    query = text;
    let matches = 0;
    for (const grp of root.querySelectorAll(".grp")) {
      let here = 0;
      for (const item of grp.querySelectorAll(".grpbody [data-q]")) {
        const row = item.closest("li") || item;
        row.hidden = !!text && !item.dataset.q.includes(text);
        if (!row.hidden && !item.classList.contains("all")) here++;
      }
      matches += here;
      grp.hidden = !!text && here === 0;
      show(grp, text ? here > 0 : open.has(grp.dataset.grp));
    }
    return matches;
  }

  return { update, filter };
}
