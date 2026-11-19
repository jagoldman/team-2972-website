// The portal Home in design 8.3 "Ground up" (D182–D190): the demo's homeGround() (portal-demo design83, js/core.js
// seasonLine, nowRows, waitingOnOthers, weekRows, homeGround; js/tasks.js nextUp; js/compete.js eventLine), drawn
// from the one /today.json answer that js/portal-home.js checks (CONTRACT H1, C1, E1). Every 8.3 part is optional:
// a part that is missing is not drawn, never an empty heading. Every text goes in with textContent.
// The buttons on a row (Approve, Deny, Sign off, Sign up) act at once (D187): the row goes, POST /today/act runs in
// the background, and on any answer but success the row comes back with a plain sentence. Sign in is a link.
import {
  daysBetween, el, fmtDay, isParentOnly, nextLine, plural, postAct, postTaskDone, practicesLeft, practicesText,
  rowsForMode, shiftFirst, svgIcon, taskHeld, todayIso, whenText,
} from "/js/portal-home.js";

const CHECK = "M5 12l5 5 9-10";
const PARTS = "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"; // the kit's parts icon

// A link to another app opens a new tab, as the apps do, so the portal stays open; a link on this host stays here.
export function linkTo(a, href) {
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

/** A section of the sheet: a rule above, a heading, no box. */
function section(id, title, cls = "") {
  const sec = el("section", `hsec${cls ? ` ${cls}` : ""}`);
  sec.id = id;
  const h = el("h2", "", title);
  h.id = `${id}-h`;
  sec.setAttribute("aria-labelledby", h.id);
  sec.append(h);
  return sec;
}

/** A state is a dot and a word, never colour alone (the kit's .shell-status). */
export function mark(word, tone) {
  return el("span", `shell-status${tone ? ` shell-status--${tone}` : ""}`, word);
}

/** A button in the kit's classes; `filled` makes it the page's one filled (blue) button. */
function btnClass(filled, more = "") {
  return `shell-btn${filled ? " shell-btn--primary" : ""}${more ? ` ${more}` : ""}`;
}

/** The app a row belongs to, from its id ("parts:…" → "parts"). */
export function rowApp(r) {
  const m = /^([a-z]+):/.exec(r && r.id || "");
  return m ? m[1] : "";
}
const isPractice = (r) => r.id === "calendar:practice";
const isShift = (r) => /^compete:shift-/.test(r.id);
// Calendar marks its Sign in link `primary` (C17); an older Calendar is known by the words.
const isSignIn = (r) => isPractice(r) && !!r.cta && (r.cta.primary === true || r.cta.label === "Sign in");

/**
 * A row's lines under its title: the `lines` Account sends (it copies the first into `detail` for older portals), or
 * the one `detail`.
 */
export function rowLines(r) {
  return r.lines && r.lines.length ? r.lines.slice() : [r.detail].filter(Boolean);
}

/**
 * The practice row as the demo words it: "Practice today" on top, then the time, then "Not signed in". Calendar sends
 * "Practice today, 3:30 pm–6 pm" with "You are not signed in"; any other title is left as it is.
 */
export function practiceWords(r) {
  const m = /^(Practice today), (.+)$/.exec(r.title);
  if (!m) return { title: r.title, lines: rowLines(r) };
  const detail = r.detail === "You are not signed in" ? "Not signed in" : r.detail;
  return { title: m[1], lines: [m[2], detail].filter(Boolean) };
}

// ---------------------------------------------------------------- the season line

/**
 * The season line (the one dark bar): N practices to the target, the date and days, one mark per meeting day, a
 * diamond on a day with a milestone due, and up to three milestones as doors to Tasks. `simple` is a parent's line:
 * the next practice first, then the days and practices, no marks.
 */
export function seasonLine(data, { simple = false, today = todayIso() } = {}) {
  const sn = data.season;
  if (simple) {
    const p = nextPractice(data.week, today);
    if (!p && !sn) return null;
    const box = el("section", "season simple");
    box.setAttribute("aria-label", "This week and the season");
    if (p) box.append(el("p", "snpractice", p));
    if (sn) box.append(seasonHead(sn, today, true));
    return box;
  }
  if (!sn) return null;
  const box = el("section", "season");
  box.setAttribute("aria-label", "The season");
  box.append(seasonHead(sn, today, false));
  const days = sn.days.filter((d) => d.date >= today);
  const ms = (data.milestones || []).filter((m) => m.date >= today && m.date < sn.target.date);
  const due = new Map();
  for (const m of ms) if (!due.has(m.date)) due.set(m.date, m);
  const track = el("div", "sntrack");
  track.setAttribute("aria-hidden", "true");
  days.forEach((d, i) => {
    const cls = ["pm"];
    if (d.date === today) cls.push("today");
    else if (i === 0) cls.push("next");
    if (d.kind === "build") cls.push("build");
    if (d.kind === "comp") cls.push("comp");
    if (due.has(d.date)) cls.push("due");
    const i_ = el("i", cls.join(" "));
    const color = due.get(d.date)?.color;
    if (color) i_.style.setProperty("--mc", color);
    track.append(i_);
  });
  track.append(el("span", "snend", sn.target.title));
  box.append(track);
  if (ms.length) {
    const next = el("div", "snnext");
    for (const m of ms.slice(0, 3)) {
      const a = el("a", "snms");
      const d = el("i", "snd");
      d.setAttribute("aria-hidden", "true");
      if (m.color) d.style.setProperty("--mc", m.color);
      const left = practicesText(sn, m.date, today);
      a.append(d, el("b", "", m.name), el("span", "", `${fmtDay(m.date)}${left ? `, ${left}` : ""}`));
      if (m.project) a.dataset.tip = `The ${m.project} project in Tasks.`;
      next.append(linkTo(a, m.href));
    }
    box.append(next);
  }
  return box;
}

function seasonHead(sn, today, simple) {
  const days = sn.days.filter((d) => d.date >= today).length;
  const toGo = Math.max(0, daysBetween(today, sn.target.date));
  const head = el("p", "snhead");
  const words = el("span");
  if (simple) {
    words.append(el("b", "", `${plural(toGo, "day", "days")}, ${plural(days, "practice", "practices")} to ${sn.target.name}`), el("span", "snmute", fmtDay(sn.target.date)));
    head.append(words);
    return head;
  }
  head.append(el("b", "snnum", String(days)));
  words.append(el("b", "", `${days === 1 ? "practice" : "practices"} to ${sn.target.name}`), el("span", "snmute", `${fmtDay(sn.target.date)}, ${plural(toGo, "day", "days")}`));
  head.append(words);
  return head;
}

/** "Practice today, 3:30 pm–6 pm, Dawson shop" or "Next practice Thu, Nov 12, …" from This week, else "". */
export function nextPractice(week, today = todayIso()) {
  for (const d of week || []) {
    if (d.date < today) continue;
    const p = d.items.find((i) => i.kind === "practice" || i.kind === "build");
    if (!p) continue;
    const head = d.date === today ? "Practice today" : `Next practice ${fmtDay(d.date)}`;
    return [head, p.time, p.location].filter(Boolean).join(", ");
  }
  return "";
}

// ---------------------------------------------------------------- the event line (the kit's .shell-evline)

/** The one line at an event: you now, the next match (or ours on the field), the robot; each a door to Competition. */
export function eventLine(ev, site, { withNow = true } = {}) {
  const parts = [];
  const door = (path) => `${site.scheme}://compete.${site.domain}${path}`;
  if (withNow && ev.line.now) parts.push(["You now", ev.line.now, door("/schedule")]);
  if (ev.line.match) parts.push([ev.line.match.label, ev.line.match.text, door("/pit?tab=check")]);
  if (ev.line.robot) parts.push(["Robot", ev.line.robot, door("/pit?tab=check")]);
  if (!parts.length) return null;
  const nav = el("nav", "shell-evline evline");
  nav.setAttribute("aria-label", "At the event");
  for (const [k, v, href] of parts) {
    const a = el("a", "shell-evpart");
    a.append(el("span", "shell-evk", k), el("span", "shell-evv", v));
    nav.append(linkTo(a, href));
  }
  return nav;
}

// ---------------------------------------------------------------- Now rows and their acts

const DONE_WORDS = { approve: "Approved.", deny: "Denied. They see your reason.", signoff: "Signed off.", snack: "Signed up.", volunteer: "Signed up.", unapprove: "Put back to wait for an OK." };
const CHANGED_WORDS = {
  approve: "Someone else already approved or denied this.",
  deny: "Someone else already approved or denied this.",
  signoff: "Someone else already signed this off.",
  snack: "That day is full now, or you're already signed up.",
  volunteer: "That event is full now, or you're already signed up.",
};
/** The plain sentence for an act's answer that was not a success; Account's own words for a 409 win when it sends them. */
export function actMessage(action, result, message = "") {
  if (result === "changed") return message || CHANGED_WORDS[action] || "Someone else already did this.";
  if (result === "refused") return "You can't do this from Home. Open it to see why.";
  if (result === "gone") return "This isn't there any more.";
  if (result === "reason") return "Say why, then press Deny again.";
  if (result === "timeout") return "We couldn't tell if that worked.";
  return "That didn't go through. Try again.";
}

/**
 * The page's acts: one call per key at a time, the row hidden at once and brought back on any answer but success.
 * o: { say(words, undo?) (the lasting status line), refresh() (asks /today.json again), onBusy(bool), post, ask(reason) }.
 */
export function makeActs(o = {}) {
  const { say = () => {}, refresh = async () => {}, onBusy = () => {}, post = postAct, ask = askReason } = o;
  const busy = new Set();
  const hidden = new Set(); // row ids settled here and not yet gone from /today.json
  const notes = new Map(); // row id → the sentence of its last failed act, kept when the Home is drawn again
  async function run(li, r, a) {
    if (busy.has(a.key)) return; // a second press while the first is on its way sends nothing
    let reason;
    if (a.reason) {
      reason = await ask(r);
      if (reason == null) return;
    }
    busy.add(a.key);
    hidden.add(r.id);
    notes.delete(r.id);
    onBusy(true);
    const next = li.nextElementSibling;
    li.hidden = true;
    li.querySelector(".nowmsg")?.remove();
    // Focus goes on down the list, else to the section's heading.
    const after = (next && !next.hidden && next.querySelector("button, a")) || li.closest("section")?.querySelector("h2");
    if (after) { if (after.tagName === "H2") after.tabIndex = -1; after.focus(); }
    say(DONE_WORDS[a.action] || "Done.");
    const body = { app: a.app, action: a.action, key: a.key };
    if (reason) body.reason = reason;
    const { result, undoUntil, message } = await post(body);
    busy.delete(a.key);
    onBusy(busy.size > 0);
    if (result === "ok") {
      if (undoUntil && a.app === "parts" && a.action === "approve") say(DONE_WORDS.approve, { until: undoUntil, run: () => undo(li, r, a) });
      if (!busy.size) refresh();
      return;
    }
    hidden.delete(r.id);
    li.hidden = false;
    const msg = el("p", "nowmsg", actMessage(a.action, result, message));
    notes.set(r.id, msg.textContent);
    li.append(msg);
    say(msg.textContent);
    li.querySelector(".nowbtn, button")?.focus();
    if (result !== "failed" && result !== "reason" && !busy.size) refresh();
  }
  // Undo exists only when Parts answered {undoUntil} (CONTRACT P): the same act path, action "unapprove".
  async function undo(li, r, a) {
    const { result } = await post({ app: a.app, action: "unapprove", key: a.key });
    say(result === "ok" ? DONE_WORDS.unapprove : actMessage("unapprove", result));
    if (result === "ok") { hidden.delete(r.id); refresh(); }
  }
  return { run, hidden, busy, notes };
}

/** Deny asks why in a small dialog, filled with the words Parts' own Deny uses. Resolves to the reason or null. */
export function askReason(r) {
  return new Promise((resolve) => {
    const dlg = el("dialog", "gdialog");
    dlg.setAttribute("aria-labelledby", "deny-h");
    const h = el("h2", "", "Deny this request?");
    h.id = "deny-h";
    const p = el("p");
    p.append(el("b", "", r.title), document.createTextNode(". They see your reason."));
    const label = el("label", "", "Why");
    label.htmlFor = "deny-why";
    const ta = el("textarea");
    ta.id = "deny-why";
    ta.rows = 3;
    ta.maxLength = 500;
    ta.value = "Let's use the ones in stock first.";
    const err = el("p", "gerr");
    err.setAttribute("role", "alert");
    const go = el("button", "shell-btn shell-btn--danger", "Deny");
    go.type = "button";
    const keep = el("button", "shell-btn", "Keep it");
    keep.type = "button";
    const row = el("div", "gbtns");
    row.append(go, keep);
    dlg.append(h, p, label, ta, err, row);
    let answer = null;
    go.addEventListener("click", () => {
      const why = ta.value.replace(/\s+/g, " ").trim();
      if (!why) { err.textContent = "Say why, so they know."; ta.focus(); return; }
      answer = why.slice(0, 500);
      dlg.close();
    });
    keep.addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { dlg.remove(); resolve(answer); });
    document.body.append(dlg);
    dlg.showModal();
    ta.focus();
  });
}

/**
 * One row of a list: the words open the owning screen; at the end its acts (buttons), its link button (cta), or a
 * chevron. `filled` is the page's one filled button: a function that says yes once (D187, "one filled button").
 */
export function nowRow(r, { acts, filled = () => false, practice = false } = {}) {
  const li = el("li", "nowrow");
  li.dataset.id = r.id;
  const words = practice ? practiceWords(r) : { title: r.title, lines: rowLines(r) };
  const withActs = !!(r.acts && r.acts.length && acts);
  const tall = withActs && words.lines.length > 1;
  if (tall) li.classList.add("nowtall");
  const a = el("a", "rowlink");
  const t = el("span", "rt", words.title);
  // The demo's nowRow: a row with buttons carries its state after the title; any other row (Stuck, Waiting on others)
  // starts its lines with it, on a line of its own.
  if (r.mark && withActs) { t.append(document.createTextNode(" ")); t.append(mark(r.mark.word, r.mark.tone)); }
  a.append(t);
  if (r.mark && !withActs) { const m = mark(r.mark.word, r.mark.tone); m.classList.add("rmark"); a.append(m); }
  // Parts' "Order by …, N days late" is the urgent line of a request (the demo's .nowdue).
  for (const line of words.lines) a.append(el("span", /^Order by .+ late$/.test(line) ? "rl nowdue" : "rl", line));
  li.append(linkTo(a, r.href));
  if (withActs) {
    const btns = el("span", "nowbtns");
    for (const x of r.acts) {
      const b = el("button", btnClass(!!x.primary && filled(), `nowbtn${x.reason ? " shell-btn--danger nowdeny" : ""}`), x.label);
      b.type = "button";
      b.dataset.action = x.action;
      b.setAttribute("aria-label", `${x.label}: ${words.title}`);
      b.addEventListener("click", () => acts.run(li, r, x));
      btns.append(b);
    }
    li.append(btns);
  } else if (r.cta) {
    const sign = isSignIn(r);
    const b = linkTo(el("a", btnClass(sign && filled(), "nowbtn"), r.cta.label), r.cta.href);
    if (sign) { li.classList.add("nowfirst"); b.dataset.tip = "Sign in with the code at the shop door."; }
    li.append(b);
  } else {
    const c = el("span", "chev", "›");
    c.setAttribute("aria-hidden", "true");
    li.append(c);
  }
  const note = acts && acts.notes && acts.notes.get(r.id);
  if (note) li.append(el("p", "nowmsg", note));
  return li;
}

function rowList(rows, opts) {
  const ul = el("ul", "glist");
  ul.append(...rows.map((r) => nowRow(r, { ...opts, practice: isPractice(r) })));
  return ul;
}

/**
 * The Now list in the demo's order. A student: the practice row (Sign in) first, then the rest. Staff: the rows that
 * need a decision, in their groups (Needs your OK, Sign-off requests, Stuck), then the doors, then the practice row.
 */
export function nowOrder(rows, staff) {
  if (!staff) return [...rows.filter(isPractice), ...rows.filter((r) => !isPractice(r))];
  const grouped = rows.filter((r) => r.group);
  const order = [];
  for (const r of grouped) if (!order.includes(r.group)) order.push(r.group);
  return [
    ...order.flatMap((g) => grouped.filter((r) => r.group === g)),
    ...rows.filter((r) => !r.group && !isPractice(r)),
    ...rows.filter((r) => !r.group && isPractice(r)),
  ];
}

/** The Now section; a short label starts each group of rows, so a mentor's list reads in groups. */
export function nowSection(rows, { title = "Now", empty = "Nothing needs you right now.", guide = false, ...opts } = {}) {
  const sec = section("home-now", title, "nowsec");
  if (guide) sec.dataset.guide = "wait";
  if (!rows.length) { sec.append(el("p", "mute gempty", empty)); return sec; }
  const anyGroup = rows.some((r) => r.group);
  // The demo labels the doors after the groups "Parts and practice"; when other apps' doors are among them (Admin's
  // account requests), a plainer label.
  const rest = rows.filter((r) => !r.group);
  const restLabel = rest.every((r) => /^(parts|calendar):/.test(r.id)) ? "Parts and practice" : "Other things";
  let ul = null, last;
  for (const r of rows) {
    const g = r.group || (anyGroup ? restLabel : "");
    if (!ul || g !== last) {
      if (g) sec.append(el("h3", "nowgroup", g));
      ul = el("ul", "glist");
      sec.append(ul);
      last = g;
    }
    ul.append(nowRow(r, { ...opts, practice: isPractice(r) }));
  }
  return sec;
}

// ---------------------------------------------------------------- This week, Coming up, Next for us

function dayCell(date, today, label) {
  const d = el("span", "wkd");
  d.append(el("b", "", label || (date === today ? "Today" : fmtDay(date, { weekday: "short" }))), el("span", "", fmtDay(date, { month: "short", day: "numeric" })));
  return d;
}

function itemWords(i) {
  if (i.kind === "practice") return `Practice${i.time ? `, ${i.time}` : ""}`;
  if (i.kind === "build") return `Build day${i.time ? `, ${i.time}` : ""}`;
  return i.name;
}

/**
 * This week: each day the team meets or has an event, a door to the Calendar. Facts: where (a parent), mentors
 * coming (staff and students), snacks (when Calendar sends them, in their mode), what is due (Tasks' milestones).
 */
export function weekSection(data, { parent = false, mode = "build", today = todayIso() } = {}) {
  if (!Array.isArray(data.week)) return null;
  const sec = section("home-week", "This week", "wksec");
  const days = data.week.filter((d) => d.date >= today);
  if (!days.length) { sec.append(el("p", "mute gempty", "Nothing in the next seven days.")); return sec; }
  const ul = el("ul", "glist week");
  for (const d of days) {
    const li = el("li");
    const a = el("a", `wkrow${d.date === today ? " today" : ""}`);
    const what = d.items.map(itemWords).filter(Boolean).join(", ");
    a.append(dayCell(d.date, today));
    const grow = el("span", "grow");
    grow.append(el("b", "", what));
    const facts = el("span", "wkfacts");
    const meet = d.items.find((i) => i.kind === "practice" || i.kind === "build");
    if (parent && meet && meet.location) facts.append(el("span", "", meet.location));
    if (!parent && Number.isInteger(d.mentorsComing)) facts.append(d.mentorsComing ? el("span", "", `${plural(d.mentorsComing, "mentor", "mentors")} coming`) : mark("No mentors yet", "warn"));
    if (d.snacks && d.snacks.modes.includes(mode)) {
      facts.append(d.snacks.open > 0 ? mark("Needs snacks", "warn") : el("span", "", `Snacks: ${d.snacks.names.join(" and ")}`));
    }
    if (!parent) for (const m of (data.milestones || []).filter((x) => x.date === d.date)) {
      const due = el("span", "wkdue");
      const dia = el("i", "snd");
      dia.setAttribute("aria-hidden", "true");
      if (m.color) dia.style.setProperty("--mc", m.color);
      due.append(dia, document.createTextNode(`Due: ${m.name}`));
      facts.append(due);
    }
    if (facts.childNodes.length) grow.append(facts);
    a.append(grow);
    a.setAttribute("aria-label", `${fmtDay(d.date)}: ${what}. Open the Calendar`);
    li.append(linkTo(a, d.href));
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

/** A parent's Coming up: the next four events, each a door to the Calendar. */
export function comingSection(list, today = todayIso()) {
  const rows = (list || []).filter((e) => e.date >= today);
  if (!rows.length) return null;
  const sec = section("home-coming", "Coming up", "comingsec");
  const ul = el("ul", "glist week");
  for (const e of rows) {
    const li = el("li");
    const a = el("a", "wkrow");
    a.append(dayCell(e.date, ""));
    const grow = el("span", "grow");
    grow.append(el("b", "", e.name));
    const fact = [e.time, e.location].filter(Boolean).join(", ");
    if (fact) { const f = el("span", "wkfacts"); f.append(el("span", "", fact)); grow.append(f); }
    a.append(grow);
    a.setAttribute("aria-label", `${fmtDay(e.date)}: ${e.name}. Open the Calendar`);
    li.append(linkTo(a, e.href));
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

/** "1:15 pm" from a full time. */
function matchClock(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M$/, (_, x) => ` ${x.toLowerCase()}m`);
}

/** Next for us: our next three matches, the alliance in words beside its square, partners and opponents. */
export function nextForUs(ev, site) {
  if (!ev.next.length) return null;
  const sec = section("home-matches", "Next for us", "matchsec");
  const ul = el("ul", "glist week");
  for (const m of ev.next) {
    const li = el("li");
    const a = el("a", "wkrow");
    a.append(dayCell("", "", `Qual ${m.match}`));
    a.querySelector(".wkd span").textContent = m.at ? matchClock(m.at) : "";
    const grow = el("span", "grow");
    const b = el("b");
    const sq = el("i", `alsq ${m.alliance === "Red" ? "red" : "blue"}`);
    sq.setAttribute("aria-hidden", "true");
    b.append(sq, document.createTextNode(`${m.alliance} alliance`));
    grow.append(b);
    const facts = el("span", "wkfacts");
    if (m.with.length) facts.append(el("span", "", `With ${m.with.join(" and ")}`));
    if (m.against.length) facts.append(el("span", "", `Against ${m.against.join(", ")}`));
    if (facts.childNodes.length) grow.append(facts);
    a.append(grow);
    li.append(linkTo(a, `${site.scheme}://compete.${site.domain}/pit?tab=check`));
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

// ---------------------------------------------------------------- the next task

/**
 * The student's next task, Ground up: the title is the link, then "Due …, N practices left", where it belongs, the
 * steps, the next step, and the buttons. With a step left the button is "Mark step done" (CONTRACT T3: the act path,
 * `{app:"tasks", action:"step-done", key:"<taskId>:<itemId>"}`), which acts at once: the step counts as done, the
 * next-step line goes, and the save runs behind; on any answer but success the card is put back and says why. With no
 * step left it is "Mark task done", the task's Done (C4) with its four answers as in release 8.1.5.
 * o: { empty, compact, season, filled(), say, onBusy, onDone, post, postStep, today }.
 */
export function nextCard(next, o = {}) {
  const { empty = false, compact = false, season = null, filled = () => true, say = () => {}, onBusy = () => {}, onDone = async () => true, post = postTaskDone, postStep = postAct, today = todayIso() } = o;
  const cls = `nextsec${compact ? " evcompact" : ""}`;
  if (!next) {
    if (!empty) return null;
    const none = section("home-next", "Nothing assigned to you", cls);
    none.append(el("p", "mute", "Take something nobody has yet."));
    return none;
  }
  const sec = section("home-next", "Your next task", cls);
  const title = el("p", "nexthead");
  const t = el("a", "nexttitle", next.title);
  const chev = el("span", "chev", "›");
  chev.setAttribute("aria-hidden", "true");
  t.append(chev);
  t.dataset.tip = "Open this task.";
  title.append(linkTo(t, next.href));
  sec.append(title);
  const m = typeof next.due === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(next.due) : null;
  if (m) {
    // Tasks counts the practices left (T1); without its count, the season line's meeting days say it.
    const n = Number.isInteger(next.practicesLeft) ? next.practicesLeft : null;
    const left = n != null ? (n === 0 ? "no practice before then" : `${plural(n, "practice", "practices")} left`) : practicesText(season, m[1], today);
    sec.append(el("p", "nextdue", `Due ${fmtDay(m[1])}${left ? `, ${left}` : ""}`));
  }
  const where = nextLine({ ...next, due: "" }).replace(/ · for /, ", for ");
  if (where) sec.append(el("p", "mute nextwhere", where));
  if (next.onHold) sec.append(el("p", "mute nexthold", "This task is on hold."));
  if (next.blocked) { const b = el("p", "nextblocked"); b.append(mark("Blocked", "bad")); sec.append(b); }
  let fill = null, count = null;
  if (next.steps) {
    const r = el("div", "nextsteps");
    const bar = el("div", "nextbar");
    bar.setAttribute("aria-hidden", "true");
    fill = el("i");
    bar.append(fill);
    count = el("span", "mute");
    r.append(bar, count);
    sec.append(r);
  }
  const showSteps = (done) => {
    if (!next.steps) return;
    fill.style.width = `${Math.round((100 * done) / next.steps.total)}%`;
    count.textContent = `${done} of ${next.steps.total} steps done`;
  };
  showSteps(next.steps ? next.steps.done : 0);
  const step = next.nextStep || null;
  let stepLine = null;
  if (step) {
    stepLine = el("p", "nextstep", "Next step: ");
    stepLine.append(el("b", "", step.title));
    sec.append(stepLine);
  }
  if (next.waitingOn) {
    const w = el("p", "nextwaiting");
    w.append(mark("Waiting on", "bad"), document.createTextNode(` ${next.waitingOn.join(", ")}.`));
    sec.append(w);
  }
  const acts = el("div", "heroacts");
  const words = step ? "Mark step done" : "Mark task done";
  const done = el("button", btnClass(!taskHeld(next) && filled()));
  done.type = "button";
  done.dataset.tip = step ? "Tick this step and bring up the next one." : "Mark this task done and bring up your next one.";
  done.append(svgIcon(CHECK, 16), el("span", "", words));
  acts.append(done);
  if (next.stuckHref) acts.append(linkTo(el("a", "shell-btn", "I'm stuck"), next.stuckHref));
  if (next.partHref) {
    const part = el("a", "shell-btn");
    part.append(svgIcon(PARTS, 16), el("span", "", "Request a part"));
    acts.append(linkTo(part, next.partHref));
  }
  let busy = false;
  const again = () => { busy = false; done.disabled = false; };
  done.addEventListener("click", step ? markStep : markTask);

  // Mark step done: at once, saved behind (D187).
  async function markStep() {
    if (busy) return; // a second press while the first is on its way sends nothing
    busy = true;
    done.disabled = true;
    onBusy(true);
    showSteps(next.steps ? Math.min(next.steps.total, next.steps.done + 1) : 0);
    stepLine.hidden = true;
    say("Step done.");
    const { result, message } = await postStep({ app: "tasks", action: "step-done", key: `${next.taskId}:${step.id}` });
    onBusy(false);
    if (result === "ok") {
      if (!(await onDone())) again();
      return;
    }
    // Put the card back as the server last had it, and say why in one sentence.
    showSteps(next.steps ? next.steps.done : 0);
    stepLine.hidden = false;
    again();
    const sentence = result === "changed" ? message || "Someone else already changed this step."
      : result === "refused" ? "You can't do this from Home. Open the task to see why."
      : result === "gone" ? "This step isn't there any more."
      : result === "timeout" ? "We couldn't tell if that worked."
      : `Couldn't save, so “${step.title}” is back as it was.`;
    say(sentence);
    done.focus();
    if (result !== "failed") await onDone();
  }

  async function markTask() {
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
      say("That didn't go through. Press Mark task done to try again.");
      again();
      done.focus();
      return;
    }
    // "refused": this task can't be marked done from the portal; the card shows "Open task" instead (C4).
    const openTask = linkTo(el("a", "shell-btn", "Open task"), next.href);
    openTask.dataset.tip = "Finish the task in the Task App.";
    done.replaceWith(openTask);
    say("This task can't be marked done from here. Open it in the Task App.");
    openTask.focus();
  }
  sec.append(acts);
  return sec;
}

// ---------------------------------------------------------------- Recent activity

/** Recent activity: three rows, the app's name muted, with when it happened. Not for parents, not at an event. */
export function activitySection(items, now = Date.now()) {
  if (!items.length) return null;
  const sec = section("home-activity", "Recent activity", "actsec");
  const ul = el("ul", "glist");
  for (const a of items.slice(0, 3)) {
    const li = el("li", "actli");
    const link = el("a", "actlink");
    const body = el("span", "grow");
    body.append(el("b", "", a.title));
    if (a.detail) body.append(document.createTextNode(` ${a.detail}`));
    link.append(body);
    if (a.app) link.append(el("span", "actapp", a.app));
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

// ---------------------------------------------------------------- the whole Home

/** Which person's Home this is: "parent" (only), "staff" (admin or mentor) or "student". */
export function homeRole(groups) {
  if (isParentOnly(groups)) return "parent";
  return groups.includes("admin") || groups.includes("mentor") ? "staff" : "student";
}

/**
 * Draws the Home from checked data. Returns { top, main: [nodes], side: [nodes], eventDay } for the page to place:
 * `top` under the greeting (the season line or the event line), `main` the main column, `side` what leads the side
 * column (This week, or a parent's Can you help?). o: { groups, mode, site, eventDay (from /event.json), acts,
 * filled, nextOpts, today, now }.
 */
export function drawHome(data, o) {
  const { groups, mode, site, acts, today = todayIso() } = o;
  const role = homeRole(groups);
  const filled = o.filled || (() => false);
  const main = [], side = [];
  let top = null;
  const keep = (rows) => rowsForMode(rows, mode).filter((r) => !acts.hidden.has(r.id));
  const ev = role !== "parent" ? data.event : null;
  if (ev) {
    // At the event Home holds only what the event needs: my shift, the line, the pit, our next matches.
    const shifts = keep(data.today).filter(isShift);
    if (shifts.length) {
      const box = el("div", "shiftcard");
      box.append(rowList(shifts, { acts, filled }));
      box.querySelector(".nowrow")?.classList.add("nowfirst");
      const first = box.querySelector(".nowrow .nowbtn");
      if (first && !first.classList.contains("shell-btn--primary") && filled()) first.classList.add("shell-btn--primary");
      main.push(box);
    }
    const line = eventLine(ev, site, { withNow: !shifts.length });
    if (shifts.length) { if (line) main.push(line); } else top = line;
    if (ev.pit.length) main.push(nowSection(ev.pit.filter((r) => !acts.hidden.has(r.id)), { title: "In the pit", acts, filled }));
    const nm = nextForUs(ev, site);
    if (nm) main.push(nm);
    return { top, main, side, eventDay: true, role };
  }
  if (role === "parent") {
    top = seasonLine(data, { simple: true, today });
    const wk = weekSection(data, { parent: true, mode, today });
    const rows = keep([...data.today, ...data.waiting]);
    const help = rows.filter((r) => (r.acts && r.acts.length) || r.cta);
    // Calendar keeps "Next practice" and "Next event" rows for older portals; This week says the same.
    const rest = rows.filter((r) => !help.includes(r) && !(wk && /^calendar:(practice|event)$/.test(r.id)));
    if (wk) main.push(wk);
    if (rest.length) main.push(nowSection(rest, { acts, filled }));
    const cm = comingSection(data.coming, today);
    if (cm) main.push(cm);
    if (help.length) {
      const sec = section("home-help", "Can you help?", "helpsec");
      sec.append(rowList(help, { acts, filled }));
      side.push(sec);
    }
    return { top, main, side, eventDay: false, role };
  }
  top = seasonLine(data, { today });
  const staff = role === "staff";
  let rows = keep([...data.today, ...data.waiting]);
  rows = shiftFirst(nowOrder(rows, staff), o.eventDay);
  main.push(nowSection(rows, { acts, filled, guide: staff }));
  if (role === "student") {
    const card = nextCard(data.next, { ...(o.nextOpts || {}), empty: true, compact: o.eventDay, season: data.season, filled, today });
    if (card) main.push(card);
  }
  const others = keep(data.others);
  if (others.length) {
    const sec = section("home-others", "Waiting on others", "otherssec");
    sec.append(rowList(others, { acts, filled }));
    main.push(sec);
  }
  if (!o.eventDay) {
    const act = activitySection(data.activity, o.now);
    if (act) main.push(act);
    const wk = weekSection(data, { mode, today });
    if (wk) side.push(wk);
  }
  return { top, main, side, eventDay: !!o.eventDay, role };
}

/** The page's one filled button: yes once, then no (GROUND_UP §5, "one filled button per screen at most"). */
export function oneFilled() {
  let used = false;
  return () => (used ? false : (used = true));
}
