// 2972 shell kit: the shared hover descriptions (D149), so every app says its tabs and status words the same way.
// Source of truth: infra/shell/tip-text.js. Words from the approved demo (portal-demo 4f767ea, js/tip.js).
// Plain ES module, no dependencies. Types: tip-text.d.ts.
//
// Keyed by the ids in config/apps.json (tasks, calendar, skills, parts, schedule, pit, scouting). The tip module
// (tip.js) looks words up here when the pointer or the focus reaches an element with the kit's tab class and a
// data-tab id (`.shell-tab[data-tab]`) or a status word (`.shell-status`), so an app writes no description for
// them. A missing entry shows no tip. A status word is looked up only in the page's own app(s) and in
// SHARED_STATUS_TIPS, never in another app's glossary: the same word can mean something else there.
//
// A description is one short sentence (about 80 characters at most) on what the thing is or does, never a repeat of
// its visible label. Nothing a person must know lives only here: phones have no hover.
// Adding a tab or a status word to an app: add its line here, bump VERSION, re-sync (or write data-tip in the app).

/** The app bar's own controls (both adapters use these; the demo's words where it has them). */
export const BAR_TIPS = Object.freeze({
  apps: "Every app, tool and team link.",
  build: "Show the apps for build season.",
  competition: "Show the event apps: schedule, pit and scouting.",
  tools: "Small helpers that open on this site.",
  more: "Other apps and links to team sites.",
  chip: "Competition mode is on; change it in Apps or Account.",
  bell: "What is new for you in every app.",
  account: "Your theme, notices and account settings.",
});

const freeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze(v)])));

/** What each tab or view switch leads to, by app id and tab id (the element's data-tab). */
export const TAB_TIPS = freeze({
  parts: {
    requests: "Every part request and where it stands.",
    toorder: "Approve requests, then order them by vendor.",
    arriving: "Orders on the way; check them in when they come.",
    inventory: "What the team has and where it is kept.",
    budget: "What each budget has spent and has left.",
    vendors: "Shipping, cutoffs and how each vendor is paid.",
  },
  skills: {
    signoff: "Students waiting for you to sign off a skill.",
    overview: "What you can start next and how far you are.",
    trees: "Every skill tree, step by step.",
    permits: "Which shop tools each person may use.",
    edit: "Add or change skills in a tree.",
  },
  // The Calendar app's three tabs, its calendar views and its Attendance views (the demo's calapp, calendar and
  // here tables, merged: no id repeats).
  calendar: {
    calendar: "Practices, events and days off.",
    here: "Sign in at the door and see hours.",
    snacks: "Families sign up to bring snacks to practice.",
    month: "The whole month at a glance.",
    agenda: "The coming days as a list.",
    setup: "When the team practices, days off and phone links.",
    today: "Sign in and see who is in the shop now.",
    board: "Hours and meetings for everyone this season.",
    me: "Your hours, meetings and streak.",
    mentors: "Which mentors come on which practice days.",
    admin: "Fix missed sign-outs and adjust hours.",
  },
  schedule: {
    mine: "Your roles and times at the event.",
    all: "Who does what, hour by hour.",
    roles: "The event roles and their colours.",
    settings: "Reminders, publishing and who may edit.",
  },
  pit: {
    check: "Before-match checklists for the robot.",
    batt: "Charge and use of every battery.",
    archives: "Checklists from earlier matches.",
    edit: "Change the checklist items.",
  },
  scouting: {
    form: "Scout the match you are assigned to.",
    stats: "Averages for every team so far.",
    picks: "Our ranked list for alliance selection.",
    assign: "Who scouts which robot in each match.",
    coverage: "Matches and teams nobody has scouted yet.",
    forms: "Change the questions on the scouting form.",
  },
  tasks: {
    my: "Tasks assigned to you, soonest first.",
    week: "What is due and planned in the next 7 days.",
    dash: "Blocked and late work across the team.",
    calendar: "Due dates and milestones by month.",
    timeline: "Projects and milestones over time.",
  },
});

// Schedule, Pit and Scouting are one app (compete) and share one glossary.
const COMPETE = {
  Published: "Everyone can see this schedule.",
  Draft: "Only mentors can see it until it is published.",
  Late: "Came in after the match started.",
  "In use": "Shown to scouts now.",
  Hidden: "Not shown to scouts.",
  Checked: "Done for this match.",
  "Not checked": "Still to do before the match.",
  new: "Just reported; nobody is on it yet.",
  resolved: "Fixed.",
  open: "Someone is working on it.",
};

/** What each status word means, by app id and the word as printed. */
export const STATUS_TIPS = freeze({
  tasks: {
    "To do": "Nobody has started it yet.",
    "In progress": "Someone is working on it now.",
    Blocked: "Stuck; it needs help or a decision.",
    Done: "Finished.",
    "Waiting on": "It can't start until this other task is done.",
    Changes: "Something here was changed.",
    Kept: "Left as it was.",
  },
  parts: {
    "Needs mentor OK": "Over the limit or new; a mentor must approve it.",
    "To order": "Approved; a mentor will order it with its vendor.",
    Ordered: "On its way from the vendor.",
    Arrived: "Here; it still needs a place on a shelf.",
    "Put away": "Here and on its shelf.",
    Denied: "A mentor said no; the request shows why.",
    Cancelled: "Withdrawn before it was ordered.",
    Low: "At or under its minimum; time to reorder.",
    "Place today": "Order today to have it by the date needed.",
    Blocking: "Work is stopped until this part comes.",
    High: "Needed soon.",
    Exempt: "The vendor doesn't charge us sales tax.",
    Taxed: "The vendor charges sales tax.",
  },
  calendar: {
    Here: "Signed in at the door now.",
    Planned: "Said they are coming today.",
    "Can't come": "Said they can't come.",
    "No answer": "Hasn't said yet whether they are coming.",
    Covered: "Enough families are bringing snacks.",
    "Missed sign-out": "Didn't sign out; hours need a fix.",
    Adjusted: "A mentor changed these hours.",
    "Up to date": "Phone calendars have the latest changes.",
  },
  skills: {
    Ready: "You can start this skill now.",
    Available: "Open to start.",
    "In progress": "Started but not signed off yet.",
    "Waiting for a mentor": "You asked for a sign-off; a mentor will check it.",
    "Waiting for sign-off": "Asked for a sign-off; a mentor will check it.",
    Complete: "Signed off.",
    Done: "Signed off.",
    Locked: "Finish the level before it first.",
    Needed: "Must be done before this one.",
    Add: "Will be added when you save.",
    Edit: "Will be changed when you save.",
  },
  schedule: COMPETE,
  pit: COMPETE,
  scouting: COMPETE,
});

/**
 * Status words that mean the same in every app, so any app may use them. Empty today: the only words the demo
 * defines in two apps mean different things there ("Done" is "Finished." in Tasks and "Signed off." in Skills;
 * "In progress" differs the same way), and a word only one app defines stays that app's. A word goes here only when
 * no app glossary defines it differently (the unit test checks).
 */
export const SHARED_STATUS_TIPS = Object.freeze({});

const CHECKED = Object.freeze([/^\d+ of \d+ checked$/, "How much of this match's checklist is done."]);
/** Words with a number in them, by app id: [pattern, description]. Checked after the app's glossary. */
export const STATUS_PATTERNS = freeze({
  parts: [Object.freeze([/^\d+ of \d+ checked in$/, "Lines of this order checked in so far."])],
  schedule: [CHECKED],
  pit: [CHECKED],
  scouting: [CHECKED],
  // The planned Tools service (GAP_SHELL_PORTAL_ACCOUNT §3; no apps.json id yet): the gear finder's result line.
  tools: [Object.freeze([/^Matches .* within \d+%$/, "How close your numbers are to this common size."])],
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const ids = (appIds) => (Array.isArray(appIds) ? appIds : [appIds]).filter((id) => typeof id === "string");

/** The description of tab `id` for app id `appIds` (one id or a list, first hit wins), or "" (no tip). */
export function tabTip(appIds, id) {
  if (typeof id !== "string") return "";
  for (const appId of ids(appIds)) if (own(TAB_TIPS, appId) && own(TAB_TIPS[appId], id)) return TAB_TIPS[appId][id];
  return "";
}

/**
 * The description of a status word as printed (spaces collapsed) for app id `appIds` (one id or a list): the
 * app's glossary, then its number patterns, then SHARED_STATUS_TIPS; "" when nothing matches (no tip). Never
 * another app's glossary.
 */
export function statusTip(appIds, word) {
  const w = typeof word === "string" ? word.replace(/\s+/g, " ").trim() : "";
  if (!w) return "";
  const list = ids(appIds);
  for (const appId of list) if (own(STATUS_TIPS, appId) && own(STATUS_TIPS[appId], w)) return STATUS_TIPS[appId][w];
  for (const appId of list) {
    if (!own(STATUS_PATTERNS, appId)) continue;
    for (const [pattern, text] of STATUS_PATTERNS[appId]) if (pattern.test(w)) return text;
  }
  return own(SHARED_STATUS_TIPS, w) ? SHARED_STATUS_TIPS[w] : "";
}
