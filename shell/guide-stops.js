// 2972 shell kit: the guide's stops, as data (D140; GUIDE_DESIGN.md §2). Source of truth: infra/shell/guide-stops.js.
// Pure: no DOM. Types: guide-stops.d.ts. The words and the order are the approved demo's (portal-demo js/guide.js).
//
// A stop is one real first-week job. It lives on one page of one app (`app` is an apps.json id, or "portal" for
// Home) and rings one control there: the element with data-guide="<target>". It finishes by a click on that control
// (`finish: "click"`), or, when only the owning app knows the job was really done, by the app saying so
// (`finish: "event"`: window.dispatchEvent(new CustomEvent("shell:guide-done", { detail: { id } }))). "Got it" on the
// stop's card also finishes it.
//   name, line   the Home card's row (a title, then one short line)
//   covered      the words for the ending ("You covered …")
//   title, text  the stop's card: a verb-first title and one sentence of at most about 20 words naming the control
//   missing      the card's sentence when the control is not on the page (nothing waiting, no open snack day)
//   needs        mode: the stop shows only in that mode; tile: an apps.json id the person must have (the Admin
//                stop); menu: the Apps menu group to open
//   continues    (optional) other paths of the same app where the stop's job goes on after its control was used
//                (the door code's sign-in page): the stop waits there, with no card, for its event
// The words name each control by what it says, never by its colour or place on the screen, and say "press", which
// fits a mouse and a finger alike. The paths were checked against the real apps (adopt-1, 2026-11-14).
// A person gets one role's list: the first of admin, mentor, student and parent that they are in (alumni and
// display get none). A stop whose app is not a tile for the person (not adopted, or not for their groups) is left out.

import { GUIDE_ROLE_ORDER, guideRole } from "./guide-state.js";

export { GUIDE_ROLE_ORDER, guideRole };

/** The line under the ending. */
export const GUIDE_CLOSING = "The bell shows what is new. Your initials hold your settings. You can run this again from Account.";

const ring = (id) => `[data-guide="${id}"]`;
const freeze = (o) => Object.freeze({ ...o, needs: Object.freeze({ ...(o.needs || {}) }), roles: Object.freeze(o.roles), continues: Object.freeze(o.continues || []) });

/** Every stop, once; a role's own words for a shared stop are in ROLE_WORDS. */
export const GUIDE_STOPS = Object.freeze([
  freeze({
    // Calendar: Attendance > Today has "Sign in" (0.5.0, Ground up; it was "Scan the door code") while the person is
    // not signed in; it opens the camera, and the code leads to /here/scan, whose confirm button signs them in (the app
    // says "door" there).
    id: "door", roles: ["student"], app: "calendar", path: "/here?tab=today", target: ring("door"), finish: "event", continues: ["/here/scan"],
    name: "Sign in at the door", line: "The first thing you do at every practice.", covered: "signing in at the door",
    title: "Sign in at the door", text: "Press Sign in when you arrive, then point your camera at the code on the door screen.",
    missing: "When you are not signed in yet, Sign in is on this page; press it when you arrive.",
  }),
  freeze({
    // Tasks: My tasks (/my), the Next up card's Open (a link to /my?task=…, which opens the task).
    id: "task", roles: ["student"], app: "tasks", path: "/my", target: ring("task"), finish: "click",
    name: "Find your next task", line: "What to work on when you get to the shop.", covered: "your next task",
    title: "Open your next task", text: "Your next task is always on the Next up card; press Open to see its steps.",
    missing: "When a task is assigned to you, it shows on this page as your next task.",
  }),
  freeze({
    // Parts: the tab row's "Request a part" (a link to /new; "Request" on a phone, named "Request a part").
    id: "part", roles: ["student"], app: "parts", path: "/", target: ring("part"), finish: "click",
    name: "Ask for a part", line: "When your task needs something the shop doesn't have.", covered: "asking for a part",
    title: "Ask for a part", text: "Press Request a part to open the form; you don't have to send it.",
    missing: "Request a part is on every list in Parts & Inventory; press it when you need something.",
  }),
  freeze({
    // Skills: Overview (a student's first tab), the first row under Ready to start, which opens the skill.
    id: "skill", roles: ["student"], app: "skills", path: "/", target: ring("skill"), finish: "click",
    name: "See your next skill", line: "Skills unlock shop tools step by step.", covered: "your next skill",
    title: "Open your next skill", text: "This is the first skill you can start; open it to see what it takes.",
    missing: "When a skill is open to you, it shows first under Ready to start.",
  }),
  freeze({
    // Calendar: Attendance > My days (Mentor days for an admin): the usual-week card ("Save usual week") and the
    // Who's coming card (one day); the app says "days" when either is saved.
    id: "days", roles: ["mentor", "admin"], app: "calendar", path: "/here?tab=mentors", target: ring("days"), finish: "event",
    name: "Say which days you are coming", line: "So students know when a mentor will be there.", covered: "your days",
    title: "Say which days you come", text: "Pick your usual days in My usual week and press Save usual week, or pick one day in Who's coming.",
    missing: "Attendance has a My days view where you set the days you usually come.",
  }),
  freeze({
    // The portal's Home: the Waiting on you card (data-guide="wait", drawn from /today.json; C4). With nothing
    // waiting the card is not drawn, and the stop shows its missing sentence.
    id: "wait", roles: ["mentor", "admin"], app: "portal", path: "/", target: ring("wait"), finish: "click",
    name: "See what is waiting on you", line: "Parts to approve, sign-offs, mentor answers.", covered: "what is waiting on you",
    title: "See what is waiting on you", text: "Everything that needs you is listed here; press a row to go straight to it.",
    missing: "Nothing waits on you now; when something does, it shows here under Waiting on you.",
  }),
  freeze({
    // Parts: Requests, the first row marked Needs mentor OK, which opens the request (Approve and Deny are inside).
    id: "ok", roles: ["mentor", "admin"], app: "parts", path: "/", target: ring("ok"), finish: "click",
    name: "Approve a part request", line: "Requests that cost more than the team's limit wait for a mentor's OK.", covered: "part approvals",
    title: "Open a request that needs an OK", text: "Open this request to see the part, the cost and the budget, then decide.",
    missing: "No request needs an OK now; when one does, it is marked Needs mentor OK in Requests.",
  }),
  freeze({
    // Skills: Sign off (a mentor's first tab), the first row under Waiting for sign-off. It finishes when that row is
    // used, never by a sign-off itself: no one grants a permission to finish a guide.
    id: "sign", roles: ["mentor"], app: "skills", path: "/?tab=signoff", target: ring("sign"), finish: "click",
    name: "Sign off a skill", line: "Students ask; you check their work and sign.", covered: "skill sign-offs",
    title: "See who is waiting for a sign-off", text: "Each row is a student asking for a sign-off; check their work in person before you choose.",
    missing: "No one is waiting now; sign-off requests show here when students ask.",
  }),
  freeze({
    // Calendar: the Agenda view, the first practice in the list, which opens the day.
    id: "next", roles: ["parent"], app: "calendar", path: "/?tab=agenda", target: ring("next"), finish: "click",
    name: "See the next practice", line: "Practices and events, in order.", covered: "the next practice",
    title: "See what is coming up", text: "The next practice is first in the list; open it to see the time, the place and who brings snacks.",
    missing: "The Calendar lists every practice and event, soonest first.",
  }),
  freeze({
    // Calendar: "Subscribe on my phone" on the Calendar tab's row (students and parents have it there; mentors get a
    // plain link under the calendar, not marked), which opens the links. A parent-only stop.
    id: "sub", roles: ["parent"], app: "calendar", path: "/", target: ring("sub"), finish: "click",
    name: "Put the calendar on your phone", line: "Practices show up in your own calendar app.", covered: "the calendar on your phone",
    title: "Put the calendar on your phone", text: "Press Subscribe on my phone, then add the link to your phone's calendar app.",
    missing: "The Calendar has a Subscribe on my phone button that gives a link for your calendar app.",
  }),
  freeze({
    // Calendar: Snacks (its tab shows in Build mode), the first open day's "I'll bring snacks"; the app says "snack"
    // when the spot is taken.
    id: "snack", roles: ["parent"], app: "calendar", path: "/snacks", target: ring("snack"), finish: "event", needs: { mode: "build" },
    name: "Sign up for snacks", line: "Families take turns bringing snacks to practice.", covered: "snack sign-up",
    title: "Sign up for snacks", text: "Press I'll bring snacks on a day that suits you; you get a reminder the day before.",
    missing: "Every practice has snacks covered; a day that needs more gets an I'll bring snacks button.",
  }),
  freeze({
    // Calendar: the Volunteer tab (0.5.0, D184; both modes), the first event's "Sign up"; the app says "vol" when the
    // sign-up is saved (as the snack stop). The demo's S_VOL.
    id: "vol", roles: ["parent"], app: "calendar", path: "/volunteer", target: ring("vol"), finish: "event",
    name: "Help at a team event", line: "The field build and other days that need adults.", covered: "volunteer sign-up",
    title: "Help at a team event", text: "Press Sign up on an event you can make; you get a reminder two days before.",
    missing: "Every volunteer event is full; one that needs people gets a Sign up button.",
  }),
  freeze({
    // The Admin link in the portal home's Admin apps row, as the demo rings it (the static mountHomeGroups marks it; the
    // stop opens that row for this time only); the bar's Admin tile in its Apps menu when Home has no such row (C2, D161).
    id: "admin", roles: ["admin"], app: "portal", path: "/", target: ring("tile-admin"), finish: "click", needs: { tile: "admin", menu: "adminapps" },
    name: "Let new people in", line: "Approve new accounts and set their groups.", covered: "letting new people in",
    title: "Let new people in", text: "Open Admin, under Admin apps, to approve new accounts and put people in groups.",
    missing: "Admin is under Admin apps, on Home and in the Apps menu; open it to approve new accounts.",
  }),
  freeze({
    // Calendar: the view switch's "Practice pattern and sync" (admins only), a link to /?tab=setup.
    id: "pattern", roles: ["admin"], app: "calendar", path: "/", target: ring("pattern"), finish: "click",
    name: "Set when the team practices", line: "The weekly pattern, days off and phone links.", covered: "the practice pattern",
    title: "Set when the team practices", text: "Open Practice pattern and sync to set weekly practices and days off; only admins can change it.",
    missing: "Calendar has a Practice pattern and sync view for admins.",
  }),
]);

/** A role's own words for a stop it shares (the admin's mentor days: an admin can fix any mentor's week). */
export const ROLE_WORDS = Object.freeze({
  admin: Object.freeze({
    days: Object.freeze({
      name: "Check the mentor days", line: "Who is coming, and you can edit any mentor.",
      title: "Check the mentor days", text: "Set your own usual week here, or choose another mentor in Editing to fix theirs.",
    }),
  }),
});

/** Each role's stops, in order (GUIDE_DESIGN §2): never more than five. */
export const GUIDE_ROLES = Object.freeze({
  student: Object.freeze(["door", "task", "part", "skill"]),
  mentor: Object.freeze(["days", "wait", "ok", "sign"]),
  parent: Object.freeze(["next", "sub", "snack", "vol"]),
  admin: Object.freeze(["admin", "pattern", "wait", "days", "ok"]),
});

/** Every stop id. */
export const STOP_IDS = Object.freeze(GUIDE_STOPS.map((s) => s.id));

/** One stop with `role`'s own words, or null for an unknown id. */
export function guideStop(id, role) {
  const s = GUIDE_STOPS.find((x) => x.id === id);
  if (!s) return null;
  const words = (role && ROLE_WORDS[role] && ROLE_WORDS[role][id]) || null;
  return words ? Object.freeze({ ...s, ...words }) : s;
}

/**
 * A role's stops for this person, in order, with the role's own words.
 *   tiles: the person's resolved tiles (core.js resolveTiles). A stop whose app (or needs.tile) is not among them is
 *          left out; "portal" is always there. null or undefined: not known, nothing is left out for it.
 *   mode:  "build" | "competition": a stop whose needs.mode or whose app's tile is not in this mode is left out.
 *          undefined: every mode (the ending counts every stop).
 */
export function guideStops(role, { tiles, mode } = {}) {
  const ids = (role && GUIDE_ROLES[role]) || [];
  const list = Array.isArray(tiles) ? tiles : null;
  const tile = (id) => (list ? list.find((t) => t && t.id === id) : undefined);
  const inMode = (t) => !mode || !t || !Array.isArray(t.modes) || t.modes.includes(mode);
  return ids
    .map((id) => guideStop(id, role))
    .filter((s) => {
      if (!s) return false;
      if (mode && s.needs.mode && s.needs.mode !== mode) return false;
      for (const app of [s.app, s.needs.tile]) {
        if (!app || app === "portal" || !list) continue;
        const t = tile(app);
        if (!t || t.comingSoon || !inMode(t)) return false;
      }
      return true;
    });
}
