// The portal home's /today.json checks and small helpers (js/portal-home.js, release 8.1.5, CONTRACT C4 and C9).
// Plain node, no browser: node --test test/portal-home-test.mjs
// The drawing is covered in the browser by test/portal-shell-test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DISPLAY_SCREENS, displayHref, dueText, isDisplayOnly, isParentOnly, parseToday, rowsForMode, safeHref, whenText } from "../js/portal-home.js";

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
  assert.deepEqual(d, { today: [], waiting: [], next: null, activity: [] });
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
