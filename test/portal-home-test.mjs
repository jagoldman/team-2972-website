// The portal home's /today.json checks and small helpers (js/portal-home.js, release 8.1.5, CONTRACT C4 and C9).
// Plain node, no browser: node --test test/portal-home-test.mjs
// The drawing is covered in the browser by test/portal-shell-test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED_APPS, DISPLAY_SCREENS, blockedAppName, clock, daysBetween, displayHref, dueText, fetchToday, fmtDay, isDisplayOnly, isParentOnly, isoDay, nextLine,
  MAX_BYTES, MAX_ROWS, parseToday, postAct, postTaskDone, practicesLeft, practicesText, rowsForMode, safeHref, shiftFirst, taskHeld, timeSpan, whenText } from "../js/portal-home.js";

const site = { scheme: "https", domain: "example.test" };
const origin = "https://portal.example.test";

test("safeHref keeps links on this site and drops the rest", () => {
  assert.equal(safeHref("https://parts.example.test/requests?id=1", site, origin), "https://parts.example.test/requests?id=1");
  assert.equal(safeHref("https://example.test/robots.html", site, origin), "https://example.test/robots.html");
  assert.equal(safeHref("/install", site, origin), "https://portal.example.test/install");
  for (const bad of ["https://evil.test/", "https://example.test.evil.test/", "javascript:alert(1)", "data:text/html,x", "//evil.test/x",
    "https://user:pw@parts.example.test/", "", "   ", null, 7, "mailto:a@example.com"]) {
    assert.equal(safeHref(bad, site, origin), null, String(bad));
  }
  assert.equal(safeHref("http://calendar.localhost:13080/here", { scheme: "http", domain: "localhost:13080" }, "http://portal.localhost:13080"), "http://calendar.localhost:13080/here");
});

test("parseToday accepts the C4 shape and checks every part", () => {
  const data = parseToday({
    v: 1,
    today: [
      { id: "cal-practice", section: "today", title: "Practice today, 3:30 to 6:00", detail: "You are not signed in", href: "https://calendar.example.test/here?tab=today", cta: { label: "Sign in", href: "https://calendar.example.test/here/scan" } },
      { id: "bad", title: "Off-site row", href: "https://evil.test/" },
      { id: "no-title", title: "  ", href: "https://calendar.example.test/" },
    ],
    waiting: [
      { id: "parts-ok", section: "waiting", title: "2 part requests need an OK", detail: "", href: "https://parts.example.test/?tab=toorder", count: 2 },
      { id: "neg", title: "A bad count", href: "https://parts.example.test/", count: -3, cta: { label: "Go", href: "javascript:void 0" } },
    ],
    next: { taskId: "t-41", title: "Wire the intake sensor", due: "2026-11-18", project: "Intake", href: "https://tasks.example.test/my?task=t-41" },
    activity: Array.from({ length: 7 }, (_, i) => ({ title: `Notice ${i}`, href: "https://account.example.test/#inbox", at: "2026-11-14T15:00:00Z" })),
  }, site, origin);
  assert.deepEqual(data.today.map((r) => r.id), ["cal-practice"]);
  assert.deepEqual(data.today[0].cta, { label: "Sign in", href: "https://calendar.example.test/here/scan" });
  assert.deepEqual(data.waiting.map((r) => [r.id, r.count, r.cta]), [["parts-ok", 2, undefined], ["neg", undefined, undefined]]);
  assert.equal(data.next.taskId, "t-41");
  assert.equal(data.next.project, "Intake");
  assert.equal(data.activity.length, 5, "five newest at most");
});

test("parseToday refuses another version, and a bad next task is no card", () => {
  assert.equal(parseToday({ v: 2, today: [] }, site, origin), null);
  assert.equal(parseToday(null, site, origin), null);
  assert.equal(parseToday("x", site, origin), null);
  const d = parseToday({ v: 1, next: { taskId: "", title: "No id", href: "https://tasks.example.test/" } }, site, origin);
  // 8.3: the optional parts are there, empty, when the answer has none of them (CONTRACT H1).
  // `present` says which apps' parts are in the answer (review item 2): a next task, even one that is no card, is Tasks'.
  assert.deepEqual(d, { today: [], waiting: [], others: [], next: null, activity: [], season: null, milestones: [], week: null, coming: null, event: null,
    present: { parts: false, skills: false, calendar: false, tasks: true } });
  assert.equal(parseToday({ v: 1, next: { taskId: 5, title: "Off site", href: "https://evil.test/" } }, site, origin).next, null);
  assert.equal(parseToday({ v: 1, next: { taskId: 5, title: "Numeric id", href: "/x" } }, site, origin).next.taskId, "5");
});

test("long text is cut, never left to break the card", () => {
  const d = parseToday({ v: 1, today: [{ title: "x".repeat(500), href: "/a" }] }, site, origin);
  assert.equal(d.today[0].title.length, 200);
  assert.ok(d.today[0].title.endsWith("…"));
});

test("C12: a row that belongs to one mode shows only in that mode", () => {
  const d = parseToday({ v: 1, today: [
    { id: "both", title: "Both", href: "/a" },
    { id: "build", title: "Build only", href: "/b", modes: ["build"] },
    { id: "comp", title: "Event only", href: "/c", modes: ["competition"] },
    { id: "junk", title: "Unknown modes mean both", href: "/d", modes: ["party"] },
  ] }, site, origin);
  assert.deepEqual(rowsForMode(d.today, "build").map((r) => r.id), ["both", "build", "junk"]);
  assert.deepEqual(rowsForMode(d.today, "competition").map((r) => r.id), ["both", "comp", "junk"]);
  assert.deepEqual(rowsForMode(d.today, null).map((r) => r.id), ["both", "build", "junk"], "no cookie is Build");
});

test("dueText and whenText", () => {
  assert.match(dueText("2026-11-18", "en-US"), /^due Wed, Nov 18$/);
  assert.equal(dueText("", "en-US"), "");
  assert.equal(dueText("not a date", "en-US"), "");
  const now = Date.parse("2026-11-14T18:00:00");
  assert.equal(whenText("2026-11-14T17:59:40", now), "just now");
  assert.equal(whenText("2026-11-14T17:15:00", now), "45 min ago");
  assert.equal(whenText("2026-11-14T09:00:00", now), "9 h ago");
  assert.equal(whenText("2026-11-13T09:00:00", now), "Yesterday");
  assert.equal(whenText("2026-11-10T09:00:00", now, "en-US"), "Nov 10");
  assert.equal(whenText("garbage", now), "");
});

test("who gets what: parents, the shop screen", () => {
  assert.equal(isParentOnly(["parent"]), true);
  assert.equal(isParentOnly(["mentor", "parent"]), false);
  assert.equal(isParentOnly(["student"]), false);
  assert.equal(isDisplayOnly("display"), true);
  assert.equal(isDisplayOnly(["display"]), true);
  assert.equal(isDisplayOnly("display|student"), false);
  assert.equal(isDisplayOnly(""), false);
  assert.equal(isDisplayOnly("authentik Admins"), false);
});

test("the shop screen's three choices go to the apps' real screens", () => {
  assert.deepEqual(DISPLAY_SCREENS.map((s) => [s.name, displayHref(s, site)]), [
    ["Door QR", "https://calendar.example.test/here/kiosk"],
    ["Pit monitor", "https://compete.example.test/pit/monitor"],
    ["Projector", "https://tasks.example.test/projector"],
  ]);
});

test("C13 and C14: activity.app, the next task's doors and its card fields", () => {
  const d = parseToday({ v: 1,
    activity: [{ app: "Parts & Inventory, with a name far longer than any app has", title: "Ordered", href: "/a", at: "2026-11-14T10:00:00Z" }],
    next: { taskId: "t-1", title: "Wire it", href: "https://tasks.example.test/my?task=t-1", project: "Intake",
      stuckHref: "https://tasks.example.test/my?task=t-1&do=stuck", partHref: "https://evil.test/?do=part",
      subteam: "Electrical", milestone: "Robot drives", steps: { done: 2, total: 5 },
      waitingOn: ["A", "B", "C", "D", 7, ""], onHold: "yes", blocked: true } }, site, origin);
  assert.equal(d.activity[0].app.length, 40);
  assert.ok(d.activity[0].app.endsWith("…"));
  const n = d.next;
  assert.equal(n.stuckHref, "https://tasks.example.test/my?task=t-1&do=stuck");
  assert.equal(n.partHref, undefined, "an off-site door is dropped");
  assert.deepEqual([n.subteam, n.milestone, n.steps, n.waitingOn, n.onHold, n.blocked], ["Electrical", "Robot drives", { done: 2, total: 5 }, ["A", "B", "C"], undefined, true]);
  assert.equal(nextLine(n, "en-US"), "Intake › Electrical · for “Robot drives”");
  for (const steps of [{ done: 6, total: 5 }, { done: -1, total: 5 }, { done: 1, total: 0 }, { done: "1", total: 2 }, { done: 1, total: 5000 }]) {
    assert.equal(parseToday({ v: 1, next: { taskId: "t", title: "x", href: "/x", steps } }, site, origin).next.steps, undefined, JSON.stringify(steps));
  }
});

test("C14: Done is gold only for a task that is not held back", () => {
  assert.equal(taskHeld({ title: "x" }), false);
  assert.equal(taskHeld({ blocked: true }), true);
  assert.equal(taskHeld({ onHold: true }), true);
  assert.equal(taskHeld({ waitingOn: ["A"] }), true);
  assert.equal(taskHeld({ waitingOn: [] }), false);
});

test("C14: on an event day Competition's shift rows go first", () => {
  const rows = [{ id: "calendar:practice" }, { id: "compete:shift-now:1" }, { id: "parts:x" }, { id: "compete:shift-next:2" }];
  assert.deepEqual(shiftFirst(rows, true).map((r) => r.id), ["compete:shift-now:1", "compete:shift-next:2", "calendar:practice", "parts:x"]);
  assert.deepEqual(shiftFirst(rows, false).map((r) => r.id), rows.map((r) => r.id));
});

// C16: ?blocked= carries the refusing app's host label; the name comes from a fixed table, never from the address.
const HOST_NAMES = [["tasks", "Tasks"], ["calendar", "Calendar"], ["parts", "Parts & Inventory"], ["skills", "Skills"], ["compete", "Competition"],
  ["account", "Account"], ["admin", "Admin"], ["editor", "Website editor"], ["tools", "Tools"]];
for (const [label, name] of HOST_NAMES) {
  test(`C16: ?blocked=${label} names ${name}`, () => {
    assert.equal(blockedAppName(`?blocked=${label}`), name);
    assert.equal(blockedAppName(`?x=1&blocked=${label}`), name);
  });
}
test("C16: the table holds exactly the nine host labels", () => {
  assert.deepEqual(Object.keys(BLOCKED_APPS).sort(), HOST_NAMES.map(([l]) => l).sort());
  assert.ok(Object.isFrozen(BLOCKED_APPS));
});
test("C16: any other value shows no notice", () => {
  for (const q of ["?blocked=unknown", "?blocked=schedule", "?blocked=portal", "?blocked=Parts", "?blocked=parts%20", "?blocked=", "", "?blocked=toString",
    "?blocked=__proto__", "?blocked=constructor"]) assert.equal(blockedAppName(q), "", q);
});
test("C16: an HTML-looking value shows no notice", () => {
  assert.equal(blockedAppName("?blocked=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E"), "");
  assert.equal(blockedAppName("?blocked=%3Cb%3ETasks%3C%2Fb%3E"), "");
});

test("the shop screen: display with an extra, non-site group still gets the picker", () => {
  assert.equal(isDisplayOnly("display|authentik Admins"), true);
  assert.equal(isDisplayOnly(["authentik Admins", "display"]), true);
  assert.equal(isDisplayOnly("display|parent"), false);
});

// A real Response (status, body, type); `kind` "redirect" is what fetch gives with redirect: "manual".
const reply = (status, body = null, type = "application/json", kind = "") => async () => {
  if (kind === "redirect") return { type: "opaqueredirect", status: 0, ok: false, redirected: false, headers: new Headers() };
  return new Response(status === 204 ? null : typeof body === "string" ? body : body == null ? null : JSON.stringify(body), { status, headers: type ? { "content-type": type } : {} });
};
const SIGN_IN = "<!doctype html><title>Sign in</title><form>…</form>";

test("Done's answers (review items 1, 6): ok only on 204; refused (403, 404); signed out (a redirect, a sign-in page); uncertain (the rest)", async () => {
  assert.deepEqual(await postTaskDone("t", { fetchImpl: reply(204) }), { result: "ok" });
  for (const st of [403, 404]) assert.deepEqual(await postTaskDone("t", { fetchImpl: reply(st, { error: "x" }) }), { result: "refused" }, String(st));
  assert.deepEqual(await postTaskDone("t", { fetchImpl: reply(0, null, "", "redirect") }), { result: "signedout" }, "a redirect");
  assert.deepEqual(await postTaskDone("t", { fetchImpl: reply(302, "", "text/html") }), { result: "signedout" }, "a 3xx");
  assert.deepEqual(await postTaskDone("t", { fetchImpl: reply(200, SIGN_IN, "text/html; charset=utf-8") }), { result: "signedout" }, "a 200 sign-in page");
  for (const st of [200, 201, 400, 409, 500, 502, 503]) assert.deepEqual(await postTaskDone("t", { fetchImpl: reply(st, { ok: true }) }), { result: "uncertain" }, String(st));
  assert.deepEqual(await postTaskDone("t", { fetchImpl: async () => { throw new TypeError("network"); } }), { result: "uncertain" });
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  assert.deepEqual(await postTaskDone("t", { fetchImpl: hang, timeout: 30 }), { result: "uncertain" });
  let sent;
  await postTaskDone("t-9", { fetchImpl: async (url, init) => { sent = [url, init.method, init.body, !!init.signal, init.redirect]; return new Response(null, { status: 204 }); } });
  assert.deepEqual(sent, ["/today/task-done", "POST", JSON.stringify({ taskId: "t-9" }), true, "manual"]);
});

test("/today.json: a redirect, a sign-in page, a non-JSON answer or one over the byte limit is no answer (review items 1, 4)", async () => {
  assert.equal(await fetchToday(site, origin, { fetchImpl: reply(0, null, "", "redirect") }), null);
  assert.equal(await fetchToday(site, origin, { fetchImpl: reply(200, SIGN_IN, "text/html") }), null);
  assert.equal(await fetchToday(site, origin, { fetchImpl: reply(200, JSON.stringify({ v: 1 }), "text/plain") }), null);
  const huge = JSON.stringify({ v: 1, today: Array.from({ length: 5000 }, (_, i) => ({ id: `x:${i}`, title: "t".repeat(60), href: "/a" })) });
  assert.ok(huge.length > MAX_BYTES);
  assert.equal(await fetchToday(site, origin, { fetchImpl: reply(200, huge) }), null, "over the limit");
  assert.equal((await fetchToday(site, origin, { fetchImpl: reply(200, { v: 1, today: [{ id: "a:1", title: "One", href: "/a" }] }) })).today.length, 1);
  let init;
  await fetchToday(site, origin, { fetchImpl: async (_u, i) => { init = i; return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); } });
  assert.equal(init.redirect, "manual");
});

test("/today.json that never answers is given up after the time limit", async () => {
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const t0 = Date.now();
  assert.equal(await fetchToday(site, origin, { fetchImpl: hang, timeout: 30 }), null);
  assert.ok(Date.now() - t0 < 1000);
});

test("hostile text stays text: parseToday keeps it as a string for textContent", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const d = parseToday({ v: 1, today: [{ title: evil, detail: evil, href: "/a", cta: { label: evil, href: "/b" } }] }, site, origin);
  assert.equal(d.today[0].title, evil);
  assert.equal(d.today[0].cta.label, evil);
});

// ---------------------------------------------------------------- release 8.3 (CONTRACT H1, H2, C1, E1)

test("8.3 H1: a row's group, mark, lines and acts are checked; a bad act is dropped, not the row", () => {
  const d = parseToday({ v: 1, waiting: [
    { id: "parts:req:12", section: "waiting", title: "Kraken X60 motor", detail: "$399.98, asked by Sam", href: "https://parts.example.test/?request=12",
      group: "Needs your OK", mark: { word: "Blocking", tone: "bad" }, lines: ["Order by Sun, Nov 8", "Mechanisms budget: $1,838.52 left", "a third line"],
      acts: [{ label: "Approve", app: "parts", action: "approve", key: "12", primary: true }, { label: "Deny", app: "parts", action: "deny", key: "12", reason: true }, { label: "Third", app: "parts", action: "x", key: "12" }] },
    { id: "skills:so:1", title: "Motor power leads", href: "/s", mark: { word: "Odd", tone: "purple" },
      acts: [{ label: "Sign off", app: "admin", action: "signoff", key: "u1:s1" }, { label: "Sign off", app: "skills", action: "signoff", key: "u1 s1" }] },
    { id: "skills:so:2", title: "Belt drives", href: "/s", acts: [{ label: "Sign off", app: "skills", action: "signoff", key: "u-2:belts", primary: "yes" }] },
    { id: "x", title: "Lines that are not text", href: "/x", lines: "one line", group: 7 },
  ] }, site, origin);
  const [a, b, c, x] = d.waiting;
  assert.equal(a.group, "Needs your OK");
  assert.deepEqual(a.mark, { word: "Blocking", tone: "bad" });
  assert.deepEqual(a.lines, ["Order by Sun, Nov 8", "Mechanisms budget: $1,838.52 left"], "two lines at most");
  assert.deepEqual(a.acts, [{ label: "Approve", app: "parts", action: "approve", key: "12", primary: true }, { label: "Deny", app: "parts", action: "deny", key: "12", reason: true }]);
  assert.equal(b.mark, undefined, "an unknown tone is no mark");
  assert.equal(b.acts, undefined, "an act for another app, or a key outside the pattern, is dropped");
  assert.deepEqual(c.acts, [{ label: "Sign off", app: "skills", action: "signoff", key: "u-2:belts" }], "primary only when true");
  assert.deepEqual([x.lines, x.group], [undefined, undefined]);
});

test("8.3 H1: rows marked section \"others\" are Waiting on others, from any list", () => {
  const d = parseToday({ v: 1,
    today: [{ id: "parts:mine:4", section: "others", title: "Bearing", href: "/p", mark: { word: "Ordered", tone: "ok" }, lines: ["Arrives about Wed, Nov 11"] }, { id: "calendar:practice", section: "today", title: "Practice", href: "/c" }],
    others: [{ id: "skills:mine:2", section: "others", title: "Sign-off: Lathe", href: "/s" }],
  }, site, origin);
  assert.deepEqual(d.today.map((r) => r.id), ["calendar:practice"]);
  assert.deepEqual(d.others.map((r) => r.id), ["parts:mine:4", "skills:mine:2"]);
});

const SEASON = { target: { name: "Season kickoff", date: "2027-01-09", kind: "kickoff" }, days: [
  { date: "2026-11-10", kind: "practice" }, { date: "2026-11-12", kind: "practice" }, { date: "2026-11-14", kind: "build" },
  { date: "2026-11-12", kind: "practice" }, { date: "2026-11-17", kind: "holiday" }, { date: "2026-11-31", kind: "practice" },
  { date: "2027-01-09", kind: "practice" }, { date: "2026-11-19", kind: "practice" },
] };

test("8.3 C1: the season line's data is checked: days are real, before the target, sorted, once each", () => {
  const sn = parseToday({ v: 1, season: SEASON }, site, origin).season;
  assert.deepEqual(sn.target, { name: "kickoff", title: "Kickoff", date: "2027-01-09", kind: "kickoff" });
  assert.deepEqual(sn.days.map((d) => d.date), ["2026-11-10", "2026-11-12", "2026-11-14", "2026-11-19"]);
  const comp = parseToday({ v: 1, season: { target: { name: "Colorado Regional", date: "2027-03-04", kind: "comp" }, days: [] } }, site, origin).season;
  assert.deepEqual([comp.target.name, comp.target.title, comp.days], ["Colorado Regional", "Colorado Regional", []]);
  for (const bad of [{}, { target: { name: "x", date: "2027-02-30", kind: "kickoff" }, days: [] }, { target: { name: "", date: "2027-01-09", kind: "comp" }, days: [] },
    { target: { name: "x", date: "2027-01-09", kind: "party" }, days: [] }, { target: { name: "x", date: "2027-01-09", kind: "kickoff" } }, "season"]) {
    assert.equal(parseToday({ v: 1, season: bad }, site, origin).season, null, JSON.stringify(bad));
  }
});

test("8.3: practices left counts the meeting days from today to the date, with both ends", () => {
  const sn = parseToday({ v: 1, season: SEASON }, site, origin).season;
  assert.equal(practicesLeft(sn, "2026-11-14", "2026-11-10"), 3);
  assert.equal(practicesLeft(sn, "2026-11-10", "2026-11-10"), 1);
  assert.equal(practicesLeft(sn, "2026-11-11", "2026-11-11"), 0, "none before the date");
  assert.equal(practicesLeft(sn, "2026-11-18", "2026-11-11"), 2, "a cancelled day is simply absent");
  assert.equal(practicesLeft(sn, "2027-02-01", "2026-11-10"), null, "after the target: Calendar did not send those days");
  assert.equal(practicesLeft(sn, "2026-11-01", "2026-11-10"), null, "already past");
  assert.equal(practicesLeft(null, "2026-11-14", "2026-11-10"), null);
  assert.equal(practicesText(sn, "2026-11-14", "2026-11-10"), "3 practices left");
  assert.equal(practicesText(sn, "2026-11-10", "2026-11-10"), "1 practice left");
  assert.equal(practicesText(sn, "2026-11-11", "2026-11-11"), "no practice before then");
  assert.equal(practicesText(sn, "2027-02-01", "2026-11-10"), "");
});

test("8.3: dates and times as the demo words them", () => {
  assert.equal(isoDay("2026-11-31"), "");
  assert.equal(isoDay("2026-11-30"), "2026-11-30");
  assert.equal(daysBetween("2026-11-10", "2027-01-09"), 60);
  assert.equal(fmtDay("2026-11-12"), "Thu, Nov 12");
  assert.deepEqual([clock("15:30"), clock("18:00"), clock("09:05"), clock("00:00"), clock("12:00"), clock("25:00"), clock(null)], ["3:30 pm", "6 pm", "9:05 am", "12 am", "12 pm", "", ""]);
  assert.equal(timeSpan("15:30", "18:00"), "3:30 pm–6 pm");
  assert.equal(timeSpan("15:30", null), "3:30 pm");
  assert.equal(timeSpan(null, null), "");
});

test("8.3 C1: This week, Coming up and the milestones are checked; app paths go to the app's host", () => {
  const d = parseToday({ v: 1,
    week: [
      { date: "2026-11-12", href: "/?tab=agenda", items: [{ kind: "practice", name: "Practice", startTime: "15:30", endTime: "18:00", location: "Dawson shop" }], mentorsComing: 3, snacks: { names: ["Kim family"], open: 1, modes: ["build"] } },
      { date: "2026-11-10", href: "https://calendar.example.test/?tab=agenda", items: [{ kind: "volunteer", name: "Library demo", startTime: null, endTime: null, location: null }, { kind: "party", name: "x" }] },
      { date: "2026-11-11", href: "https://evil.test/", items: [{ kind: "practice", name: "" }] },
      { date: "bad", href: "/", items: [{ kind: "practice", name: "" }] },
      { date: "2026-11-13", href: "/", items: [] },
      { date: "2026-11-14", href: "/", items: [{ kind: "build", name: "" }], mentorsComing: -1, snacks: { names: "x", open: 2 } },
    ],
    coming: [{ date: "2026-11-19", name: "Library robot demo", startTime: "18:00", endTime: "20:00", location: "Lafayette Public Library", href: "/?e=4" }, { date: "x", name: "y", href: "/" }],
    milestones: [{ name: "Design review", date: "2026-11-19", project: "Drive", color: "#2b6cff", href: "/projects/3" }, { name: "Bad colour", date: "2026-11-12", project: "Intake", color: "red;background:url(x)", href: "/p" }, { name: "Off site", date: "2026-11-12", href: "https://evil.test/" }],
  }, site, origin);
  assert.deepEqual(d.week.map((w) => w.date), ["2026-11-10", "2026-11-12", "2026-11-14"], "sorted; bad days and days with nothing are dropped");
  assert.equal(d.week[1].href, "https://calendar.example.test/?tab=agenda");
  assert.deepEqual(d.week[1].items[0], { kind: "practice", name: "Practice", time: "3:30 pm–6 pm", location: "Dawson shop" });
  assert.deepEqual([d.week[1].mentorsComing, d.week[1].snacks], [3, { names: ["Kim family"], open: 1, modes: ["build"] }]);
  assert.deepEqual(d.week[0].items.map((i) => i.kind), ["volunteer"]);
  assert.deepEqual([d.week[2].mentorsComing, d.week[2].snacks], [undefined, { names: [], open: 2, modes: ["build", "competition"] }]);
  assert.deepEqual(d.coming, [{ date: "2026-11-19", name: "Library robot demo", time: "6 pm–8 pm", location: "Lafayette Public Library", href: "https://calendar.example.test/?e=4" }]);
  assert.deepEqual(d.milestones.map((m) => [m.name, m.color, m.href]), [["Bad colour", undefined, "https://tasks.example.test/p"], ["Design review", "#2b6cff", "https://tasks.example.test/projects/3"]]);
  assert.equal(parseToday({ v: 1, week: "x" }, site, origin).week, null, "no list: no This week at all");
  assert.deepEqual(parseToday({ v: 1, week: [] }, site, origin).week, [], "an empty list: This week says nothing is planned");
});

test("8.3 E1: the event part is checked; its paths are Competition's", () => {
  const ev = parseToday({ v: 1, event: {
    name: "Colorado Regional",
    line: { now: "Scouting until 10:00", match: { label: "Our match now", text: "Qual 14, Red, on the field" }, robot: "On the field, battery B1 at 12.9 V" },
    pit: [{ id: "pit-save:1:14", title: "Save the Qual 14 checklist after the match", detail: "Then start Qual 19", href: "/pit?tab=check", cta: { label: "Open the Pit", href: "/pit?tab=check" } },
      { id: "pit-issues:1", title: "2 open issues in the pit", detail: "Open since 9:02", lines: ["Cracked sprocket", "Squeak", "Third", "Fourth"], href: "/pit?tab=check" }, { id: "3", title: "Third row", href: "/pit" }],
    next: [{ match: 19, at: "2026-03-06T20:15:00Z", alliance: "Blue", with: [2945, 9033], against: [2036, 4388, 1410] }, { match: 20, at: null, alliance: "Green", with: [], against: [] }],
  } }, site, origin).event;
  assert.deepEqual(ev.line, { now: "Scouting until 10:00", robot: "On the field, battery B1 at 12.9 V", match: { label: "Our match now", text: "Qual 14, Red, on the field" } });
  assert.deepEqual(ev.pit.map((p) => [p.id, p.href, p.cta && p.cta.href, p.lines]), [
    ["compete:pit-save:1:14", "https://compete.example.test/pit?tab=check", "https://compete.example.test/pit?tab=check", undefined],
    ["compete:pit-issues:1", "https://compete.example.test/pit?tab=check", undefined, ["Cracked sprocket", "Squeak", "Third"]],
  ]);
  assert.deepEqual(ev.next, [{ match: 19, at: "2026-03-06T20:15:00Z", alliance: "Blue", with: [2945, 9033], against: [2036, 4388, 1410] }]);
  assert.equal(parseToday({ v: 1, event: { name: "x", line: { now: null, match: null, robot: null }, pit: [], next: [] } }, site, origin).event, null, "nothing to draw: no event");
  assert.equal(parseToday({ v: 1, event: { name: "x" } }, site, origin).event, null);
});

test("8.3 T1: the next task's next step ({id, title}) and practices left; a step whose act key would not fit is left out", () => {
  const n = parseToday({ v: 1, next: { taskId: "t", title: "Cut plates", href: "/t", practicesLeft: 3, nextStep: { id: "s2", title: "Cut on the router" } } }, site, origin).next;
  assert.deepEqual(n.nextStep, { id: "s2", title: "Cut on the router" });
  assert.equal(n.practicesLeft, 3);
  const take = (next) => parseToday({ v: 1, next: { taskId: "t", title: "x", href: "/t", ...next } }, site, origin).next;
  assert.equal(take({ nextStep: "loose" }).nextStep, undefined);
  assert.equal(take({ nextStep: { id: "s2", label: "the 8.3 first pass's guess" } }).nextStep, undefined, "the contract's field is title");
  assert.equal(take({ nextStep: { id: "a b", title: "Space in the id" } }).nextStep, undefined);
  assert.equal(take({ nextStep: { id: "x".repeat(249), title: "Too long a key" } }).nextStep, undefined);
  assert.equal(take({ nextStep: { id: "x".repeat(200), title: "A long id that fits" } }).nextStep.id.length, 200);
  assert.equal(take({ nextStep: null, practicesLeft: null }).nextStep, undefined);
  assert.deepEqual(take({ nextStep: { id: 42, title: "A number id" } }).nextStep, { id: "42", title: "A number id" });
  for (const bad of [-1, 1.5, "3", 10001]) assert.equal(take({ practicesLeft: bad }).practicesLeft, undefined, String(bad));
  assert.equal(take({ practicesLeft: 0 }).practicesLeft, 0);
});

test("8.3 C17: a cta may be the page's one filled button (primary: true only)", () => {
  const rows = parseToday({ v: 1, today: [
    { id: "calendar:practice", section: "today", title: "Practice today, 3:30 pm–6 pm", href: "/p", cta: { label: "Sign in", href: "/p", primary: true } },
    { id: "calendar:other", section: "today", title: "Other", href: "/o", cta: { label: "Go", href: "/o", primary: "yes" } },
  ] }, site, origin).today;
  assert.deepEqual(rows.map((r) => r.cta), [{ label: "Sign in", href: "https://portal.example.test/p", primary: true }, { label: "Go", href: "https://portal.example.test/o" }]);
});

test("8.3 H2, P4: the act's answers: ok (204, 200 with undoUntil and approval), changed, refused, gone, reason, uncertain", async () => {
  const answer = (status, body) => reply(status, body);
  const act = { app: "parts", action: "approve", key: "12" };
  assert.deepEqual(await postAct(act, { fetchImpl: answer(204) }), { result: "ok" });
  const until = new Date(Date.now() + 120000).toISOString();
  // P4: Undo needs both the time and the approval Parts wrote; either alone, or a bad id, is no Undo.
  // Parts sends a positive integer (a JSON number); it is kept as that number. A short safe string is accepted too.
  assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { undoUntil: until, approval: 1234 }) }), { result: "ok", undoUntil: until, approval: 1234 });
  assert.equal(typeof (await postAct(act, { fetchImpl: answer(200, { undoUntil: until, approval: 1234 }) })).approval, "number");
  assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { undoUntil: until, approval: "ev_7Kx-2" }) }), { result: "ok", undoUntil: until, approval: "ev_7Kx-2" });
  for (const bad of [0, -3, 1.5, 2 ** 60, "1 2", true]) assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { undoUntil: until, approval: bad }) }), { result: "ok" }, `approval ${bad}`);
  let undoBody;
  await postAct({ app: "parts", action: "unapprove", key: "12", approval: 1234 }, { fetchImpl: async (_u, i) => { undoBody = i.body; return new Response(null, { status: 204 }); } });
  assert.equal(undoBody, JSON.stringify({ app: "parts", action: "unapprove", key: "12", approval: 1234 }), "sent back as a number");
  assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { undoUntil: until }) }), { result: "ok" }, "no approval: no Undo");
  assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { approval: "ev1" }) }), { result: "ok" }, "no time: no Undo");
  for (const bad of ["", "a b", "x".repeat(65), "ev;1", -7]) assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { undoUntil: until, approval: bad }) }), { result: "ok" }, String(bad));
  assert.deepEqual(await postAct(act, { fetchImpl: answer(200, { undoUntil: "2000-01-01T00:00:00Z", approval: "ev1" }) }), { result: "ok" }, "an Undo that ran out is not offered");
  assert.deepEqual(await postAct(act, { fetchImpl: answer(200, {}) }), { result: "ok" }, "Approve's 200 with valid JSON and no Undo");
  // Review item 1: a 200 that is not valid JSON is not a success; a redirect or a sign-in page means signed out.
  assert.deepEqual(await postAct(act, { fetchImpl: reply(200, "not json") }), { result: "uncertain" });
  assert.deepEqual(await postAct(act, { fetchImpl: reply(200, SIGN_IN, "text/html; charset=utf-8") }), { result: "signedout" });
  assert.deepEqual(await postAct(act, { fetchImpl: reply(0, null, "", "redirect") }), { result: "signedout" });
  assert.deepEqual(await postAct(act, { fetchImpl: reply(303, "", "text/html") }), { result: "signedout" });
  // Lead, after the reviews: a 5xx, a code the page does not know (400, 201, 418, 504...), a network failure or no
  // answer is "uncertain": it may have been saved.
  for (const [st, r] of [[409, "changed"], [403, "refused"], [404, "gone"], [422, "reason"], [400, "uncertain"], [201, "uncertain"], [418, "uncertain"], [500, "uncertain"], [502, "uncertain"], [503, "uncertain"], [504, "uncertain"]]) {
    assert.deepEqual(await postAct(act, { fetchImpl: answer(st) }), { result: r }, String(st));
  }
  // Account's 409 may say what changed in plain words (today-act.ts changedWords); they are passed on, cut to length.
  assert.deepEqual(await postAct(act, { fetchImpl: answer(409, { error: "changed", message: "Someone else already settled this request." }) }),
    { result: "changed", message: "Someone else already settled this request." });
  assert.deepEqual(await postAct(act, { fetchImpl: answer(409, { error: "changed", message: 7 }) }), { result: "changed" });
  assert.deepEqual(await postAct(act, { fetchImpl: async () => ({ ok: false, status: 409, json: async () => { throw new SyntaxError("no body"); } }) }), { result: "changed" });
  assert.deepEqual(await postAct(act, { fetchImpl: async () => { throw new TypeError("network"); } }), { result: "uncertain" });
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  assert.deepEqual(await postAct(act, { fetchImpl: hang, timeout: 30 }), { result: "uncertain" });
  let sent;
  await postAct({ ...act, action: "deny", reason: "Use stock" }, { fetchImpl: async (url, init) => { sent = [url, init.method, init.body, init.credentials]; return { ok: true, status: 204 }; } });
  assert.deepEqual(sent, ["/today/act", "POST", JSON.stringify({ app: "parts", action: "deny", key: "12", reason: "Use stock" }), "same-origin"]);
});

// Account's real answer (test/fixtures/today-account-83.json: Account r83's gatherToday run on made-up app answers).
// The portal reads every part of it; nothing Account sends is dropped or misread.
test("8.3 H1: Account's own answer, read field for field", async () => {
  const { readFileSync } = await import("node:fs");
  const A = JSON.parse(readFileSync(new URL("./fixtures/today-account-83.json", import.meta.url), "utf8"));
  const site83 = { scheme: "http", domain: "landing.test" }, origin83 = "http://portal.landing.test";
  const m = parseToday(A.mentor, site83, origin83);
  assert.deepEqual(m.waiting.map((r) => [r.id, r.group || null, r.mark ? r.mark.word : null, (r.lines || []).length, (r.acts || []).map((a) => a.label + (a.primary ? "*" : "")).join("/")]), A.mentor.waiting.map((r) =>
    [r.id, r.group || null, r.mark ? r.mark.word : null, (r.lines || []).length, (r.acts || []).map((a) => a.label + (a.primary ? "*" : "")).join("/")]));
  assert.ok(m.waiting.some((r) => r.group === "Stuck" && r.mark.tone === "bad" && r.lines[1].startsWith("Waits on ")), "stuck rows come through whole");
  assert.deepEqual(m.waiting.find((r) => r.id === "parts:request:12").acts, A.mentor.waiting.find((r) => r.id === "parts:request:12").acts);
  assert.equal(m.milestones.length, A.mentor.milestones.length);
  assert.deepEqual(m.milestones.map((x) => x.color || null), A.mentor.milestones.map((x) => x.color));
  assert.equal(m.week.length, A.mentor.week.length);
  assert.equal(m.season.days.length, A.mentor.season.days.length);
  assert.deepEqual(m.coming, [], "an empty coming list is no Coming up");
  const s = parseToday(A.student, site83, origin83);
  assert.deepEqual(s.next.nextStep, A.student.next.nextStep);
  assert.equal(s.next.practicesLeft, A.student.next.practicesLeft);
  assert.deepEqual(s.others.map((r) => [r.id, r.lines]), A.student.others.map((r) => [r.id, r.lines]));
  assert.equal(s.today[0].cta.label, "Sign in");
  const p = parseToday(A.parent, site83, origin83);
  assert.deepEqual(p.today.map((r) => [r.id, r.acts[0].action, r.acts[0].key, !!r.acts[0].primary, r.cta.label]),
    A.parent.today.map((r) => [r.id, r.acts[0].action, r.acts[0].key, !!r.acts[0].primary, r.cta.label]));
  assert.deepEqual(p.coming.map((c) => [c.name, c.time, c.location]), [["Library robot demo", "6 pm–8 pm", "Public library"], ["Kickoff", "9 am", ""]]);
  assert.equal(p.week[0].items[0].location, "Team shop");
  const ad = parseToday(A.adminOnly, site83, origin83);
  assert.deepEqual([...ad.today, ...ad.waiting].map((r) => [r.id, !!r.acts, r.group || null]), [...A.adminOnly.today, ...A.adminOnly.waiting].map((r) => [r.id, false, null]), "admin only: count rows, no acts, no groups (D166)");
  assert.equal(ad.next, null);
  const e = parseToday(A.studentEvent, site83, origin83).event;
  assert.deepEqual(e.line, A.studentEvent.event.line);
  assert.deepEqual(e.pit.map((x) => [x.id, x.href, x.lines || null]), A.studentEvent.event.pit.map((x) => ["compete:" + x.id, x.href, x.lines || null]));
  assert.deepEqual(e.next.map((x) => [x.match, x.at, x.alliance]), [[19, "2026-11-19T20:15:00Z", "Blue"], [21, "", "Red"]]);
});

test("8.3 S3: Sign off's key is \"<Authentik uid>:<skillId>\" (up to 250 characters, as Account's); longer is no act", () => {
  const key = `${"a1".repeat(32)}:${"lathe-".repeat(6)}`; // a 64-character uid and a 36-character skill id
  const row = (k) => parseToday({ v: 1, waiting: [{ id: "skills:signoff:x", section: "waiting", title: "Lathe", href: "/s", acts: [{ label: "Sign off", app: "skills", action: "signoff", key: k }] }] }, site, origin).waiting[0];
  assert.equal(row(key).acts[0].key, key);
  assert.equal(row("k".repeat(251)).acts, undefined);
});

test("8.3 T1: a milestone's colour is a plain # and 3, 4, 6 or 8 hex digits (the Task App's rule); anything else is none", () => {
  const colour = (c) => parseToday({ v: 1, milestones: [{ name: "M", date: "2026-12-01", href: "/p", color: c }] }, site, origin).milestones[0].color;
  for (const ok of ["#2a6", "#2a6f", "#22aa66", "#22aa66cc"]) assert.equal(colour(ok), ok, ok);
  for (const bad of ["#22aa6", "#22aa66c", "22aa66", "red", "#ggg", "#22aa66; background:url(x)", "rgb(1,2,3)", null]) assert.equal(colour(bad), undefined, String(bad));
});

test("review item 4: a button is kept only when its app, action and row belong together; Deny always asks why", () => {
  const acts = (id, list) => parseToday({ v: 1, waiting: [{ id, section: "waiting", title: "T", href: "/a", acts: list }] }, site, origin).waiting[0].acts;
  assert.equal(acts("parts:request:1", [{ label: "Sign off", app: "parts", action: "signoff", key: "1" }]), undefined, "parts has no signoff: the row stays a link");
  assert.equal(acts("parts:request:1", [{ label: "Sign off", app: "skills", action: "signoff", key: "u:s" }]), undefined, "another app's button on a Parts row");
  assert.equal(acts("skills:signoff:u:s", [{ label: "Approve", app: "skills", action: "approve", key: "u:s" }]), undefined);
  assert.equal(acts("calendar:x", [{ label: "Go", app: "calendar", action: "step-done", key: "1" }]), undefined);
  for (const [id, app, action] of [["parts:request:1", "parts", "approve"], ["parts:request:1", "parts", "unapprove"], ["skills:signoff:u:s", "skills", "signoff"],
    ["calendar:snacks:d", "calendar", "snack"], ["calendar:vol:e", "calendar", "volunteer"], ["tasks:x", "tasks", "step-done"]]) {
    assert.equal(acts(id, [{ label: "Go", app, action, key: "k1" }])[0].action, action, `${app} ${action}`);
  }
  assert.equal(acts("parts:request:1", [{ label: "Deny", app: "parts", action: "deny", key: "1" }])[0].reason, true, "Deny without reason:true still asks");
  assert.equal(acts("parts:request:1", [{ label: "Approve", app: "parts", action: "approve", key: "1", reason: true }])[0].reason, undefined, "only Deny asks");
});

test("review item 4: every list is cut before it is read, so a huge answer is read quickly", () => {
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const lines = many(1000, () => "x"), items = many(1000, () => ({ kind: "practice", name: "P" })), names = many(100000, () => "n");
  const big = { v: 1,
    today: many(100000, (i) => ({ id: `calendar:${i}`, section: "today", title: `Row ${i}`, href: "/a", lines })),
    waiting: many(100000, (i) => ({ id: `parts:${i}`, section: "waiting", title: "W", href: "/a" })),
    others: many(100000, () => ({ id: "skills:w", section: "others", title: "O", href: "/a" })),
    activity: many(100000, () => ({ title: "A", href: "/a", at: new Date().toISOString() })),
    season: { target: { name: "k", date: "2099-01-01", kind: "kickoff" }, days: many(100000, (i) => ({ date: "2026-12-01", kind: "practice" })) },
    week: many(100000, () => ({ date: "2026-12-01", href: "/c", items, snacks: { names, open: 1 } })),
    coming: many(100000, () => ({ date: "2026-12-01", name: "C", href: "/c" })),
    milestones: many(100000, () => ({ name: "M", date: "2026-12-01", href: "/m" })),
    next: { taskId: "t", title: "T", href: "/t", waitingOn: many(100000, () => "w") } };
  const t0 = Date.now();
  const d = parseToday(big, site, origin);
  assert.ok(Date.now() - t0 < 1000, `read in ${Date.now() - t0} ms`);
  assert.ok(d.today.length <= MAX_ROWS && d.waiting.length <= MAX_ROWS && d.others.length <= MAX_ROWS);
  assert.ok(d.today[0].lines.length === 2 && d.week.length <= 7 && d.coming.length <= 4 && d.milestones.length <= 12 && d.activity.length <= 5 && d.season.days.length <= 200);
});
